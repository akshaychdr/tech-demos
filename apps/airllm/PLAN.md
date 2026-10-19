# airllm — plan

Produced by following `skills/project-planning/SKILL.md`.

## Goal

Demonstrate [AirLLM](https://github.com/lyogavin/airllm) layer-wise inference under a hard **physical RAM** budget: a full `transformers` load is killed for exceeding the cap while AirLLM completes generation.

## Single-user MVP (ships in the first cut)

- Side-by-side UI: prompt, **RAM cap (physical, cgroup)** slider, compression toggle (none / 8-bit / 4-bit).
- One button runs **both** paths sequentially under the **same** RAM cap in isolated subprocesses.
- Cap enforcement: cgroup v2 `memory.max` + `memory.swap.max=0`, or `systemd-run --scope` when available; else parent **RSS watchdog** (SIGKILL when process tree RSS exceeds cap).
- Live layer strip for the AirLLM run (load → run → free per layer).
- Live memory chart (baseline killed when RSS hits cap; AirLLM stays under cap).
- Stats: tokens/sec, peak RSS, total time; baseline shows **killed: exceeded N MB RAM** when applicable.
- AirLLM one-line RSS breakdown (overhead, embed/head, layer peak, working) from measured deltas.
- Short generation (~10 new tokens) for reasonable CPU runtime on a ~3B model.

## Explicitly out of scope

- GPU path in the default demo (documented in README only).
- Multi-user auth, persistence, model picker in UI.
- Committing model weights (HF cache only; `.gitignore` covers caches).
- Training mode, prefetch tuning, or MoE-scale models.

## Repo exception (documented here)

`AGENTS.md` assumes Bun-only apps. This demo adds a **Python FastAPI backend** under `apps/airllm/server/` because AirLLM is a Python library. The **frontend** still follows repo rules: Bun, Vite + React + TS, `bunfig.toml`, shadcn/ui minimalist preset.

## Tasks (vertical slices)

1. **PLAN + scaffold** — Vite React TS frontend; `server/` with pinned `requirements.txt` and uv/venv.
2. **Workers** — `run_worker.py` (baseline + AirLLM); `memory_cap.py` (cgroup / watchdog).
3. **API + SSE** — FastAPI streams memory, layer, breakdown events; synthesizes kill result when worker is SIGKILL'd.
4. **UI** — model ~6 GB vs cap display, physical RAM labels, kill badge, breakdown line.
5. **Scripts + docs** — `setup.sh`, `dev.sh`, Playwright `record-pr-artifacts.mjs`.
6. **Validation** — CPU with `Qwen/Qwen2.5-3B-Instruct`, cap **2500 MB**; screenshot + video at 1440×900.

## Stack

| Piece | Choice | Rationale |
| ----- | ------ | --------- |
| Frontend runtime | Bun | Repo rule |
| UI | Vite + React + TS + shadcn/ui | Official scaffold, one screen |
| Charts | Recharts | Simple live line charts in React |
| Backend | FastAPI + uvicorn | SSE-friendly, minimal |
| Inference | transformers + airllm | Baseline vs layer-wise |
| Memory cap | cgroup v2 `memory.max` (swap 0) or RSS watchdog | Binds **physical** RAM, not virtual (`RLIMIT_AS`) |
| Model | `Qwen/Qwen2.5-3B-Instruct` | Ungated ~3B, ~6 GB fp16 weights — clearly above 2.5 GB cap |

## Compression on CPU

AirLLM block-wise 4-bit/8-bit uses **bitsandbytes** (GPU-oriented); on CPU the UI shows 8-bit/4-bit **disabled**. **None** only.

## Deferred

- Parallel runs (would double peak host RAM).
- Custom model download UI.
- Automated pytest for workers (manual validation for demo).
