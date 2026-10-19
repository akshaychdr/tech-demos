# airllm — plan

Produced by following `skills/project-planning/SKILL.md`.

## Goal

Demonstrate [AirLLM](https://github.com/lyogavin/airllm) layer-wise inference under a hard memory budget: a full `transformers` load fails or is killed under the same cap while AirLLM completes generation.

## Single-user MVP (ships in the first cut)

- Side-by-side UI: prompt, memory-cap slider, compression toggle (none / 8-bit / 4-bit).
- One button runs **both** paths sequentially under the **same** `RLIMIT_AS` cap in isolated subprocesses.
- Live layer strip for the AirLLM run (load → run → free per layer).
- Live memory chart for both runs (baseline spikes or flatlines on kill; AirLLM stays low).
- Stats: tokens/sec, peak RSS, total time, outcome (success / OOM-killed).
- Short generation (~24 new tokens) for reasonable CPU runtime.

## Explicitly out of scope

- GPU path in the default demo (documented in README only).
- Multi-user auth, persistence, model picker in UI.
- Committing model weights (HF cache only; `.gitignore` covers caches).
- Training mode, prefetch tuning, or MoE-scale models.

## Repo exception (documented here)

`AGENTS.md` assumes Bun-only apps. This demo adds a **Python FastAPI backend** under `apps/airllm/server/` because AirLLM is a Python library. The **frontend** still follows repo rules: Bun, Vite + React + TS, `bunfig.toml`, shadcn/ui minimalist preset. Setup/run scripts orchestrate both processes.

## Tasks (vertical slices)

1. **PLAN + scaffold** — Vite React TS frontend; `server/` with pinned `requirements.txt` and uv/venv.
2. **Workers** — `baseline_worker.py` (full `AutoModelForCausalLM`); `airllm_worker.py` (`airllm.AutoModel` + layer progress JSONL); shared `run_under_rlimit.py` wrapper.
3. **API + SSE** — FastAPI: start compare job, stream memory + layer events, final stats.
4. **UI** — shadcn controls, Recharts memory series, layer strip component, side-by-side result panels.
5. **Scripts + docs** — `scripts/setup.sh`, `scripts/dev.sh`; README with CPU caveat, GPU/model notes, upstream credit.
6. **Validation** — run on CPU with `Qwen/Qwen2.5-0.5B-Instruct`; screenshot + video for PR.

## Stack

| Piece | Choice | Rationale |
| ----- | ------ | --------- |
| Frontend runtime | Bun | Repo rule |
| UI | Vite + React + TS + shadcn/ui | Official scaffold, one screen |
| Charts | Recharts | Simple live line charts in React |
| Backend | FastAPI + uvicorn | SSE-friendly, minimal |
| Inference | transformers + airllm | Baseline vs layer-wise |
| Memory cap | `prlimit` / `RLIMIT_AS` on worker subprocess | Hard budget without root cgroups |
| Model | `Qwen/Qwen2.5-0.5B-Instruct` | Ungated, ~0.5B, AirLLM-supported on CPU |

## Compression on CPU

AirLLM block-wise 4-bit/8-bit uses **bitsandbytes**, which targets GPU kernels; on CPU the UI shows 8-bit/4-bit **disabled** with a short explanation. **None** is the supported compression mode for this demo.

## Layout

```
apps/airllm/
  PLAN.md README.md bunfig.toml package.json vite.config.ts
  scripts/setup.sh scripts/dev.sh
  server/requirements.txt server/main.py server/workers/*.py
  src/ … React UI
```

## Deferred

- Parallel runs (would double peak host RAM).
- Custom model download UI.
- Automated pytest for workers (manual validation for demo).
