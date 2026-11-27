# Anatomy Mirror — canonical fit and thin bone lines

## Goal

Place the head in MediaPipe canonical face space and run Hashem's per-frame fit unchanged, so the bones sit on the face, and draw those bones as his thin additive rim instead of a glow.

## MVP

In: a similarity of the existing head meshes onto his canonical landmark coordinates. His `updateHead` step (lerp 0.6 / 0.55 / 0.5, centroid scale clamped 0.6–1.6, fit lerp 0.5 and 0.7, projection correction, manual `tmpM * fitM`, jaw 0.36, drop the pose after 250ms without a face). Cover crop stays in the landmark-to-NDC map because the stage uses object-fit cover; the video and the canvases stay mirrored together. One rim shader, his colors, gains, and render order. Veil opacity is `1 - real` with real at 0.12. Cranium decimated to about 58k triangles and the jaw to about 14k, after dropping any inner shell. A 720p pixel-error check, plus frontal, three-quarter, head-turned, and a skull-only / everything pair.

Out: a new skull topology from scratch, a warp, bloom, a demo video, and any file outside this app.

## Tasks

1. Bake the similarity into the head meshes, anchors, and labels. Decimate the outer cranium and jaw.
2. Replace the orbit fit with his screen step, and replace the x-ray shader with his rim.
3. Measure mean pixel error at 720p, then the screenshots and the Pages build.
