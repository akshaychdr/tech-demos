# Anatomy Mirror — x-ray rebuild

## Goal

A student opens the same static Pages app and sees a Hashem-style x-ray of their own head: a smooth BodyParts3D skull (separate jaw), brain, and face muscles tracked with MediaPipe’s facial matrix, with the existing welcome, touch, expressions, quiz, share, and credits still working.

## MVP

In: higher-detail skull, mandible, and brain aligned to the MediaPipe canonical face; original muscle sheets where BodyParts3D 4.3 has no face-muscle meshes; x-ray and solid looks; feathered lens, whole-head, half, top, and lower-face reveals; independent skull, muscle, brain, and hand-bone layers; jaw driven by `jawOpen`; hand bones posed on HandLandmarker joints; leader-line labels; glow highlights and a small frosted fact card; one sans-serif UI with a phone bottom sheet.

Out: a demo video, accounts, extra quiz anatomy, editing `.github`, copying the reference app’s source.

## Stack

- Keep the Vite + React + TypeScript app. This is a visual rebuild, not a new scaffold.
- three.js ShaderMaterial for the fresnel x-ray and the solid look. MediaPipe Tasks Vision stays, now requesting the facial transformation matrix.
- Meshes are rebuilt by `scripts/build_anatomy.py` from BodyParts3D 4.3 element OBJs, decimated only enough to stay a lazy-loaded GLB. CC BY-SA 2.1 JP.
- Bun test covers the screen-fit math plus the existing touch, expression, and quiz checks.

## Tasks

1. Export a smoother skull, jaw, brain, shell, and hand-bone templates, and check alignment against the canonical face.
2. Drive the head from the facial matrix plus a per-frame landmark scale fit. Articulate the jaw. Pose hand-bone segments.
3. Restyle the stage: frosted panels, pill toggles, collapsible phone sheet, 16px type, no heavy bars.
4. `bun test` and `VITE_BASE_PATH=/tech-demos/anatomy-mirror/ bun run build` must pass.

## Deferred

- Real iOS camera pass (this environment has no camera). A `?preview=1` pose is only for checking the render.
- Teacher review of the fun facts.
