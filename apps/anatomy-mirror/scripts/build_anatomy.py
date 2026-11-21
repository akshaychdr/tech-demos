#!/usr/bin/env python3
"""Rebuild Anatomy Mirror meshes from BodyParts3D 4.3 element OBJs.

Bones, brain, and hand bones are decimated from BodyParts3D (CC BY-SA 2.1 JP,
(c) DBCLS). Release 4.3 has no meshes for the five expression muscles, so those
sheets are drawn on the MediaPipe canonical face and shipped under the same
licence. Cache lives in /tmp/bp3d.

Requires: trimesh, fast-simplification, numpy, scipy, scikit-image, pillow, matplotlib.
"""

from __future__ import annotations

import json
import subprocess
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
    "frontal": 11000,
    "parietal": 11000,
    "temporal": 9000,
    "occipital": 8000,
    "nasal": 3500,
    "zygomatic": 5500,
    "maxilla": 9000,
    "mandible": 11000,
    "brain": 15000,
    "shell": 7000,
}

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


def muscle_sheets(face_mesh: trimesh.Trimesh) -> dict[str, trimesh.Trimesh]:
    fine = subdivide(face_mesh)
    tree = cKDTree(fine.vertices)
    normals = fine.vertex_normals
    surface = fine.vertices
    face = face_mesh.vertices

    def on(points: np.ndarray, lift: float) -> np.ndarray:
        return snap(tree, normals, surface, points, lift)

    brow = resample(face[BROW], 28)
    crown = brow.copy()
    crown[:, 1] += 3.4
    crown[:, 2] -= 0.55
    rows = []
    for t in np.linspace(0, 1, 16):
        band = (1 - t) * brow + t * crown
        rows.append(on(band, 0.16))
    frontalis = grid_sheet(rows, 0.28)

    def strap(a: np.ndarray, b: np.ndarray, width: float, lift: float, steps: int = 14) -> trimesh.Trimesh:
        path = on(resample(np.stack([a, b]), steps), lift)
        tangent = np.gradient(path, axis=0)
        tangent /= np.maximum(np.linalg.norm(tangent, axis=1, keepdims=True), 1e-8)
        side = np.cross(tangent, np.array([0.0, 0.0, 1.0]))
        side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-8)
        half = width / 2
        return grid_sheet([path - side * half, path + side * half], 0.2)

    corrugator = trimesh.util.concatenate(
        [
            strap(face[107], face[8], 0.34, 0.14, 10),
            strap(face[336], face[8], 0.34, 0.14, 10),
        ]
    )

    def eye_band(indices: list[int]) -> trimesh.Trimesh:
        loop = face[indices]
        center = loop.mean(axis=0)
        outer = on(center + (loop - center) * 1.55, 0.14)
        inner = on(center + (loop - center) * 0.62, 0.12)
        # close the ring by repeating the first sample
        outer_r = resample(np.vstack([outer, outer[:1]]), 36)
        inner_r = resample(np.vstack([inner, inner[:1]]), 36)
        return grid_sheet([inner_r, outer_r], 0.18)

    orbicularis = trimesh.util.concatenate([eye_band(RIGHT_EYE), eye_band(LEFT_EYE)])
    zygomaticus = trimesh.util.concatenate(
        [
            strap(face[116], face[61], 0.48, 0.16, 16),
            strap(face[345], face[291], 0.48, 0.16, 16),
        ]
    )

    def masseter(cheek: int, jaw: int, ear: int) -> trimesh.Trimesh:
        top_front = face[cheek] + np.array([0.0, -0.15, -0.2])
        top_back = face[cheek] * 0.45 + face[ear] * 0.55 + np.array([0.0, 0.7, 0.4])
        bot_back = face[jaw]
        bot_front = face[jaw] * 0.55 + face[152] * 0.45
        rows = []
        for t in np.linspace(0, 1, 12):
            a = (1 - t) * top_front + t * top_back
            b = (1 - t) * bot_front + t * bot_back
            line = on(resample(np.stack([a, b]), 8), 0.2)
            rows.append(line)
        return grid_sheet(rows, 0.42)

    masseter = trimesh.util.concatenate([masseter(116, 172, 234), masseter(345, 397, 454)])
    sheets = {
        "frontalis": frontalis,
        "corrugator": corrugator,
        "orbicularis": orbicularis,
        "zygomaticus": zygomaticus,
        "masseter": masseter,
    }
    for name, mesh in sheets.items():
        print(f"  muscle {name} faces {len(mesh.faces)}")
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
    for name in ("frontalis", "corrugator", "orbicularis", "zygomaticus", "masseter"):
        mesh = meshes[name]
        verts = mesh.vertices
        if name in ("orbicularis", "zygomaticus", "masseter", "corrugator"):
            anchors[name] = [
                [round(float(v), 4) for v in verts[verts[:, 0] >= 0].mean(0)],
                [round(float(v), 4) for v in verts[verts[:, 0] < 0].mean(0)],
            ]
        else:
            anchors[name] = [[round(float(v), 4) for v in verts.mean(0)]]
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
        "zygomaticus": "#ff8d84", "masseter": "#ff8d84", "shell": "#35507a",
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
    print("jaw pivot", jaw)
    export.update(muscle_sheets(face_mesh))
    skull_for_shell = combine(export, ["frontal", "parietal", "temporal", "occipital"])
    export["shell"] = build_shell(face_mesh, skull_for_shell)
    hand_raw = {name: load_mesh(have[fj]) for name, (fj, _bp) in HAND_FILES.items()}
    export.update(build_hand(hand_raw))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    scene = trimesh.Scene()
    for name, mesh in export.items():
        # Touch the cache so the glTF writer stores normals. Without them the x-ray shader has nothing to shade.
        mesh.vertex_normals
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
    payload = {"jawPivot": anchors.pop("jawPivot")[0], "anchors": anchors, "hands": hand_map, "bytes": glb.stat().st_size}
    (OUT_DIR / "anchors.json").write_text(json.dumps(payload, indent=2))
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


if __name__ == "__main__":
    main()
