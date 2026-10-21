# elevator-selective-collective

HyperFrames motion reel contrasting **down collective** (up-distributive / one hall button per landing) with **selective collective** (directional collective / LOOK): same passengers, same physics, with **simulated wait and journey times** from `composition/simulation.js`.

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
