# Anatomy Mirror — one clean skull, then the face

## Goal

Ship one watertight cranium and one jaw, with even triangles and a crisp fresnel edge, then lay the real BodyParts3D face muscles and a skin veil on that rigid skull.

## MVP

In: drop duplicate bone shells, build one watertight cranium (outer surface, smooth normals, no torn edges) and keep the mandible as the jaw. Standalone fresnel renders (front, three-quarter, side) before the mesh is wired into the app. Muscles are the 23 BodyParts3D 4.0 isa elements under FMA9616, named from the FMA parts list, merged, and rigidly aligned. One skin mesh drawn as a dark veil and again as a blue fresnel outline. X-ray fresnel with per-layer gains. Pose from the face matrix, then a smoothed uniform 2D scale and offset (0.6–1.6) plus Fit sliders. Small type. Default is skull, eyes, and outline on; brain, muscles, and labels off.

Out: a new scaffold, a demo video, copying the reference source, editing `.github`, deforming the skull onto the eyes.

## Stack

- Keep the Vite app and `scripts/build_anatomy.py`. Bones stay BodyParts3D 4.3. Muscles come from `isa_BP3D_4.0_obj_99`.
- One similarity into canonical-face centimetres. The 4.0 muscles are registered onto this skull because that release does not share coordinates with 4.3.
- three.js keeps the fresnel shader. The screen fit is a uniform least-squares scale and offset on the projection.

## Tasks

1. Build the watertight cranium and jaw and render them alone (front, three-quarter, side) with the fresnel shader. Do not wire a torn or doubled shell into the app.
2. Identify the 23 muscle-of-head elements, merge them, and replace the handmade sheets.
3. Add the skin veil and outline, the layer gains, the screen fit, and the smaller controls.
4. Check a frontal and a three-quarter face, then the Pages build.

## Deferred

- A live phone pass. This environment uses still portraits as the camera.
