#!/usr/bin/env python3
"""Download BodyParts3D bones + a brain shell, decimate, align to the
MediaPipe canonical face, add schematic muscle ribbons, and write one GLB.

Bones and brain: BodyParts3D / Anatomography, CC BY-SA 2.1 Japan, (c) DBCLS.
The five expression muscles are not in BodyParts3D 4.3 (confirmed against the
4.3 FMA manifest). Their surfaces are original schematics in the same file,
released under CC BY-SA 2.1 JP so the GLB has a single licence.

Cache lives in /tmp/bp3d so reruns skip the network. Requires:
trimesh, fast-simplification, numpy, pillow, matplotlib.
"""

from __future__ import annotations

import io
import json
import subprocess
import time
import zipfile
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "anatomy" / "bodyparts3d"
CACHE = Path("/tmp/bp3d/cache")
CANONICAL = ROOT / "tests" / "fixtures" / "canonical_face_model.obj"
MANIFEST = Path("/tmp/bp3d/MANIFEST.csv")

UA = "Mozilla/5.0 (compatible; AnatomyMirrorMeshBuilder/1.0)"
VIEWER = "https://lifesciencedb.jp/bp3d/?lng=en"
DOWNLOAD = "https://lifesciencedb.jp/bp3d/download.cgi"

# One element id per bone side. A second copy exists in the 4.3 set; we fetch
# both and drop exact duplicates so inner/outer shells still merge.
BONES: dict[str, list[str]] = {
    "frontal": ["FJ3200", "FJ6310"],
    "parietal": ["FJ3274", "FJ3380", "FJ6385", "FJ6472"],
    "temporal": ["FJ3281", "FJ3386", "FJ6391", "FJ6478"],
    "occipital": ["FJ3309", "FJ6411"],
    "nasal": ["FJ6383", "FJ6470"],
    "zygomatic": ["FJ3287", "FJ3392", "FJ6397", "FJ6483"],
    "maxilla": ["FJ3269", "FJ3375", "FJ6380", "FJ6468"],
    "mandible": ["FJ3289", "FJ6399"],
}

TARGETS = {
    "frontal": 2800,
    "parietal": 2400,
    "temporal": 2200,
    "occipital": 2400,
    "nasal": 400,
    "zygomatic": 1100,
    "maxilla": 2200,
    "mandible": 2200,
    "brain": 4200,
    "frontalis": 700,
    "corrugator": 400,
    "orbicularis": 900,
    "zygomaticus": 500,
    "masseter": 600,
}

BRAIN_ALLOW = (
    "superior frontal gyrus",
    "middle frontal gyrus",
    "inferior frontal gyrus",
    "precentral gyrus",
    "postcentral gyrus",
    "supramarginal gyrus",
    "angular gyrus",
    "superior temporal gyrus",
    "middle temporal gyrus",
    "inferior temporal gyrus",
    "lateral occipital gyrus",
    "cerebellum",
)


def load_manifest() -> dict[str, dict[str, str]]:
    import csv

    rows = {}
    with MANIFEST.open() as f:
        for row in csv.DictReader(f):
            rows[row["fj_id"]] = row
    return rows


def curl(args: list[str], timeout: int = 180) -> None:
    last = "curl failed"
    for attempt in range(1, 5):
        p = subprocess.run(args, capture_output=True, timeout=timeout)
        if p.returncode == 0:
            return
        last = p.stderr.decode(errors="replace")[:300]
        time.sleep(2**attempt)
    raise RuntimeError(last)


def download_chunk(fj_ids: list[str], bp_ids: list[str], dest: Path, cookies: Path) -> None:
    if dest.exists() and dest.stat().st_size > 1000:
        try:
            with zipfile.ZipFile(dest) as z:
                if z.testzip() is None and any(n.lower().endswith(".obj") for n in z.namelist()):
                    return
        except zipfile.BadZipFile:
            dest.unlink(missing_ok=True)
    curl(
        [
            "curl",
            "-A",
            UA,
            "-e",
            VIEWER,
            "-b",
            str(cookies),
            "-c",
            str(cookies),
            "-s",
            "--compressed",
            "-o",
            str(dest),
            "--data-urlencode",
            f"ids={json.dumps(fj_ids)}",
            "--data-urlencode",
            f"rep_id={json.dumps(bp_ids)}",
            "--data-urlencode",
            f"filename={dest.stem}",
            "--data-urlencode",
            "type=art_file",
            "--data-urlencode",
            "all_downloads=1",
            DOWNLOAD,
        ],
        timeout=300,
    )


def ensure_objs(ids: list[str], manifest: dict[str, dict[str, str]]) -> dict[str, Path]:
    CACHE.mkdir(parents=True, exist_ok=True)
    cookies = CACHE / "cookies.txt"
    if not cookies.exists():
        curl(["curl", "-A", UA, "-c", str(cookies), "-s", "-o", "/dev/null", VIEWER])
    missing = []
    have: dict[str, Path] = {}
    for fj in ids:
        hits = list(CACHE.glob(f"{fj}_*.obj"))
        if hits:
            have[fj] = hits[0]
        else:
            missing.append(fj)
    if not missing:
        return have
    chunk = 10
    for i in range(0, len(missing), chunk):
        part = missing[i : i + chunk]
        bps = sorted({manifest[fj]["bp_id"] for fj in part if fj in manifest})
        dest = CACHE / f"chunk_{part[0]}_{len(part)}.zip"
        print(f"download {part[0]}.. ({len(part)})", flush=True)
        download_chunk(part, bps, dest, cookies)
        with zipfile.ZipFile(dest) as z:
            for member in z.namelist():
                if not member.lower().endswith(".obj"):
                    continue
                name = Path(member).name
                fj = name.split("_", 1)[0]
                path = CACHE / name
                if not path.exists():
                    path.write_bytes(z.read(member))
                if fj in part:
                    have[fj] = path
        time.sleep(0.4)
    absent = [fj for fj in ids if fj not in have]
    if absent:
        print("missing objs", absent)
    return have


def load_mesh(path: Path) -> trimesh.Trimesh:
    m = trimesh.load(path, process=False, force="mesh")
    if isinstance(m, trimesh.Scene):
        m = trimesh.util.concatenate(tuple(m.geometry.values()))
    return m


def is_duplicate(a: trimesh.Trimesh, b: trimesh.Trimesh) -> bool:
    if len(a.vertices) == 0 or len(b.vertices) == 0:
        return True
    sample = a.vertices[:: max(1, len(a.vertices) // 400)]
    # 2mm mean distance counts as the same shell in millimetre units.
    d = np.linalg.norm(sample[:, None, :] - b.vertices[:: max(1, len(b.vertices) // 800)][None, :, :], axis=2)
    return float(d.min(axis=1).mean()) < 2.0


def merge_parts(paths: list[Path]) -> trimesh.Trimesh:
    meshes = [load_mesh(p) for p in paths]
    meshes = [m for m in meshes if len(m.faces) > 0]
    kept: list[trimesh.Trimesh] = []
    for m in meshes:
        if any(is_duplicate(m, k) for k in kept):
            continue
        kept.append(m)
    if not kept:
        raise RuntimeError("no geometry")
    if len(kept) == 1:
        return kept[0]
    return trimesh.util.concatenate(kept)


def decimate(mesh: trimesh.Trimesh, target: int) -> trimesh.Trimesh:
    if len(mesh.faces) <= target:
        return mesh
    try:
        import fast_simplification

        verts, faces = fast_simplification.simplify(
            mesh.vertices.astype(np.float32),
            mesh.faces.astype(np.int32),
            target_count=int(target),
        )
        out = trimesh.Trimesh(verts, faces, process=False)
        if len(out.faces) > 0:
            return out
    except Exception as exc:  # noqa: BLE001
        print("simplify failed", exc)
    try:
        return mesh.simplify_quadric_decimation(target)
    except Exception as exc:  # noqa: BLE001
        print("quadric failed", exc)
        return mesh


def load_canonical() -> np.ndarray:
    verts = []
    for line in CANONICAL.read_text().splitlines():
        if line.startswith("v "):
            verts.append([float(x) for x in line.split()[1:4]])
    return np.asarray(verts, dtype=np.float64)


def umeyama(src: np.ndarray, dst: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
    """Map src -> dst. Both (n, 3)."""
    n = src.shape[0]
    mu_s = src.mean(axis=0)
    mu_d = dst.mean(axis=0)
    sc = src - mu_s
    dc = dst - mu_d
    cov = (dc.T @ sc) / n
    u, d, vt = np.linalg.svd(cov)
    sign = np.eye(3)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        sign[-1, -1] = -1
    rot = u @ sign @ vt
    var = (sc**2).sum() / n
    scale = float(np.trace(np.diag(d) @ sign) / var)
    trans = mu_d - scale * (rot @ mu_s)
    return scale, rot, trans


def apply_transform(mesh: trimesh.Trimesh, scale: float, rot: np.ndarray, trans: np.ndarray) -> trimesh.Trimesh:
    out = mesh.copy()
    out.vertices = (scale * (out.vertices @ rot.T)) + trans
    return out


def bone_anchors(parts: dict[str, trimesh.Trimesh]) -> np.ndarray:
    """Seven anatomical points in BodyParts3D space, matching canonical landmarks
    10 (forehead), 168 (nasion), 152 (chin), 345 / 116 (cheekbones), 397 / 172 (jaw angles).
    """
    all_v = np.concatenate([m.vertices for m in parts.values()])
    up = parts["parietal"].vertices.mean(0) - parts["mandible"].vertices.mean(0)
    up = up / np.linalg.norm(up)
    forward = parts["nasal"].vertices.mean(0) - parts["occipital"].vertices.mean(0)
    forward = forward / np.linalg.norm(forward)
    forward = forward - up * np.dot(forward, up)
    forward = forward / np.linalg.norm(forward)
    right = np.cross(up, forward)
    right = right / np.linalg.norm(right)

    def project(v: np.ndarray) -> np.ndarray:
        return np.stack([v @ right, v @ up, v @ forward], axis=1)

    def pick(mesh: trimesh.Trimesh, score: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
        idx = np.arange(len(mesh.vertices))
        if mask is not None:
            idx = idx[mask]
        return mesh.vertices[idx[np.argmax(score if mask is None else score[mask])]]

    nasal = parts["nasal"].vertices
    nas_p = project(nasal)
    nasion = pick(parts["nasal"], nas_p[:, 1], np.abs(nas_p[:, 0]) < np.quantile(np.abs(nas_p[:, 0]), 0.4))

    frontal = parts["frontal"].vertices
    fr_p = project(frontal)
    midline = np.abs(fr_p[:, 0]) < np.quantile(np.abs(fr_p[:, 0]), 0.15)
    # Hairline-ish: high, but not the coronal edge. Maximize a blend of forward and up.
    forehead = pick(parts["frontal"], fr_p[:, 2] * 0.55 + fr_p[:, 1] * 0.45, midline)

    mandible = parts["mandible"].vertices
    md_p = project(mandible)
    chin_mask = (md_p[:, 2] > np.quantile(md_p[:, 2], 0.45)) & (np.abs(md_p[:, 0]) < np.quantile(np.abs(md_p[:, 0]), 0.2))
    chin = pick(parts["mandible"], -md_p[:, 1], chin_mask)

    zy = parts["zygomatic"].vertices
    zy_p = project(zy)
    cheek_r = pick(parts["zygomatic"], -zy_p[:, 0])  # person's right = -right axis if +right is person's left? 
    # `right` was np.cross(up, forward). With Y up and Z forward in a right-handed anatomical
    # frame where +X is the person's left, cross(up, forward) = cross(+Y, +Z) = +X = person's left.
    # Most negative along `right` is the person's right cheek.
    cheek_l = pick(parts["zygomatic"], zy_p[:, 0])
    jaw_r = pick(parts["mandible"], -md_p[:, 0], md_p[:, 1] < np.median(md_p[:, 1]))
    jaw_l = pick(parts["mandible"], md_p[:, 0], md_p[:, 1] < np.median(md_p[:, 1]))
    print("anchors bp3d", flush=True)
    for name, p in (
        ("forehead", forehead),
        ("nasion", nasion),
        ("chin", chin),
        ("cheekL", cheek_l),
        ("cheekR", cheek_r),
        ("jawL", jaw_l),
        ("jawR", jaw_r),
    ):
        print(f"  {name} {p}")
    return np.stack([forehead, nasion, chin, cheek_l, cheek_r, jaw_l, jaw_r])


def tube(points: np.ndarray, radius: float, segments: int = 8) -> trimesh.Trimesh:
    """A simple swept tube through 3D points. Original geometry, not a scan."""
    if len(points) < 2:
        raise ValueError("tube needs 2 points")
    verts = []
    faces = []
    rings = []
    for i, p in enumerate(points):
        if i == 0:
            tangent = points[1] - points[0]
        elif i == len(points) - 1:
            tangent = points[-1] - points[-2]
        else:
            tangent = points[i + 1] - points[i - 1]
        tangent = tangent / (np.linalg.norm(tangent) + 1e-8)
        helper = np.array([0.0, 1.0, 0.0]) if abs(tangent[1]) < 0.9 else np.array([1.0, 0.0, 0.0])
        side = np.cross(tangent, helper)
        side = side / (np.linalg.norm(side) + 1e-8)
        up = np.cross(tangent, side)
        ring = []
        for s in range(segments):
            a = 2 * np.pi * s / segments
            ring.append(p + radius * (np.cos(a) * side + np.sin(a) * up))
        rings.append(len(verts))
        verts.extend(ring)
    for i in range(len(points) - 1):
        a0 = rings[i]
        b0 = rings[i + 1]
        for s in range(segments):
            s2 = (s + 1) % segments
            faces.append([a0 + s, b0 + s, b0 + s2])
            faces.append([a0 + s, b0 + s2, a0 + s2])
    # caps
    # skip caps; x-ray tubes read fine open
    return trimesh.Trimesh(vertices=np.array(verts), faces=np.array(faces), process=False)


def muscle_meshes(face: np.ndarray) -> dict[str, trimesh.Trimesh]:
    def lm(*ids: int) -> np.ndarray:
        return face[list(ids)]

    # Frontalis: a sheet over the forehead landmarks, lifted slightly off the skin (+Z).
    grid_ids = [
        [109, 10, 338],
        [108, 151, 337],
        [69, 107, 299] if 107 < len(face) else [69, 108, 299],
    ]
    # 107 may exist on the 468 model. Fall back if the middle brow index looks wrong.
    rows = []
    brow = [70, 63, 105, 66, 107, 9, 336, 296, 334, 293, 300]
    brow = [i for i in brow if i < len(face)]
    top = lm(109, 10, 338)
    mid = lm(67, 151, 297)
    low = face[brow] if brow else lm(69, 9, 299) if 9 < len(face) else mid
    # Build a width-wise sampled sheet between top and a brow polyline.
    sheet = []
    low_sorted = low[np.argsort(low[:, 0])]
    top_sorted = top[np.argsort(top[:, 0])]
    for t in np.linspace(0, 1, 6):
        row = []
        for s in np.linspace(0, 1, 7):
            a = top_sorted[min(len(top_sorted) - 1, int(s * (len(top_sorted) - 1)))]
            b = low_sorted[min(len(low_sorted) - 1, int(s * (len(low_sorted) - 1)))]
            p = (1 - t) * a + t * b
            p = p + np.array([0.0, 0.0, 0.35])
            row.append(p)
        sheet.append(row)
    verts = []
    faces = []
    for r, row in enumerate(sheet):
        base = len(verts)
        verts.extend(row)
        if r == 0:
            continue
        prev = base - len(row)
        for c in range(len(row) - 1):
            faces.append([prev + c, base + c, base + c + 1])
            faces.append([prev + c, base + c + 1, prev + c + 1])
    frontalis = trimesh.Trimesh(vertices=np.array(verts), faces=np.array(faces), process=False)

    # Corrugator: short straps from the inner brow down toward the nose root.
    corrugator = trimesh.util.concatenate(
        [
            tube(np.stack([face[70], face[107] if 107 < len(face) else face[55], face[8]]), 0.18),
            tube(np.stack([face[300], face[336], face[8]]), 0.18),
        ]
    )

    def eye_ring(center_idx: int, radius: float) -> np.ndarray:
        c = face[center_idx]
        d = np.linalg.norm(face - c, axis=1)
        idx = np.where(d < radius)[0]
        pts = face[idx]
        ang = np.arctan2(pts[:, 1] - c[1], pts[:, 0] - c[0])
        order = np.argsort(ang)
        ring = pts[order]
        # decimate the ring to ~16 points
        step = max(1, len(ring) // 16)
        return ring[::step]

    iod = float(np.linalg.norm(face[33] - face[263]))
    rings = []
    for center in (33, 263):
        ring = eye_ring(center, iod * 0.28)
        ring = ring + np.array([0.0, 0.0, 0.25])
        if len(ring) >= 4:
            rings.append(tube(np.vstack([ring, ring[:1]]), 0.16, segments=6))
    orbicularis = trimesh.util.concatenate(rings)

    zygomaticus = trimesh.util.concatenate(
        [
            tube(np.stack([face[116], face[117] if 117 < len(face) else face[123], face[61]]), 0.2),
            tube(np.stack([face[345], face[346], face[291]]), 0.2),
        ]
    )
    masseter = trimesh.util.concatenate(
        [
            tube(np.stack([face[123], face[147] if 147 < len(face) else face[137], face[172]]), 0.42, segments=8),
            tube(np.stack([face[352], face[376] if 376 < len(face) else face[366], face[397]]), 0.42, segments=8),
        ]
    )
    return {
        "frontalis": frontalis,
        "corrugator": corrugator,
        "orbicularis": orbicularis,
        "zygomaticus": zygomaticus,
        "masseter": masseter,
    }


def preview(scene_meshes: dict[str, trimesh.Trimesh], face: np.ndarray, path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, axes = plt.subplots(1, 2, figsize=(10, 6), facecolor="#111")
    views = [(0, 1, "front"), (2, 1, "side")]
    colors = {
        "frontal": "#e6b15a",
        "parietal": "#f0d59a",
        "temporal": "#d4845a",
        "occipital": "#b76b73",
        "nasal": "#f3e6cf",
        "zygomatic": "#e38b7a",
        "maxilla": "#8fbfa8",
        "mandible": "#7ea0b8",
        "brain": "#a9b4e8",
        "frontalis": "#c7b0e8",
        "corrugator": "#9b8fd4",
        "orbicularis": "#8ec8e6",
        "zygomaticus": "#f0a0c0",
        "masseter": "#e07a93",
    }
    for ax, (xi, yi, title) in zip(axes, views):
        ax.set_facecolor("#111")
        for name, mesh in scene_meshes.items():
            v = mesh.vertices
            if len(v) > 4000:
                v = v[:: len(v) // 4000]
            ax.scatter(v[:, xi], v[:, yi], s=1, c=colors.get(name, "white"), alpha=0.7, linewidths=0)
        ax.scatter(face[:, xi], face[:, yi], s=2, c="#666", alpha=0.5)
        ax.set_aspect("equal")
        ax.set_title(title, color="white")
        ax.tick_params(colors="#888")
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=110)
    print("preview", path)


def brain_ids(manifest: dict[str, dict[str, str]]) -> list[str]:
    best: dict[str, tuple[int, str]] = {}
    for fj, row in manifest.items():
        name = row["name"].lower()
        if not any(key in name for key in BRAIN_ALLOW):
            continue
        if any(bad in name for bad in ("artery", "vein", "nerve", "white matter")):
            continue
        faces = int(row["faces"])
        if faces < 4000:
            continue
        prev = best.get(name)
        if prev is None or faces > prev[0]:
            best[name] = (faces, fj)
    chosen = [fj for _, fj in best.values()]
    print(f"brain parts {len(chosen)}")
    return chosen


def main() -> None:
    manifest = load_manifest()
    face = load_canonical()
    bone_fj = [fj for group in BONES.values() for fj in group]
    brain = brain_ids(manifest)
    have = ensure_objs(bone_fj + brain, manifest)

    parts: dict[str, trimesh.Trimesh] = {}
    for name, fjs in BONES.items():
        paths = [have[fj] for fj in fjs if fj in have]
        print(f"merge {name} from {len(paths)} files", flush=True)
        parts[name] = merge_parts(paths)

    src = bone_anchors(parts)
    # Canonical targets in the same order: forehead 10, nasion 168, chin 152,
    # cheek L 345 (person's left, +X), cheek R 116, jaw L 397, jaw R 172.
    dst = np.stack([face[10], face[168], face[152], face[345], face[116], face[397], face[172]])
    scale, rot, trans = umeyama(src, dst)
    print("umeyama scale", scale)

    aligned: dict[str, trimesh.Trimesh] = {}
    for name, mesh in parts.items():
        aligned[name] = decimate(apply_transform(mesh, scale, rot, trans), TARGETS[name])
        print(f"  {name} faces {len(aligned[name].faces)}")

    brain_meshes = []
    for fj in brain:
        if fj not in have:
            continue
        brain_meshes.append(load_mesh(have[fj]))
    if brain_meshes:
        brain_mesh = trimesh.util.concatenate(brain_meshes)
        brain_mesh = decimate(apply_transform(brain_mesh, scale, rot, trans), TARGETS["brain"])
        aligned["brain"] = brain_mesh
        print("  brain faces", len(brain_mesh.faces))

    for name, mesh in muscle_meshes(face).items():
        aligned[name] = decimate(mesh, TARGETS[name])
        print(f"  {name} faces {len(aligned[name].faces)}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    scene = trimesh.Scene()
    for name, mesh in aligned.items():
        mesh.visual.vertex_colors = [220, 210, 200, 255]
        scene.add_geometry(mesh, node_name=name, geom_name=name)
    glb = OUT_DIR / "anatomy.glb"
    scene.export(glb)
    print("wrote", glb, glb.stat().st_size)
    preview(aligned, face, Path("/tmp/bp3d/preview-front.png"))

    names = sorted(aligned)
    (OUT_DIR / "nodes.json").write_text(json.dumps({"nodes": names, "bytes": glb.stat().st_size}, indent=2))


if __name__ == "__main__":
    main()
