# Anatomy file attribution

`anatomy.glb` contains:

- One cranium and one mandible from BodyParts3D 4.3. The cranium is the outer surface of the welded skull bones. Duplicate element shells are dropped. The jaw is the mandible, subdivided once.
- Eyes (cornea and sclera), a head crop of the skin, and a cerebrum shell plus the cerebellum, from BodyParts3D.
- Right-hand carpals and finger bones from BodyParts3D, posed between the joints MediaPipe tracks. The same bones are mirrored for the left hand.
- The 23 element meshes under FMA9616 “muscle of head” in the BodyParts3D 4.0 isa tree (extraocular muscles, tongue, and palate), rigidly placed on the 4.3 skull. The muscles of facial expression are not in that release.

Source: [BodyParts3D](https://lifesciencedb.jp/bp3d/), © Database Center for Life Science (DBCLS).  
Licence: [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en).

Meshes were aligned to the MediaPipe canonical face (Apache 2.0) and decimated for the browser. Rebuild with `python3 scripts/build_anatomy.py` (needs network access to lifesciencedb.jp and the cached manifest).
