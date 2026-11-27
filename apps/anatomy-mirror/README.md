# Anatomy Mirror

A phone-first mirror that teaches the skull and the muscles that move the face. The camera never leaves the device and stays in its natural color. MediaPipe places one BodyParts3D cranium, jaw, and the expression muscles on your face. The head outline is one thin additive rim on that skin, and the stage matches the video so each landmark maps straight onto the picture.

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

Welcome, then Explore. Skull, muscles, brain, eyes, the head outline, and labels start on. Touch and tell, Make a face, and a five-question quiz are still there. The panel has layer presets, X-ray or Solid, brightness, how much of you shows through, edge feather, and the fit sliders. Reveal can show the whole head, one half, or a lens. A link with `?beat=8` shows a challenge on the welcome screen.

## Licences

App code is MIT. The file `public/anatomy/bodyparts3d/anatomy.glb` is CC BY-SA 2.1 Japan. See that folder’s `LICENSE` and `ATTRIBUTION.md`.
