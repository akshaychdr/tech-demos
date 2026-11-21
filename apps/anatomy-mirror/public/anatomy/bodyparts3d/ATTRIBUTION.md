# Anatomy file attribution

`anatomy.glb` contains:

- Frontal, parietal, temporal, occipital, nasal, zygomatic, maxilla, and mandible bones, decimated from BodyParts3D 4.3 element meshes. The sphenoid is included with the temporal bone so the temple stays closed.
- A brain shell assembled from BodyParts3D cortical gyri and the cerebellum, remeshed into one surface, then decimated. Release 4.3 has no single cerebrum mesh.
- Right-hand carpals and finger bones from BodyParts3D, posed between the joints MediaPipe tracks. The same bones are mirrored for the left hand.
- Schematic ribbons for frontalis, corrugator supercilii, orbicularis oculi, zygomaticus major, and masseter. Those muscles are not in the BodyParts3D 4.3 manifest, so the surfaces are original and placed on the MediaPipe canonical face.

Source: [BodyParts3D](https://lifesciencedb.jp/bp3d/), © Database Center for Life Science (DBCLS).  
Licence: [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en).

Meshes were aligned to the MediaPipe canonical face (Apache 2.0) and decimated for the browser. Rebuild with `python3 scripts/build_anatomy.py` (needs network access to lifesciencedb.jp and the cached manifest).
