#!/usr/bin/env python3
"""Put the shipped head back on Hashem's boxes and bake smooth normals.

Skin returns to the canonical shell (the pre-hug GLB). Vertices on the mirror
plane are snapped together and the skin normals are averaged so the midline
is one soft edge. The hindbrain is axis-fitted onto his hindbrain box. The
posterior temporalis, behind the ears, is stretched back to his muscle box;
the face of the muscle sheet is left where the eyes and the mouth already sit.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
GLB = ROOT / "public/anatomy/bodyparts3d/anatomy.glb"
sys.path.insert(0, str(ROOT / "scripts"))
from canonical_space import write_revision  # noqa: E402

HINDBRAIN = np.array(
    [[-5.59772, -3.60263, -12.35683], [-5.59772 + 10.98145, -3.60263 + 8.56924, -12.35683 + 8.83706]],
    dtype=np.float64,
)
# Behind the ears. In front of this plane the eyes and the mouth stay put.
MUSCLE_Z_CUT = -4.0
MUSCLE_Z_BACK = -15.80511
HEAD = ("cranium", "jaw", "eyes", "cerebrum", "hindbrain", "skin", "muscles")


def axis_fit(vertices: np.ndarray, box: np.ndarray) -> np.ndarray:
    lo = vertices.min(0)
    hi = vertices.max(0)
    scale = (box[1] - box[0]) / np.maximum(hi - lo, 1e-6)
    center = (lo + hi) / 2
    target = (box[0] + box[1]) / 2
    return (vertices - center) * scale + target


def extend_posterior(vertices: np.ndarray) -> np.ndarray:
    out = np.array(vertices, dtype=np.float64, copy=True)
    z = out[:, 2]
    back = z < MUSCLE_Z_CUT
    if not np.any(back):
        return out
    zmin = float(z.min())
    scale = (MUSCLE_Z_BACK - MUSCLE_Z_CUT) / (zmin - MUSCLE_Z_CUT)
    out[back, 2] = MUSCLE_Z_CUT + (z[back] - MUSCLE_Z_CUT) * scale
    return out


def face_vertex_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    triangles = vertices[faces]
    face_normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    normals = np.zeros_like(vertices)
    for corner in range(3):
        np.add.at(normals, faces[:, corner], face_normals)
    length = np.linalg.norm(normals, axis=1, keepdims=True)
    return normals / np.maximum(length, 1e-8)


def smooth_normals(mesh: trimesh.Trimesh, rounds: int) -> None:
    normals = face_vertex_normals(np.asarray(mesh.vertices, dtype=np.float64), np.asarray(mesh.faces))
    neighbors = mesh.vertex_neighbors
    for _ in range(rounds):
        averaged = np.zeros_like(normals)
        for index, ring in enumerate(neighbors):
            if not ring:
                averaged[index] = normals[index]
                continue
            averaged[index] = normals[index] + normals[list(ring)].sum(axis=0)
        length = np.linalg.norm(averaged, axis=1, keepdims=True)
        normals = averaged / np.maximum(length, 1e-8)
    mesh.vertex_normals = normals


def weld_skin(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    vertices = np.array(mesh.vertices, dtype=np.float64, copy=True)
    vertices[np.abs(vertices[:, 0]) < 0.05, 0] = 0.0
    welded = trimesh.Trimesh(vertices=vertices, faces=np.array(mesh.faces), process=False)
    welded.merge_vertices(digits_vertex=3)
    welded.update_faces(welded.unique_faces() & welded.nondegenerate_faces())
    welded.remove_unreferenced_vertices()
    smooth_normals(welded, 6)
    return welded


def bake(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    copied = trimesh.Trimesh(
        vertices=np.array(mesh.vertices, dtype=np.float64, copy=True),
        faces=np.array(mesh.faces, copy=True),
        process=False,
    )
    copied.vertex_normals = face_vertex_normals(np.asarray(copied.vertices), np.asarray(copied.faces))
    return copied


def bounds(mesh: trimesh.Trimesh) -> tuple[np.ndarray, np.ndarray]:
    vertices = np.asarray(mesh.vertices)
    return vertices.min(0), vertices.max(0)


def main() -> None:
    previous = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/glb/c0fa522.glb")
    current = trimesh.load(GLB, force="scene")
    canonical = trimesh.load(previous, force="scene")
    if "skin" not in canonical.geometry:
        raise SystemExit(f"{previous} has no skin mesh")
    skin = weld_skin(canonical.geometry["skin"])
    hind = current.geometry["hindbrain"]
    hind_vertices = axis_fit(np.asarray(hind.vertices, dtype=np.float64), HINDBRAIN)
    hind = trimesh.Trimesh(vertices=hind_vertices, faces=np.asarray(hind.faces), process=False)
    hind = bake(hind)
    muscles = current.geometry["muscles"]
    muscle_vertices = extend_posterior(np.asarray(muscles.vertices, dtype=np.float64))
    muscles = trimesh.Trimesh(vertices=muscle_vertices, faces=np.asarray(muscles.faces), process=False)
    muscles = bake(muscles)
    out = trimesh.Scene()
    for name in current.geometry:
        if name == "skin":
            mesh = skin
        elif name == "hindbrain":
            mesh = hind
        elif name == "muscles":
            mesh = muscles
        elif name in HEAD:
            mesh = bake(current.geometry[name])
        else:
            mesh = bake(current.geometry[name])
        out.add_geometry(mesh, node_name=name, geom_name=name)
        lo, hi = bounds(mesh)
        size = hi - lo
        print(
            f"{name:12} min [{lo[0]:7.2f} {lo[1]:7.2f} {lo[2]:7.2f}] size [{size[0]:6.2f} {size[1]:6.2f} {size[2]:6.2f}]",
            flush=True,
        )
    out.export(GLB)
    digest = write_revision(GLB.stat().st_size)
    print("wrote", GLB, GLB.stat().st_size, digest, flush=True)


if __name__ == "__main__":
    main()
