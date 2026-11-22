# Anatomy Mirror — orbits, muscles, and the face fit

## Goal

The skull’s eye sockets, the face muscles, and the way both sit on a real face should read as an x-ray of that person, at the level of Hashem Al-Ghaili’s X-Ray Mirror.

## MVP

In: deep BodyParts3D orbits lined up with the irises and eye corners, with fresnel so the sockets recede and a faint eyeball in each one; smooth muscle surfaces (frontalis, orbicularis oculi, corrugator, zygomaticus, orbicularis oris, masseter, temporalis) with fiber stripes, soft edges, and blendshape motion; a per-face scale and offset from interpupillary distance, face width, and chin; a one-euro pose filter; a feathered face-oval edge on every reveal.

Out: a demo video, new quiz anatomy beyond the muscles above, copying the reference app’s source, editing `.github`.

## Stack

- Keep the Vite app. This is a visual fix, not a new scaffold.
- The mesh script stays the source of the GLB. A smooth warp slides the orbital openings onto the canonical eyes while the chin, nose, and cranium stay put. Muscles are rebuilt on that skull.
- three.js keeps the fresnel shader. Muscles add fiber stripes. A one-euro filter and a separate horizontal and vertical screen fit live in the scene.

## Tasks

1. Warp the orbits onto the eyes, smooth the rims, and rebuild the muscles with fiber coordinates and jaw/expression motion.
2. Fit scale and offset from the eyes, the face width, and the chin. Filter the pose. Feather the glow to the face oval on every reveal.
3. Check the result on a still face fed in as a camera, then `bun test` and the Pages build.

## Deferred

- A real phone camera pass. This environment uses a still portrait as the camera.
