# PLAN: `apps/elevator-install-3d/`

## Goal (one sentence)
Interactive IKEA-style 3D install guide for Federal Panorama/Renaissance hydraulic lifts: Type A layout (2D→3D), IR curtain assembly steps, and animated disconnect/motor wiring — all dimensions in mm.

## Single-user MVP
- Three tabbed scenes with blueprint art direction and persistent disclaimer banner.
- Scene 1: Federal Planning Guide Type A (accordion + bifold rows), cab selector, travel height input (max 15240 mm), SVG plan morphing to three.js hoistway.
- Scene 2: Appendix 5 curtain assembly — steps, exploded view, autoplay.
- Scene 3: Appendix 3 wiring — schematic SVG, switch animation, amp table, motor link views.
- Vitest: inch↔mm consistency (flag PDF rounding mismatches), circuit energisation, dimension refs.
- HyperFrames reel MP4 1920×1080 @ 60fps.

## Out of scope
- Other layout types (B–E), machine room, Cambridge E50.
- Embedding OEM PDFs; terminal numbers on motor blocks marked TBD.

## Tasks
1. Data: `dimensions.json` (Type A table + global pit/overhead/rail offsets), `steps.json`, `circuit.json`.
2. Model: `units.ts`, `geometry.ts`, `circuit.ts`, `typeA.ts`.
3. Scene 1: SVG plan + Three.js extrusion + linked selection.
4. Scene 2: SVG/3D curtain parts + step rail.
5. Scene 3: Schematic + flow animation + HP/supply toggles.
6. Composition reel + `render:mp4` script.
7. Tests + PR artifacts (screenshot + video + reel).

## Stack
| Piece | Rationale |
|-------|-----------|
| Vite + TS | Fast dev, matches repo demos |
| three.js | 3D hoistway and curtain |
| GSAP | Morphs, staggers, reel timeline |
| Vitest | Dimension and circuit tests |
| HyperFrames | Headless 1080p60 reel |

## Deferred
- Full bloom/postprocessing if reel perf issues
- Playwright artifact script (manual capture fallback)

## Sources
- Federal Planning Guide (March 2023): Type A tables pp.11–14, pit/overhead p.4–5, rail detail p.6.
- Federal Hydraulic Residential Install Manual: Appendix 3 (disconnect), Appendix 5 (IR curtain).
