# Anatomy file attribution

`anatomy.glb` contains:

- One cranium and one mandible from BodyParts3D 4.3. The cranium is the outer surface of the welded skull bones. Duplicate element shells are dropped. The jaw is the mandible, subdivided once.
- Eyes (cornea and sclera), a head crop of the skin, and a cerebrum shell plus the cerebellum, from BodyParts3D.
- Right-hand carpals and finger bones from BodyParts3D, posed between the joints MediaPipe tracks. The same bones are mirrored for the left hand.
- Facial expression muscles from BodyParts3D 3.0 (frontalis, orbicularis oculi, orbicularis oris, zygomaticus major and minor, the upper-lip levators, risorius, mentalis, depressor anguli oris, buccinator, nasalis, procerus, superficial and deep masseter, and temporalis). They were simplified and re-aligned onto the 4.x skull. The frown marker sits on procerus, which is the mesh in that set.

Source: [BodyParts3D](https://lifesciencedb.jp/bp3d/), © Database Center for Life Science (DBCLS).  
Licence: [CC BY-SA 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en).

Meshes were aligned to the MediaPipe canonical face (Apache 2.0) and decimated for the browser. Rebuild with `python3 scripts/build_anatomy.py` (needs network access to lifesciencedb.jp and the cached manifest).
