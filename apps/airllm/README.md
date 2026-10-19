# AirLLM memory-budget demo

Side-by-side comparison of a **full Hugging Face `transformers` load** vs **[AirLLM](https://github.com/lyogavin/airllm)** layer-wise inference under the same **physical RAM** cap.

Upstream: [lyogavin/airllm](https://github.com/lyogavin/airllm) — per-layer shards loaded/run/freed so peak RAM stays near one layer plus activations (not the full ~6 GB weights).

## Stack exception

The monorepo normally uses Bun-only apps. This demo adds a **Python FastAPI** backend under `server/` because AirLLM is a Python library. The UI is Vite + React + TypeScript + shadcn/ui on Bun.

## CPU caveat (default)

No GPU in the default environment:

| Setting | Value |
| ------- | ----- |
| Model | `Qwen/Qwen2.5-3B-Instruct` (ungated) |
| Weights (fp16) | ~**6 GB** in RAM when fully loaded |
| Default RAM cap | **2500 MB** — below full model size |
| Device | CPU (`device="cpu"` for AirLLM) |
| New tokens | ~10 (keeps CPU runs under a few minutes) |

### How the cap is enforced

1. **Preferred:** cgroup v2 `memory.max` + `memory.swap.max=0` on the worker process (or `systemd-run --user --scope -p MemoryMax=…` when user systemd is available).
2. **Fallback:** parent process **RSS watchdog** — sums worker + child RSS and sends **SIGKILL** when RSS exceeds the cap (swap should be 0 on the host for a hard bind).

This is **not** `RLIMIT_AS` (virtual address space). The UI labels the slider **RAM cap (physical, cgroup)** and shows **model ~6 GB vs cap 2.5 GB**.

Baseline is expected to be **killed: exceeded N MB RAM** while loading the full checkpoint. AirLLM should **finish** under the same cap.

Block-wise **4-bit/8-bit compression** is disabled on CPU (bitsandbytes GPU kernels). Use **None**.

Weights and AirLLM layer shards live under `.cache/huggingface` (gitignored).

## Setup

```bash
cd apps/airllm
chmod +x scripts/*.sh
./scripts/setup.sh
```

First run downloads ~6 GB of weights and builds layer shards.

## Run

```bash
./scripts/dev.sh
```

Open http://127.0.0.1:5173 — **Run side-by-side**.

## PR validation recording

```bash
# API :8765 + Vite :5173 running
node scripts/record-pr-artifacts.mjs
```

Fixed **1440×900** Playwright viewport (no desktop crop).

## GPU / other models

1. Install CUDA PyTorch + `airllm` in `server/.venv`.
2. Set `device="cuda:0"` in `server/workers/run_worker.py`.
3. Change `DEFAULT_MODEL` / `MODEL_WEIGHTS_GB` in `server/config.py`.
4. Tune `DEFAULT_MEMORY_CAP_MB` so full load exceeds the cap but AirLLM still fits.

## Credit

AirLLM by Gavin Li — [GitHub](https://github.com/lyogavin/airllm) · [PyPI](https://pypi.org/project/airllm/).
