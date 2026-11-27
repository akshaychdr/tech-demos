# Anatomy Mirror — Hashem fidelity

## Goal

On a real webcam the head reads as one face: a thin fresnel rim, a dark veil, and x-ray bones at true scale, matching Hashem Al-Ghaili's X-Ray Mirror numbers.

## MVP

In: delete the depth flatten, use `normalMatrix` normals, draw the skin twice (veil + outline), drop stale fit sliders (`anatomy-mirror-fit-v3`), restore the canonical skin box, weld that skin, put the hindbrain on Hashem's box, and keep x-ray gain, blending, and the listed defaults. A headless FaceLandmarker harness reports fit error and silhouette ratio on real faces, including skull-only, muscles-only, brain-only, outline-only, and all-on frames.

Out: a new app, files outside this folder, and stretching the expression muscles onto Hashem's larger muscle box (that would lift the eye rings off the eyes).

## Tasks

1. Shaders, veil, pose, and fit storage match the reference.
2. Repair the GLB: canonical skin, welded smooth skin normals, hindbrain box, posterior temporalis depth, baked normals.
3. Verify with the FaceLandmarker harness and a Chromium fake webcam that still has a v2 size of 1.4.
