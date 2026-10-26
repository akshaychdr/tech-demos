# elevator-install-3d

IKEA-style interactive install demo for **Federal Elevator Panorama/Renaissance** residential hydraulic lifts. All on-screen dimensions are in **millimetres**.

**Disclaimer:** Illustrative demo, not for installation. Follow the manufacturer’s manuals and local code.

## Scenes

1. **Layout Type A** — Federal Planning Guide (March 2023): 2D SVG plan morphs to a three.js hoistway (rails, cylinder, cab). Cab/gate selector covers all Type A accordion and bifold rows; travel height is user-adjustable (max 15 240 mm).
2. **IR curtain** — Installation manual Appendix 5: numbered steps, bracket spacing 225 / 953 / 248 mm, exploded view.
3. **Wiring** — Appendix 3: aux + main disconnects, contactors, overload, motor; animated power flow, HP/amp table, single/Δ/Y link patterns (terminal numbers TBD).

## Run

```bash
cd apps/elevator-install-3d
bun install
bun run dev
```

Open the URL shown (default port **5174**). Keys `1`–`3` switch scenes.

## Tests & reel

```bash
bun test
bun run render:mp4   # HyperFrames reel → out/elevator-install-3d-reel.mp4
```

## Data

- `data/dimensions.json` — global mm constants + curtain bracket dims
- `data/typeARows.json` — full Type A table (inch source + published mm)
- `data/steps.json` — curtain assembly steps
- `data/circuit.json` — disconnect schematic graph + amp table

## Sources (redrawn, not embedded)

- Federal Planning Guide, Panorama & Renaissance, March 2023
- Federal Hydraulic Residential Elevator Installation Manual, Appendices 3 & 5
