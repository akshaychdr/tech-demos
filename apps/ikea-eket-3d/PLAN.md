# PLAN — EKET cabinet 2 drawers (00333947) 3D assembly

## Goal

Interactive step-by-step assembly of **EKET cabinet with 2 drawers** (70×35×35 cm) using the official [IKEA 3D Assembly Dataset](https://github.com/IKEA/IKEA3DAssemblyDataset) GLB + manual AA-1914748-7, with CC BY-NC-SA 4.0 attribution.

## MVP

- Vite + TS + three.js + GSAP; load `public/dataset/EKET_00333947_70x35x35.glb` (real parts, no hand geometry).
- Map GLB top-level nodes to manual steps; animate from exploded layout; studio lighting + shadows.
- UI: step counter, prev/next/play, hardware callouts, mm dimensions, manual page image per step, drawer open on final step.
- `VITE_BASE_PATH` for GitHub Pages; Vitest on step data; capture script for PR media.

## Deferred

- Drawing-mode outline renderer.
- Full 25-step 1:1 with every hardware piece animated.
