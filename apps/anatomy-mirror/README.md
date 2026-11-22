# Anatomy Mirror

A phone-first mirror that teaches eight skull bones and the muscles that move the face. The camera never leaves the device. MediaPipe places a BodyParts3D skull, brain, and hand bones on your face, with the eye sockets lined up to your eyes and an x-ray glow that feathers into the skin.

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

Welcome, then Explore (skull, muscles, brain, and hand bones, shown together, plus labels), Touch and tell, Make a face, and a five-question quiz. Switch between the x-ray glow and a solid look, and open the anatomy with a lens, the whole head, or a soft cut. A link with `?beat=8` shows a challenge on the welcome screen.

## Licences

App code is MIT. The file `public/anatomy/bodyparts3d/anatomy.glb` is CC BY-SA 2.1 Japan. See that folder’s `LICENSE` and `ATTRIBUTION.md`.
