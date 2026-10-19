"""Isolated inference worker (stdout JSONL). Physical RAM cap applied at startup when configured."""

from __future__ import annotations

import argparse
import os
import sys
import threading
import time
import traceback
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from config import DEFAULT_MAX_NEW_TOKENS, DEFAULT_MODEL, HF_HOME, MODEL_WEIGHTS_GB  # noqa: E402
from workers.common import emit, start_memory_sampler  # noqa: E402
from workers.memory_cap import enter_cgroup_v2  # noqa: E402


def _setup_env() -> None:
    HF_HOME.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(HF_HOME))
    os.environ.setdefault("TRANSFORMERS_NO_ADVISORY_WARNINGS", "1")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def _apply_physical_cap(cap_mb: int, method: str) -> str:
    if method == "cgroup_v2" and enter_cgroup_v2(cap_mb):
        return "cgroup_v2"
    if method == "systemd_run":
        # Parent launched us under systemd-run MemoryMax.
        return "systemd_run"
    return "rss_watchdog"


def _layer_label(layer_names: list[str], idx: int) -> str:
    name = layer_names[idx]
    if name.endswith("embed_tokens") or "embed" in name:
        return "embed"
    if name.endswith("norm"):
        return "norm"
    if "lm_head" in name:
        return "lm_head"
    if "layers." in name:
        return name.split("layers.")[-1]
    return str(idx)


def _instrument_airllm_hooks(model, breakdown: dict) -> None:
    layer_names = model.layer_names
    total = len(layer_names)
    streamed = getattr(model, "_streamed_indices", list(range(len(layer_names))))

    for idx in streamed:
        module = model.layers[idx]

        def pre_hook(_module, _args, layer_idx=idx):
            emit(
                {
                    "type": "layer",
                    "index": layer_idx,
                    "label": _layer_label(layer_names, layer_idx),
                    "phase": "load",
                    "total": total,
                }
            )
            from workers.memory_cap import tree_rss_bytes

            rss = tree_rss_bytes(os.getpid()) / (1024 * 1024)
            breakdown["layer_peak_mb"] = max(breakdown.get("layer_peak_mb", 0), rss)
            emit(
                {
                    "type": "layer",
                    "index": layer_idx,
                    "label": _layer_label(layer_names, layer_idx),
                    "phase": "run",
                    "total": total,
                }
            )

        def post_hook(_module, _args, _output, layer_idx=idx):
            emit(
                {
                    "type": "layer",
                    "index": layer_idx,
                    "label": _layer_label(layer_names, layer_idx),
                    "phase": "free",
                    "total": total,
                }
            )

        module.register_forward_pre_hook(pre_hook)
        module.register_forward_hook(post_hook)


def _emit_memory_breakdown(breakdown: dict, peak_rss_mb: float) -> None:
    overhead = breakdown.get("overhead_mb", 0)
    embed = breakdown.get("embed_mb", 0)
    layer_peak = breakdown.get("layer_peak_mb", 0)
    working = max(0, peak_rss_mb - overhead)
    emit(
        {
            "type": "memory_breakdown",
            "overhead_mb": round(overhead, 1),
            "embed_mb": round(embed, 1),
            "layer_peak_mb": round(layer_peak, 1),
            "working_mb": round(working, 1),
            "summary": (
                f"overhead ~{overhead:.0f} MB · embed/head ~{embed:.0f} MB · "
                f"layer peak ~{layer_peak:.0f} MB · working ~{working:.0f} MB"
            ),
        }
    )


def run_baseline(model_id: str, prompt: str, max_new_tokens: int) -> None:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    emit({"type": "status", "message": "Loading full model into RAM…"})
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        dtype=torch.float16,
        low_cpu_mem_usage=True,
    )
    model.eval()
    inputs = tokenizer([prompt], return_tensors="pt", truncation=True, max_length=256)
    emit({"type": "status", "message": "Generating…"})
    t0 = time.perf_counter()
    with torch.inference_mode():
        output_ids = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False)
    elapsed = time.perf_counter() - t0
    text = tokenizer.decode(output_ids[0], skip_special_tokens=True)
    emit(
        {
            "type": "result",
            "success": True,
            "output_text": text,
            "tokens": max_new_tokens,
            "total_s": round(elapsed, 3),
            "tokens_per_sec": round(max_new_tokens / elapsed, 3) if elapsed > 0 else 0,
        }
    )


def run_airllm(model_id: str, prompt: str, max_new_tokens: int, compression: str | None, breakdown: dict) -> None:
    from airllm import AutoModel
    from workers.memory_cap import tree_rss_bytes

    kwargs = {"device": "cpu", "prefetching": False}
    if compression:
        kwargs["compression"] = compression
    emit({"type": "status", "message": "Initializing AirLLM (layer shards on disk)…"})
    model = AutoModel.from_pretrained(model_id, **kwargs)
    breakdown["overhead_mb"] = tree_rss_bytes(os.getpid()) / (1024 * 1024)
    breakdown["embed_mb"] = tree_rss_bytes(os.getpid()) / (1024 * 1024)
    emit({"type": "meta", "layer_count": len(model.layer_names), "layer_names": model.layer_names})
    _instrument_airllm_hooks(model, breakdown)
    inputs = model.tokenizer(
        [prompt],
        return_tensors="pt",
        return_attention_mask=False,
        truncation=True,
        max_length=256,
        padding=False,
    )
    emit({"type": "status", "message": "Generating with layer-wise streaming…"})
    t0 = time.perf_counter()
    generation = model.generate(
        inputs["input_ids"],
        max_new_tokens=max_new_tokens,
        use_cache=True,
        return_dict_in_generate=True,
        do_sample=False,
    )
    elapsed = time.perf_counter() - t0
    text = model.tokenizer.decode(generation.sequences[0], skip_special_tokens=True)
    emit(
        {
            "type": "result",
            "success": True,
            "output_text": text,
            "tokens": max_new_tokens,
            "total_s": round(elapsed, 3),
            "tokens_per_sec": round(max_new_tokens / elapsed, 3) if elapsed > 0 else 0,
        }
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["baseline", "airllm"], required=True)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--max-new-tokens", type=int, default=DEFAULT_MAX_NEW_TOKENS)
    parser.add_argument("--memory-cap-mb", type=int, required=True)
    parser.add_argument("--compression", default="none")
    parser.add_argument("--cap-method", default="rss_watchdog")
    args = parser.parse_args()

    _setup_env()
    cap_method = _apply_physical_cap(args.memory_cap_mb, args.cap_method)
    compression = None if args.compression in ("none", "", "null") else args.compression

    stop = threading.Event()
    _, mem_state = start_memory_sampler(stop)
    breakdown: dict = {}

    emit(
        {
            "type": "start",
            "mode": args.mode,
            "memory_cap_mb": args.memory_cap_mb,
            "cap_method": cap_method,
            "model_weights_gb": MODEL_WEIGHTS_GB,
        }
    )
    success = False
    error: str | None = None

    try:
        if args.mode == "baseline":
            run_baseline(args.model, args.prompt, args.max_new_tokens)
        else:
            if compression and compression not in ("4bit", "8bit"):
                raise ValueError(f"Unsupported compression: {compression}")
            run_airllm(args.model, args.prompt, args.max_new_tokens, compression, breakdown)
        success = True
    except Exception as exc:  # noqa: BLE001
        error = f"{type(exc).__name__}: {exc}"
        emit({"type": "result", "success": False, "output_text": "", "error": error})
        traceback.print_exc(file=sys.stderr)
    finally:
        stop.set()
        time.sleep(0.1)
        peak = mem_state["peak_rss_mb"]
        if args.mode == "airllm" and success:
            samples = mem_state.get("samples") or [peak]
            breakdown["overhead_mb"] = min(samples) if samples else peak
            _emit_memory_breakdown(breakdown, peak)
        emit(
            {
                "type": "done",
                "success": success,
                "peak_rss_mb": round(peak, 1),
                "error": error,
                "cap_method": cap_method,
            }
        )

    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
