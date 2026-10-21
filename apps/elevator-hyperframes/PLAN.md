# elevator-hyperframes — plan

Produced by following `skills/project-planning/SKILL.md`.

## Goal

Ship a small web app that explains how a traction elevator works, with a live HTML cutaway preview and MP4 export via HeyGen’s open-source HyperFrames CLI (HTML/CSS/JS → deterministic MP4).

## Single-user MVP (ships in the first cut)

- Controls: building height (floors), car speed (m/s), optional passenger load (kg).
- Honest derived numbers: travel distance, one-way travel time, counterweight mass (~car + 45% of rated load; labeled simplification).
- Live cutaway preview (React) mirroring the composition: machine room (motor, sheave, brake), hoist ropes, car vs counterweight, guide rails, overspeed governor + safety gear in a free-fall scenario.
- **Render video** calls `npx hyperframes render` on `composition/` with `--variables` JSON; serves MP4 for in-page playback and download.
- One committed sample reel (`samples/elevator-sample.mp4`, &lt;10 MB).
- README, root index row, bookmark tracking entry for HyperFrames bookmark `2112609040962359354`.

## Explicitly out of scope

- HeyGen cloud rendering / credits, Docker-only workflows, Lambda deploy.
- Hydraulic elevators, MRL variants, door operators, group control, regenerative drives.
- Full building simulation (only a representative shaft slice).
- Accounts, auth, persistence beyond current session renders.

## Tasks (vertical slices)

1. **HyperFrames composition** — `composition/index.html` with `data-composition-variables` (floors, speedMps, loadKg), GSAP seekable timeline `window.__timelines.main`, scenes with captions.
2. **Physics module** — `src/lib/elevatorPhysics.ts` (+ vitest): floor height, travel time, counterweight estimate, copy for labels.
3. **Preview UI** — shadcn controls + `ElevatorCutaway` animated preview synced to computed timing.
4. **Render API** — Bun `server/render.ts` (or Vite plugin middleware): spawn HyperFrames, stream/serve output from `renders/`.
5. **Docs & artifacts** — sample MP4, Playwright PR capture at 1440×900, PR with screenshot + video.

## Stack

- **Bun** — runtime, package manager, render API process.
- **Vite + React + TypeScript** (`bunx create-vite --template react-ts`) — matches sibling demos.
- **Tailwind v4 + shadcn/ui** — minimalist preset; `button`, `card`, `slider`, `label`, `badge`.
- **hyperframes** (CLI via `npx hyperframes@0.8.181`) — real render path; `composition/` is a standard init-style project.
- **Playwright** — PR validation recording (pattern from `apps/airllm`).
- **bunfig.toml** with `[install] minimumReleaseAge = 259200`.

## Layout

```
apps/elevator-hyperframes/
  bunfig.toml  PLAN.md  README.md  package.json
  composition/          # HyperFrames project (index.html, hyperframes.json)
  server/render.ts      # POST /api/render → hyperframes CLI
  src/
    App.tsx
    lib/elevatorPhysics.ts
    features/controls/
    features/cutaway/
    components/ui/
  samples/elevator-sample.mp4
  scripts/record-pr-artifacts.mjs
```

## Testing

- Vitest for `elevatorPhysics.ts` (travel time, counterweight formula).

## Deferred

- Shared single source between React SVG and composition DOM (would need build step into HTML); MVP keeps visuals parallel with shared math only.
- Audio narration / BGM in composition.

## Risks

- HyperFrames requires Node 22+ and FFmpeg — verified on VM (`node v22`, `ffmpeg 6.1`, Chrome present). If Puppeteer fails, run `npx hyperframes doctor` and report.
