#!/usr/bin/env python3
"""Put the expression muscles on the cranium's frame.

The cranium was mirrored across the midline. The muscle sheet was not, so
one side sat on the bone and the other was shifted off the arch and the
orbit. This keeps the half that already meets the bone, reflects it, and
undoes the posterior stretch that pulled temporalis toward the occiput.
One shared vertical lift, taken from the eye-ring error, is applied to
the whole sheet. No muscle is recentred on its own.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from canonical_space import write_revision  # noqa: E402

GLB = ROOT / "public/anatomy/bodyparts3d/anatomy.glb"
ATTRS = ROOT / "public/anatomy/bodyparts3d/muscle-attrs.json"
# The posterior stretch in repair_fidelity.py mapped this z to -15.805.
Z_CUT = -4.0
Z_BEFORE = -11.043919563293457
Z_AFTER = -15.80511


def normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    triangles = vertices[faces]
    face_n = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    out = np.zeros_like(vertices)
    for corner in range(3):
        np.add.at(out, faces[:, corner], face_n)
    length = np.linalg.norm(out, axis=1, keepdims=True)
    return out / np.maximum(length, 1e-8)


def unstretch(vertices: np.ndarray) -> np.ndarray:
    out = np.array(vertices, dtype=np.float64, copy=True)
    if float(out[:, 2].min()) > -14.0:
        return out
    stretch = (Z_AFTER - Z_CUT) / (Z_BEFORE - Z_CUT)
    back = out[:, 2] < Z_CUT
    out[back, 2] = Z_CUT + (out[back, 2] - Z_CUT) / stretch
    return out


def mirror_positive(vertices: np.ndarray, faces: np.ndarray, move: np.ndarray, uv: np.ndarray):
    """Keep x >= 0, the side that meets the zygoma, and reflect it."""
    eps = 0.08
    plane = np.abs(vertices[:, 0]) <= eps
    keep = vertices[:, 0] > eps
    new_index = np.full(len(vertices), -1, dtype=np.int64)
    new_v: list[np.ndarray] = []
    new_m: list[np.ndarray] = []
    new_u: list[np.ndarray] = []
    mirror_of: dict[int, int] = {}
    for index in np.where(plane)[0]:
        new_index[index] = len(new_v)
        point = vertices[index].copy()
        point[0] = 0.0
        new_v.append(point)
        new_m.append(move[index].copy())
        new_u.append(uv[index].copy())
    for index in np.where(keep)[0]:
        new_index[index] = len(new_v)
        new_v.append(vertices[index].copy())
        new_m.append(move[index].copy())
        new_u.append(uv[index].copy())
        mirror_of[int(index)] = len(new_v)
        reflected = vertices[index].copy()
        reflected[0] *= -1
        reflected_move = move[index].copy()
        reflected_move[0] *= -1
        new_v.append(reflected)
        new_m.append(reflected_move)
        new_u.append(uv[index].copy())
    new_f: list[list[int]] = []
    for tri in faces:
        if not all(plane[int(i)] or keep[int(i)] for i in tri):
            continue
        kept = [int(new_index[int(i)]) for i in tri]
        if len(set(kept)) == 3:
            new_f.append(kept)
        mirrored: list[int] = []
        for index in tri:
            index = int(index)
            if index in mirror_of:
                mirrored.append(mirror_of[index])
            elif plane[index]:
                mirrored.append(int(new_index[index]))
            else:
                mirrored = []
                break
        if len(mirrored) == 3 and len(set(mirrored)) == 3:
            new_f.append(list(reversed(mirrored)))
    return (
        np.array(new_v, dtype=np.float64),
        np.array(new_f, dtype=np.int64),
        np.array(new_m, dtype=np.float64),
        np.array(new_u, dtype=np.float64),
    )


def bone_mean(vertices: np.ndarray, mask: np.ndarray) -> np.ndarray:
    return vertices[mask].mean(0)


def alignment_rows(muscles: np.ndarray, cranium: np.ndarray, jaw: np.ndarray) -> list[tuple[str, float]]:
    rows: list[tuple[str, float]] = []
    for sign, name in ((-1.0, "R"), (1.0, "L")):
        band = np.hypot(cranium[:, 0] - sign * 3.1, cranium[:, 1] - 3.82)
        orbit = bone_mean(cranium, (band > 1.15) & (band < 2.6) & (cranium[:, 2] > 2.2))
        distance = np.linalg.norm(muscles - orbit, axis=1)
        ring = muscles[(distance > 0.55) & (distance < 2.0)]
        rows.append((f"orbicularis oculi {name}", float(np.linalg.norm(ring.mean(0) - orbit))))
        frontal = bone_mean(
            cranium,
            (cranium[:, 0] * sign > 1.2)
            & (cranium[:, 0] * sign < 3.8)
            & (cranium[:, 1] > 6.2)
            & (cranium[:, 1] < 8.6)
            & (cranium[:, 2] > 3.2),
        )
        sheet = muscles[
            (muscles[:, 0] * sign > 1.2)
            & (muscles[:, 0] * sign < 3.8)
            & (muscles[:, 1] > 6.2)
            & (muscles[:, 1] < 8.6)
            & (muscles[:, 2] > 2.8)
        ]
        rows.append((f"frontalis {name}", float(np.linalg.norm(sheet.mean(0) - frontal))))
        fossa = bone_mean(
            cranium,
            (cranium[:, 0] * sign > 6.0)
            & (cranium[:, 1] > 4.5)
            & (cranium[:, 1] < 7.5)
            & (cranium[:, 2] < -2.5)
            & (cranium[:, 2] > -6.0),
        )
        fan = muscles[
            (muscles[:, 0] * sign > 6.0)
            & (muscles[:, 1] > 4.5)
            & (muscles[:, 1] < 7.5)
            & (muscles[:, 2] < -2.5)
            & (muscles[:, 2] > -6.0)
        ]
        rows.append((f"temporalis {name}", float(np.linalg.norm(fan.mean(0) - fossa))))
        zygoma = bone_mean(
            cranium,
            (cranium[:, 0] * sign > 5.8)
            & (np.abs(cranium[:, 1] - 1.15) < 0.9)
            & (cranium[:, 2] > 0.4)
            & (cranium[:, 2] < 2.4),
        )
        near = muscles[np.linalg.norm(muscles - zygoma, axis=1) < 1.2]
        rows.append((f"zygoma {name}", float(np.linalg.norm(near.mean(0) - zygoma))))
        ramus_band = jaw[
            (jaw[:, 0] * sign > 4.2) & (jaw[:, 1] > -2.4) & (jaw[:, 1] < 0.0) & (jaw[:, 2] < 0.4)
        ]
        lateral = np.quantile(ramus_band[:, 0] * sign, 0.85)
        ramus = ramus_band[ramus_band[:, 0] * sign >= lateral].mean(0)
        rows.append((f"ramus {name}", float(np.linalg.norm(muscles - ramus, axis=1).min())))
    teeth = jaw[(np.abs(jaw[:, 0]) < 0.9) & (jaw[:, 1] < -5.1) & (jaw[:, 1] > -6.6)]
    incisors = teeth[teeth[:, 2] >= np.quantile(teeth[:, 2], 0.8)].mean(0)
    mouth = muscles[(np.abs(muscles[:, 0]) < 1.1) & (muscles[:, 1] < -5.0) & (muscles[:, 1] > -6.5) & (muscles[:, 2] > 3.6)]
    rows.append(("orbicularis oris", float(np.linalg.norm(mouth.mean(0) - incisors))))
    return rows


def main() -> None:
    scene = trimesh.load(GLB, force="scene")
    muscles = scene.geometry["muscles"]
    vertices = unstretch(np.asarray(muscles.vertices, dtype=np.float64))
    faces = np.asarray(muscles.faces)
    attrs = json.loads(ATTRS.read_text())
    spec = attrs["muscles"]
    move = np.array(spec["move"], dtype=np.float64).reshape(-1, 3)
    uv = np.array(spec["uv"], dtype=np.float64).reshape(-1, 2)
    if len(move) != len(vertices):
        raise SystemExit(f"moves {len(move)} do not match vertices {len(vertices)}")
    mirrored = vertices.copy()
    mirrored[:, 0] *= -1
    # Already reflected once: the two halves meet.
    from scipy.spatial import cKDTree

    mirror_gap = float(np.median(cKDTree(mirrored).query(vertices)[0]))
    if mirror_gap > 0.35:
        vertices, faces, move, uv = mirror_positive(vertices, faces, move, uv)
        print(f"mirrored the aligned half, gap was {mirror_gap:.2f} cm", flush=True)
    else:
        print(f"muscles already mirrored, gap {mirror_gap:.2f} cm", flush=True)
        return
    cranium = np.asarray(scene.geometry["cranium"].vertices)
    jaw = np.asarray(scene.geometry["jaw"].vertices)
    # One lift for the whole sheet, from the mean eye-ring height error.
    y_error = 0.0
    count = 0
    for sign in (-1.0, 1.0):
        band = np.hypot(cranium[:, 0] - sign * 3.1, cranium[:, 1] - 3.82)
        orbit = bone_mean(cranium, (band > 1.15) & (band < 2.6) & (cranium[:, 2] > 2.2))
        distance = np.linalg.norm(vertices - orbit, axis=1)
        ring = vertices[(distance > 0.55) & (distance < 2.0)]
        y_error += float(ring.mean(0)[1] - orbit[1])
        count += 1
    lift = -y_error / max(count, 1)
    lift = float(np.clip(lift, -0.6, 0.6))
    vertices = vertices.copy()
    vertices[:, 1] += lift
    print(f"shared lift {lift:.3f} cm", flush=True)
    mesh = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    mesh.vertex_normals = normals(vertices, faces)
    mesh.visual.vertex_colors = [220, 230, 240, 255]
    out = trimesh.Scene()
    for name, geom in scene.geometry.items():
        out.add_geometry(mesh if name == "muscles" else geom, node_name=name, geom_name=name)
    out.export(GLB)
    spec["move"] = [round(float(v), 5) for v in move.reshape(-1)]
    spec["uv"] = [round(float(v), 5) for v in uv.reshape(-1)]
    attrs["muscles"] = spec
    ATTRS.write_text(json.dumps(attrs))
    rows = alignment_rows(vertices, cranium, jaw)
    print(f"{'feature':24} {'offset cm':>10}")
    worst = 0.0
    for name, offset in rows:
        worst = max(worst, offset)
        print(f"{name:24} {offset:10.3f}")
    print(f"worst {worst:.3f} cm", flush=True)
    size = GLB.stat().st_size
    digest = write_revision(size)
    print("wrote", GLB, size, digest, flush=True)


def bone_mean(vertices: np.ndarray, mask: np.ndarray) -> np.ndarray:
    return vertices[mask].mean(0)


if __name__ == "__main__":
    main()
