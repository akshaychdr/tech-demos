# AirLLM memory-budget demo

Side-by-side comparison of a **full Hugging Face `transformers` load** vs **[AirLLM](https://github.com/lyogavin/airllm)** layer-wise inference under the same hard memory cap (`RLIMIT_AS`).

Upstream project: [lyogavin/airllm](https://github.com/lyogavin/airllm) — splits checkpoints into per-layer shards, loads/runs/frees each layer in turn so peak RAM stays near one layer plus activations.

## Stack exception

The monorepo normally uses Bun-only apps. This demo adds a **Python FastAPI** backend under `server/` because AirLLM is a Python library. The UI is still Vite + React + TypeScript + shadcn/ui on Bun.

## CPU caveat (default)

This environment has **no GPU**. The demo uses:

- Model: `Qwen/Qwen2.5-0.5B-Instruct` (ungated, no HF token)
- Device: CPU (`device="cpu"` for AirLLM)
- Default cap: **3800 MB** — full load fails; AirLLM completes

Block-wise **4-bit/8-bit compression** is shown in the UI but **disabled on CPU** (bitsandbytes kernels target GPU). Use **None** for compression here.

First run downloads weights and builds AirLLM layer shards under `.cache/huggingface` (not committed).

## Setup

```bash
cd apps/airllm
chmod +x scripts/*.sh
./scripts/setup.sh
```

## Run

```bash
./scripts/dev.sh
```

Open http://127.0.0.1:5173 — click **Run side-by-side** and watch RSS + the layer strip.

Or run processes separately:

```bash
export HF_HOME="$(pwd)/.cache/huggingface"
server/.venv/bin/python server/main.py   # :8765
bun run dev                               # :5173, proxies /api
```

## GPU / larger models

On a machine with CUDA:

1. Install a CUDA build of PyTorch and `airllm` in `server/.venv`.
2. Change `device="cuda:0"` in `server/workers/run_worker.py` for AirLLM.
3. Point `DEFAULT_MODEL` in `server/config.py` at a larger HF repo (e.g. Llama/Qwen 7B+).
4. Enable **4-bit/8-bit** compression in the UI once bitsandbytes is available on GPU.
5. Adjust the memory cap slider to match your VRAM/RAM experiment.

## Credit

AirLLM by Gavin Li and contributors — see the [upstream repository](https://github.com/lyogavin/airllm) and [PyPI package](https://pypi.org/project/airllm/).
