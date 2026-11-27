# Anatomy Mirror — one face, pinned to the camera

## Goal

The live webcam and the anatomy read as one head: a single thin outline on the real silhouette, one pair of eyes, and a per-frame fit whose landmarks land on the face.

## MVP

In: one skin mesh, drawn once as the additive `#6fb6ff` rim (gain 0.55). No second skin, no dark veil mesh, no procedural eye spheres. Closed eyeball spheres in the one `eyes` mesh. The skin surface passes through canonical landmarks 1, 152, 234, 454, and 10 within 0.5 cm. Landmark targets use `(x*2-1, 1-y*2)` because the stage matches the video and the video fills the canvas. A tracking overlay draws all 478 landmarks and the 13 fit points. The GLB URL carries a content hash. Runtime scene graph lists every mesh once.

Out: a second app, a demo video, and files outside this folder.

## Tasks

1. Hug the skin to those five landmarks and replace the open eye shells with closed spheres.
2. Draw the skin once, guard the camera mount so a second engine cannot leave a canvas behind, and map the fit in video pixels. The 63° pose over-perspectives a close face, so the head keeps a quarter of that camera-space depth before the same scale-and-shift.
3. Screenshots with tracking dots on a real face at 1280×720, 640×480, and 720×1280, plus the live scene graph.
