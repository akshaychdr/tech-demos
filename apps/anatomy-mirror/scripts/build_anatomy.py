#!/usr/bin/env python3
"""Rebuild Anatomy Mirror meshes from BodyParts3D 4.3 element OBJs.

Bones, brain, and hand bones are decimated from BodyParts3D (CC BY-SA 2.1 JP,
(c) DBCLS). Release 4.3 has no face-muscle meshes, so the muscle surfaces are
original sheets that follow this skull and ship under the same licence.
The bones stay rigid: one similarity into canonical-face centimetres, then light decimation.
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

try:
    from scipy import ndimage
    from scipy.spatial import cKDTree
except ImportError:  # canonical placement of an existing GLB does not remesh
    ndimage = None
    cKDTree = None

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

# Face bones stay at the BodyParts3D resolution. The orbits, the nasal
# aperture, and the cheekbones tear if those triangles are collapsed.
FACE_LIMIT = {
    "frontal": 20000,
    "parietal": 18000,
    "temporal": 14000,
    "occipital": 14000,
    "nasal": 4000,
    "zygomatic": 8000,
    "maxilla": 14000,
    "mandible": 12000,
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
    parts: dict[str, trimesh.Trimesh], _face: np.ndarray
) -> tuple[dict[str, trimesh.Trimesh], np.ndarray, tuple[float, np.ndarray, np.ndarray]]:
    src_named = bone_points(parts)
    order = ["forehead", "nasion", "menton", "cheek_l", "cheek_r", "gonion_l", "gonion_r"]
    # Canonical centimetres: midline at x = 0, cheeks on the zygomatic arches.
    # canonical_space.py then mirrors the skull and fits each box.
    targets = {
        "forehead": np.array([0.13, 8.05, 4.35]),
        "nasion": np.array([0.0, 3.271027, 5.236015]),
        "menton": np.array([0.0, -9.403378, 4.264492]),
        "cheek_l": np.array([5.0, 0.27, 2.3]),
        "cheek_r": np.array([-5.0, 0.27, 2.3]),
        "gonion_l": np.array([6.2, -3.2, 0.4]),
        "gonion_r": np.array([-6.2, -3.2, 0.4]),
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


def remesh_brain(parts: list[trimesh.Trimesh], target: int = 15000, pitch: float = 2.5) -> trimesh.Trimesh:
    cloud = np.concatenate([mesh.vertices for mesh in parts])
    if len(cloud) > 120000:
        cloud = cloud[:: max(1, len(cloud) // 120000)]
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
    mesh = decimate(mesh, target)
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
        mesh = meshes.get(name)
        if mesh is None:
            continue
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


def _boundary_edges(mesh: trimesh.Trimesh) -> int:
    edges, counts = np.unique(mesh.edges_sorted, axis=0, return_counts=True)
    return int((counts == 1).sum())


def measure_orbits(meshes: dict[str, trimesh.Trimesh], face: np.ndarray) -> list[dict]:
    """Record the real orbital openings. The vertices are not moved."""
    face_bone = trimesh.util.concatenate([meshes[name] for name in ("frontal", "zygomatic", "maxilla", "nasal")])
    eye_r = (face[33] + face[133]) / 2
    eye_l = (face[263] + face[362]) / 2
    found = detect_orbits(face_bone, np.stack([eye_r, eye_l]))
    for name in ("frontal", "zygomatic", "maxilla", "nasal", "mandible", "parietal", "temporal", "occipital"):
        mesh = meshes[name]
        print(f"  intact {name} faces {len(mesh.faces)} boundary { _boundary_edges(mesh) }")
    if found is None:
        raise RuntimeError("the rigid skull has no orbital opening near each eye")
    right, left, _nasal, radius = found
    print("rigid orbits", np.round(right, 2), np.round(left, 2), "radius", round(radius, 2))
    return [
        {"center": [round(float(v), 4) for v in right], "radius": round(radius, 3)},
        {"center": [round(float(v), 4) for v in left], "radius": round(radius, 3)},
    ]


def _pack(point: np.ndarray) -> list[float]:
    return [round(float(v), 4) for v in point]


def fit_anchors(meshes: dict[str, trimesh.Trimesh], orbits: list[dict]) -> list[dict]:
    """Skull points paired with MediaPipe landmark ids. The mesh itself stays put."""
    right = np.array(orbits[0]["center"])
    left = np.array(orbits[1]["center"])

    def on_rim(center: np.ndarray, toward: float, radius: float) -> np.ndarray:
        # Searching the bone for the inner corner landed on the nasal bridge,
        # and the screen fit then scaled the whole skull up to reach the eye.
        direction = np.array([toward, -0.05, 0.22], dtype=np.float64)
        direction /= np.linalg.norm(direction)
        return np.asarray(center, dtype=np.float64) + direction * float(radius) * 0.82

    frontal = meshes["frontal"].vertices
    bridge = frontal[(np.abs(frontal[:, 0]) < 0.9) & (frontal[:, 1] > 1.2) & (frontal[:, 1] < 5.2)]
    nasion = bridge[int(np.argmax(bridge[:, 2]))] if len(bridge) else frontal[int(np.argmax(frontal[:, 2]))]
    zy = meshes["zygomatic"].vertices
    cheek_r = zy[int(np.argmin(zy[:, 0]))]
    cheek_l = zy[int(np.argmax(zy[:, 0]))]
    jaw = meshes["mandible"].vertices
    chin = jaw[int(np.argmin(jaw[:, 1] + np.abs(jaw[:, 0]) * 0.15))]
    right_jaw = jaw[jaw[:, 0] < np.quantile(jaw[:, 0], 0.18)]
    left_jaw = jaw[jaw[:, 0] > np.quantile(jaw[:, 0], 0.82)]
    gonion_r = right_jaw[int(np.argmin(right_jaw[:, 1]))]
    gonion_l = left_jaw[int(np.argmin(left_jaw[:, 1]))]
    pairs = [
        (468, right),
        (473, left),
        (33, on_rim(right, -1.0, float(orbits[0]["radius"]))),
        (133, on_rim(right, 1.0, float(orbits[0]["radius"]))),
        (263, on_rim(left, 1.0, float(orbits[1]["radius"]))),
        (362, on_rim(left, -1.0, float(orbits[1]["radius"]))),
        (168, nasion),
        (116, cheek_r),
        (345, cheek_l),
        (152, chin),
        (172, gonion_r),
        (397, gonion_l),
    ]
    return [{"id": index, "at": _pack(point)} for index, point in pairs]


CRANIUM_KEYS = [
    "frontal",
    "parietal_l",
    "parietal_r",
    "temporal_l",
    "temporal_r",
    "sphenoid",
    "occipital",
    "nasal_l",
    "nasal_r",
    "zygomatic_l",
    "zygomatic_r",
    "maxilla_l",
    "maxilla_r",
]
# Pitch is the triangle size. Quadric decimation is not used: it turns the
# smooth vault into huge triangles and the fresnel line breaks.
CRANIUM_PITCH_CM = 0.155
JAW_PITCH_CM = 0.125
# How far outside air may walk into openings. Deep enough for the eye sockets
# and the nasal aperture, short of the cranial cavity and the sinus labyrinth.
SOCKET_REACH_CM = 2.55


def _as_mesh(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    return trimesh.Trimesh(np.asarray(mesh.vertices), np.asarray(mesh.faces), process=False)


def _filled_points(mesh: trimesh.Trimesh, pitch: float) -> np.ndarray:
    """Voxel centres inside a closed bone. The source shells are watertight solids."""
    solid = _as_mesh(mesh)
    solid.merge_vertices()
    solid.update_faces(solid.unique_faces() & solid.nondegenerate_faces())
    solid.remove_unreferenced_vertices()
    solid.fix_normals()
    grid = solid.voxelized(pitch).fill()
    return np.asarray(grid.points, dtype=np.float64)


def _union_mask(meshes: list[trimesh.Trimesh], pitch: float) -> tuple[np.ndarray, np.ndarray]:
    clouds = [_filled_points(mesh, pitch) for mesh in meshes]
    cloud = np.concatenate(clouds)
    lo = cloud.min(axis=0) - pitch * 2
    hi = cloud.max(axis=0) + pitch * 2
    dims = np.ceil((hi - lo) / pitch).astype(int) + 1
    print(f"  voxel grid {tuple(int(v) for v in dims)} pitch {pitch}", flush=True)
    mask = np.zeros(tuple(int(v) for v in dims), dtype=bool)
    index = np.floor((cloud - lo) / pitch).astype(int)
    index = np.clip(index, 0, dims - 1)
    mask[index[:, 0], index[:, 1], index[:, 2]] = True
    # Close suture gaps, then fill air cells that do not open onto the outside.
    mask = ndimage.binary_closing(mask, iterations=1)
    mask = ndimage.binary_fill_holes(mask)
    return mask, lo


def _world_to_index(points: np.ndarray, lo: np.ndarray, pitch: float, dims: np.ndarray) -> np.ndarray:
    index = np.floor((points - lo) / pitch).astype(int)
    return np.clip(index, 0, dims - 1)


def _plug_sphere(mask: np.ndarray, lo: np.ndarray, pitch: float, center: np.ndarray, radius: float) -> None:
    dims = np.array(mask.shape)
    lo_i = _world_to_index(np.array([center - radius]), lo, pitch, dims)[0]
    hi_i = _world_to_index(np.array([center + radius]), lo, pitch, dims)[0]
    xs = range(int(lo_i[0]), int(hi_i[0]) + 1)
    ys = range(int(lo_i[1]), int(hi_i[1]) + 1)
    zs = range(int(lo_i[2]), int(hi_i[2]) + 1)
    for x in xs:
        for y in ys:
            for z in zs:
                point = lo + np.array([x + 0.5, y + 0.5, z + 0.5]) * pitch
                if np.linalg.norm(point - center) <= radius:
                    mask[x, y, z] = True


def _enclosed_hole(slice_mask: np.ndarray, window: np.ndarray) -> np.ndarray | None:
    """Largest air hole that does not touch the border of a 2D window. Returns [x, z] indices."""
    x0, x1, z0, z1 = [int(v) for v in window]
    x0, z0 = max(x0, 0), max(z0, 0)
    x1, z1 = min(x1, slice_mask.shape[0] - 1), min(z1, slice_mask.shape[1] - 1)
    if x1 - x0 < 6 or z1 - z0 < 6:
        return None
    crop = slice_mask[x0 : x1 + 1, z0 : z1 + 1]
    air = ~crop
    labeled, count = ndimage.label(air)
    if count == 0:
        return None
    best = None
    best_area = 0
    for label in range(1, count + 1):
        component = labeled == label
        if component[0, :].any() or component[-1, :].any() or component[:, 0].any() or component[:, -1].any():
            continue
        area = int(component.sum())
        if area > best_area:
            best_area = area
            points = np.argwhere(component)
            best = points.mean(axis=0) + np.array([x0, z0])
    if best is None or best_area < 25:
        return None
    return best


def _plug_cranial_tunnels(mask: np.ndarray, lo: np.ndarray, pitch: float, aligned: dict[str, trimesh.Trimesh]) -> None:
    """Cap the foramen magnum and ear canals so the cranial cavity stays inside."""
    dims = np.array(mask.shape)

    def window_for(bone: trimesh.Trimesh, shrink: float = 0.08) -> tuple[int, int, int, int]:
        lo_b, hi_b = bone.bounds
        span = hi_b - lo_b
        lo_b = lo_b + span * shrink
        hi_b = hi_b - span * shrink
        lo_i = _world_to_index(lo_b.reshape(1, 3), lo, pitch, dims)[0]
        hi_i = _world_to_index(hi_b.reshape(1, 3), lo, pitch, dims)[0]
        return int(lo_i[0]), int(hi_i[0]), int(lo_i[2]), int(hi_i[2])

    def y_range(bone: trimesh.Trimesh, start: float, end: float) -> range:
        lo_b, hi_b = bone.bounds[:, 1]
        y0 = lo_b + (hi_b - lo_b) * start
        y1 = lo_b + (hi_b - lo_b) * end
        i0 = int(_world_to_index(np.array([[0.0, y0, 0.0]]), lo, pitch, dims)[0, 1])
        i1 = int(_world_to_index(np.array([[0.0, y1, 0.0]]), lo, pitch, dims)[0, 1])
        return range(max(0, i0), min(mask.shape[1] - 1, i1) + 1)

    occipital = aligned["occipital"]
    holes = []
    for y in y_range(occipital, 0.05, 0.48):
        found = _enclosed_hole(mask[:, y, :], np.array(window_for(occipital, 0.02)))
        if found is not None:
            holes.append((y, found))
    if holes:
        # The foramen is the lowest large hole. A higher hole is the cranial cavity seen in cross-section.
        y, found = holes[0]
        center = lo + np.array([found[0] + 0.5, y + 0.5, found[1] + 0.5]) * pitch
        print("  plug foramen", np.round(center, 2), flush=True)
        _plug_sphere(mask, lo, pitch, center, 1.2)

    for name in ("temporal_l", "temporal_r"):
        bone = aligned[name]
        found_canal = None
        for y in y_range(bone, 0.38, 0.72):
            found = _enclosed_hole(mask[:, y, :], np.array(window_for(bone, 0.05)))
            if found is not None:
                found_canal = (y, found)
                break
        if found_canal is None:
            continue
        y, found = found_canal
        center = lo + np.array([found[0] + 0.5, y + 0.5, found[1] + 0.5]) * pitch
        print(f"  plug {name}", np.round(center, 2), flush=True)
        _plug_sphere(mask, lo, pitch, center, 0.6)


def _outer_volume(mask: np.ndarray, lo: np.ndarray, pitch: float) -> np.ndarray:
    """Bone plus the cranial cavity. The surface is the outside of that volume."""
    air = ~mask
    reached = np.zeros(mask.shape, dtype=bool)
    reached[0, :, :] = air[0, :, :]
    reached[-1, :, :] = air[-1, :, :]
    reached[:, 0, :] = air[:, 0, :]
    reached[:, -1, :] = air[:, -1, :]
    reached[:, :, 0] = air[:, :, 0]
    reached[:, :, -1] = air[:, :, -1]
    structure = ndimage.generate_binary_structure(3, 1)
    limit = int(sum(mask.shape))
    for _ in range(limit):
        grown = ndimage.binary_dilation(reached, structure=structure)
        grown &= air
        if np.array_equal(grown, reached):
            break
        reached = grown
    return ~reached


def _mesh_from_mask(mask: np.ndarray, lo: np.ndarray, pitch: float) -> trimesh.Trimesh:
    padded = np.pad(mask, 1)
    mesh = trimesh.voxel.ops.matrix_to_marching_cubes(padded, pitch=pitch)
    mesh.apply_translation(lo - pitch)
    mesh.merge_vertices()
    mesh.update_faces(mesh.unique_faces() & mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    pieces = mesh.split(only_watertight=False)
    mesh = max(pieces, key=lambda item: len(item.faces))
    mesh.fix_normals()
    return mesh


def _smooth_shell(mesh: trimesh.Trimesh, iterations: int = 4) -> trimesh.Trimesh:
    # Taubin takes the small steps off the rims without shrinking the orbits.
    trimesh.smoothing.filter_taubin(mesh, lamb=0.33, nu=0.34, iterations=iterations)
    mesh.merge_vertices()
    mesh.update_faces(mesh.unique_faces() & mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    mesh.fix_normals()
    if not mesh.is_watertight:
        trimesh.repair.fill_holes(mesh)
        mesh.fix_normals()
    # Average normals in place so the fresnel line is one curve, not a facet.
    normals = np.array(mesh.vertex_normals, copy=True)
    neighbors = mesh.vertex_neighbors
    for _ in range(4):
        averaged = np.zeros_like(normals)
        for index, ring in enumerate(neighbors):
            if not ring:
                averaged[index] = normals[index]
                continue
            averaged[index] = normals[index] * 2.0 + normals[ring].sum(axis=0)
        length = np.linalg.norm(averaged, axis=1, keepdims=True)
        normals = averaged / np.maximum(length, 1e-8)
    mesh.vertex_normals = normals
    return mesh


def shell_quality(name: str, mesh: trimesh.Trimesh) -> None:
    _edges, counts = np.unique(mesh.edges_sorted, axis=0, return_counts=True)
    areas = np.asarray(mesh.area_faces)
    lengths = np.asarray(mesh.edges_unique_length)
    mean = float(areas.mean()) if len(areas) else 1.0
    print(
        f"  {name} faces {len(mesh.faces)} watertight {mesh.is_watertight} "
        f"boundary {int((counts == 1).sum())} nonmanifold {int((counts > 2).sum())} "
        f"area-cv {areas.std() / mean:.2f} max-edge {lengths.max():.3f} "
        f"p95-edge {np.quantile(lengths, 0.95):.3f} area {mesh.area:.1f}",
        flush=True,
    )


def union_shell(
    parts: list[trimesh.Trimesh], pitch: float, aligned: dict[str, trimesh.Trimesh] | None = None
) -> trimesh.Trimesh:
    mask, lo = _union_mask(parts, pitch)
    if aligned is not None:
        _plug_cranial_tunnels(mask, lo, pitch, aligned)
    volume = _outer_volume(mask, lo, pitch)
    mesh = _mesh_from_mask(volume, lo, pitch)
    shell_quality("before-smooth", mesh)
    return _smooth_shell(mesh)


def _march_distance(origins: np.ndarray, directions: np.ndarray, mask: np.ndarray, lo: np.ndarray, pitch: float) -> np.ndarray:
    """Distance along each ray until bone. Negative means the ray left the grid."""
    pos = origins.copy()
    hit = np.full(len(origins), np.inf)
    alive = np.ones(len(origins), dtype=bool)
    step = pitch * 0.7
    dims = np.array(mask.shape)
    for index in range(90):
        if not alive.any():
            break
        pos[alive] += directions[alive] * step
        idx = np.floor((pos - lo) / pitch).astype(int)
        inside = alive & np.all((idx >= 0) & (idx < dims), axis=1)
        hit[alive & ~inside] = -1.0
        alive &= inside
        if not alive.any():
            break
        solid = mask[idx[alive, 0], idx[alive, 1], idx[alive, 2]]
        struck = np.zeros(len(origins), dtype=bool)
        struck[np.flatnonzero(alive)[solid]] = True
        hit[struck] = (index + 1) * step
        alive[struck] = False
    return hit


def _fill_short_boundaries(mesh: trimesh.Trimesh, max_edges: int = 18) -> trimesh.Trimesh:
    """Close suture cracks. Orbital and nasal loops are much longer and stay open."""
    edges = mesh.edges_sorted
    uniq, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = uniq[counts == 1]
    if len(boundary) == 0:
        return mesh
    neighbors: dict[int, list[int]] = {}
    for a, b in boundary:
        neighbors.setdefault(int(a), []).append(int(b))
        neighbors.setdefault(int(b), []).append(int(a))
    seen: set[int] = set()
    fans: list[list[int]] = []
    for start in list(neighbors):
        if start in seen:
            continue
        loop = [start]
        seen.add(start)
        prev = -1
        current = start
        for _ in range(len(neighbors) + 2):
            nxts = [n for n in neighbors[current] if n != prev]
            if not nxts:
                break
            nxt = nxts[0]
            if nxt == start:
                break
            if nxt in seen:
                break
            loop.append(nxt)
            seen.add(nxt)
            prev, current = current, nxt
        if 3 <= len(loop) <= max_edges and neighbors[loop[-1]].count(start):
            fans.append(loop)
    if not fans:
        return mesh
    faces = [mesh.faces]
    for loop in fans:
        anchor = loop[0]
        faces.append([[anchor, loop[i], loop[i + 1]] for i in range(1, len(loop) - 1)])
    mesh = trimesh.Trimesh(mesh.vertices.copy(), np.vstack(faces), process=False)
    mesh.remove_unreferenced_vertices()
    mesh.fix_normals()
    return mesh


def _exterior_bone(parts: list[trimesh.Trimesh], occupancy_pitch: float) -> trimesh.Trimesh:
    """One layer of the original bone triangles: the faces that look out of the skull."""
    mesh = _as_mesh(trimesh.util.concatenate([_as_mesh(part) for part in parts]))
    mesh.merge_vertices()
    mesh.update_faces(mesh.unique_faces() & mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    # Each bone already points outward. Fixing normals on the combined mesh
    # flips some of those solids and the vault then gets discarded.
    mask, lo = _union_mask(parts, occupancy_pitch)
    centroids = mesh.triangles_center
    normals = np.array(mesh.face_normals, copy=True)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-8)
    # Start outside the bone thickness. A ray that leaves the grid is the outer
    # surface. A short hit is another bone in front (a buried face). A medium hit
    # on the face is the far wall of an eye socket or the nasal opening.
    origins = centroids + normals * 0.85
    distance = _march_distance(origins, normals, mask, lo, occupancy_pitch)
    socket = (distance > 0.4) & (distance < 4.6) & (centroids[:, 2] > -0.4)
    keep = (distance < 0) | socket
    print(f"  exterior faces {int(keep.sum())} of {len(keep)}", flush=True)
    mesh.update_faces(keep)
    mesh.remove_unreferenced_vertices()
    shell_quality("kept", mesh)
    # Weld suture vertices that sit within about 1.5mm of each other.
    mesh.vertices = np.round(mesh.vertices / 0.15) * 0.15
    mesh.merge_vertices()
    mesh.update_faces(mesh.unique_faces() & mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    mesh = _fill_short_boundaries(mesh, max_edges=28)
    mesh.fix_normals()
    return _smooth_shell(mesh, iterations=3)


def _axis_shell(mask: np.ndarray) -> np.ndarray:
    """The first and last solid voxel along x, y, and z. Seams and the inner table drop out."""
    shell = np.zeros(mask.shape, dtype=bool)
    for axis in range(3):
        any_solid = mask.any(axis=axis)
        first = np.argmax(mask, axis=axis)
        last = mask.shape[axis] - 1 - np.argmax(np.flip(mask, axis=axis), axis=axis)
        indexer = [np.arange(mask.shape[i]) for i in range(3) if i != axis]
        grids = np.meshgrid(*indexer, indexing="ij")
        base = [None, None, None]
        slot = 0
        for dim in range(3):
            if dim == axis:
                continue
            base[dim] = grids[slot]
            slot += 1
        for which in (first, last):
            coords = base.copy()
            coords[axis] = which
            chosen = tuple(coords)
            shell[chosen] |= any_solid
    return shell


def _close_gaps(mask: np.ndarray, pitch: float, radius_cm: float) -> np.ndarray:
    """Weld suture gaps and ear canals. Orbits, the nose, and the foramen stay open."""
    radius = max(1, int(round(radius_cm / pitch)))
    struct = ndimage.iterate_structure(ndimage.generate_binary_structure(3, 1), radius)
    closed = ndimage.binary_closing(mask, structure=struct)
    return ndimage.binary_fill_holes(closed)


def _seal_cranial_cavity(mask: np.ndarray, lo: np.ndarray, pitch: float) -> tuple[np.ndarray, np.ndarray]:
    """Fill the braincase so the surface is the outside of the skull.

    A watershed on the air-distance field meets at the foramen magnum, which is
    the narrow neck between the cavity and the outside. Eye sockets and the
    nasal aperture stay open because they are wide and face the outside.
    """
    from skimage.segmentation import watershed

    pad = int(np.ceil(3.4 / pitch))
    mask = np.pad(mask, pad, constant_values=False)
    lo = lo - pad * pitch
    dist = ndimage.distance_transform_edt(~mask) * pitch
    border = np.zeros(mask.shape, dtype=bool)
    border[0] = border[-1] = True
    border[:, 0] = border[:, -1] = True
    border[:, :, 0] = border[:, :, -1] = True
    sealed_core = None
    for threshold in (2.4, 2.1, 1.85, 1.6, 1.35):
        core = dist >= threshold
        labeled, count = ndimage.label(core)
        if count == 0:
            continue
        outside_ids = set(np.unique(labeled[border]).tolist()) - {0}
        best_lab = 0
        best_cm3 = 0.0
        for lab in range(1, count + 1):
            if lab in outside_ids:
                continue
            cm3 = float((labeled == lab).sum()) * pitch**3
            if cm3 > best_cm3:
                best_lab = lab
                best_cm3 = cm3
        outside_voxels = int(np.isin(labeled, list(outside_ids)).sum()) if outside_ids else 0
        print(
            f"  cavity T={threshold:.2f} internal {best_cm3:.0f} cm3 outside-core {outside_voxels}",
            flush=True,
        )
        if best_cm3 > 200 and outside_voxels > 1000:
            markers = np.zeros(mask.shape, dtype=np.int32)
            markers[np.isin(labeled, list(outside_ids))] = 1
            markers[labeled == best_lab] = 2
            elevation = -dist.astype(np.float64)
            elevation[mask] = 1.0e3
            labels = watershed(elevation, markers, mask=~mask)
            cavity = labels == 2
            print(f"  cavity kept {float(cavity.sum()) * pitch**3:.0f} cm3", flush=True)
            sealed_core = mask | cavity
            break
    if sealed_core is None:
        print("  cranial cavity was not sealed", flush=True)
        sealed_core = mask
    sealed_core = ndimage.binary_fill_holes(sealed_core)
    return sealed_core, lo


def _sdf_mesh(mask: np.ndarray, lo: np.ndarray, pitch: float, sigma: float) -> trimesh.Trimesh:
    """Marching cubes on a blurred signed distance, so the fresnel line is one curve."""
    from skimage.measure import marching_cubes

    pad = 3
    padded = np.pad(mask, pad, constant_values=False)
    origin = lo - pad * pitch
    outside = ndimage.distance_transform_edt(~padded)
    inside = ndimage.distance_transform_edt(padded)
    field = ndimage.gaussian_filter((outside - inside).astype(np.float32), sigma=sigma)
    verts, faces, normals, _values = marching_cubes(field, level=0.0, spacing=(pitch, pitch, pitch))
    mesh = trimesh.Trimesh(vertices=verts + origin, faces=faces, vertex_normals=normals, process=False)
    mesh.merge_vertices()
    mesh.update_faces(mesh.unique_faces() & mesh.nondegenerate_faces())
    mesh.remove_unreferenced_vertices()
    pieces = mesh.split(only_watertight=False)
    mesh = max(pieces, key=lambda item: len(item.faces))
    mesh.fix_normals()
    # The distance field is already smooth. A short normal average keeps the
    # silhouette one line where two triangles share a shallow angle.
    normals = np.array(mesh.vertex_normals, copy=True)
    neighbors = mesh.vertex_neighbors
    for _ in range(3):
        averaged = np.zeros_like(normals)
        for index, ring in enumerate(neighbors):
            if not ring:
                averaged[index] = normals[index]
                continue
            averaged[index] = normals[index] * 2.0 + normals[ring].sum(axis=0)
        length = np.linalg.norm(averaged, axis=1, keepdims=True)
        normals = averaged / np.maximum(length, 1e-8)
    mesh.vertex_normals = normals
    return mesh


def _spatial_smooth(mesh: trimesh.Trimesh, radius: float, iterations: int, blend: float) -> None:
    """Average vertices inside a small radius so voxel steps stop catching the fresnel."""
    vertices = np.asarray(mesh.vertices).copy()
    for _ in range(iterations):
        tree = cKDTree(vertices)
        groups = tree.query_ball_point(vertices, r=radius)
        averaged = np.empty_like(vertices)
        for index, group in enumerate(groups):
            averaged[index] = vertices[group].mean(axis=0)
        vertices = vertices * (1.0 - blend) + averaged * blend
    mesh.vertices = vertices


def _smooth_normals(mesh: trimesh.Trimesh, radius: float) -> None:
    mesh.fix_normals()
    normals = np.array(mesh.vertex_normals, copy=True)
    tree = cKDTree(np.asarray(mesh.vertices))
    groups = tree.query_ball_point(mesh.vertices, r=radius)
    smoothed = np.empty_like(normals)
    for index, group in enumerate(groups):
        normal = normals[group].mean(axis=0)
        smoothed[index] = normal / max(float(np.linalg.norm(normal)), 1e-8)
    mesh.vertex_normals = smoothed


def _visible_cranium(parts: list[trimesh.Trimesh], pitch: float) -> trimesh.Trimesh:
    mask, lo = _union_mask(parts, pitch)
    mask = _close_gaps(mask, pitch, 0.38)
    mask, lo = _seal_cranial_cavity(mask, lo, pitch)
    mesh = _sdf_mesh(mask, lo, pitch, sigma=1.15)
    _spatial_smooth(mesh, radius=0.42, iterations=4, blend=0.55)
    _smooth_normals(mesh, radius=0.5)
    return mesh


def _jaw_shell(mandible: trimesh.Trimesh) -> trimesh.Trimesh:
    """The real mandible, subdivided once. A voxel jaw reads as stacked blocks."""
    jaw = _as_mesh(mandible)
    jaw.merge_vertices()
    jaw.update_faces(jaw.unique_faces() & jaw.nondegenerate_faces())
    jaw.remove_unreferenced_vertices()
    jaw.fix_normals()
    jaw = subdivide(jaw)
    _smooth_normals(jaw, radius=0.22)
    return jaw


def build_skull_shells(
    aligned: dict[str, trimesh.Trimesh],
) -> tuple[trimesh.Trimesh, trimesh.Trimesh]:
    print("outer cranium", flush=True)
    cranium = _visible_cranium([aligned[name] for name in CRANIUM_KEYS], 0.18)
    shell_quality("cranium", cranium)
    print("jaw from the mandible", flush=True)
    jaw = _jaw_shell(aligned["mandible"])
    shell_quality("jaw", jaw)
    return cranium, jaw


# BodyParts3D 3.0 expression muscles. Ids are the FMA rows in parts_list_e.txt
# (release 20110915). "jaw" says how the muscle answers jawOpen:
# stretch keeps the cranial origin still, follow rides the mandible, light
# is a smaller share of that ride, none stays on the cranium.
# quiz is the label this mesh owns. Empty means it is drawn but does not host a quiz marker.
EXPRESSION_MUSCLES = [
    ("FMA46759", "right frontalis", "frontalis", "none"),
    ("FMA46760", "left frontalis", "frontalis", "none"),
    ("FMA46782", "orbital part of right orbicularis oculi", "orbicularis", "none"),
    ("FMA46783", "orbital part of left orbicularis oculi", "orbicularis", "none"),
    ("FMA46785", "palpebral part of right orbicularis oculi", "orbicularis", "none"),
    ("FMA46786", "palpebral part of left orbicularis oculi", "orbicularis", "none"),
    ("FMA46841", "orbicularis oris", "oris", "light"),
    ("FMA46812", "right zygomaticus major", "zygomaticus", "none"),
    ("FMA46813", "left zygomaticus major", "zygomaticus", "none"),
    ("FMA46814", "right zygomaticus minor", "", "none"),
    ("FMA46815", "left zygomaticus minor", "", "none"),
    ("FMA46806", "right levator labii superioris", "", "none"),
    ("FMA46807", "left levator labii superioris", "", "none"),
    ("FMA46803", "right levator labii superioris alaeque nasi", "", "none"),
    ("FMA46804", "left levator labii superioris alaeque nasi", "", "none"),
    ("FMA46839", "right risorius", "", "light"),
    ("FMA46840", "left risorius", "", "light"),
    ("FMA46826", "right mentalis", "", "follow"),
    ("FMA46827", "left mentalis", "", "follow"),
    ("FMA46829", "right depressor anguli oris", "", "follow"),
    ("FMA46830", "left depressor anguli oris", "", "follow"),
    ("FMA46835", "right buccinator", "", "stretch"),
    ("FMA46836", "left buccinator", "", "stretch"),
    ("FMA55606", "right nasalis", "", "none"),
    ("FMA55607", "left nasalis", "", "none"),
    ("FMA55610", "right procerus", "corrugator", "none"),
    ("FMA55611", "left procerus", "corrugator", "none"),
    ("FMA49001", "superficial part of right masseter", "masseter", "stretch"),
    ("FMA49002", "superficial part of left masseter", "masseter", "stretch"),
    ("FMA49004", "deep part of right masseter", "masseter", "stretch"),
    ("FMA49005", "deep part of left masseter", "masseter", "stretch"),
    ("FMA49007", "right temporalis", "temporalis", "stretch"),
    ("FMA49008", "left temporalis", "temporalis", "stretch"),
]
# 3.0 bone, 4.0 bone. The pair estimates the similarity between the two releases.
ALIGNMENT_BONES = [
    ("FMA52734", "FJ3200", "frontal"),
    ("FMA52748", "FJ3289", "mandible"),
    ("FMA52893", "FJ3287", "left zygomatic"),
    ("FMA52892", "FJ3392", "right zygomatic"),
]
EYE_IDS = ("FJ1289", "FJ1340", "FJ1317", "FJ1368")  # cornea L/R, sclera L/R
ISA_ZIP = Path("/tmp/bp3d/isa_BP3D_4.0_obj_99.zip")
V3_ZIP = Path("/tmp/bp3d/bp3d30.zip")
# Matches the jaw's full open in AnatomyScene (jawOpen of 1 rotates 0.42 rad).
JAW_OPEN = 0.42


def _isa_mesh(fj: str) -> trimesh.Trimesh:
    cache = Path("/tmp/bp3d/muscles40") / f"{fj}.obj"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(ISA_ZIP) as bundle:
            cache.write_bytes(bundle.read(f"isa_BP3D_4.0_obj_99/{fj}.obj"))
    return load_mesh(cache)


def _posed(fj: str, scale: float, rot: np.ndarray, trans: np.ndarray) -> trimesh.Trimesh:
    return apply_similarity(_isa_mesh(fj), scale, rot, trans)


def _v3_mesh(fma: str) -> trimesh.Trimesh:
    cache = Path("/tmp/bp3d/muscles30") / f"{fma}.obj"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(V3_ZIP) as bundle:
            member = next(
                name for name in bundle.namelist() if name.replace("\\", "/").endswith(f"/{fma}.obj")
            )
            cache.write_bytes(bundle.read(member))
    return load_mesh(cache)


def _compose(
    s1: float, r1: np.ndarray, t1: np.ndarray, s0: float, r0: np.ndarray, t0: np.ndarray
) -> tuple[float, np.ndarray, np.ndarray]:
    """Apply (s0, r0, t0) first, then (s1, r1, t1). Matches apply_similarity."""
    scale = s1 * s0
    rot = r1 @ r0
    trans = s1 * (t0 @ r1.T) + t1
    return scale, rot, trans


def similarity_icp(
    src: np.ndarray, dst: np.ndarray, iterations: int = 20
) -> tuple[float, np.ndarray, np.ndarray, np.ndarray]:
    """Similarity ICP. Correspondences are nearest neighbours; each step is Umeyama."""
    tree = cKDTree(dst)
    scale = 1.0
    rot = np.eye(3)
    trans = np.zeros(3)
    thresh = 15.0
    current = src
    for step in range(iterations):
        dist, index = tree.query(current)
        keep = dist < thresh
        if int(keep.sum()) < 80:
            thresh *= 1.4
            continue
        step_scale, step_rot, step_trans = umeyama(current[keep], dst[index[keep]])
        scale, rot, trans = _compose(step_scale, step_rot, step_trans, scale, rot, trans)
        current = apply_similarity_points(src, scale, rot, trans)
        kept = dist[keep]
        median = float(np.median(kept))
        thresh = float(np.clip(median * 6.0, 2.0, 20.0))
        print(
            f"  icp {step:02d} scale {scale:.4f} median {median:.3f} mm keep {int(keep.sum())}/{len(src)}",
            flush=True,
        )
    dist, _index = tree.query(current)
    return scale, rot, trans, dist


def _sample_bone(mesh: trimesh.Trimesh, count: int = 2500) -> np.ndarray:
    points, _faces = trimesh.sample.sample_surface(mesh, count, seed=4)
    return np.asarray(points, dtype=np.float64)


def register_releases() -> tuple[float, np.ndarray, np.ndarray]:
    """Similarity that takes a 3.0 vertex, in millimetres, onto the 4.0 bones."""
    sources = []
    targets = []
    for fma, fj, label in ALIGNMENT_BONES:
        try:
            src = _sample_bone(_v3_mesh(fma))
            dst = _sample_bone(_isa_mesh(fj))
        except (StopIteration, KeyError, FileNotFoundError) as error:
            print(f"  skip {label}: {error}", flush=True)
            continue
        before, _index = cKDTree(dst).query(src)
        print(
            f"  bone {label} before median {np.median(before):.2f} mm p95 {np.quantile(before, 0.95):.2f}",
            flush=True,
        )
        sources.append(src)
        targets.append(dst)
    if len(sources) < 3:
        raise RuntimeError("need at least three bone pairs to register 3.0 onto 4.0")
    src = np.concatenate(sources)
    dst = np.concatenate(targets)
    before, _index = cKDTree(dst).query(src)
    print(
        f"  before median {np.median(before):.3f} mm p95 {np.quantile(before, 0.95):.3f}",
        flush=True,
    )
    scale, rot, trans, after = similarity_icp(src, dst)
    print(
        f"  after scale {scale:.4f} median {np.median(after):.3f} mm p95 {np.quantile(after, 0.95):.3f}",
        flush=True,
    )
    print(f"  rotation\n{np.array2string(rot, precision=4)}", flush=True)
    print(f"  translation {np.round(trans, 3)} mm", flush=True)
    return scale, rot, trans


def _jaw_weights(points: np.ndarray, kind: str, jaw_tree: cKDTree, skull_tree: cKDTree) -> np.ndarray:
    if kind == "none":
        return np.zeros(len(points))
    jaw_dist, _index = jaw_tree.query(points)
    skull_dist, _index = skull_tree.query(points)
    on_jaw = skull_dist / np.maximum(skull_dist + jaw_dist, 1e-6)
    if kind == "follow":
        return np.clip(on_jaw * 0.25 + 0.75, 0.0, 1.0)
    if kind == "light":
        return np.clip(on_jaw * 0.55, 0.0, 1.0)
    # stretch: origin stays, the mandibular end travels with the hinge
    return np.clip((on_jaw - 0.2) / 0.6, 0.0, 1.0)


def _open_move(points: np.ndarray, pivot: np.ndarray, weights: np.ndarray) -> np.ndarray:
    angle = JAW_OPEN
    cosine, sine = float(np.cos(angle)), float(np.sin(angle))
    relative = points - pivot
    opened = np.column_stack(
        [
            relative[:, 0],
            relative[:, 1] * cosine - relative[:, 2] * sine,
            relative[:, 1] * sine + relative[:, 2] * cosine,
        ]
    )
    return (opened - relative) * weights[:, None]


def _topology_normals(mesh: trimesh.Trimesh) -> None:
    normals = np.array(mesh.vertex_normals, copy=True)
    neighbors = mesh.vertex_neighbors
    for _ in range(2):
        averaged = np.zeros_like(normals)
        for index, ring in enumerate(neighbors):
            averaged[index] = normals[index] if not ring else normals[index] + normals[ring].sum(axis=0)
        length = np.linalg.norm(averaged, axis=1, keepdims=True)
        normals = averaged / np.maximum(length, 1e-8)
    mesh.vertex_normals = normals


def _on_surface(mesh: trimesh.Trimesh) -> list[float]:
    center = mesh.vertices.mean(0)
    point = mesh.vertices[int(np.argmin(np.linalg.norm(mesh.vertices - center, axis=1)))]
    return [round(float(v), 4) for v in point]


def build_expression_muscles(
    skull_pose: tuple[float, np.ndarray, np.ndarray],
    jaw_pivot_cm: np.ndarray,
    mandible: trimesh.Trimesh,
    cranium_parts: list[trimesh.Trimesh],
) -> tuple[trimesh.Trimesh, list[dict], dict[str, list[list[float]]]]:
    """3.0 expression muscles, in the app's centimetre frame, with jaw travel stored per vertex."""
    reg_scale, reg_rot, reg_trans = register_releases()
    scale, rot, trans = _compose(*skull_pose, reg_scale, reg_rot, reg_trans)
    jaw_tree = cKDTree(mandible.vertices[:: max(1, len(mandible.vertices) // 8000)])
    skull_cloud = np.concatenate([part.vertices[:: max(1, len(part.vertices) // 6000)] for part in cranium_parts])
    skull_tree = cKDTree(skull_cloud)

    raw = []
    for fma, name, quiz, kind in EXPRESSION_MUSCLES:
        mesh = apply_similarity(_v3_mesh(fma), scale, rot, trans)
        raw.append((fma, name, quiz, kind, mesh))
        print(f"  muscle {fma} {name} faces {len(mesh.faces)}", flush=True)
    areas = np.array([max(mesh.area, 1e-4) for *_rest, mesh in raw])
    budgets = np.maximum(180, np.round(36000 * areas / areas.sum()).astype(int))
    if int(budgets.sum()) > 36000:
        budgets = np.maximum(180, np.round(budgets * 36000 / budgets.sum()).astype(int))

    pieces = []
    moves = []
    identified = []
    anchors: dict[str, list[list[float]]] = {name: [] for name in MUSCLE_NAMES}
    for (fma, name, quiz, kind, mesh), budget in zip(raw, budgets):
        if len(mesh.faces) > int(budget):
            mesh = decimate(mesh, int(budget))
        else:
            mesh.fix_normals()
        weights = _jaw_weights(np.asarray(mesh.vertices), kind, jaw_tree, skull_tree)
        move = _open_move(np.asarray(mesh.vertices), jaw_pivot_cm, weights)
        pieces.append(mesh)
        moves.append(move)
        identified.append({"id": fma, "name": name, "at": _on_surface(mesh)})
        if quiz:
            anchors[quiz].append(_on_surface(mesh))
        print(f"    kept {len(mesh.faces)} jaw {kind} weight {float(weights.mean()):.2f}", flush=True)

    offset = 0
    faces = []
    for mesh in pieces:
        faces.append(np.asarray(mesh.faces) + offset)
        offset += len(mesh.vertices)
    merged = trimesh.Trimesh(
        vertices=np.concatenate([mesh.vertices for mesh in pieces]),
        faces=np.concatenate(faces),
        process=False,
    )
    merged.metadata = {"move": np.concatenate(moves).astype(np.float32)}
    _topology_normals(merged)
    shell_quality("muscles", merged)
    return merged, identified, anchors


def build_eyes(scale: float, rot: np.ndarray, trans: np.ndarray) -> trimesh.Trimesh:
    eyes = trimesh.util.concatenate([_posed(fj, scale, rot, trans) for fj in EYE_IDS])
    eyes.merge_vertices()
    print(f"  eyes raw {len(eyes.faces)}", flush=True)
    if len(eyes.faces) > 8000:
        eyes = decimate(eyes, 6000)
    eyes.fix_normals()
    shell_quality("eyes", eyes)
    return eyes


def build_skin(
    scale: float, rot: np.ndarray, trans: np.ndarray, skull: trimesh.Trimesh
) -> tuple[trimesh.Trimesh, float, float]:
    """Head crop of the 4.0 skin. Body triangles are dropped, then long edges
    are split so the veil and the fresnel outline stay continuous."""
    skin = _posed("FJ2810", scale, rot, trans)
    lo = skull.bounds[0] - np.array([1.8, 5.5, 2.0])
    hi = skull.bounds[1] + np.array([1.8, 1.4, 2.4])
    center = skin.triangles_center
    skin.update_faces(np.all((center >= lo) & (center <= hi), axis=1))
    skin.remove_unreferenced_vertices()
    faces = np.asarray(skin.faces)

    def edge_length(a: np.ndarray, c: np.ndarray) -> np.ndarray:
        return np.linalg.norm(skin.vertices[a] - skin.vertices[c], axis=1)

    short = (
        (edge_length(faces[:, 0], faces[:, 1]) <= 3.2)
        & (edge_length(faces[:, 1], faces[:, 2]) <= 3.2)
        & (edge_length(faces[:, 2], faces[:, 0]) <= 3.2)
    )
    skin.update_faces(short)
    skin.remove_unreferenced_vertices()
    verts, faces = trimesh.remesh.subdivide_to_size(
        skin.vertices, skin.faces, max_edge=1.15, max_iter=6
    )
    skin = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
    skin.merge_vertices()
    skin.update_faces(skin.unique_faces() & skin.nondegenerate_faces())
    skin.remove_unreferenced_vertices()
    pieces = skin.split(only_watertight=False)
    skin = max(pieces, key=lambda item: len(item.faces))
    if len(skin.faces) < 500:
        raise RuntimeError("head crop removed the skin")
    # The body skin is a thin double wall. The inner wall turns the fresnel into a web.
    center = np.median(skin.vertices, axis=0)
    outward = np.einsum("ij,ij->i", skin.triangles_center - center, skin.face_normals) > 0.05
    skin.update_faces(outward)
    skin.remove_unreferenced_vertices()
    _spatial_smooth(skin, 0.45, 4, 0.6)
    _smooth_normals(skin, 0.7)
    shell_quality("skin", skin)
    ys = skin.vertices[:, 1]
    # Fade only the cut neck. The chin stays bright.
    low = float(ys.min())
    return skin, low + 0.4, low + 3.2


def _expression_anchors(labeled: dict[str, trimesh.Trimesh], orbits: list[dict]) -> dict[str, list[list[float]]]:
    """Label points on the skull for the quiz. These muscles are not in the 4.0 element set."""
    frontal = labeled["frontal"].vertices
    upper = frontal[frontal[:, 1] > np.quantile(frontal[:, 1], 0.62)]
    frontalis = upper[int(np.argmax(upper[:, 2]))] if len(upper) else frontal.mean(0)
    nasion_band = frontal[(np.abs(frontal[:, 0]) < 1.1) & (frontal[:, 1] > 1.0) & (frontal[:, 1] < 4.5)]
    nasion = nasion_band[int(np.argmax(nasion_band[:, 2]))] if len(nasion_band) else frontal.mean(0)
    right = np.array(orbits[0]["center"], dtype=np.float64)
    left = np.array(orbits[1]["center"], dtype=np.float64)
    mx = labeled["maxilla"].vertices
    mouth = mx[(np.abs(mx[:, 0]) < 1.4) & (mx[:, 1] < np.quantile(mx[:, 1], 0.35))]
    oris = mouth[int(np.argmax(mouth[:, 2]))] if len(mouth) else mx.mean(0)
    zy = labeled["zygomatic"].vertices
    md = labeled["mandible"].vertices
    lateral = md[np.abs(md[:, 0]) > np.quantile(np.abs(md[:, 0]), 0.72)]
    masseter = lateral.mean(0) if len(lateral) else md.mean(0)
    tv = labeled["temporal"].vertices
    high = tv[tv[:, 1] > np.quantile(tv[:, 1], 0.7)]
    temporalis = high.mean(0) if len(high) else tv.mean(0)

    def pack(point: np.ndarray) -> list[float]:
        return [round(float(v), 4) for v in point]

    return {
        "frontalis": [pack(frontalis)],
        "corrugator": [pack(nasion + np.array([0.7, 0.35, 0.1])), pack(nasion + np.array([-0.7, 0.35, 0.1]))],
        "orbicularis": [pack(right), pack(left)],
        "oris": [pack(oris)],
        "zygomaticus": [pack(zy[zy[:, 0] >= 0].mean(0)), pack(zy[zy[:, 0] < 0].mean(0))],
        "masseter": [pack(masseter)],
        "temporalis": [pack(temporalis)],
    }


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
    labeled = {
        "frontal": aligned["frontal"],
        "parietal": combine(aligned, ["parietal_l", "parietal_r"]),
        "temporal": combine(aligned, ["temporal_l", "temporal_r", "sphenoid"]),
        "occipital": aligned["occipital"],
        "nasal": combine(aligned, ["nasal_l", "nasal_r"]),
        "zygomatic": combine(aligned, ["zygomatic_l", "zygomatic_r"]),
        "maxilla": combine(aligned, ["maxilla_l", "maxilla_r"]),
        "mandible": aligned["mandible"],
    }
    orbits = measure_orbits(labeled, face)
    fit = fit_anchors(labeled, orbits)
    jaw = jaw_pivot(aligned["mandible"])
    print("jaw pivot", np.round(jaw, 3), flush=True)
    cranium, jaw_mesh = build_skull_shells(aligned)
    print("expression muscles", flush=True)
    muscles, identified, muscle_anchors = build_expression_muscles(
        (scale, rot, trans),
        jaw,
        aligned["mandible"],
        [aligned[name] for name in ("frontal", "zygomatic_l", "zygomatic_r", "maxilla_l", "maxilla_r")],
    )
    drift = float(np.linalg.norm(muscles.vertices.mean(0) - cranium.vertices.mean(0)))
    print(f"  muscle centroid drift {drift:.2f} cm", flush=True)
    if drift > 12:
        raise RuntimeError("4.0 muscles did not land on the 4.3 skull")
    print("eyes", flush=True)
    eyes = build_eyes(scale, rot, trans)
    skull_box = trimesh.util.concatenate([cranium, jaw_mesh])
    print("skin", flush=True)
    skin, neck0, neck1 = build_skin(scale, rot, trans, skull_box)
    print(f"  neck fade {neck0:.2f} {neck1:.2f}", flush=True)
    cerebrum_raw = []
    hind_raw = []
    for fj, _bp in BRAIN_FILES:
        if fj not in have:
            continue
        bucket = hind_raw if fj == "FJ1781" else cerebrum_raw
        bucket.append(load_mesh(have[fj]))
    print(f"brain parts cerebrum {len(cerebrum_raw)} hind {len(hind_raw)}", flush=True)
    cerebrum = apply_similarity(remesh_brain(cerebrum_raw, target=70000, pitch=1.7), scale, rot, trans)
    cerebrum.fix_normals()
    hindbrain = apply_similarity(decimate(hind_raw[0], 16000), scale, rot, trans)
    hindbrain.fix_normals()
    for name, mesh in (("cerebrum", cerebrum), ("hindbrain", hindbrain)):
        span = mesh.bounds[1] - mesh.bounds[0]
        print(name, "faces", len(mesh.faces), "span", np.round(span, 2), flush=True)
        if span[1] > 28 or mesh.bounds[0][1] < -18:
            raise RuntimeError(f"{name} bounds look wrong: {mesh.bounds}")

    export: dict[str, trimesh.Trimesh] = {
        "cranium": cranium,
        "jaw": jaw_mesh,
        "muscles": muscles,
        "eyes": eyes,
        "skin": skin,
        "cerebrum": cerebrum,
        "hindbrain": hindbrain,
    }
    hand_raw = {name: load_mesh(have[fj]) for name, (fj, _bp) in HAND_FILES.items()}
    export.update(build_hand(hand_raw))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    scene = trimesh.Scene()
    muscle_attrs: dict[str, dict[str, list[float]]] = {}
    for name, mesh in export.items():
        # Touch the cache so the glTF writer stores normals. Without them the x-ray shader has nothing to shade.
        mesh.vertex_normals
        move = mesh.metadata.get("move") if isinstance(mesh.metadata, dict) else None
        if name == "muscles" and move is not None:
            count = len(mesh.vertices)
            muscle_attrs[name] = {
                "uv": [0.0] * (count * 2),
                "move": [round(float(v), 4) for v in np.asarray(move, dtype=np.float32).reshape(-1)],
            }
        mesh.visual.vertex_colors = [220, 230, 240, 255]
        scene.add_geometry(mesh, node_name=name, geom_name=name)
    glb = OUT_DIR / "anatomy.glb"
    scene.export(glb)
    bone_anchors = anchor_points({**labeled, "brain": export["cerebrum"]}, jaw)
    for name, points in muscle_anchors.items():
        if points:
            bone_anchors[name] = points
    anchors = bone_anchors
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
        "fit": fit,
        "neck": [round(neck0, 3), round(neck1, 3)],
        "muscles": identified,
        "bytes": glb.stat().st_size,
    }
    (OUT_DIR / "anchors.json").write_text(json.dumps(payload))
    (OUT_DIR / "muscle-attrs.json").write_text(json.dumps(muscle_attrs))
    (OUT_DIR / "nodes.json").write_text(json.dumps({"nodes": sorted(export), "bytes": glb.stat().st_size}, indent=2))
    print("wrote", glb, glb.stat().st_size)
    preview(export, face, Path("/tmp/bp3d/preview-aligned.png"))
    from canonical_space import main as place_canonical

    place_canonical()


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


def _muscle_job(
    aligned: dict[str, trimesh.Trimesh], pose: tuple[float, np.ndarray, np.ndarray]
) -> tuple[trimesh.Trimesh, list[dict], dict[str, list[list[float]]]]:
    np.random.seed(4)
    jaw = jaw_pivot(aligned["mandible"])
    return build_expression_muscles(
        pose,
        jaw,
        aligned["mandible"],
        [aligned[name] for name in ("frontal", "zygomatic_l", "zygomatic_r", "maxilla_l", "maxilla_r")],
    )


def _load_aligned() -> tuple[dict[str, trimesh.Trimesh], tuple[float, np.ndarray, np.ndarray]]:
    pairs = [item for group in BONE_FILES.values() for item in group]
    seen: set[str] = set()
    unique = []
    for pair in pairs:
        if pair[0] not in seen:
            seen.add(pair[0])
            unique.append(pair)
    have = ensure_objs(unique)
    parts = {name: merge_paths([have[fj] for fj, _bp in files if fj in have]) for name, files in BONE_FILES.items()}
    face = load_canonical().vertices
    aligned, _jaw, pose = align_bones(parts, face)
    return aligned, pose


def muscles_preview() -> None:
    """Write skull + new muscles to a preview file. Does not touch the app."""
    aligned, pose = _load_aligned()
    muscles, identified, anchors = _muscle_job(aligned, pose)
    skull = trimesh.load(OUT_DIR / "anatomy.glb", force="scene")
    scene = trimesh.Scene()
    for name in ("cranium", "jaw"):
        mesh = skull.geometry[name]
        mesh.vertex_normals
        scene.add_geometry(mesh, node_name=name, geom_name=name)
    muscles.vertex_normals
    scene.add_geometry(muscles, node_name="muscles", geom_name="muscles")
    out = Path("/tmp/bp3d/muscles-on-skull.glb")
    scene.export(out)
    print("preview", out, out.stat().st_size, flush=True)
    print("anchors", {key: len(points) for key, points in anchors.items()}, flush=True)
    print("identified", len(identified), flush=True)


def replace_muscles() -> None:
    """Swap the muscle layer in the app file. The cranium and jaw stay as they are."""
    aligned, pose = _load_aligned()
    muscles, identified, muscle_anchors = _muscle_job(aligned, pose)
    glb = OUT_DIR / "anatomy.glb"
    loaded = trimesh.load(glb, force="scene")
    move = np.asarray(muscles.metadata["move"], dtype=np.float32)
    scene = trimesh.Scene()
    for name, mesh in loaded.geometry.items():
        if name == "muscles":
            continue
        mesh.vertex_normals
        scene.add_geometry(mesh, node_name=name, geom_name=name)
    muscles.vertex_normals
    muscles.visual.vertex_colors = [220, 230, 240, 255]
    scene.add_geometry(muscles, node_name="muscles", geom_name="muscles")
    scene.export(glb)
    count = len(muscles.vertices)
    attrs = {
        "muscles": {
            "uv": [0.0] * (count * 2),
            "move": [round(float(v), 4) for v in move.reshape(-1)],
        }
    }
    (OUT_DIR / "muscle-attrs.json").write_text(json.dumps(attrs))
    anchors = json.loads((OUT_DIR / "anchors.json").read_text())
    for name, points in muscle_anchors.items():
        if points:
            anchors["anchors"][name] = points
    anchors["muscles"] = identified
    anchors["bytes"] = glb.stat().st_size
    (OUT_DIR / "anchors.json").write_text(json.dumps(anchors))
    nodes = json.loads((OUT_DIR / "nodes.json").read_text())
    nodes["bytes"] = glb.stat().st_size
    (OUT_DIR / "nodes.json").write_text(json.dumps(nodes, indent=2))
    print("replaced muscles", glb.stat().st_size, "faces", len(muscles.faces), flush=True)


def skull_only() -> None:
    """Union the rigid bones and write a skull GLB. Does not touch the app export."""
    pairs = [item for group in BONE_FILES.values() for item in group]
    seen: set[str] = set()
    unique = []
    for pair in pairs:
        if pair[0] not in seen:
            seen.add(pair[0])
            unique.append(pair)
    have = ensure_objs(unique)
    parts = {name: merge_paths([have[fj] for fj, _bp in files if fj in have]) for name, files in BONE_FILES.items()}
    for name, mesh in parts.items():
        print(f"loaded {name} faces {len(mesh.faces)} watertight {mesh.is_watertight}", flush=True)
    face = load_canonical().vertices
    aligned, _jaw, _pose = align_bones(parts, face)
    cranium, jaw = build_skull_shells(aligned)
    out = Path("/tmp/bp3d/skull-only.glb")
    scene = trimesh.Scene()
    for name, mesh in (("cranium", cranium), ("jaw", jaw)):
        mesh.vertex_normals
        scene.add_geometry(mesh, node_name=name, geom_name=name)
    scene.export(out)
    print("wrote", out, out.stat().st_size, flush=True)


if __name__ == "__main__":
    if "--muscles-preview" in sys.argv:
        muscles_preview()
    elif "--muscles-only" in sys.argv:
        replace_muscles()
    elif "--skull-only" in sys.argv:
        skull_only()
    elif "--place-canonical" in sys.argv:
        from canonical_space import main as place_canonical

        place_canonical()
    elif "--hug-face" in sys.argv:
        from canonical_space import retouch

        retouch()
    else:
        main()
