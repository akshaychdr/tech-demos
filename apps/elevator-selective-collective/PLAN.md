# elevator-selective-collective — plan

## Goal

Premium HyperFrames explainer on **selective collective** (directional collective / LOOK) vs **down collective** (Barney / Harris), with car-call passengers and honest wait + journey times from `composition/simulation.js`.

## Phase 1 (current — owner review)

- [x] `STORYBOARD.md` scene breakdown
- [x] Rework `composition/index.html` — night glass tower, cyan car, magenta calls, GSAP motion
- [x] `composition/simulation.js` + vitest
- [x] Four 1920×1080 stills via `hyperframes snapshot` → `storyboard-stills/`
- [x] Remove old traction cutaway visuals
- [ ] **Wait** — no full 60&nbsp;fps render or Playwright app recording until stills approved

## Phase 2 (done)

- [x] HyperFrames render `out/elevator-selective-collective.mp4` (1920×1080 @ 60&nbsp;fps, ~38&nbsp;s)
- [x] Vite viewer — full-frame iframe of `composition/`
- [x] `bun run record:viewer` — 1920×1080 Playwright capture

## Stack

Bun, Vite, React, shadcn (shell), HyperFrames CLI, GSAP in composition.

## Deferred

Destination dispatch, multi-car, traffic patterns beyond fixed demo list.
