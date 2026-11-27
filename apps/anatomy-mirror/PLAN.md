# Anatomy Mirror — source-accurate overlay

## Goal

Match the measured overlay: one continuous crown, a feathered rim, 26 layer-colored labels in two columns, pose lerp, and the reveal / fit panel.

## Cause of the cut

The shared shader feathers every layer with the MediaPipe face oval, then forces pixels above a line eight pixels under the hairline back on (`uCrown`). Bone and brain drop out in that gap and the cap above it floats free. The neck fade, the camera planes, and a mesh split are not the cut. The cranium is one mesh. Bone, brain, muscle, and the outline no longer use that oval. The neck fade is `smoothstep(-12.4, -9.2, y)` in head centimetres.

## MVP

In: the 26 labels (layer, facing, sticky columns, 12.5px, 18px gap, halo, 2.6px dot). Landmark lerp 0.65 and pose lerp 0.6 / slerp 0.55 / scale 0.5. Feather `uFeather = feather * 0.75` with the source `soft` and neck `fade`. Reveal whole, half, or lens, with cut softness `feather * 5` cm. Slider ranges from the source. Labels on. Every mesh `frustumCulled = false` and `matrixAutoUpdate = false`.

Out: a new skull mesh, a warp, One Euro on the pose, a demo video, and any file outside this app.

## Tasks

1. Shader and pose: source feather, neck fade, lerp. Keep the crown fix.
2. Labels and the panel: 26 anchors, column layout, presets, half cut.
3. Tests, frontal and three-quarter screenshots, then the Pages build.
