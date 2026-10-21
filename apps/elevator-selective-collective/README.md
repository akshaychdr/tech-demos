# elevator-selective-collective

HyperFrames motion reel contrasting **down collective** (up-distributive / one hall button per landing) with **selective collective** (directional collective / LOOK): same passengers, same physics, with **simulated wait and journey times** from `composition/simulation.js`.

Built on [HeyGen HyperFrames](https://github.com/heygen-com/hyperframes). Bookmark: [2112609040962359354](https://x.com/i/status/2112609040962359354).

## Run

```bash
cd apps/elevator-selective-collective
bun install
bun run test
```

| Task | Command |
|------|---------|
| Storyboard stills (with cab preflight) | `bun run snapshot:stills` |
| Full reel MP4 (1920×1080 @ 60fps) | `bun run render:mp4` → `out/elevator-selective-collective.mp4` |
| Vite viewer (iframe of composition) | `bun run dev` → http://localhost:5173 |
| Record viewer window (1920×1080) | `bun run record:viewer` |
| Art prep (plate / passengers) | `bun run process:art` |
| Preview composition only | `npx hyperframes preview composition` |

See **`STORYBOARD.md`** for scene timing and simulation table.

## Layout

- **`composition/`** — HyperFrames HTML reel (art plate + neon CSS cab + GSAP timeline)
- **`public/composition/`** — symlink for the Vite iframe viewer
- **`storyboard-stills/`** — Phase 1 PNG keyframes
- **`out/`** — rendered MP4 and PR recordings (gitignored)
