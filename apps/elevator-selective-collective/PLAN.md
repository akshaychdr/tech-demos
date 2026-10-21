# elevator-selective-collective — plan

## Goal

Premium HyperFrames explainer on **selective collective** (directional collective / SCAN) hall-call dispatch vs naive FCFS, ending with honest mean-wait times from a discrete-event simulation.

## Phase 1 (current — owner review)

- [x] `STORYBOARD.md` scene breakdown
- [x] Rework `composition/index.html` — night glass tower, cyan car, magenta calls, GSAP motion
- [x] `composition/simulation.js` + vitest
- [x] Four 1920×1080 stills via `hyperframes snapshot` → `storyboard-stills/`
- [x] Remove old traction cutaway visuals
- [ ] **Wait** — no full 60&nbsp;fps render or Playwright app recording until stills approved

## Phase 2 (after approval)

- Final render 1920×1080 @ 60&nbsp;fps, ~38&nbsp;s, `looks` quality
- Vite UI: call editor, re-run simulation, trigger render
- PR validation video @ 1440×900

## Stack

Bun, Vite, React, shadcn (shell), HyperFrames CLI, GSAP in composition.

## Deferred

Destination dispatch, multi-car, traffic patterns beyond fixed demo list.
