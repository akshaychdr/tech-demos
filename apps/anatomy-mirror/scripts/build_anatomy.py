#!/usr/bin/env python3
"""Rebuild Anatomy Mirror meshes from BodyParts3D 4.3 element OBJs.

Bones, brain, and hand bones are decimated from BodyParts3D (CC BY-SA 2.1 JP,
(c) DBCLS). Release 4.3 has no face-muscle meshes, so the muscle surfaces are
original sheets that follow this skull and ship under the same licence.
A smooth warp then slides the orbital openings onto the canonical eyes.
Cache lives in /tmp/bp3d.

Requires: trimesh, fast-simplification, numpy, scipy, scikit-image, pillow, matplotlib.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
import zipfile
from pathlib import Path

import numpy as np
import trimesh
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "anatomy" / "bodyparts3d"
CACHE = Path("/tmp/bp3d/cache")
CANONICAL = ROOT / "tests" / "fixtures" / "canonical_face_model.obj"
UA = "Mozilla/5.0 (compatible; AnatomyMirrorMeshBuilder/1.1)"
VIEWER = "https://lifesciencedb.jp/bp3d/?lng=en"
DOWNLOAD = "https://lifesciencedb.jp/bp3d/download.cgi"

# (fj id, bp id). Both copies are fetched; exact duplicates are dropped so a
# real inner shell still survives.
BONE_FILES: dict[str, list[tuple[str, str]]] = {
    "frontal": [("FJ3200", "BP22997"), ("FJ6310", "BP22997")],
    "parietal_l": [("FJ3274", "BP23158"), ("FJ6385", "BP23158")],
    "parietal_r": [("FJ3380", "BP23064"), ("FJ6472", "BP23064")],
    "temporal_l": [("FJ3281", "BP23760"), ("FJ6391", "BP23760")],
    "temporal_r": [("FJ3386", "BP23685"), ("FJ6478", "BP23685")],
    "sphenoid": [("FJ3394", "BP23082"), ("FJ6485", "BP23082")],
    "occipital": [("FJ3309", "BP21571"), ("FJ6411", "BP21571")],
    "nasal_l": [("FJ6383", "BP23333")],
    "nasal_r": [("FJ6470", "BP23260")],
    "zygomatic_l": [("FJ3287", "BP23337"), ("FJ6397", "BP23337")],
    "zygomatic_r": [("FJ3392", "BP23110"), ("FJ6483", "BP23110")],
    "maxilla_l": [("FJ3269", "BP23755"), ("FJ6380", "BP23755")],
    "maxilla_r": [("FJ3375", "BP23661"), ("FJ6468", "BP23661")],
    "mandible": [("FJ3289", "BP22817"), ("FJ6399", "BP22817")],
}

BRAIN_FILES = [
    ("FJ1732", "BP20877"), ("FJ1733", "BP20955"),
    ("FJ1744", "BP20792"), ("FJ1745", "BP20872"),
    ("FJ1746", "BP22696"), ("FJ1747", "BP20982"),
    ("FJ1787", "BP20940"), ("FJ1788", "BP20959"),
    ("FJ1789", "BP22697"), ("FJ1790", "BP20852"),
    ("FJ1797", "BP21536"), ("FJ1798", "BP21975"),
    ("FJ1800", "BP20889"), ("FJ1801", "BP20932"),
    ("FJ1833", "BP20885"), ("FJ1834", "BP20808"),
    ("FJ1835", "BP20880"), ("FJ1836", "BP20869"),
    ("FJ1837", "BP20634"), ("FJ1838", "BP21881"),
    ("FJ1839", "BP21142"), ("FJ1840", "BP21069"),
    ("FJ1841", "BP20820"), ("FJ1842", "BP20873"),
    ("FJ7462", "BP29843"), ("FJ7462M", "BP29846"),
    ("FJ7465", "BP29833"), ("FJ7465M", "BP29827"),
    ("FJ7466", "BP29828"), ("FJ7466M", "BP29831"),
    ("FJ7467", "BP29830"), ("FJ7467M", "BP29834"),
    ("FJ7468", "BP29829"), ("FJ7468M", "BP29832"),
    ("FJ7469", "BP29848"), ("FJ7469M", "BP29838"),
    ("FJ7474", "BP29841"), ("FJ7474M", "BP29840"),
    ("FJ7478", "BP29852"), ("FJ7478M", "BP29851"),
    ("FJ7479", "BP29847"), ("FJ7479M", "BP29842"),
    ("FJ1781", "BP21476"),
]

# One right-hand example of each bone. Posed later between tracked joints.
HAND_FILES = {
    "mc1": ("FJ3350", "BP23353"),
    "mc2": ("FJ3352", "BP23440"),
    "mc3": ("FJ3354", "BP23643"),
    "mc4": ("FJ3356", "BP23371"),
    "mc5": ("FJ3358", "BP23729"),
    "pp1": ("FJ3327", "BP23922"),
    "pp2": ("FJ3322", "BP20124"),
    "pp3": ("FJ3325", "BP20136"),
    "pp4": ("FJ3326", "BP20098"),
    "pp5": ("FJ3323", "BP20215"),
    "mp2": ("FJ3303", "BP20064"),
    "mp3": ("FJ3306", "BP20057"),
    "mp4": ("FJ3292", "BP20072"),
    "mp5": ("FJ3304", "BP20229"),
    "dp1": ("FJ3198", "BP23933"),
    "dp2": ("FJ3193", "BP20194"),
    "dp3": ("FJ3196", "BP20160"),
    "dp4": ("FJ3197", "BP20048"),
    "dp5": ("FJ3194", "BP20275"),
    "scaphoid": ("FJ3383", "BP20164"),
    "lunate": ("FJ3374", "BP23841"),
    "triquetral": ("FJ3390", "BP20286"),
    "pisiform": ("FJ3382", "BP19634"),
    "trapezium": ("FJ3388", "BP20135"),
    "trapezoid": ("FJ3389", "BP23872"),
    "capitate": ("FJ3361", "BP20134"),
    "hamate": ("FJ3367", "BP23822"),
}

CARPALS = ["scaphoid", "lunate", "triquetral", "pisiform", "trapezium", "trapezoid", "capitate", "hamate"]
LONG_BONES = [k for k in HAND_FILES if k not in CARPALS]

FACE_LIMIT = {
    "frontal": 14000,
    "parietal": 11000,
    "temporal": 9000,
    "occipital": 8000,
    "nasal": 3500,
    "zygomatic": 7000,
    "maxilla": 10000,
    "mandible": 10000,
    "brain": 15000,
    "shell": 7000,
}

MUSCLE_NAMES = (
    "frontalis",
    "corrugator",
    "orbicularis",
    "oris",
    "zygomaticus",
    "masseter",
    "temporalis",
)

RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
BROW = [70, 63, 105, 66, 107, 9, 336, 296, 334, 293, 300]


def curl(args: list[str], timeout: int = 240) -> None:
    last = "curl failed"
    for attempt in range(1, 5):
        proc = subprocess.run(args, capture_output=True, timeout=timeout)
        if proc.returncode == 0:
            return
        last = proc.stderr.decode(errors="replace")[:240]
        time.sleep(2**attempt)
    raise RuntimeError(last)


def ensure_objs(pairs: list[tuple[str, str]]) -> dict[str, Path]:
    CACHE.mkdir(parents=True, exist_ok=True)
    cookies = CACHE / "cookies.txt"
    if not cookies.exists():
        curl(["curl", "-A", UA, "-c", str(cookies), "-s", "-o", "/dev/null", VIEWER])
    have: dict[str, Path] = {}
    missing: list[tuple[str, str]] = []
    for fj, bp in pairs:
        hits = list(CACHE.glob(f"{fj}_*.obj"))
        if hits and hits[0].stat().st_size > 200:
            have[fj] = hits[0]
        else:
            missing.append((fj, bp))
    for index in range(0, len(missing), 6):
        chunk = missing[index : index + 6]
        fjs = [fj for fj, _ in chunk]
        bps = sorted({bp for _, bp in chunk})
        dest = CACHE / f"chunk_{fjs[0]}_{len(fjs)}.zip"
        print(f"download {fjs[0]} +{len(fjs) - 1}", flush=True)
        curl(
            [
                "curl", "-A", UA, "-e", VIEWER, "-b", str(cookies), "-c", str(cookies),
                "-s", "--compressed", "-o", str(dest),
                "--data-urlencode", f"ids={json.dumps(fjs)}",
                "--data-urlencode", f"rep_id={json.dumps(bps)}",
                "--data-urlencode", f"filename={dest.stem}",
                "--data-urlencode", "type=art_file",
                "--data-urlencode", "all_downloads=1",
                DOWNLOAD,
            ],
            timeout=300,
        )
        with zipfile.ZipFile(dest) as bundle:
            for member in bundle.namelist():
                if not member.lower().endswith(".obj"):
                    continue
                name = Path(member).name
                fj = name.split("_", 1)[0]
                path = CACHE / name
                if not path.exists() or path.stat().st_size < 200:
                    path.write_bytes(bundle.read(member))
                if fj in fjs:
                    have[fj] = path
        time.sleep(0.35)
    absent = [fj for fj, _ in pairs if fj not in have]
    if absent:
        raise RuntimeError(f"missing objs: {absent}")
    return have


def load_mesh(path: Path) -> trimesh.Trimesh:
    mesh = trimesh.load(path, process=False, force="mesh")
    if isinstance(mesh, trimesh.Scene):
        mesh = trimesh.util.concatenate(tuple(mesh.geometry.values()))
    mesh.merge_vertices()
    return mesh


def is_duplicate(a: trimesh.Trimesh, b: trimesh.Trimesh) -> bool:
    if len(a.vertices) == 0 or len(b.vertices) == 0:
        return True
    sample = a.vertices[:: max(1, len(a.vertices) // 500)]
    other = b.vertices[:: max(1, len(b.vertices) // 900)]
    dist = np.linalg.norm(sample[:, None, :] - other[None, :, :], axis=2)
    return float(dist.min(axis=1).mean()) < 2.0


def merge_paths(paths: list[Path]) -> trimesh.Trimesh:
    kept: list[trimesh.Trimesh] = []
    for path in paths:
        mesh = load_mesh(path)
        if len(mesh.faces) == 0 or any(is_duplicate(mesh, prev) for prev in kept):
            continue
        kept.append(mesh)
    if not kept:
        raise RuntimeError(f"no geometry in {paths}")
    mesh = kept[0] if len(kept) == 1 else trimesh.util.concatenate(kept)
    mesh.merge_vertices()
    return mesh


def decimate(mesh: trimesh.Trimesh, target: int) -> trimesh.Trimesh:
    if len(mesh.faces) <= target:
        mesh.fix_normals()
        return mesh
    import fast_simplification

    verts, faces = fast_simplification.simplify(
        np.asarray(mesh.vertices, dtype=np.float32),
        np.asarray(mesh.faces, dtype=np.int32),
        target_count=int(target),
    )
    out = trimesh.Trimesh(verts, faces, process=False)
    out.fix_normals()
    return out


def load_canonical() -> trimesh.Trimesh:
    verts = []
    faces = []
    for line in CANONICAL.read_text().splitlines():
        if line.startswith("v "):
            verts.append([float(x) for x in line.split()[1:4]])
        elif line.startswith("f "):
            idx = []
            for token in line.split()[1:]:
                idx.append(int(token.split("/")[0]) - 1)
            if len(idx) >= 3:
                faces.append(idx[:3])
    mesh = trimesh.Trimesh(vertices=np.asarray(verts), faces=np.asarray(faces), process=False)
    mesh.fix_normals()
    return mesh


def umeyama(src: np.ndarray, dst: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
    mu_s = src.mean(axis=0)
    mu_d = dst.mean(axis=0)
    sc = src - mu_s
    dc = dst - mu_d
    cov = (dc.T @ sc) / len(src)
    u, singular, vt = np.linalg.svd(cov)
    sign = np.eye(3)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        sign[-1, -1] = -1
    rot = u @ sign @ vt
    scale = float(np.trace(np.diag(singular) @ sign) / ((sc**2).sum() / len(src)))
    trans = mu_d - scale * (rot @ mu_s)
    return scale, rot, trans


def apply_similarity(mesh: trimesh.Trimesh, scale: float, rot: np.ndarray, trans: np.ndarray) -> trimesh.Trimesh:
    out = mesh.copy()
    out.vertices = (scale * (out.vertices @ rot.T)) + trans
    return out


def apply_similarity_points(pts: np.ndarray, scale: float, rot: np.ndarray, trans: np.ndarray) -> np.ndarray:
    return (scale * (pts @ rot.T)) + trans


def gram_axes(parts: dict[str, trimesh.Trimesh]) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    left = parts["parietal_l"].vertices.mean(0)
    right = parts["parietal_r"].vertices.mean(0)
    up = parts["parietal_l"].vertices.mean(0) - parts["mandible"].vertices.mean(0)
    up = up / np.linalg.norm(up)
    nasal_mid = (parts["nasal_l"].vertices.mean(0) + parts["nasal_r"].vertices.mean(0)) / 2
    forward = nasal_mid - parts["occipital"].vertices.mean(0)
    forward = forward - up * np.dot(forward, up)
    forward = forward / np.linalg.norm(forward)
    side = np.cross(up, forward)
    side = side / np.linalg.norm(side)
    if np.dot(side, left - right) < 0:
        side = -side
    origin = (left + right) / 2
    return origin, side, up, forward


def coords(pts: np.ndarray, origin: np.ndarray, side: np.ndarray, up: np.ndarray, forward: np.ndarray) -> np.ndarray:
    delta = pts - origin
    return np.stack([delta @ side, delta @ up, delta @ forward], axis=1)


def pick(mesh: trimesh.Trimesh, score: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
    idx = np.arange(len(mesh.vertices))
    if mask is not None:
        idx = idx[mask]
    return mesh.vertices[idx[int(np.argmax(score if mask is None else score[mask]))]]


def bone_points(parts: dict[str, trimesh.Trimesh]) -> dict[str, np.ndarray]:
    origin, side, up, forward = gram_axes(parts)

    def frame(mesh: trimesh.Trimesh) -> np.ndarray:
        return coords(mesh.vertices, origin, side, up, forward)

    nasal = trimesh.util.concatenate([parts["nasal_l"], parts["nasal_r"]])
    nas = frame(nasal)
    midline = np.abs(nas[:, 0]) < np.quantile(np.abs(nas[:, 0]), 0.45)
    nasion = pick(nasal, nas[:, 1], midline)
    front = frame(parts["frontal"])
    fore_band = np.abs(front[:, 0]) < np.quantile(np.abs(front[:, 0]), 0.18)
    forehead = pick(parts["frontal"], front[:, 2] * 0.6 + front[:, 1] * 0.4, fore_band)
    mandible = parts["mandible"]
    md = frame(mandible)
    chin_band = (np.abs(md[:, 0]) < np.quantile(np.abs(md[:, 0]), 0.18)) & (md[:, 2] > np.quantile(md[:, 2], 0.35))
    menton = pick(mandible, -md[:, 1], chin_band)
    zy_l = frame(parts["zygomatic_l"])
    zy_r = frame(parts["zygomatic_r"])
    cheek_l = pick(parts["zygomatic_l"], zy_l[:, 0] * 0.45 + zy_l[:, 2] * 0.55)
    cheek_r = pick(parts["zygomatic_r"], -zy_r[:, 0] * 0.45 + zy_r[:, 2] * 0.55)
    lateral = md[:, 0] > np.quantile(md[:, 0], 0.72)
    gonion_l = pick(mandible, -md[:, 1] * 0.55 - md[:, 2] * 0.45 + md[:, 0], lateral)
    lateral_r = md[:, 0] < np.quantile(md[:, 0], 0.28)
    gonion_r = pick(mandible, -md[:, 1] * 0.55 - md[:, 2] * 0.45 - md[:, 0], lateral_r)
    return {
        "nasion": nasion,
        "forehead": forehead,
        "menton": menton,
        "cheek_l": cheek_l,
        "cheek_r": cheek_r,
        "gonion_l": gonion_l,
        "gonion_r": gonion_r,
    }


def largest_hole(occupied: np.ndarray) -> np.ndarray | None:
    empty = ~occupied
    empty[0, :] = empty[-1, :] = empty[:, 0] = empty[:, -1] = False
    labels, count = ndimage.label(empty)
    if count == 0:
        return None
    best = None
    best_area = 0
    for label in range(1, count + 1):
        ys, xs = np.where(labels == label)
        if len(xs) < 12 or len(xs) > 0.45 * occupied.size:
            continue
        if len(xs) > best_area:
            best_area = len(xs)
            best = np.array([xs.mean(), ys.mean()])
    return best


def orbit_center(vertices: np.ndarray, side: float) -> np.ndarray | None:
    eye_x = 3.35 * side
    eye_y = 2.55
    window = (
        (np.abs(vertices[:, 0] - eye_x) < 3.1)
        & (np.abs(vertices[:, 1] - eye_y) < 3.0)
        & (vertices[:, 2] > -1.0)
    )
    band = vertices[window]
    if len(band) < 40:
        return None
    res = 0.16
    x0, y0 = eye_x - 2.9, eye_y - 2.7
    nx, ny = 36, 34
    grid = np.zeros((ny, nx), dtype=bool)
    ix = np.clip(((band[:, 0] - x0) / res).astype(int), 0, nx - 1)
    iy = np.clip(((band[:, 1] - y0) / res).astype(int), 0, ny - 1)
    grid[iy, ix] = True
    grid = ndimage.binary_dilation(grid, iterations=1)
    hole = largest_hole(grid)
    if hole is None:
        return None
    cx = x0 + hole[0] * res
    cy = y0 + hole[1] * res
    near = band[np.hypot(band[:, 0] - cx, band[:, 1] - cy) < 1.15]
    if len(near) < 8:
        return None
    return np.array([cx, cy, float(np.quantile(near[:, 2], 0.72))])


def weighted_axis_fit(src: np.ndarray, dst: np.ndarray, weights: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    scale = np.ones(3)
    shift = np.zeros(3)
    for axis in range(3):
        x = src[:, axis]
        y = dst[:, axis]
        w = weights[:, axis]
        sw = np.sqrt(w)
        design = np.stack([x, np.ones_like(x)], axis=1) * sw[:, None]
        sol, *_ = np.linalg.lstsq(design, y * sw, rcond=None)
        scale[axis] = float(np.clip(sol[0], 0.72, 1.38))
        shift[axis] = float(sol[1])
    return scale, shift


def align_bones(
    parts: dict[str, trimesh.Trimesh], face: np.ndarray
) -> tuple[dict[str, trimesh.Trimesh], np.ndarray, tuple[float, np.ndarray, np.ndarray]]:
    src_named = bone_points(parts)
    order = ["forehead", "nasion", "menton", "cheek_l", "cheek_r", "gonion_l", "gonion_r"]
    # Skin sits just outside the bone. Targets are tucked in a little so the
    # skull reads inside the face instead of floating in front of it.
    targets = {
        "forehead": face[10] + np.array([0.0, -0.15, -0.35]),
        "nasion": face[168] + np.array([0.0, 0.0, -0.2]),
        "menton": face[152] + np.array([0.0, 0.25, -0.45]),
        "cheek_l": face[345] + np.array([0.05, 0.0, -0.28]),
        "cheek_r": face[116] + np.array([-0.05, 0.0, -0.28]),
        "gonion_l": face[397] + np.array([0.15, 0.05, -0.35]),
        "gonion_r": face[172] + np.array([-0.15, 0.05, -0.35]),
    }
    src = np.stack([src_named[name] for name in order])
    dst = np.stack([targets[name] for name in order])
    scale, rot, trans = umeyama(src, dst)
    # A single similarity keeps the eye sockets on the eyes. A later per-axis
    # warp pulled the skull off to one side, so it stays a rigid fit.
    aligned = {name: apply_similarity(mesh, scale, rot, trans) for name, mesh in parts.items()}
    moved = apply_similarity_points(src, scale, rot, trans)
    err = np.linalg.norm(moved - dst, axis=1)
    print(f"alignment scale {scale:.4f} mean {err.mean():.3f} max {err.max():.3f}")
    jaw = jaw_pivot(aligned["mandible"])
    return aligned, jaw, (scale, rot, trans)


def jaw_pivot(mandible: trimesh.Trimesh) -> np.ndarray:
    """Midpoint of the two condyles, so the jaw opens around the real hinge."""
    verts = mandible.vertices
    pivots = []
    for sign in (1.0, -1.0):
        side = verts[verts[:, 0] * sign > 1.2]
        if len(side) < 12:
            continue
        high = side[side[:, 1] >= np.quantile(side[:, 1], 0.9)]
        post = high[high[:, 2] <= np.quantile(high[:, 2], 0.45)]
        pivots.append(post.mean(0) if len(post) >= 4 else high.mean(0))
    if len(pivots) < 2:
        return verts[int(np.argmax(verts[:, 1]))]
    return np.mean(pivots, axis=0)


def remesh_brain(parts: list[trimesh.Trimesh]) -> trimesh.Trimesh:
    cloud = np.concatenate([mesh.vertices for mesh in parts])
    if len(cloud) > 80000:
        cloud = cloud[:: len(cloud) // 80000]
    pitch = 2.5
    mins = cloud.min(0) - pitch * 3
    dims = np.ceil((cloud.max(0) - mins) / pitch).astype(int) + 6
    idx = np.clip(((cloud - mins) / pitch).astype(int), 0, dims - 1)
    grid = np.zeros(tuple(int(v) for v in dims), dtype=bool)
    grid[idx[:, 0], idx[:, 1], idx[:, 2]] = True
    grid = ndimage.binary_dilation(grid, iterations=2)
    grid = ndimage.binary_fill_holes(grid)
    grid = ndimage.binary_erosion(grid, iterations=1)
    mesh = trimesh.voxel.ops.matrix_to_marching_cubes(grid, pitch=pitch)
    mesh.apply_translation(mins)
    center = np.median(np.concatenate([part.vertices for part in parts]), axis=0)
    near = np.linalg.norm(mesh.vertices - center, axis=1) < 120
    mesh.update_faces(near[mesh.faces].all(axis=1))
    mesh.remove_unreferenced_vertices()
    pieces = mesh.split(only_watertight=False)
    mesh = max(pieces, key=lambda item: len(item.faces))
    # Smooth in local coordinates. The same filter drifts when vertices sit at z ≈ 1500 mm.
    origin = mesh.vertices.mean(0)
    mesh.vertices = mesh.vertices - origin
    mesh = decimate(mesh, FACE_LIMIT["brain"])
    trimesh.smoothing.filter_laplacian(mesh, lamb=0.35, iterations=4)
    mesh.vertices = mesh.vertices + origin
    mesh.fix_normals()
    return mesh


def subdivide(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    verts, faces = trimesh.remesh.subdivide(mesh.vertices, mesh.faces)
    out = trimesh.Trimesh(verts, faces, process=False)
    out.fix_normals()
    return out


def snap(tree: cKDTree, normals: np.ndarray, surface: np.ndarray, points: np.ndarray, lift: float) -> np.ndarray:
    _, index = tree.query(points)
    return surface[index] + normals[index] * lift


def grid_sheet(rows: list[np.ndarray], thickness: float) -> trimesh.Trimesh:
    stack = np.stack(rows, axis=0)
    a, b, _ = stack.shape
    tang_u = np.gradient(stack, axis=0)
    tang_v = np.gradient(stack, axis=1)
    normal = np.cross(tang_u, tang_v)
    length = np.linalg.norm(normal, axis=2, keepdims=True)
    normal = normal / np.maximum(length, 1e-8)
    top = (stack + normal * (thickness * 0.5)).reshape(-1, 3)
    bot = (stack - normal * (thickness * 0.35)).reshape(-1, 3)
    count = a * b

    def quads(base: int, flip: bool) -> list[list[int]]:
        faces = []
        for i in range(a - 1):
            for j in range(b - 1):
                v00 = base + i * b + j
                v10 = base + (i + 1) * b + j
                v01 = v00 + 1
                v11 = v10 + 1
                if flip:
                    faces.append([v00, v01, v11])
                    faces.append([v00, v11, v10])
                else:
                    faces.append([v00, v11, v01])
                    faces.append([v00, v10, v11])
        return faces

    faces = quads(0, False) + quads(count, True)
    # stitch the four edges so the sheet has a little thickness from the side
    def edge(loop: list[tuple[int, int]]) -> None:
        for (a0, b0), (a1, b1) in zip(loop, loop[1:]):
            faces.append([a0, b0, b1])
            faces.append([a0, b1, a1])

    top_i = lambda i, j: i * b + j
    bot_i = lambda i, j: count + i * b + j
    edge([(top_i(0, j), bot_i(0, j)) for j in range(b)])
    edge([(bot_i(a - 1, j), top_i(a - 1, j)) for j in range(b)])
    edge([(bot_i(i, 0), top_i(i, 0)) for i in range(a)])
    edge([(top_i(i, b - 1), bot_i(i, b - 1)) for i in range(a)])
    mesh = trimesh.Trimesh(vertices=np.vstack([top, bot]), faces=np.asarray(faces), process=False)
    mesh.fix_normals()
    return mesh


def resample(polyline: np.ndarray, count: int) -> np.ndarray:
    if len(polyline) == 1:
        return np.repeat(polyline, count, axis=0)
    seg = np.linalg.norm(np.diff(polyline, axis=0), axis=1)
    total = np.concatenate([[0], np.cumsum(seg)])
    if total[-1] < 1e-6:
        return np.repeat(polyline[:1], count, axis=0)
    want = np.linspace(0, total[-1], count)
    out = []
    for distance in want:
        i = int(np.searchsorted(total, distance, side="right") - 1)
        i = min(max(i, 0), len(polyline) - 2)
        span = max(total[i + 1] - total[i], 1e-8)
        t = (distance - total[i]) / span
        out.append((1 - t) * polyline[i] + t * polyline[i + 1])
    return np.stack(out)


def _raster_openings(mesh: trimesh.Trimesh, res: float = 0.07) -> list[dict]:
    """Front-view holes in the facial bones. Each hole is a dict of center, size, and area."""
    verts = mesh.vertices
    x0, x1, y0, y1 = -8.4, 7.2, -6.2, 8.6
    width = int((x1 - x0) / res) + 1
    height = int((y1 - y0) / res) + 1
    occupied = np.zeros((height, width), dtype=bool)
    tris = verts[mesh.faces]
    for tri in tris:
        samples = [tri.mean(0)]
        for i in range(3):
            samples.append(tri[i])
            samples.append((tri[i] + tri[(i + 1) % 3]) * 0.5)
        for point in samples:
            ix = int((point[0] - x0) / res)
            iy = int((point[1] - y0) / res)
            if 0 <= ix < width and 0 <= iy < height:
                occupied[iy, ix] = True
    occupied = ndimage.binary_dilation(occupied, iterations=1)
    empty = ~occupied
    empty[0, :] = empty[-1, :] = empty[:, 0] = empty[:, -1] = False
    labels, count = ndimage.label(empty)
    holes = []
    for label in range(1, count + 1):
        ys, xs = np.where(labels == label)
        if len(xs) < 80:
            continue
        cx = x0 + xs.mean() * res
        cy = y0 + ys.mean() * res
        holes.append(
            {
                "area": int(len(xs)),
                "center": np.array([cx, cy, 0.0]),
                "width": (xs.max() - xs.min()) * res,
                "height": (ys.max() - ys.min()) * res,
            }
        )
    return holes


def _rim_point(vertices: np.ndarray, center_xy: np.ndarray, radius: float) -> np.ndarray:
    flat = np.hypot(vertices[:, 0] - center_xy[0], vertices[:, 1] - center_xy[1])
    band = vertices[(flat > radius * 0.45) & (flat < radius * 1.25)]
    if len(band) < 12:
        band = vertices[flat < radius * 1.6]
    if len(band) < 8:
        return np.array([center_xy[0], center_xy[1], 3.2])
    z = float(np.quantile(band[:, 2], 0.72))
    return np.array([center_xy[0], center_xy[1], z])


def _orbit_candidates(holes: list[dict], eye: np.ndarray) -> list[tuple[float, dict]]:
    """Holes on the eye's side of the face, ranked by distance to that eye."""
    side = -1.0 if eye[0] < 0 else 1.0
    ranked = []
    for hole in holes:
        center = hole["center"]
        if side * center[0] < 1.35:
            continue
        if not (1.15 <= hole["width"] <= 4.6 and 0.9 <= hole["height"] <= 4.8):
            continue
        if not (280 <= hole["area"] <= 5200):
            continue
        dist = float(np.hypot(center[0] - eye[0], center[1] - eye[1]))
        if dist > 3.5:
            continue
        ranked.append((dist, hole))
    ranked.sort(key=lambda item: item[0])
    return ranked


def detect_orbits(mesh: trimesh.Trimesh, eyes: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, float] | None:
    """Right orbit, left orbit, nasal aperture, and a socket radius.

    The orbit is the opening nearest each canonical eye, not the largest hole
    on that side. A medial gap beside the nose is closer to the midline and
    must not win.
    """
    holes = _raster_openings(mesh)
    print(
        "openings",
        [(round(float(h["center"][0]), 2), round(float(h["center"][1]), 2), h["area"], round(h["width"], 2), round(h["height"], 2)) for h in holes],
    )
    right_ranked = _orbit_candidates(holes, eyes[0])
    left_ranked = _orbit_candidates(holes, eyes[1])
    if not right_ranked or not left_ranked:
        return None
    right_h = right_ranked[0][1]
    left_h = left_ranked[0][1]
    radius = float(np.clip((right_h["width"] + right_h["height"] + left_h["width"] + left_h["height"]) / 8, 1.05, 1.55))
    right_c = _rim_point(mesh.vertices, right_h["center"][:2], radius)
    left_c = _rim_point(mesh.vertices, left_h["center"][:2], radius)
    nasal_holes = [h for h in holes if abs(h["center"][0]) < 1.35 and h["center"][1] < min(right_c[1], left_c[1]) - 0.35]
    if nasal_holes:
        nasal_h = max(nasal_holes, key=lambda h: h["area"])
        nasal = _rim_point(mesh.vertices, nasal_h["center"][:2], 0.9)
    else:
        nasal = np.array([0.0, -2.3, 5.0])
    return right_c, left_c, nasal, radius


def _smooth_falloff(distance: np.ndarray, inner: float, outer: float) -> np.ndarray:
    span = np.clip((outer - distance) / max(outer - inner, 1e-4), 0.0, 1.0)
    return span * span * (3.0 - 2.0 * span)


def _socket_slide(
    vertices: np.ndarray,
    sources: np.ndarray,
    targets: np.ndarray,
    pins: np.ndarray,
    inner: float = 2.15,
    outer: float = 4.1,
) -> np.ndarray:
    """Translate each socket as a piece. Pins vote to stay put, so the chin and cheeks do not follow."""
    acc = np.zeros_like(vertices)
    weight = np.zeros(len(vertices))
    for source, target in zip(sources, targets):
        influence = _smooth_falloff(np.linalg.norm(vertices - source, axis=1), inner, outer)
        acc += influence[:, None] * (target - source)
        weight += influence
    for pin in pins:
        influence = _smooth_falloff(np.linalg.norm(vertices - pin, axis=1), 0.7, 1.7)
        weight += influence
    out = vertices.copy()
    mask = weight > 1e-6
    out[mask] += acc[mask] / weight[mask, None]
    return out


def _rbf_move(points: np.ndarray, handles: np.ndarray, disp: np.ndarray, radius: float) -> np.ndarray:
    kernel = np.exp(-(np.linalg.norm(handles[:, None, :] - handles[None, :, :], axis=2) / radius) ** 2)
    weights = np.linalg.solve(kernel + np.eye(len(handles)) * 1e-3, disp)
    out = np.empty_like(points)
    for start in range(0, len(points), 25000):
        chunk = points[start : start + 25000]
        dist = np.linalg.norm(chunk[:, None, :] - handles[None, :, :], axis=2)
        phi = np.exp(-((dist / radius) ** 2))
        out[start : start + len(chunk)] = chunk + phi @ weights
    return out


def _closest(vertices: np.ndarray, point: np.ndarray) -> np.ndarray:
    return vertices[int(np.argmin(np.linalg.norm(vertices - point, axis=1)))]


def pin_orbits(meshes: dict[str, trimesh.Trimesh], face: np.ndarray) -> list[dict]:
    """Slide each orbital opening onto its canonical eye.

    The warp is local. The forehead, cheekbones, nose, chin, and cranium are
    pinned, so the socket moves without dragging the rest of the skull.
    """
    face_bone = trimesh.util.concatenate([meshes[name] for name in ("frontal", "zygomatic", "maxilla", "nasal")])
    eye_r = (face[33] + face[133]) / 2 + np.array([0.0, 0.0, -0.22])
    eye_l = (face[263] + face[362]) / 2 + np.array([0.0, 0.0, -0.22])
    eyes = np.stack([eye_r, eye_l])
    found = detect_orbits(face_bone, eyes)
    if found is None:
        raise RuntimeError("orbit detection failed; the facial bones have no socket near each eye")
    right, left, nasal, radius = found
    print("orbits before", np.round(right, 2), np.round(left, 2), "radius", round(radius, 2))
    mandible = meshes["mandible"].vertices
    menton = mandible[int(np.argmin(mandible[:, 1] + np.abs(mandible[:, 0]) * 0.15))]
    frontal = meshes["frontal"].vertices
    crown = frontal[int(np.argmax(frontal[:, 1] - np.abs(frontal[:, 0]) * 0.2))]
    nasion = _closest(frontal, face[168])
    parietal = meshes["parietal"].vertices
    top = parietal[int(np.argmax(parietal[:, 1]))]
    gonion_r = mandible[int(np.argmin(mandible[:, 0]))]
    gonion_l = mandible[int(np.argmax(mandible[:, 0]))]
    occipital = meshes["occipital"].vertices
    back = occipital[int(np.argmin(occipital[:, 2]))]
    zy = meshes["zygomatic"].vertices
    cheek_band = zy[(zy[:, 2] > np.quantile(zy[:, 2], 0.35)) & (zy[:, 1] < min(right[1], left[1]) - 1.4)]
    if len(cheek_band) < 8:
        cheek_band = zy
    cheek_r = cheek_band[int(np.argmin(cheek_band[:, 0]))]
    cheek_l = cheek_band[int(np.argmax(cheek_band[:, 0]))]
    pins = np.stack([menton, nasal, nasion, crown, top, gonion_r, gonion_l, back, cheek_r, cheek_l])
    sources = np.stack([right, left])
    targets = np.stack([eye_r, eye_l])
    print("socket slide", np.round(sources, 2), "->", np.round(targets, 2))
    names = [name for name in ("frontal", "parietal", "temporal", "occipital", "nasal", "zygomatic", "maxilla", "mandible", "brain") if name in meshes]
    for name in names:
        mesh = meshes[name]
        moved = _socket_slide(mesh.vertices, sources, targets, pins)
        shift = np.linalg.norm(moved - mesh.vertices, axis=1)
        if float(shift.max()) > 5.5:
            raise RuntimeError(f"orbit warp moved {name} by {shift.max():.2f} cm")
        mesh.vertices = moved
        mesh.fix_normals()
    _finish_orbits(meshes, eyes)
    check = trimesh.util.concatenate([meshes[name] for name in ("frontal", "zygomatic", "maxilla", "nasal")])
    after = detect_orbits(check, eyes)
    if after is None:
        raise RuntimeError("orbit warp closed the sockets")
    for label, eye, landed in (("right", eye_r, after[0]), ("left", eye_l, after[1])):
        miss = float(np.hypot(landed[0] - eye[0], landed[1] - eye[1]))
        nearest = float(np.linalg.norm(check.vertices - eye, axis=1).min())
        print(f"  {label} socket miss {miss:.2f} cm, nearest bone {nearest:.2f} cm, landed {np.round(landed, 2)}")
        if miss > 0.65:
            raise RuntimeError(f"{label} orbit is still {miss:.2f} cm from the eye")
        if nearest < 0.45 or nearest > 2.1:
            raise RuntimeError(f"{label} eye is {nearest:.2f} cm from bone; the socket did not open around it")
    _orbit_preview(meshes, eyes, Path("/tmp/bp3d/orbit-check.png"))
    return [
        {"center": [round(float(v), 4) for v in eye_r], "radius": round(radius, 3)},
        {"center": [round(float(v), 4) for v in eye_l], "radius": round(radius, 3)},
    ]


def _split_long_faces(mesh: trimesh.Trimesh, limit: float = 0.42, rounds: int = 4) -> trimesh.Trimesh:
    """Break the stretched triangles the socket slide leaves behind, so the rim can be round."""
    vertices = np.asarray(mesh.vertices)
    faces = np.asarray(mesh.faces)
    for _ in range(rounds):
        length = np.maximum(
            np.linalg.norm(vertices[faces[:, 0]] - vertices[faces[:, 1]], axis=1),
            np.maximum(
                np.linalg.norm(vertices[faces[:, 1]] - vertices[faces[:, 2]], axis=1),
                np.linalg.norm(vertices[faces[:, 2]] - vertices[faces[:, 0]], axis=1),
            ),
        )
        long = np.where(length > limit)[0]
        if len(long) == 0:
            break
        if len(long) > 12000:
            long = long[np.argsort(length[long])[-12000:]]
        vertices, faces = trimesh.remesh.subdivide(vertices, faces, face_index=long)
    out = trimesh.Trimesh(vertices, faces, process=False)
    out.fix_normals()
    return out


def _relax_rims(mesh: trimesh.Trimesh, eyes: np.ndarray, reach: float = 2.35) -> None:
    """Round the bone around each eye without pulling the chin or the cranium."""
    neighbors: list[list[int]] = [[] for _ in range(len(mesh.vertices))]
    for a, b in mesh.edges_unique:
        neighbors[a].append(int(b))
        neighbors[b].append(int(a))
    distance = np.min(np.linalg.norm(mesh.vertices[:, None, :] - eyes[None, :, :], axis=2), axis=1)
    mask = distance < reach
    if int(mask.sum()) < 30:
        return
    weight = _smooth_falloff(distance, reach * 0.35, reach)
    vertices = mesh.vertices.copy()
    for factor in (0.42, -0.44) * 5:
        delta = np.zeros_like(vertices)
        for index in np.flatnonzero(mask):
            adjacent = neighbors[index]
            if adjacent:
                delta[index] = vertices[adjacent].mean(axis=0) - vertices[index]
        vertices += delta * (factor * weight)[:, None]
    mesh.vertices = vertices
    mesh.fix_normals()


def _finish_orbits(meshes: dict[str, trimesh.Trimesh], eyes: np.ndarray) -> None:
    for name in ("frontal", "zygomatic", "maxilla", "nasal"):
        meshes[name] = _split_long_faces(meshes[name])
        _relax_rims(meshes[name], eyes)
        print(f"rounded {name} faces {len(meshes[name].faces)}")


def _orbit_preview(meshes: dict[str, trimesh.Trimesh], eyes: np.ndarray, path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6, 7), facecolor="#10141c")
    ax.set_facecolor("#10141c")
    colors = {"frontal": "#d5e8ff", "zygomatic": "#9ec4ef", "maxilla": "#c5d8f0", "nasal": "#f4f8ff", "mandible": "#8ec8ff"}
    for name, color in colors.items():
        verts = meshes[name].vertices
        step = max(1, len(verts) // 4000)
        ax.scatter(verts[::step, 0], verts[::step, 1], s=1, c=color, linewidths=0)
    ax.scatter(eyes[:, 0], eyes[:, 1], s=40, c="#ff5a4a", linewidths=0)
    ax.set_aspect("equal")
    ax.set_xlim(-8, 8)
    ax.set_ylim(-10, 10)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=130)
    print("orbit preview", path)


def refine_face_bones(meshes: dict[str, trimesh.Trimesh]) -> None:
    """Subdivide the bones that form the orbits, then round the rims before they are pinned."""
    for name, lamb in (("frontal", 0.2), ("zygomatic", 0.22), ("nasal", 0.2), ("maxilla", 0.12)):
        refined = subdivide(meshes[name])
        trimesh.smoothing.filter_laplacian(refined, lamb=lamb, iterations=2)
        refined.fix_normals()
        meshes[name] = refined
        print(f"refined {name} faces {len(refined.faces)}")


def _project(tree: cKDTree, verts: np.ndarray, normals: np.ndarray, points: np.ndarray, lift: float) -> np.ndarray:
    _, index = tree.query(points)
    return verts[index] + normals[index] * lift


def _settle(grid: np.ndarray, tree: cKDTree, verts: np.ndarray, normals: np.ndarray, lift: float, rounds: int = 7) -> np.ndarray:
    """Pull a fiber grid onto a surface, then relax it so the quads stop reading as bricks."""
    settled = grid.copy()
    rows, cols, _ = settled.shape
    for _ in range(rounds):
        flat = _project(tree, verts, normals, settled.reshape(-1, 3), lift).reshape(settled.shape)
        if rows > 2 and cols > 2:
            average = (flat[:-2, 1:-1] + flat[2:, 1:-1] + flat[1:-1, :-2] + flat[1:-1, 2:]) / 4
            flat = flat.copy()
            flat[1:-1, 1:-1] = flat[1:-1, 1:-1] * 0.42 + average * 0.58
        settled = flat
    return _project(tree, verts, normals, settled.reshape(-1, 3), lift).reshape(settled.shape)


def _surface(grid: np.ndarray, moves: np.ndarray, closed: bool = False) -> trimesh.Trimesh:
    """grid is (along, across, 3). moves is the same shape, in centimetres at full expression.

    `closed` joins the fiber ends, which is how a ring (eyes, lips) stays a loop.
    """
    along, across, _ = grid.shape
    verts = grid.reshape(-1, 3)
    move = moves.reshape(-1, 3).astype(np.float32)
    fiber = np.linspace(0, 1, along, endpoint=not closed)
    span = np.linspace(0, 1, across)
    uu, vv = np.meshgrid(fiber, span, indexing="ij")
    uv = np.stack([uu, vv], axis=-1).reshape(-1, 2).astype(np.float32)
    faces: list[list[int]] = []
    steps = along if closed else along - 1
    for i in range(steps):
        i2 = (i + 1) % along
        for j in range(across - 1):
            v00 = i * across + j
            v10 = i2 * across + j
            v01 = i * across + (j + 1)
            v11 = i2 * across + (j + 1)
            faces.append([v00, v10, v11])
            faces.append([v00, v11, v01])
    mesh = trimesh.Trimesh(vertices=verts, faces=np.asarray(faces), process=False)
    mesh.fix_normals()
    # The glTF writer keeps UVs or vertex colours, not both. Motion is stored beside the file.
    mesh.visual = trimesh.visual.TextureVisuals(uv=uv)
    mesh.metadata = {"move": move}
    return mesh


def _join(parts: list[trimesh.Trimesh]) -> trimesh.Trimesh:
    moves = np.concatenate([part.metadata["move"] for part in parts])
    uvs = np.concatenate([np.asarray(part.visual.uv) for part in parts])
    mesh = trimesh.util.concatenate(parts)
    mesh.metadata = {"move": moves.astype(np.float32)}
    mesh.visual = trimesh.visual.TextureVisuals(uv=uvs.astype(np.float32))
    mesh.fix_normals()
    return mesh


def _loop_axes(points: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    center = points.mean(0)
    _, _, vt = np.linalg.svd(points - center, full_matrices=False)
    return center, vt[0], vt[1]


def _ring(points: np.ndarray, inner: float, outer: float, around: int, bands: int) -> np.ndarray:
    center, axis_u, axis_v = _loop_axes(points)
    local = points - center
    ru = max(float(np.abs(local @ axis_u).max()), 0.4)
    rv = max(float(np.abs(local @ axis_v).max()), 0.35)
    grid = []
    for radius in np.linspace(inner, outer, bands):
        ring = []
        for angle in np.linspace(0, 2 * np.pi, around, endpoint=False):
            ring.append(center + axis_u * (np.cos(angle) * ru * radius) + axis_v * (np.sin(angle) * rv * radius))
        grid.append(ring)
    return np.asarray(grid)


def _jaw_delta(points: np.ndarray, pivot: np.ndarray, angle: float = 0.42) -> np.ndarray:
    rel = points - pivot
    cos = np.cos(angle)
    sin = np.sin(angle)
    rotated = np.stack([rel[:, 0], rel[:, 1] * cos - rel[:, 2] * sin, rel[:, 1] * sin + rel[:, 2] * cos], axis=1)
    return rotated - rel


def _tree_of(mesh: trimesh.Trimesh) -> tuple[cKDTree, np.ndarray, np.ndarray]:
    fine = subdivide(mesh) if len(mesh.faces) < 20000 else mesh
    return cKDTree(fine.vertices), fine.vertices, fine.vertex_normals


def build_muscles(
    face_mesh: trimesh.Trimesh, bones: dict[str, trimesh.Trimesh], jaw: np.ndarray
) -> dict[str, trimesh.Trimesh]:
    """Smooth muscle sheets on the skull. `metadata['move']` is the full-expression displacement."""
    face = face_mesh.vertices
    skull = trimesh.util.concatenate([bones[name] for name in ("frontal", "zygomatic", "maxilla", "mandible", "temporal", "nasal")])
    skull_tree, skull_v, skull_n = _tree_of(skull)
    face_tree, face_v, face_n = _tree_of(face_mesh)
    frontal_tree, frontal_v, frontal_n = _tree_of(bones["frontal"])
    side_tree, side_v, side_n = _tree_of(trimesh.util.concatenate([bones["temporal"], bones["parietal"], bones["frontal"]]))

    def fade(grid: np.ndarray, move_at_end: np.ndarray) -> np.ndarray:
        """move_at_end is (across, 3) or a single vector. Weight grows along the fiber."""
        along = grid.shape[0]
        weight = np.linspace(0, 1, along)[:, None, None]
        end = np.asarray(move_at_end, dtype=float)
        if end.ndim == 1:
            end = np.broadcast_to(end, (grid.shape[1], 3))
        return weight * end[None, :, :]

    brow = resample(face[BROW], 34)
    hair = brow.copy()
    hair[:, 0] *= 0.84
    hair[:, 1] = face[10, 1] - 0.55
    hair[:, 2] = np.minimum(hair[:, 2], face[10, 2] + 0.15)
    rows = [(1 - t) * hair + t * brow for t in np.linspace(0, 1, 22)]
    frontalis_g = _settle(np.stack(rows), frontal_tree, frontal_v, frontal_n, 0.1, rounds=8)
    brow_lift = np.array([0.0, 0.7, 0.16])
    frontalis = _surface(frontalis_g, fade(frontalis_g, brow_lift))

    def strap(origin: np.ndarray, insertion: np.ndarray, width: float, along: int, across: int, lift: float, end_move: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        path = resample(np.stack([origin, insertion]), along)
        tangent = np.gradient(path, axis=0)
        tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-8)
        side = np.cross(tangent, np.array([0.0, 0.0, 1.0]))
        weak = np.linalg.norm(side, axis=1) < 1e-4
        if np.any(weak):
            side[weak] = np.cross(tangent[weak], np.array([0.0, 1.0, 0.0]))
        side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-8)
        cols = [path + side * (t * width) for t in np.linspace(-0.5, 0.5, across)]
        grid = _settle(np.stack(cols, axis=1), skull_tree, skull_v, skull_n, lift)
        return grid, fade(grid, end_move)

    glabella = face[9]
    corrugator_parts = []
    for brow_index, sign in ((107, -1.0), (336, 1.0)):
        move = np.array([sign * -0.28, -0.22, 0.05])
        grid, moves = strap(face[brow_index], glabella, 0.55, 12, 6, 0.14, move)
        corrugator_parts.append(_surface(grid, moves))
    corrugator = _join(corrugator_parts)

    def eye_ring(indices: list[int]) -> trimesh.Trimesh:
        grid = _ring(face[indices], 0.62, 1.28, 64, 8)
        along, across, _ = grid.shape
        # Fiber runs around the eye, so the grid's last axis is the loop. Swap to (around, bands).
        grid = np.transpose(grid, (1, 0, 2))
        grid = _settle(grid, skull_tree, skull_v, skull_n, 0.12, rounds=5)
        center = face[indices].mean(0)
        toward = center - grid
        toward /= np.maximum(np.linalg.norm(toward, axis=2, keepdims=True), 1e-6)
        moves = toward * 0.28
        return _surface(grid, moves, closed=True)

    orbicularis = _join([eye_ring(RIGHT_EYE), eye_ring(LEFT_EYE)])

    lip = face[[61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]]
    oris_g = _ring(lip, 0.78, 1.38, 52, 6)
    oris_g = np.transpose(oris_g, (1, 0, 2))
    oris_g = _settle(oris_g, face_tree, face_v, face_n, 0.05, rounds=4)
    mouth = lip.mean(0)
    toward_mouth = mouth - oris_g
    toward_mouth /= np.maximum(np.linalg.norm(toward_mouth, axis=2, keepdims=True), 1e-6)
    oris = _surface(oris_g, toward_mouth * 0.34, closed=True)

    def smile_strap(cheek: int, corner: int) -> trimesh.Trimesh:
        origin = face[cheek] + np.array([0.0, 0.15, -0.15])
        insertion = face[corner]
        direction = origin - insertion
        pull = direction / max(float(np.linalg.norm(direction)), 1e-6) * 0.85 + np.array([0.0, 0.22, 0.06])
        grid, moves = strap(origin, insertion, 1.35, 24, 10, 0.1, pull)
        return _surface(grid, moves)

    zygomaticus = _join([smile_strap(116, 61), smile_strap(345, 291)])

    def chew(cheek: int, gonion: int, ear: int) -> trimesh.Trimesh:
        top_front = face[cheek] + np.array([0.0, -0.25, -0.15])
        top_back = face[cheek] * 0.42 + face[ear] * 0.58 + np.array([0.0, 0.85, 0.15])
        bot_back = face[gonion]
        bot_front = face[gonion] * 0.62 + face[152] * 0.38
        along = 16
        across = 10
        grid = np.zeros((along, across, 3))
        for i, t in enumerate(np.linspace(0, 1, along)):
            left = (1 - t) * top_front + t * bot_front
            right = (1 - t) * top_back + t * bot_back
            grid[i] = resample(np.stack([left, right]), across)
        grid = _settle(grid, skull_tree, skull_v, skull_n, 0.12, rounds=8)
        weight = np.linspace(0, 1, along)[:, None]
        delta = _jaw_delta(grid.reshape(-1, 3), jaw).reshape(grid.shape)
        moves = delta * weight[:, :, None]
        return _surface(grid, moves)

    masseter = _join([chew(116, 172, 234), chew(345, 397, 454)])

    def temple(ear: int, gonion: int, cheek: int, sign: float) -> trimesh.Trimesh:
        insertion = face[ear] * 0.28 + face[gonion] * 0.22 + face[cheek] * 0.5 + np.array([sign * 0.2, 1.7, 0.35])
        origins = []
        for lift, forward in ((2.4, -0.2), (3.6, 0.3), (4.8, 1.0), (5.0, 1.9), (4.2, 2.7), (3.2, 3.1), (2.2, 2.2), (1.6, 1.2)):
            origins.append(face[ear] + np.array([sign * forward, lift, 0.35]))
        along = 14
        grid = np.zeros((along, len(origins), 3))
        for j, origin in enumerate(origins):
            grid[:, j] = resample(np.stack([origin, insertion]), along)
        grid = _settle(grid, side_tree, side_v, side_n, 0.16, rounds=5)
        weight = np.linspace(0, 1, along)[:, None]
        delta = _jaw_delta(grid.reshape(-1, 3), jaw).reshape(grid.shape)
        return _surface(grid, delta * weight[:, :, None] * 0.85)

    temporalis = _join([temple(234, 172, 116, -1.0), temple(454, 397, 345, 1.0)])

    sheets = {
        "frontalis": frontalis,
        "corrugator": corrugator,
        "orbicularis": orbicularis,
        "oris": oris,
        "zygomaticus": zygomaticus,
        "masseter": masseter,
        "temporalis": temporalis,
    }
    for name, mesh in sheets.items():
        shift = float(np.linalg.norm(mesh.metadata["move"], axis=1).max())
        print(f"  muscle {name} faces {len(mesh.faces)} move {shift:.2f} cm")
    return sheets


def build_shell(face_mesh: trimesh.Trimesh, skull: trimesh.Trimesh) -> trimesh.Trimesh:
    skin = subdivide(face_mesh)
    trimesh.smoothing.filter_laplacian(skin, lamb=0.25, iterations=2)
    skin.vertices = skin.vertices + skin.vertex_normals * 0.04
    center = np.median(skull.vertices, axis=0)
    radial = skull.vertices - center
    dist = np.linalg.norm(radial, axis=1, keepdims=True)
    cap_v = skull.vertices + radial / np.maximum(dist, 1e-6) * 0.7
    forward = cap_v[:, 2]
    height = cap_v[:, 1]
    keep = (forward < 3.2) | (height > 6.2)
    cap = trimesh.Trimesh(vertices=cap_v[keep], faces=[], process=False)
    # balls around the kept vertices make a cranial canopy without a facial mask
    hull_src = cap_v[keep][:: max(1, keep.sum() // 1800)]
    canopy = trimesh.convex.convex_hull(hull_src)
    canopy = decimate(canopy, 2800)
    # drop the canopy's facial half so it does not paint a second mask over the cheeks
    centroids = canopy.triangles_center
    facial = (centroids[:, 2] > 2.4) & (centroids[:, 1] < 7.0)
    canopy.update_faces(~facial)
    canopy.remove_unreferenced_vertices()
    shell = trimesh.util.concatenate([skin, canopy])
    shell.fix_normals()
    return decimate(shell, FACE_LIMIT["shell"])


def bone_frame(mesh: trimesh.Trimesh, wrist: np.ndarray, palm_n: np.ndarray) -> trimesh.Trimesh:
    verts = mesh.vertices
    axis = verts - verts.mean(0)
    cov = np.cov(axis.T)
    _, vecs = np.linalg.eigh(cov)
    direction = vecs[:, -1]
    proj = (verts - verts.mean(0)) @ direction
    end_a = verts[proj <= np.quantile(proj, 0.14)].mean(0)
    end_b = verts[proj >= np.quantile(proj, 0.86)].mean(0)
    if np.linalg.norm(end_a - wrist) > np.linalg.norm(end_b - wrist):
        end_a, end_b = end_b, end_a
    along = end_b - end_a
    length = float(np.linalg.norm(along)) or 1.0
    along = along / length
    side = np.cross(along, palm_n)
    if np.linalg.norm(side) < 1e-5:
        side = np.cross(along, np.array([0.0, 1.0, 0.0]))
    side = side / np.linalg.norm(side)
    normal = np.cross(along, side)
    local = np.stack([(verts - end_a) @ along / length, (verts - end_a) @ side / length, (verts - end_a) @ normal / length], axis=1)
    out = mesh.copy()
    out.vertices = local
    return out


def build_hand(raw: dict[str, trimesh.Trimesh]) -> dict[str, trimesh.Trimesh]:
    carpals = [raw[name] for name in CARPALS]
    wrist = np.concatenate([mesh.vertices for mesh in carpals]).mean(0)

    def distal(mesh: trimesh.Trimesh) -> np.ndarray:
        verts = mesh.vertices
        proj = (verts - verts.mean(0)) @ (np.linalg.eigh(np.cov((verts - verts.mean(0)).T))[1][:, -1])
        end_a = verts[proj <= np.quantile(proj, 0.14)].mean(0)
        end_b = verts[proj >= np.quantile(proj, 0.86)].mean(0)
        return end_a if np.linalg.norm(end_a - wrist) > np.linalg.norm(end_b - wrist) else end_b

    index_mcp = distal(raw["mc2"])
    pinky_mcp = distal(raw["mc5"])
    e1 = index_mcp - wrist
    e2 = pinky_mcp - wrist
    normal = np.cross(e1, e2)
    normal = normal / np.linalg.norm(normal)
    # Thickness uses the geometric mean of the palm edges so it scales with the hand, not with the square of it.
    e3 = normal * np.sqrt(np.linalg.norm(e1) * np.linalg.norm(e2))
    basis = np.stack([e1, e2, e3], axis=1)
    inverse = np.linalg.inv(basis)
    palm_v = np.concatenate([mesh.vertices for mesh in carpals])
    palm_local = (palm_v - wrist) @ inverse.T
    # A light convex wrap reads as the carpal mass without seven separate pebbles.
    hull = trimesh.convex.convex_hull(palm_local)
    palm = decimate(hull, 900)
    palm_n = e3 / np.linalg.norm(e3)
    out = {"hand_palm": palm}
    for name in LONG_BONES:
        shaped = bone_frame(raw[name], wrist, palm_n)
        out[f"hand_{name}"] = decimate(shaped, 700)
        print(f"  hand {name} faces {len(out[f'hand_{name}'].faces)}")
    print("  palm faces", len(palm.faces))
    return out


def anchor_points(meshes: dict[str, trimesh.Trimesh], jaw: np.ndarray) -> dict[str, list[list[float]]]:
    def most(mesh: trimesh.Trimesh, score: np.ndarray, mask: np.ndarray | None = None) -> list[float]:
        return [round(float(v), 4) for v in pick(mesh, score, mask)]

    anchors: dict[str, list[list[float]]] = {}
    frontal = meshes["frontal"]
    fz = frontal.vertices
    mid = np.abs(fz[:, 0]) < 1.2
    anchors["frontal"] = [most(frontal, fz[:, 2] * 0.5 + fz[:, 1] * 0.5, mid)]
    parietal = meshes["parietal"]
    pv = parietal.vertices
    anchors["parietal"] = [
        most(parietal, pv[:, 1], pv[:, 0] > 1),
        most(parietal, pv[:, 1], pv[:, 0] < -1),
    ]
    temporal = meshes["temporal"]
    tv = temporal.vertices
    anchors["temporal"] = [
        most(temporal, tv[:, 0], tv[:, 1] > np.median(tv[:, 1])),
        most(temporal, -tv[:, 0], tv[:, 1] > np.median(tv[:, 1])),
    ]
    occipital = meshes["occipital"]
    anchors["occipital"] = [most(occipital, -occipital.vertices[:, 2])]
    nasal = meshes["nasal"]
    anchors["nasal"] = [most(nasal, nasal.vertices[:, 2], np.abs(nasal.vertices[:, 0]) < 0.8)]
    zy = meshes["zygomatic"]
    zv = zy.vertices
    anchors["zygomatic"] = [most(zy, zv[:, 0] * 0.4 + zv[:, 2], zv[:, 0] > 0), most(zy, -zv[:, 0] * 0.4 + zv[:, 2], zv[:, 0] < 0)]
    mx = meshes["maxilla"]
    mv = mx.vertices
    anchors["maxilla"] = [most(mx, mv[:, 2], (mv[:, 0] > 0) & (mv[:, 1] < np.median(mv[:, 1]))), most(mx, mv[:, 2], (mv[:, 0] < 0) & (mv[:, 1] < np.median(mv[:, 1])))]
    md = meshes["mandible"]
    anchors["mandible"] = [most(md, -md.vertices[:, 1] + md.vertices[:, 2], np.abs(md.vertices[:, 0]) < 1.1)]
    brain = meshes["brain"]
    anchors["brain"] = [most(brain, brain.vertices[:, 1] * 0.6 + brain.vertices[:, 2] * 0.4)]
    for name in MUSCLE_NAMES:
        mesh = meshes[name]
        verts = mesh.vertices
        if name in ("frontalis", "oris"):
            anchors[name] = [[round(float(v), 4) for v in verts.mean(0)]]
        else:
            right = verts[verts[:, 0] < 0]
            left = verts[verts[:, 0] >= 0]
            anchors[name] = [
                [round(float(v), 4) for v in (left.mean(0) if len(left) else verts.mean(0))],
                [round(float(v), 4) for v in (right.mean(0) if len(right) else verts.mean(0))],
            ]
    anchors["jawPivot"] = [[round(float(v), 4) for v in jaw]]
    return anchors


def preview(meshes: dict[str, trimesh.Trimesh], face: np.ndarray, path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(1, 2, figsize=(11, 7), facecolor="#0c1018")
    views = [(0, 1, "front"), (2, 1, "side")]
    colors = {
        "frontal": "#d5e8ff", "parietal": "#c5d8f0", "temporal": "#b7cbe6", "occipital": "#a9bdd8",
        "nasal": "#f2f7ff", "zygomatic": "#d5e8ff", "maxilla": "#d5e8ff", "mandible": "#e7f2ff",
        "brain": "#ffb3c7", "frontalis": "#ff8d84", "corrugator": "#ff8d84", "orbicularis": "#ff8d84",
        "oris": "#ff8d84", "zygomaticus": "#ff8d84", "masseter": "#ff8d84", "temporalis": "#ff8d84",
        "shell": "#35507a",
    }
    for ax, (xi, yi, title) in zip(axes, views):
        ax.set_facecolor("#0c1018")
        for name, mesh in meshes.items():
            if name.startswith("hand_"):
                continue
            verts = mesh.vertices
            step = max(1, len(verts) // 2500)
            ax.scatter(verts[::step, xi], verts[::step, yi], s=1, c=colors.get(name, "#fff"), alpha=0.55, linewidths=0)
        ax.scatter(face[:, xi], face[:, yi], s=4, c="#ffd56a", alpha=0.8, linewidths=0)
        ax.set_aspect("equal")
        ax.set_title(title, color="white")
        ax.tick_params(colors="#888")
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=120)
    print("preview", path)


def combine(parts: dict[str, trimesh.Trimesh], names: list[str]) -> trimesh.Trimesh:
    return trimesh.util.concatenate([parts[name] for name in names])


def main() -> None:
    pairs = [item for group in BONE_FILES.values() for item in group]
    pairs += BRAIN_FILES
    pairs += list(HAND_FILES.values())
    # unique preserving order
    seen = set()
    unique = []
    for pair in pairs:
        if pair[0] not in seen:
            seen.add(pair[0])
            unique.append(pair)
    have = ensure_objs(unique)
    parts = {name: merge_paths([have[fj] for fj, _ in files if fj in have]) for name, files in BONE_FILES.items()}
    for name, mesh in parts.items():
        print(f"loaded {name} faces {len(mesh.faces)}")
    face_mesh = load_canonical()
    face = face_mesh.vertices
    aligned, jaw, pose = align_bones(parts, face)
    scale, rot, trans = pose
    brain_raw = []
    for fj, _bp in BRAIN_FILES:
        if fj in have:
            brain_raw.append(load_mesh(have[fj]))
    print(f"brain parts {len(brain_raw)}", flush=True)
    brain_bp = remesh_brain(brain_raw)
    brain = apply_similarity(brain_bp, scale, rot, trans)
    brain.fix_normals()
    span = brain.bounds[1] - brain.bounds[0]
    print("brain faces", len(brain.faces), "span", np.round(span, 2))
    if span[1] > 28 or brain.bounds[0][1] < -18:
        raise RuntimeError(f"brain bounds look wrong: {brain.bounds}")

    export: dict[str, trimesh.Trimesh] = {
        "frontal": decimate(aligned["frontal"], FACE_LIMIT["frontal"]),
        "parietal": decimate(combine(aligned, ["parietal_l", "parietal_r"]), FACE_LIMIT["parietal"]),
        "temporal": decimate(combine(aligned, ["temporal_l", "temporal_r", "sphenoid"]), FACE_LIMIT["temporal"]),
        "occipital": decimate(aligned["occipital"], FACE_LIMIT["occipital"]),
        "nasal": decimate(combine(aligned, ["nasal_l", "nasal_r"]), FACE_LIMIT["nasal"]),
        "zygomatic": decimate(combine(aligned, ["zygomatic_l", "zygomatic_r"]), FACE_LIMIT["zygomatic"]),
        "maxilla": decimate(combine(aligned, ["maxilla_l", "maxilla_r"]), FACE_LIMIT["maxilla"]),
        "mandible": decimate(aligned["mandible"], FACE_LIMIT["mandible"]),
        "brain": brain,
    }
    print("jaw pivot before orbit pin", jaw)
    refine_face_bones(export)
    orbits = pin_orbits(export, face)
    jaw = jaw_pivot(export["mandible"])
    print("jaw pivot", jaw)
    export.update(build_muscles(face_mesh, export, jaw))
    skull_for_shell = combine(export, ["frontal", "parietal", "temporal", "occipital"])
    export["shell"] = build_shell(face_mesh, skull_for_shell)
    hand_raw = {name: load_mesh(have[fj]) for name, (fj, _bp) in HAND_FILES.items()}
    export.update(build_hand(hand_raw))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    scene = trimesh.Scene()
    muscle_attrs: dict[str, dict[str, list[float]]] = {}
    for name, mesh in export.items():
        # Touch the cache so the glTF writer stores normals. Without them the x-ray shader has nothing to shade.
        mesh.vertex_normals
        move = mesh.metadata.get("move") if isinstance(mesh.metadata, dict) else None
        if name in MUSCLE_NAMES and move is not None:
            uv = np.asarray(mesh.visual.uv, dtype=np.float32)
            muscle_attrs[name] = {
                "uv": [round(float(v), 4) for v in uv.reshape(-1)],
                "move": [round(float(v), 4) for v in np.asarray(move, dtype=np.float32).reshape(-1)],
            }
        mesh.visual.vertex_colors = [220, 230, 240, 255]
        scene.add_geometry(mesh, node_name=name, geom_name=name)
    glb = OUT_DIR / "anatomy.glb"
    scene.export(glb)
    anchors = anchor_points({k: v for k, v in export.items() if not k.startswith("hand_")}, jaw)
    hand_map = {
        "palm": "hand_palm",
        "bones": [
            {"name": "hand_mc1", "a": 1, "b": 2, "span": 1},
            {"name": "hand_pp1", "a": 2, "b": 3, "span": 1},
            {"name": "hand_dp1", "a": 3, "b": 4, "span": 0.92},
            {"name": "hand_mc2", "a": 0, "b": 5, "span": 1},
            {"name": "hand_pp2", "a": 5, "b": 6, "span": 1},
            {"name": "hand_mp2", "a": 6, "b": 7, "span": 1},
            {"name": "hand_dp2", "a": 7, "b": 8, "span": 0.92},
            {"name": "hand_mc3", "a": 0, "b": 9, "span": 1},
            {"name": "hand_pp3", "a": 9, "b": 10, "span": 1},
            {"name": "hand_mp3", "a": 10, "b": 11, "span": 1},
            {"name": "hand_dp3", "a": 11, "b": 12, "span": 0.92},
            {"name": "hand_mc4", "a": 0, "b": 13, "span": 1},
            {"name": "hand_pp4", "a": 13, "b": 14, "span": 1},
            {"name": "hand_mp4", "a": 14, "b": 15, "span": 1},
            {"name": "hand_dp4", "a": 15, "b": 16, "span": 0.92},
            {"name": "hand_mc5", "a": 0, "b": 17, "span": 1},
            {"name": "hand_pp5", "a": 17, "b": 18, "span": 1},
            {"name": "hand_mp5", "a": 18, "b": 19, "span": 1},
            {"name": "hand_dp5", "a": 19, "b": 20, "span": 0.92},
        ],
    }
    payload = {
        "jawPivot": anchors.pop("jawPivot")[0],
        "anchors": anchors,
        "hands": hand_map,
        "orbits": orbits,
        "bytes": glb.stat().st_size,
    }
    (OUT_DIR / "anchors.json").write_text(json.dumps(payload))
    (OUT_DIR / "muscle-attrs.json").write_text(json.dumps(muscle_attrs))
    (OUT_DIR / "nodes.json").write_text(json.dumps({"nodes": sorted(export), "bytes": glb.stat().st_size}, indent=2))
    print("wrote", glb, glb.stat().st_size)
    preview(export, face, Path("/tmp/bp3d/preview-aligned.png"))


def transform_like(source: trimesh.Trimesh, aligned: trimesh.Trimesh, mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Apply the vertex transform that took `source` to `aligned` (same topology)."""
    a = source.vertices
    b = aligned.vertices
    # Affine from 4 non-coplanar source verts. Fall back to a similarity if needed.
    picks = _basis_indices(a)
    src = a[picks]
    dst = b[picks]
    affine = _affine_from(src, dst)
    out = mesh.copy()
    homo = np.concatenate([out.vertices, np.ones((len(out.vertices), 1))], axis=1)
    out.vertices = (homo @ affine.T)[:, :3]
    return out


def transform_like_point(source: trimesh.Trimesh, aligned: trimesh.Trimesh, point: np.ndarray) -> np.ndarray:
    picks = _basis_indices(source.vertices)
    affine = _affine_from(source.vertices[picks], aligned.vertices[picks])
    homo = np.array([point[0], point[1], point[2], 1.0])
    return (affine @ homo)[:3]


def _basis_indices(verts: np.ndarray) -> list[int]:
    # four spread-out vertices so the affine is well conditioned
    center = verts.mean(0)
    scores = [
        verts[:, 0] + verts[:, 1],
        -verts[:, 0] + verts[:, 1],
        verts[:, 2] - verts[:, 1],
        -verts[:, 2] - verts[:, 0],
    ]
    idx = [int(np.argmax(score)) for score in scores]
    if len(set(idx)) < 4:
        idx = [0, len(verts) // 3, (2 * len(verts)) // 3, len(verts) - 1]
    return idx


def _affine_from(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    design = np.concatenate([src, np.ones((len(src), 1))], axis=1)
    # dst = design @ M.T
    matrix, *_ = np.linalg.lstsq(design, dst, rcond=None)
    affine = np.eye(4)
    affine[:3, :] = matrix.T
    return affine


def replace_muscles() -> None:
    """Rebuild muscle sheets on the skull already in the glTF. Does not move the bones."""
    glb = OUT_DIR / "anatomy.glb"
    loaded = trimesh.load(glb, force="scene")
    bones = {name: loaded.geometry[name] for name in ("frontal", "parietal", "temporal", "occipital", "nasal", "zygomatic", "maxilla", "mandible")}
    face_mesh = load_canonical()
    jaw = jaw_pivot(bones["mandible"])
    muscles = build_muscles(face_mesh, bones, jaw)
    export = {name: loaded.geometry[name] for name in loaded.geometry}
    export.update(muscles)
    scene = trimesh.Scene()
    muscle_attrs: dict[str, dict[str, list[float]]] = {}
    for name, mesh in export.items():
        mesh.vertex_normals
        move = mesh.metadata.get("move") if isinstance(mesh.metadata, dict) else None
        if name in MUSCLE_NAMES and move is not None:
            uv = np.asarray(mesh.visual.uv, dtype=np.float32)
            muscle_attrs[name] = {
                "uv": [round(float(v), 4) for v in uv.reshape(-1)],
                "move": [round(float(v), 4) for v in np.asarray(move, dtype=np.float32).reshape(-1)],
            }
        if name not in MUSCLE_NAMES:
            mesh.visual.vertex_colors = [220, 230, 240, 255]
        scene.add_geometry(mesh, node_name=name, geom_name=name)
    scene.export(glb)
    anchors = json.loads((OUT_DIR / "anchors.json").read_text())
    fresh = anchor_points({k: v for k, v in export.items() if not k.startswith("hand_")}, jaw)
    anchors["jawPivot"] = fresh.pop("jawPivot")[0]
    anchors["anchors"] = {k: v for k, v in fresh.items() if k != "jawPivot"}
    anchors["bytes"] = glb.stat().st_size
    (OUT_DIR / "anchors.json").write_text(json.dumps(anchors))
    (OUT_DIR / "muscle-attrs.json").write_text(json.dumps(muscle_attrs))
    print("replaced muscles", glb.stat().st_size)


if __name__ == "__main__":
    if "--muscles-only" in sys.argv:
        replace_muscles()
    else:
        main()
