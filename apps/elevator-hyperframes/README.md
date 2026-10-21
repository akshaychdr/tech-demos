# elevator-hyperframes

Animated explainer of **how a traction elevator works**, with a live HTML cutaway preview and MP4 export via [HeyGen HyperFrames](https://github.com/heygen-com/hyperframes) (HTML/CSS/JS → deterministic MP4).

Inspired by bookmark [2112609040962359354](https://x.com/i/status/2112609040962359354) (@thegreatest_sv).

## What it demos

- Pick **floors**, **car speed (m/s)**, and optional **passenger load (kg)**.
- See a live SVG cutaway: machine room (motor, sheave, brake), hoist ropes, car vs counterweight, guide rails, and an overspeed governor / safety-gear scenario.
- **Render video** runs the real HyperFrames CLI on `composition/index.html` with `--variables` for your settings.
- Physics labels use honest formulas with stated simplifications (3 m floor height; counterweight ≈ empty car + 45% of rated load).

## Run locally

Requirements: **Bun**, **Node 22+**, **FFmpeg**, and Chrome/Chromium (HyperFrames uses Puppeteer).

```bash
cd apps/elevator-hyperframes
bun install

# Terminal 1 — render API
bun run dev:api

# Terminal 2 — UI
bun run dev
```

Open http://127.0.0.1:5173, adjust sliders, click **Render video**.

### Sample reel (committed)

`samples/elevator-sample.mp4` — regenerate:

```bash
bun run render:sample
```

### HyperFrames only

```bash
npx hyperframes@0.8.181 render composition -o out.mp4 \
  --variables '{"floors":12,"speedMps":1.75,"loadKg":200}' --quality draft -f 24
```

## Tests

```bash
bun run test
```
