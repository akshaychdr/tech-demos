# Anatomy Mirror — expression muscles on the rigid skull

## Goal

Replace the extraocular-and-tongue muscle layer with the facial-expression muscles from BodyParts3D 3.0, rigidly aligned onto the current 4.x skull.

## MVP

In: left and right meshes for frontalis, orbital and palpebral orbicularis oculi, orbicularis oris, zygomaticus major and minor, both levators of the upper lip, risorius, mentalis, depressor anguli oris, buccinator, nasalis, procerus, superficial and deep masseter, and temporalis. A similarity ICP (Umeyama) from the 3.0 frontal, mandible, and zygomatic bones onto the 4.0 bones, then the same similarity that already places the skull in the face frame. One merged muscle mesh, about 36k triangles, smooth normals. Masseter, temporalis, and the other jaw muscles stretch or follow `jawOpen`. Quiz anchors sit on these meshes. Credits name BodyParts3D 3.0 and 4.x.

Out: rebuilding the skull, a new scaffold, a demo video, deforming the muscles onto the face, and hunting muscles that are not in this list.

## Stack

- Keep the Vite app. Muscles come from `BodyParts3D_3.0_obj_99.zip` (files are `FMA*.obj`). Alignment targets are `FJ3200`, `FJ3289`, and `FJ3287` in the 4.0 isa zip, plus the right zygomatic when it is there.
- The existing fresnel shader and gain stay. Jaw motion is a per-vertex offset along the mandible’s hinge, driven by `jawOpen`.

## Tasks

1. Estimate the 3.0-to-4.0 similarity and record the scale and residuals.
2. Render the muscles over the skull alone (front, three-quarter, side) before replacing the app mesh.
3. Splice the mesh, jaw follow, anchors, and credits. Check a frontal and a three-quarter face, then the Pages build.

## Deferred

- A separate mesh per muscle. One merged layer is what the mirror draws.
- Corrugator supercilii. It is not in this parts list; the frown marker sits on procerus.
