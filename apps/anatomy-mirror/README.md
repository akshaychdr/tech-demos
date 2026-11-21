# Anatomy Mirror

A phone-first mirror that teaches eight skull bones and five face muscles. The camera never leaves the device: MediaPipe finds the face and the fingertip, and a decimated BodyParts3D skull sits on top.

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

Welcome, then Explore (bones, muscles, brain, an optional hand sketch, labels), Touch and tell, Make a face, and a five-question quiz. A link with `?beat=8` shows a challenge on the welcome screen.

## Licences

App code is MIT. The file `public/anatomy/bodyparts3d/anatomy.glb` is CC BY-SA 2.1 Japan. See that folder’s `LICENSE` and `ATTRIBUTION.md`.
