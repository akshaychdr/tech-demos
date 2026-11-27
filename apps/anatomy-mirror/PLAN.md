# Anatomy Mirror — one head, natural color

## Goal

Make the live face and the overlaid head read as one see-through head: the anatomy sits in canonical face space, centered on the midline, and the camera stays in natural color with no crop.

## MVP

In: one joint similarity (scale, rotation, translation) that carries every head mesh onto the canonical eyeballs, nasion, menton, zygomatic arches, and the labelled bone points, then a mirror across the midline. A symmetric head-only skin with no shoulder. The video filter removed. The stage aspect set to the video (`--ar`) so the video and both WebGL canvases fill that box and object-fit cover does not crop. Video, head canvas, and hand canvas stay mirrored; the HUD does not. Everything from the previous fit and the rim shader stays.

Out: a new app, a warp of the orbits, a demo video, and any file outside this app.

## Tasks

1. Export the head in canonical space and print every mesh bound against the reference boxes.
2. Remove the video CSS filter and size the stage to the video aspect.
3. Screenshots on a real color face: frontal, three-quarter, head turned. Natural color outside the veil.
