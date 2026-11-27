#!/usr/bin/env python3
"""Place the exported head in canonical face space.

One similarity, solved on the eyeballs, nasion, menton, zygomatic arches,
tragi, and the labelled bone points, is applied to every head mesh. The
skull is then mirrored across the midline. A residual axis-aligned scale
(no shear) lands each structure's box on the reference box. Expression
muscles keep the cranium's scale so they stay on the face. Hands stay put.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
GLB = ROOT / "public/anatomy/bodyparts3d/anatomy.glb"
ANCHORS = ROOT / "public/anatomy/bodyparts3d/anchors.json"
MUSCLES = ROOT / "public/anatomy/bodyparts3d/muscle-attrs.json"
NODES = ROOT / "public/anatomy/bodyparts3d/nodes.json"
LABELS = ROOT / "src/domain/headLabels.ts"
REVISION = ROOT / "src/scene/anatomyRevision.ts"

HEAD = ("cranium", "jaw", "eyes", "cerebrum", "hindbrain", "skin", "muscles")
BOX = {
    "cranium": np.array([[-7.89, -6.32, -15.59], [7.83, 14.16, 6.11]]),
    "cerebrum": np.array([[-7.33, -0.86, -14.84], [7.25, 13.59, 3.64]]),
    "eyes": np.array([[-4.76, 0.63, 0.31], [4.72, 4.09, 3.96]]),
    "skin": np.array([[-10.80, -12.59, -16.04], [10.21, 14.55, 7.95]]),
    "muscles": np.array([[-8.54, -7.44, -15.81], [8.48, 14.41, 6.08]]),
    "jaw": np.array([[-5.57, -7.58, -4.30], [5.39, 0.90, 5.09]]),
    "hindbrain": np.array([[-5.59772, -3.60263, -12.35683], [5.38373, 4.96661, -3.51977]]),
}
# Posterior temporalis, behind the ears. The face of the muscle sheet stays put.
MUSCLE_Z_CUT = -4.0
MUSCLE_Z_BACK = -15.80511
EYE_L = np.array([2.9, 2.85, 3.8])
EYE_R = np.array([-2.9, 2.85, 3.8])
# id -> (mesh, canonical points). Missing labels are carried by the mesh affine.
LABEL_TARGETS = {
    "frontal-bone": ("cranium", [[0.13, 8.05, 4.35], [-0.13, 8.05, 4.35]]),
    "parietal-bone": ("cranium", [[-5.55, 11.0, -10.68], [5.55, 11.0, -10.68]]),
    "temporal-bone": ("cranium", [[-6.5, 0.0, -6.15], [6.5, 0.0, -6.15]]),
    "occipital-bone": ("cranium", [[0.14, 3.45, -15.35]]),
    "nasal-bone": ("cranium", [[0.04, 2.18, 5.59]]),
    "zygomatic-bone": ("cranium", [[-5.0, 0.27, 2.3], [5.0, 0.27, 2.3]]),
    "mandible": ("jaw", [[-0.12, -7.4, 4.22]]),
    "teeth": ("jaw", [[0.4, -2.32, 4.68], [-0.4, -2.32, 4.68]]),
}


def umeyama(src: np.ndarray, dst: np.ndarray, weights: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
    w = weights / weights.sum()
    mu_s = (src * w[:, None]).sum(0)
    mu_d = (dst * w[:, None]).sum(0)
    xs = src - mu_s
    yd = dst - mu_d
    cov = (yd * w[:, None]).T @ xs
    u, singular, vt = np.linalg.svd(cov)
    sign = np.eye(3)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        sign[2, 2] = -1
    rot = u @ sign @ vt
    var = float((w[:, None] * xs**2).sum())
    scale = float(np.trace(np.diag(singular) @ sign) / max(var, 1e-12))
    trans = mu_d - scale * (rot @ mu_s)
    return scale, rot, trans


def apply_points(pts: np.ndarray, scale: float, rot: np.ndarray, trans: np.ndarray) -> np.ndarray:
    return scale * (np.asarray(pts, dtype=np.float64) @ rot.T) + trans


def apply_vectors(vecs: np.ndarray, scale: float, rot: np.ndarray) -> np.ndarray:
    return scale * (np.asarray(vecs, dtype=np.float64) @ rot.T)


def eye_centers(vertices: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    order = np.argsort(vertices[:, 0])
    xs = vertices[order, 0]
    gap = int(np.argmax(np.diff(xs)))
    mid = 0.5 * (xs[gap] + xs[gap + 1])
    right = vertices[vertices[:, 0] < mid]
    left = vertices[vertices[:, 0] >= mid]
    if len(right) == 0 or len(left) == 0:
        mid = float(np.median(vertices[:, 0]))
        right = vertices[vertices[:, 0] < mid]
        left = vertices[vertices[:, 0] >= mid]
    return right.mean(0), left.mean(0)


def _extreme(vertices: np.ndarray, mask: np.ndarray, axis: int, sign: float) -> np.ndarray:
    band = vertices[mask]
    if len(band) < 12:
        return vertices[int(np.argmax(sign * vertices[:, axis]))]
    return band[int(np.argmax(sign * band[:, axis]))]


def landmark_pairs(cranium: np.ndarray, jaw: np.ndarray, eyes: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Anatomical sources and the canonical targets, plus per-point weights."""
    right, left = eye_centers(eyes)
    mid = 0.5 * float(cranium[:, 0].min() + cranium[:, 0].max())
    eye_y = 0.5 * float(right[1] + left[1])
    near = np.abs(cranium[:, 0] - mid) < 1.3
    nasion = _extreme(
        cranium,
        near & (cranium[:, 1] > eye_y + 1.2) & (cranium[:, 1] < eye_y + 5.5) & (cranium[:, 2] > 3.0),
        2,
        1,
    )
    frontal = _extreme(
        cranium,
        near & (cranium[:, 1] > eye_y + 4.5) & (cranium[:, 2] > 1.0),
        2,
        1,
    )
    nasal = _extreme(
        cranium,
        (np.abs(cranium[:, 0] - mid) < 1.1) & (cranium[:, 1] > eye_y - 2.2) & (cranium[:, 1] < eye_y + 1.2) & (cranium[:, 2] > 3.5),
        2,
        1,
    )
    occipital = _extreme(cranium, np.abs(cranium[:, 0] - mid) < 2.2, 2, -1)
    menton = _extreme(jaw, (np.abs(jaw[:, 0] - mid) < 1.8) & (jaw[:, 2] > 0.5), 1, -1)
    mandible = _extreme(
        jaw,
        (np.abs(jaw[:, 0] - mid) < 1.8) & (jaw[:, 1] > menton[1] + 0.8) & (jaw[:, 1] < menton[1] + 3.5) & (jaw[:, 2] > 1.0),
        2,
        1,
    )
    teeth = _extreme(
        cranium,
        (np.abs(cranium[:, 0] - mid) < 1.6) & (cranium[:, 1] < eye_y - 2.0) & (cranium[:, 1] > menton[1] + 2.0) & (cranium[:, 2] > 2.0),
        2,
        1,
    )

    def lateral(side: float, y0: float, y1: float, z_sign: float) -> np.ndarray:
        band = (cranium[:, 0] * side > 1.5) & (cranium[:, 1] > y0) & (cranium[:, 1] < y1)
        if z_sign > 0:
            band = band & (cranium[:, 2] > 0.0)
        else:
            band = band & (cranium[:, 2] < 0.0)
        return _extreme(cranium, band, 0, side)

    zyg_r = lateral(-1, eye_y - 3.0, eye_y + 2.5, 1)
    zyg_l = lateral(1, eye_y - 3.0, eye_y + 2.5, 1)
    tmp_r = lateral(-1, eye_y - 3.0, eye_y + 4.0, -1)
    tmp_l = lateral(1, eye_y - 3.0, eye_y + 4.0, -1)
    high = cranium[:, 1] > np.quantile(cranium[:, 1], 0.72)
    back = cranium[:, 2] < np.quantile(cranium[:, 2], 0.4)
    par_r = cranium[high & back & (cranium[:, 0] < mid)].mean(0)
    par_l = cranium[high & back & (cranium[:, 0] >= mid)].mean(0)
    src = np.stack(
        [right, left, nasion, menton, zyg_r, zyg_l, tmp_r, tmp_l, frontal, nasal, occipital, mandible, teeth, par_r, par_l]
    )
    dst = np.stack(
        [
            EYE_R,
            EYE_L,
            np.array([0.0, 3.271027, 5.236015]),
            np.array([0.0, -9.403378, 4.264492]),
            np.array([-5.0, 0.27, 2.3]),
            np.array([5.0, 0.27, 2.3]),
            np.array([-6.5, 0.0, -6.15]),
            np.array([6.5, 0.0, -6.15]),
            np.array([0.13, 8.05, 4.35]),
            np.array([0.04, 2.18, 5.59]),
            np.array([0.14, 3.45, -15.35]),
            np.array([-0.12, -7.4, 4.22]),
            np.array([0.4, -2.32, 4.68]),
            np.array([-5.55, 11.0, -10.68]),
            np.array([5.55, 11.0, -10.68]),
        ]
    )
    weights = np.array([4, 4, 3, 3, 2, 2, 2, 2, 1.5, 1.5, 1.5, 1.5, 1, 1, 1], dtype=np.float64)
    return src, dst, weights


def _inside(point: np.ndarray, keep_positive: bool) -> bool:
    return bool(point[0] >= -1e-7) if keep_positive else bool(point[0] <= 1e-7)


def _clip_polygon(poly: np.ndarray, keep_positive: bool) -> list[np.ndarray]:
    if len(poly) == 0:
        return []

    def hit(a: np.ndarray, b: np.ndarray) -> np.ndarray:
        den = float(a[0] - b[0])
        t = 0.0 if abs(den) < 1e-12 else float(np.clip(a[0] / den, 0.0, 1.0))
        return a + (b - a) * t

    out: list[np.ndarray] = []
    prev = poly[-1]
    prev_in = _inside(prev, keep_positive)
    for cur in poly:
        cur_in = _inside(cur, keep_positive)
        if cur_in:
            if not prev_in:
                out.append(hit(prev, cur))
            out.append(np.array(cur, copy=True))
        elif prev_in:
            out.append(hit(prev, cur))
        prev = cur
        prev_in = cur_in
    return out


def _clip_mesh(vertices: np.ndarray, faces: np.ndarray, keep_positive: bool) -> tuple[np.ndarray, np.ndarray]:
    indexed: dict[tuple[float, float, float], int] = {}
    out_v: list[np.ndarray] = []
    out_f: list[list[int]] = []

    def vid(point: np.ndarray) -> int:
        key = (round(float(point[0]), 4), round(float(point[1]), 4), round(float(point[2]), 4))
        found = indexed.get(key)
        if found is None:
            found = len(out_v)
            indexed[key] = found
            snapped = np.array(point, dtype=np.float64)
            if abs(snapped[0]) < 5e-4:
                snapped[0] = 0.0
            out_v.append(snapped)
        return found

    for tri in faces:
        poly = _clip_polygon(vertices[tri], keep_positive)
        if len(poly) < 3:
            continue
        base = vid(poly[0])
        for k in range(1, len(poly) - 1):
            out_f.append([base, vid(poly[k]), vid(poly[k + 1])])
    if not out_f:
        return np.zeros((0, 3)), np.zeros((0, 3), dtype=np.int64)
    return np.vstack(out_v), np.asarray(out_f, dtype=np.int64)


def _surface_area(vertices: np.ndarray, faces: np.ndarray) -> float:
    if len(faces) == 0:
        return 0.0
    a = vertices[faces[:, 0]]
    b = vertices[faces[:, 1]]
    c = vertices[faces[:, 2]]
    return float(0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1).sum())


def mirror_symmetrise(
    vertices: np.ndarray, faces: np.ndarray, plane_x: float, keep_positive: bool | None = None
) -> tuple[np.ndarray, np.ndarray, bool]:
    """Keep one half, mirror it, and return vertices with the plane at x = 0."""
    shifted = np.array(vertices, dtype=np.float64, copy=True)
    shifted[:, 0] -= plane_x
    halves = []
    for positive in (True, False):
        hv, hf = _clip_mesh(shifted, faces, positive)
        halves.append((positive, hv, hf, _surface_area(hv, hf)))
    if keep_positive is None:
        keep_positive, hv, hf, _area = max(halves, key=lambda item: item[3])
    else:
        keep_positive, hv, hf, _area = next(item for item in halves if item[0] == keep_positive)
    if len(hf) == 0:
        keep_positive, hv, hf, _area = max(halves, key=lambda item: item[3])
    mirrored = np.array(hv, copy=True)
    mirrored[:, 0] *= -1
    faces_m = hf[:, ::-1] + len(hv)
    mesh = trimesh.Trimesh(vertices=np.vstack([hv, mirrored]), faces=np.vstack([hf, faces_m]), process=False)
    mesh.merge_vertices(digits_vertex=3)
    mesh.update_faces(mesh.unique_faces() & mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    return np.asarray(mesh.vertices, dtype=np.float64), np.asarray(mesh.faces, dtype=np.int64), keep_positive


def axis_fit(vertices: np.ndarray, box: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    lo = vertices.min(0)
    hi = vertices.max(0)
    size = np.maximum(hi - lo, 1e-6)
    scale = (box[1] - box[0]) / size
    trans = (box[0] + box[1]) / 2 - scale * (lo + hi) / 2
    return scale, trans


def apply_axis(vertices: np.ndarray, scale: np.ndarray, trans: np.ndarray) -> np.ndarray:
    return np.asarray(vertices, dtype=np.float64) * scale + trans


def as_mesh(vertices: np.ndarray, faces: np.ndarray) -> trimesh.Trimesh:
    mesh = trimesh.Trimesh(vertices=np.asarray(vertices, dtype=np.float64), faces=np.asarray(faces), process=False)
    mesh.merge_vertices(digits_vertex=4)
    mesh.update_faces(mesh.unique_faces() & mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    return mesh


def largest_faces(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    parent = np.arange(len(faces))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = int(parent[i])
        return i

    edge_owner: dict[tuple[int, int], int] = {}
    for index, tri in enumerate(faces):
        for a, b in ((int(tri[0]), int(tri[1])), (int(tri[1]), int(tri[2])), (int(tri[2]), int(tri[0]))):
            key = (a, b) if a < b else (b, a)
            other = edge_owner.get(key)
            if other is None:
                edge_owner[key] = index
            else:
                ra, rb = find(index), find(other)
                if ra != rb:
                    parent[ra] = rb
    groups: dict[int, list[int]] = {}
    for index in range(len(faces)):
        groups.setdefault(find(index), []).append(index)
    best = max(groups.values(), key=len)
    return faces[np.array(best, dtype=np.int64)]


def crop_skin(vertices: np.ndarray, faces: np.ndarray, jaw_min_y: float, half_width: float) -> tuple[np.ndarray, np.ndarray]:
    """Drop the chest and the shoulder stubs. Keep a short symmetric neck."""
    center = vertices[faces].mean(1)
    shoulder = (center[:, 1] < jaw_min_y - 1.5) & (np.abs(center[:, 0]) > half_width + 1.2)
    chest = center[:, 1] < jaw_min_y - 6.5
    keep = faces[~shoulder & ~chest]
    if len(keep) < 200:
        keep = faces[~chest]
    keep = largest_faces(vertices, keep)
    mesh = as_mesh(vertices, keep)
    return np.asarray(mesh.vertices, dtype=np.float64), np.asarray(mesh.faces, dtype=np.int64)


def place_globes(vertices: np.ndarray, faces: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Keep the rounder globe, scale it once, and mirror it onto (±2.9, y, z).

    The vertical and depth centres are the ones that put the pair's box on the
    reference eye box. A uniform scale keeps the globe round.
    """
    centers = vertices[faces].mean(1)
    chosen: trimesh.Trimesh | None = None
    best_score: tuple[float, float] | None = None
    for mask in (centers[:, 0] < 0.0, centers[:, 0] >= 0.0):
        subset = faces[mask]
        if len(subset) < 30:
            continue
        mesh = as_mesh(vertices, subset)
        size = mesh.extents
        aspect = float(size.max() / max(float(size.min()), 1e-6))
        forward = -float(np.asarray(mesh.vertices)[:, 2].mean())
        score = (aspect, forward)
        if best_score is None or score < best_score:
            best_score = score
            chosen = mesh
    if chosen is None:
        raise RuntimeError("the eye meshes did not split into two globes")
    local = np.asarray(chosen.vertices, dtype=np.float64)
    local = local - local.mean(0)
    globe_faces = np.asarray(chosen.faces, dtype=np.int64)
    # Centres are the canonical globes. A uniform scale of 1 keeps the eye round;
    # his box also contains the optic nerve, so the back of that box sits behind a globe.
    scale, y0, z0 = 1.0, 2.85, 3.8
    right = local * scale + EYE_R
    left = local * np.array([-scale, scale, scale]) + EYE_L
    verts = np.vstack([right, left])
    faces_out = np.vstack([globe_faces, globe_faces[:, ::-1] + len(right)])
    lo, hi = verts.min(0), verts.max(0)
    box = BOX["eyes"]
    err = float(np.max(np.abs(np.concatenate([lo - box[0], hi - box[1]]))))
    print(
        f"eyes scale {scale:.3f} centres (±2.90, {y0:.2f}, {z0:.2f}) bound {err:.3f} cm",
        flush=True,
    )
    return verts, faces_out


def bounds_of(vertices: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return vertices.min(0), vertices.max(0)


def format_table(rows: list[tuple[str, np.ndarray, np.ndarray]]) -> str:
    lines = [
        "| mesh | axis | ours min | his min | Δmin | ours max | his max | Δmax |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    worst = 0.0
    for name, lo, hi in rows:
        box = BOX.get(name)
        for axis, label in enumerate("xyz"):
            if box is None:
                lines.append(f"| {name} | {label} | {lo[axis]:.2f} |  |  | {hi[axis]:.2f} |  |  |")
                continue
            dlo = float(lo[axis] - box[0, axis])
            dhi = float(hi[axis] - box[1, axis])
            worst = max(worst, abs(dlo), abs(dhi))
            lines.append(
                f"| {name} | {label} | {lo[axis]:.2f} | {box[0, axis]:.2f} | {dlo:+.2f} | {hi[axis]:.2f} | {box[1, axis]:.2f} | {dhi:+.2f} |"
            )
    lines.append(f"\nWorst absolute edge error across listed meshes: {worst:.2f} cm.")
    return "\n".join(lines)


class Frame:
    """Similarity, then the midline mirror, then one axis-aligned scale and shift."""

    def __init__(
        self,
        scale: float,
        rot: np.ndarray,
        trans: np.ndarray,
        plane_x: float,
        keep_positive: bool,
        axis_s: np.ndarray,
        axis_t: np.ndarray,
        mirrored: bool,
    ) -> None:
        self.scale = scale
        self.rot = rot
        self.trans = trans
        self.plane_x = plane_x
        self.keep_positive = keep_positive
        self.axis_s = axis_s
        self.axis_t = axis_t
        self.mirrored = mirrored

    def points(self, pts: np.ndarray) -> np.ndarray:
        q = apply_points(pts, self.scale, self.rot, self.trans)
        q = np.array(q, copy=True)
        q[:, 0] -= self.plane_x
        if self.mirrored:
            if self.keep_positive:
                flip = q[:, 0] < 0
            else:
                flip = q[:, 0] > 0
            q[flip, 0] *= -1
        return apply_axis(q, self.axis_s, self.axis_t)

    def vectors(self, vecs: np.ndarray) -> np.ndarray:
        spun = apply_vectors(vecs, self.scale, self.rot)
        return spun * self.axis_s


def already_canonical(vertices: np.ndarray) -> bool:
    lo, hi = vertices.min(0), vertices.max(0)
    box = BOX["cranium"]
    return float(np.max(np.abs(np.concatenate([lo - box[0], hi - box[1]])))) < 0.08


def place(meshes: dict[str, trimesh.Trimesh]) -> tuple[dict[str, trimesh.Trimesh], dict[str, Frame], str]:
    cr = np.asarray(meshes["cranium"].vertices, dtype=np.float64)
    if already_canonical(cr):
        raise RuntimeError("cranium is already in the canonical box; refusing to place it again")
    jaw = np.asarray(meshes["jaw"].vertices, dtype=np.float64)
    eyes = np.asarray(meshes["eyes"].vertices, dtype=np.float64)
    src, dst, weights = landmark_pairs(cr, jaw, eyes)
    scale, rot, trans = umeyama(src, dst, weights)
    moved = apply_points(src, scale, rot, trans)
    err = np.linalg.norm(moved - dst, axis=1)
    angle = float(np.degrees(np.arccos(np.clip((np.trace(rot) - 1) / 2, -1, 1))))
    print(
        f"similarity scale {scale:.4f} angle {angle:.2f} deg  mean {err.mean():.2f} cm  max {err.max():.2f} cm",
        flush=True,
    )
    if angle > 8 or not 0.92 <= scale <= 1.12 or float(err.mean()) > 2.2:
        print("similarity left the head askew; keeping the axis fit on the unrotated meshes", flush=True)
        scale, rot, trans = 1.0, np.eye(3), np.zeros(3)

    posed: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for name in HEAD:
        mesh = meshes[name]
        posed[name] = (
            apply_points(np.asarray(mesh.vertices), scale, rot, trans),
            np.asarray(mesh.faces, dtype=np.int64),
        )
    plane_x = 0.5 * float(posed["cranium"][0][:, 0].min() + posed["cranium"][0][:, 0].max())
    jaw_min = float(posed["jaw"][0][:, 1].min())
    half = max(abs(float(posed["cranium"][0][:, 0].min())), abs(float(posed["cranium"][0][:, 0].max())))
    skin_v, skin_f = crop_skin(posed["skin"][0], posed["skin"][1], jaw_min, half)
    posed["skin"] = (skin_v, skin_f)

    centered: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    keep_positive = True
    for name, (verts, faces) in posed.items():
        shifted = np.array(verts, copy=True)
        shifted[:, 0] -= plane_x
        centered[name] = (shifted, faces)

    mirrored_flag: dict[str, bool] = {}
    mirror_names = ("cranium", "jaw", "cerebrum", "hindbrain", "skin")
    keep_positive: bool | None = None
    for name in mirror_names:
        verts, faces = centered[name]
        mv, mf, keep_positive = mirror_symmetrise(verts, faces, 0.0, keep_positive)
        centered[name] = (mv, mf)
        mirrored_flag[name] = True
        print(f"mirror {name:10} faces {len(mf)} keep+ {keep_positive}", flush=True)
    eye_v, eye_f = place_globes(*centered["eyes"])
    mirrored_flag["eyes"] = True
    mirrored_flag["muscles"] = False
    print(f"mirror eyes       faces {len(eye_f)}", flush=True)

    # Muscles share the cranium and jaw scales so the eye rings stay on the eyes.
    # The hindbrain has its own box, at the back of the skull.
    fit_owner = {
        "cranium": "cranium",
        "jaw": "jaw",
        "cerebrum": "cerebrum",
        "hindbrain": "hindbrain",
        "skin": "skin",
        "muscles": "cranium",
    }
    axis: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for owner in ("cranium", "jaw", "cerebrum", "skin", "hindbrain"):
        axis[owner] = axis_fit(centered[owner][0], BOX[owner])
        print(f"axis {owner:10} scale {np.round(axis[owner][0], 3)} shift {np.round(axis[owner][1], 2)}", flush=True)

    frames: dict[str, Frame] = {}
    out: dict[str, trimesh.Trimesh] = {}
    rows = []
    identity = (np.ones(3), np.zeros(3))
    for name in HEAD:
        if name == "eyes":
            mesh = as_mesh(eye_v, eye_f)
            axis_s, axis_t = identity
        elif name == "muscles":
            source_v = centered["muscles"][0]
            upper = apply_axis(source_v, *axis["cranium"])
            lower = apply_axis(source_v, *axis["jaw"])
            jaw_y = centered["jaw"][0][:, 1]
            high = float(np.quantile(jaw_y, 0.8))
            low = float(np.quantile(jaw_y, 0.3))
            span = max(high - low, 1e-6)
            blend = np.clip((high - source_v[:, 1]) / span, 0.0, 1.0)
            blend = blend * blend * (3.0 - 2.0 * blend)
            verts = upper * (1.0 - blend)[:, None] + lower * blend[:, None]
            back = verts[:, 2] < MUSCLE_Z_CUT
            if np.any(back):
                zmin = float(verts[:, 2].min())
                stretch = (MUSCLE_Z_BACK - MUSCLE_Z_CUT) / (zmin - MUSCLE_Z_CUT)
                verts = np.array(verts, copy=True)
                verts[back, 2] = MUSCLE_Z_CUT + (verts[back, 2] - MUSCLE_Z_CUT) * stretch
            mesh = trimesh.Trimesh(vertices=verts, faces=centered["muscles"][1], process=False)
            mesh.metadata = {"jawBlend": blend.astype(np.float64)}
            axis_s, axis_t = axis["cranium"]
        else:
            owner = fit_owner[name]
            axis_s, axis_t = axis[owner]
            verts = apply_axis(centered[name][0], axis_s, axis_t)
            mesh = as_mesh(verts, centered[name][1])
        out[name] = mesh
        lo, hi = bounds_of(np.asarray(mesh.vertices))
        rows.append((name, lo, hi))
        side = True if keep_positive is None else keep_positive
        frames[name] = Frame(scale, rot, trans, plane_x, side, axis_s, axis_t, mirrored_flag[name] and name != "eyes")
    # Eyes were rebuilt rather than reflected vertex-wise. Labels on them are reset below.
    table = format_table(rows)
    print(table, flush=True)
    return out, frames, table


def snap(point: np.ndarray, vertices: np.ndarray, limit: float = 2.2) -> np.ndarray:
    delta = np.linalg.norm(vertices - point, axis=1)
    index = int(np.argmin(delta))
    if float(delta[index]) > limit:
        return point
    return np.asarray(vertices[index], dtype=np.float64)


def outward(point: np.ndarray, center: np.ndarray) -> np.ndarray:
    normal = point - center
    length = float(np.linalg.norm(normal))
    if length < 1e-6:
        return np.array([0.0, 0.0, 1.0])
    return normal / length


def num(value: float) -> str:
    rendered = f"{value:.2f}"
    return "0" if rendered in ("-0.00", "0.00") and value < 0 else rendered


def _label_points(label_id: str, old_points: list[np.ndarray], meshes: dict[str, trimesh.Trimesh], frames: dict[str, Frame]) -> tuple[str, list[np.ndarray]]:
    if label_id == "eyeball":
        eyes = np.asarray(meshes["eyes"].vertices)
        right, left = eye_centers(eyes)
        poles = []
        for center in (right, left):
            cluster = eyes[np.linalg.norm(eyes - center, axis=1) < 2.4]
            poles.append(cluster[int(np.argmax(cluster[:, 2]))])
        return "eyes", poles
    target = LABEL_TARGETS.get(label_id)
    if target is not None:
        return target[0], [np.array(point, dtype=np.float64) for point in target[1]]
    mesh_name = "cranium"
    if label_id in ("cerebellum", "pons", "medulla"):
        mesh_name = "hindbrain"
    elif "lobe" in label_id:
        mesh_name = "cerebrum"
    elif label_id in ("frontalis", "temporalis", "orbicularis", "nasalis", "zygomaticus", "masseter", "oris", "dao", "mentalis"):
        mesh_name = "muscles"
    moved = frames[mesh_name].points(np.stack(old_points))
    return mesh_name, [moved[i] for i in range(len(old_points))]


def rewrite_labels(meshes: dict[str, trimesh.Trimesh], frames: dict[str, Frame]) -> None:
    text = LABELS.read_text()
    centers = {name: np.asarray(mesh.vertices).mean(0) for name, mesh in meshes.items()}
    lines = text.splitlines(keepends=True)
    current = ""
    rewritten = 0
    for index, line in enumerate(lines):
        found = re.search(r"id: '([^']+)'", line)
        if found:
            current = found.group(1)
        if "at: [" not in line or not current:
            continue
        prefix, rest = line.split("at: [", 1)
        close = rest.rfind("],")
        if close < 0:
            raise SystemExit(f"could not find the end of {current}")
        body = rest[:close]
        triples = re.findall(r"\[(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\]", body)
        old = [np.array([float(a), float(b), float(c)]) for a, b, c in triples[0::2]]
        mesh_name, points = _label_points(current, old, meshes, frames)
        snapped = []
        for point in points:
            verts = np.asarray(meshes[mesh_name].vertices)
            distance = np.linalg.norm(verts - point, axis=1)
            landed = np.asarray(verts[int(np.argmin(distance))])
            if float(distance.min()) > 3.0:
                other = "jaw" if mesh_name != "jaw" else "cranium"
                verts = np.asarray(meshes[other].vertices)
                distance = np.linalg.norm(verts - point, axis=1)
                if float(distance.min()) <= 3.0:
                    landed = np.asarray(verts[int(np.argmin(distance))])
                    mesh_name = other
            normal = outward(landed, centers[mesh_name])
            snapped.append((landed, normal))
        rebuilt = ", ".join(
            f"pt([{num(p[0])}, {num(p[1])}, {num(p[2])}], [{num(n[0])}, {num(n[1])}, {num(n[2])}])"
            for p, n in snapped
        )
        lines[index] = f"{prefix}at: [{rebuilt}{rest[close:]}"
        rewritten += 1
        current = ""
    if rewritten != 26:
        raise SystemExit(f"rewrote {rewritten} labels, expected 26")
    LABELS.write_text("".join(lines))


def jaw_pivot(vertices: np.ndarray) -> list[float]:
    top = vertices[vertices[:, 1] > np.quantile(vertices[:, 1], 0.96)]
    if len(top) < 8:
        top = vertices
    right = top[top[:, 0] < 0]
    left = top[top[:, 0] >= 0]
    if len(right) == 0 or len(left) == 0:
        pivot = top.mean(0)
    else:
        pivot = 0.5 * (right.mean(0) + left.mean(0))
    return [round(float(v), 4) for v in pivot]


def rewrite_anchors(meshes: dict[str, trimesh.Trimesh], frames: dict[str, Frame], glb_bytes: int) -> None:
    data = json.loads(ANCHORS.read_text())
    data["jawPivot"] = jaw_pivot(np.asarray(meshes["jaw"].vertices))
    owners = {
        "frontal": "cranium",
        "parietal": "cranium",
        "temporal": "cranium",
        "occipital": "cranium",
        "nasal": "cranium",
        "zygomatic": "cranium",
        "maxilla": "cranium",
        "mandible": "jaw",
        "brain": "cerebrum",
        "frontalis": "muscles",
        "corrugator": "muscles",
        "orbicularis": "muscles",
        "oris": "muscles",
        "zygomaticus": "muscles",
        "masseter": "muscles",
        "temporalis": "muscles",
    }
    for name, points in data["anchors"].items():
        owner = owners.get(name, "cranium")
        moved = frames[owner].points(np.array(points, dtype=np.float64))
        verts = np.asarray(meshes[owner].vertices)
        data["anchors"][name] = [[round(float(v), 4) for v in snap(point, verts)] for point in moved]
    eyes = np.asarray(meshes["eyes"].vertices)
    right, left = eye_centers(eyes)
    radius = float(np.mean(np.linalg.norm(eyes - np.where(eyes[:, 0][:, None] < 0, right, left), axis=1)))
    data["orbits"] = [
        {"center": [round(float(v), 4) for v in right], "radius": round(radius, 4)},
        {"center": [round(float(v), 4) for v in left], "radius": round(radius, 4)},
    ]
    jaw_ids = {152, 172, 397}
    for mark in data.get("fit", []):
        owner = "jaw" if int(mark["id"]) in jaw_ids else "cranium"
        moved = frames[owner].points(np.array([mark["at"]], dtype=np.float64))[0]
        mark["at"] = [round(float(v), 4) for v in snap(moved, np.asarray(meshes[owner].vertices), 3.0)]
    for muscle in data.get("muscles", []):
        moved = frames["muscles"].points(np.array([muscle["at"]], dtype=np.float64))[0]
        muscle["at"] = [round(float(v), 4) for v in snap(moved, np.asarray(meshes["muscles"].vertices), 3.0)]
    low = float(np.asarray(meshes["skin"].vertices)[:, 1].min())
    data["neck"] = [round(low + 0.4, 3), round(low + 3.2, 3)]
    data["bytes"] = glb_bytes
    ANCHORS.write_text(json.dumps(data, separators=(",", ":")))


def rewrite_moves(frames: dict[str, Frame], blend: np.ndarray) -> None:
    attrs = json.loads(MUSCLES.read_text())
    spec = attrs.get("muscles")
    if not spec or "move" not in spec:
        return
    flat = np.array(spec["move"], dtype=np.float64).reshape(-1, 3)
    if len(flat) != len(blend):
        raise SystemExit(f"muscle moves {len(flat)} do not match vertices {len(blend)}")
    base = apply_vectors(flat, frames["muscles"].scale, frames["muscles"].rot)
    upper = base * frames["cranium"].axis_s
    lower = base * frames["jaw"].axis_s
    spun = upper * (1.0 - blend)[:, None] + lower * blend[:, None]
    spec["move"] = [round(float(v), 4) for v in spun.reshape(-1)]
    MUSCLES.write_text(json.dumps(attrs))


def closed_eyes(vertices: np.ndarray) -> trimesh.Trimesh:
    """Two closed spheres. An open shell drawn double-sided reads as a ring."""
    points = np.asarray(vertices, dtype=np.float64)
    right = points[points[:, 0] < 0]
    if len(right) < 20:
        right = points
    center = right.mean(0)
    radius = float(np.median(np.linalg.norm(right - center, axis=1)))
    radius = float(np.clip(radius, 0.9, 1.6))
    sphere = trimesh.creation.icosphere(subdivisions=3, radius=radius)
    local = np.asarray(sphere.vertices, dtype=np.float64)
    faces = np.asarray(sphere.faces, dtype=np.int64)
    owned = [local + EYE_R, local + EYE_L]
    verts = np.vstack(owned)
    both = np.vstack([faces, faces + len(local)])
    print(f"closed eyes radius {radius:.3f} centres (±2.90, 2.85, 3.80)", flush=True)
    return trimesh.Trimesh(vertices=verts, faces=both, process=False)


def write_revision(size: int) -> str:
    digest = hashlib.sha256(GLB.read_bytes()).hexdigest()[:12]
    REVISION.write_text(f"export const ANATOMY_REVISION = '{digest}'\n")
    nodes = json.loads(NODES.read_text()) if NODES.exists() else {"nodes": list(HEAD)}
    nodes["bytes"] = size
    nodes["hash"] = digest
    NODES.write_text(json.dumps(nodes, indent=2) + "\n")
    if ANCHORS.exists():
        anchors = json.loads(ANCHORS.read_text())
        anchors["bytes"] = size
        ANCHORS.write_text(json.dumps(anchors, separators=(",", ":")))
    return digest


def retouch() -> None:
    """Close the eyes on a GLB that is already canonical. The skin shell is not pulled."""
    scene = trimesh.load(GLB, force="scene")
    out = trimesh.Scene()
    for name, geom in scene.geometry.items():
        if name == "eyes":
            mesh = closed_eyes(np.asarray(geom.vertices))
        else:
            mesh = geom
        out.add_geometry(mesh, node_name=name, geom_name=name)
    out.export(GLB)
    size = GLB.stat().st_size
    digest = write_revision(size)
    print("wrote", GLB, size, digest, flush=True)


def main() -> None:
    scene = trimesh.load(GLB, force="scene")
    source = {name: scene.geometry[name] for name in scene.geometry}
    placed, frames, _table = place(source)
    placed["eyes"] = closed_eyes(np.asarray(placed["eyes"].vertices))
    out = trimesh.Scene()
    for name, geom in source.items():
        mesh = placed.get(name, geom)
        out.add_geometry(mesh, node_name=name, geom_name=name)
    out.export(GLB)
    size = GLB.stat().st_size
    rewrite_moves(frames, np.asarray(placed["muscles"].metadata["jawBlend"], dtype=np.float64))
    rewrite_anchors(placed, frames, size)
    rewrite_labels(placed, frames)
    eyes = np.asarray(placed["eyes"].vertices)
    right, left = eye_centers(eyes)
    print("eye centres", np.round(right, 2), np.round(left, 2), flush=True)
    print("jaw pivot", jaw_pivot(np.asarray(placed["jaw"].vertices)), flush=True)
    for name in ("cranium", "jaw", "cerebrum", "skin", "hindbrain"):
        lo, hi = bounds_of(np.asarray(placed[name].vertices))
        delta = np.concatenate([lo - BOX[name][0], hi - BOX[name][1]])
        worst = float(np.max(np.abs(delta)))
        if worst > 0.5:
            raise SystemExit(f"{name} bound error {worst:.2f} cm exceeds 0.5")
    digest = write_revision(size)
    print("wrote", GLB, size, digest, flush=True)


if __name__ == "__main__":
    if "--hug-face" in sys.argv:
        raise SystemExit("the skin hug was removed; it pulled the shell off the canonical box")
    main()
