# elevator-selective-collective

HyperFrames motion reel explaining **selective collective** elevator control (SCAN / LOOK): serve every hall call in the current direction, then reverse — contrasted with naive FCFS and closed with **simulated mean wait times** on the same call list.

Built on [HeyGen HyperFrames](https://github.com/heygen-com/hyperframes). Bookmark: [2112609040962359354](https://x.com/i/status/2112609040962359354).

## Phase 1

- Read **`STORYBOARD.md`** for scene timing and copy.
- Composition: **`composition/index.html`** (+ `composition/simulation.js`).
- Key-frame stills: **`storyboard-stills/`** (1920×1080 PNGs from `hyperframes snapshot`).

```bash
cd apps/elevator-selective-collective
bun install
bun run test
bun run snapshot:stills   # regenerate storyboard PNGs
npx hyperframes preview composition
```

## Phase 2 (not yet)

Full 60&nbsp;fps MP4 render + interactive app (see `PLAN.md`).
