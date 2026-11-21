# Anatomy Mirror v2

## Goal

A 12–16-year-old opens one GitHub Pages link and learns 8 skull bones and 5 face muscles on their own face, in the browser, with nothing recorded or uploaded.

## MVP

In: welcome with privacy note, `?beat=` banner, and three first-launch tips; Explore (bones, muscles, brain, labels, optional hand sketch); Touch and tell for 8 bones; Make a face for 5 muscles; a 5-question quiz (3 touch + 2 show-me) with timer, score, review, share card, and play again; phone-first layout; credits and licences.

Out: accounts, analytics, teacher mode, extra anatomy, offline install, welcome video, recording.

## Stack

- Vite + React + TypeScript — static Pages app, same `VITE_BASE_PATH` pattern as the other demos. No workflow edit.
- Tailwind + shadcn/ui — minimal UI primitives, custom theater styling on top.
- MediaPipe Tasks Vision (`FaceLandmarker` blendshapes + `HandLandmarker`) from the CDN, loaded only after Start.
- three.js — one lazy GLB, fit to the live face with a similarity transform.
- Bun test — region, expression, hold, and quiz scoring only.

## Tasks

1. Measure touch regions (6 quiz bones) and expression scores (5 muscles) on synthetic landmark and blendshape inputs before building the UI.
2. Export decimated BodyParts3D bones and a brain shell. Muscle surfaces are original schematics because BodyParts3D 4.3 has no meshes for those five muscles; the anatomy file stays CC BY-SA 2.1 JP.
3. Ship welcome, explore, touch, faces, quiz, share, and error states.
4. Prove it with a fake camera feed, screenshots, and a video at laptop and phone sizes.

## Deferred

- Real-device iOS pass (this environment has no camera).
- Teacher review of the fun facts (drafted in the app and listed on the PR).
