# Anatomy Mirror

A phone-first mirror that teaches the skull and the muscles that move the face. The camera never leaves the device and stays in its natural color. MediaPipe places one BodyParts3D cranium and jaw on your face. The skin is drawn twice: a dark veil, then a thin additive fresnel rim. Skull, eyes, and that outline start on. Brain and muscles start off. Fit sliders are saved under `anatomy-mirror-fit-v3` and start at 1 and 0.

Hosted at [https://akshaychdr.github.io/tech-demos/anatomy-mirror/](https://akshaychdr.github.io/tech-demos/anatomy-mirror/).

## Run

```bash
bun install
bun run dev
```

Open `http://localhost:5177/tech-demos/anatomy-mirror/`.

```bash
bun test
bun run build
```

## What you can do

Welcome, then Explore. Skull, eyes, and the head outline start on. Touch and tell, Make a face, and a five-question quiz are still there. The panel has layer presets, X-ray or Solid, brightness, how much of you shows through, edge feather, and the fit sliders. Reset fit returns every slider to the neutral pose. Reveal can show the whole head, one half, or a lens. A link with `?beat=8` shows a challenge on the welcome screen. `?live=1&face=fixtures/faces/near.jpg&track=1&layer=skull&panel=0` renders one still photograph through the real face tracker.

## Licences

App code is MIT. The file `public/anatomy/bodyparts3d/anatomy.glb` is CC BY-SA 2.1 Japan. See that folder’s `LICENSE` and `ATTRIBUTION.md`.
