"""Place the head in MediaPipe canonical face space and thin the bone meshes.

One similarity (rotation, uniform scale, translation) carries the skull onto the
canonical landmark coordinates. Inner bone, the faces that sit well inside the
outer envelope, is dropped, then quadric decimation brings the cranium to about
58k triangles and the jaw to about 14k. Hands stay in screen space.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import fast_simplification
import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
GLB_PATH = ROOT / "public/anatomy/bodyparts3d/anatomy.glb"
ANCHOR_PATH = ROOT / "public/anatomy/bodyparts3d/anchors.json"
MUSCLE_PATH = ROOT / "public/anatomy/bodyparts3d/muscle-attrs.json"
NODES_PATH = ROOT / "public/anatomy/bodyparts3d/nodes.json"
LABEL_PATH = ROOT / "src/domain/headLabels.ts"

HEAD = ("cranium", "jaw", "eyes", "cerebrum", "hindbrain", "skin", "muscles")
# Anatomical picks on the current mesh, paired with the canonical face coordinates.
SRC = np.array(
    [
        [-3.872, -0.159, 2.700],
        [2.606, 2.310, 4.132],
        [-0.715, 0.631, 2.532],
        [0.877, 0.654, 3.558],
        [0.790, -1.175, 6.044],
        [-0.590, 4.249, 5.943],
        [-0.590, 7.036, 5.189],
        [0.892, -9.164, 2.863],
    ],
    dtype=np.float64,
)
DST = np.array(
    [
        [-4.445859, 2.663991, 3.173422],
        [4.445859, 2.663991, 3.173422],
        [-1.856432, 2.585245, 3.757904],
        [1.856432, 2.585245, 3.757904],
        [0.0, -1.126865, 7.475604],
        [0.0, 3.271027, 5.236015],
        [0.0, 8.261778, 4.481535],
        [0.0, -9.403378, 4.264492],
    ],
    dtype=np.float64,
)


def similarity(src: np.ndarray, dst: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
    count = len(src)
    mu_a, mu_b = src.mean(0), dst.mean(0)
    aa, bb = src - mu_a, dst - mu_b
    var = float((aa**2).sum() / count)
    cov = bb.T @ aa / count
    u, singular, vt = np.linalg.svd(cov)
    reflection = np.sign(np.linalg.det(u @ vt))
    diagonal = np.diag([1.0, 1.0, reflection])
    rotation = u @ diagonal @ vt
    scale = float(np.trace(np.diag(singular) @ diagonal) / var)
    translation = mu_b - scale * (rotation @ mu_a)
    return scale, rotation, translation


def apply_points(points: np.ndarray, scale: float, rotation: np.ndarray, translation: np.ndarray) -> np.ndarray:
    return scale * (np.asarray(points, dtype=np.float64) @ rotation.T) + translation


def apply_vectors(vectors: np.ndarray, scale: float, rotation: np.ndarray) -> np.ndarray:
    return scale * (np.asarray(vectors, dtype=np.float64) @ rotation.T)


def rotate_normals(normals: np.ndarray, rotation: np.ndarray) -> np.ndarray:
    spun = np.asarray(normals, dtype=np.float64) @ rotation.T
    length = np.linalg.norm(spun, axis=1, keepdims=True)
    return spun / np.maximum(length, 1e-9)


def outer_faces(mesh: trimesh.Trimesh, tolerance: float) -> trimesh.Trimesh:
    """Keep triangles that sit on the outer envelope. Sinus walls fall inside it."""
    center = mesh.bounding_box.centroid
    centroids = mesh.triangles_center
    delta = centroids - center
    radius = np.linalg.norm(delta, axis=1)
    direction = delta / (radius[:, None] + 1e-9)
    theta = np.arctan2(direction[:, 0], direction[:, 2])
    phi = np.arcsin(np.clip(direction[:, 1], -1.0, 1.0))
    bins_theta, bins_phi = 96, 48
    theta_index = np.clip(((theta + np.pi) / (2 * np.pi) * bins_theta).astype(int), 0, bins_theta - 1)
    phi_index = np.clip(((phi + np.pi / 2) / np.pi * bins_phi).astype(int), 0, bins_phi - 1)
    bin_id = phi_index * bins_theta + theta_index
    max_radius = np.zeros(bins_theta * bins_phi)
    np.maximum.at(max_radius, bin_id, radius)
    grid = max_radius.reshape(bins_phi, bins_theta)
    neighbor = grid.copy()
    rows = np.arange(bins_phi)
    cols = np.arange(bins_theta)
    for row_shift in (-1, 0, 1):
        source = np.clip(rows + row_shift, 0, bins_phi - 1)
        for col_shift in (-1, 0, 1):
            shifted = grid[source][:, (cols - col_shift) % bins_theta]
            neighbor = np.maximum(neighbor, shifted)
    gap = neighbor.reshape(-1)[bin_id] - radius
    kept = trimesh.Trimesh(vertices=mesh.vertices.copy(), faces=mesh.faces[gap <= tolerance], process=False)
    kept.remove_unreferenced_vertices()
    return kept


def decimate(mesh: trimesh.Trimesh, target: int) -> trimesh.Trimesh:
    if len(mesh.faces) <= target:
        return mesh
    points, faces = fast_simplification.simplify(
        np.asarray(mesh.vertices, dtype=np.float64),
        np.asarray(mesh.faces, dtype=np.int32),
        target_count=target,
        agg=2.0,
    )
    return trimesh.Trimesh(vertices=points, faces=faces, process=False)


def bounds(mesh: trimesh.Trimesh) -> tuple[np.ndarray, np.ndarray]:
    low = mesh.vertices.min(0)
    return low, mesh.vertices.max(0) - low


def placed(vertices: np.ndarray, faces: np.ndarray) -> trimesh.Trimesh:
    return trimesh.Trimesh(vertices=vertices, faces=np.asarray(faces), process=False)


def rewrite_labels(scale: float, rotation: np.ndarray, translation: np.ndarray) -> None:
    text = LABEL_PATH.read_text()
    pattern = re.compile(r"\[(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\]")
    triples = [tuple(float(part) for part in match.groups()) for match in pattern.finditer(text)]
    if len(triples) % 2 != 0:
        raise SystemExit(f"expected point/normal pairs in labels, found {len(triples)}")

    def num(value: float) -> str:
        rendered = f"{value:.2f}"
        return "0" if rendered == "-0.00" else rendered

    rebuilt: list[str] = []
    for index in range(0, len(triples), 2):
        point = apply_points(np.array([triples[index]]), scale, rotation, translation)[0]
        normal = rotate_normals(np.array([triples[index + 1]]), rotation)[0]
        rebuilt.append(f"[{num(point[0])}, {num(point[1])}, {num(point[2])}]")
        rebuilt.append(f"[{num(normal[0])}, {num(normal[1])}, {num(normal[2])}]")
    cursor = 0

    def swap(match: re.Match[str]) -> str:
        nonlocal cursor
        value = rebuilt[cursor]
        cursor += 1
        return value

    updated = pattern.sub(swap, text)
    if cursor != len(rebuilt):
        raise SystemExit("label rewrite did not consume every triple")
    LABEL_PATH.write_text(updated)


def rewrite_anchors(scale: float, rotation: np.ndarray, translation: np.ndarray, glb_bytes: int) -> None:
    data = json.loads(ANCHOR_PATH.read_text())
    data["jawPivot"] = [round(float(v), 4) for v in apply_points(np.array([data["jawPivot"]]), scale, rotation, translation)[0]]
    for name, points in data["anchors"].items():
        moved = apply_points(np.array(points, dtype=np.float64), scale, rotation, translation)
        data["anchors"][name] = [[round(float(v), 4) for v in point] for point in moved]
    for orbit in data.get("orbits", []):
        center = apply_points(np.array([orbit["center"]]), scale, rotation, translation)[0]
        orbit["center"] = [round(float(v), 4) for v in center]
        orbit["radius"] = round(float(orbit["radius"]) * scale, 4)
    for mark in data.get("fit", []):
        at = apply_points(np.array([mark["at"]]), scale, rotation, translation)[0]
        mark["at"] = [round(float(v), 4) for v in at]
    for muscle in data.get("muscles", []):
        at = apply_points(np.array([muscle["at"]]), scale, rotation, translation)[0]
        muscle["at"] = [round(float(v), 4) for v in at]
    data["bytes"] = glb_bytes
    ANCHOR_PATH.write_text(json.dumps(data, separators=(",", ":")))
    if NODES_PATH.exists():
        nodes = json.loads(NODES_PATH.read_text())
        nodes["bytes"] = glb_bytes
        NODES_PATH.write_text(json.dumps(nodes, indent=2) + "\n")


def main() -> None:
    scene = trimesh.load(GLB_PATH, force="scene")
    cranium = scene.geometry["cranium"]
    if len(cranium.vertices) < 40000:
        raise SystemExit("cranium is already thinned; refusing to transform it again")
    scale, rotation, translation = similarity(SRC, DST)
    print(f"scale {scale:.4f} det {np.linalg.det(rotation):.3f} t {np.round(translation, 3)}")

    transformed: dict[str, trimesh.Trimesh] = {}
    for name in HEAD:
        mesh = scene.geometry[name]
        vertices = apply_points(mesh.vertices, scale, rotation, translation)
        transformed[name] = placed(vertices, mesh.faces)
        low, size = bounds(transformed[name])
        print(f"  {name:12} before thin  min {np.round(low, 2)} size {np.round(size, 2)}")

    for name, tolerance, target in (("cranium", 0.4, 58000), ("jaw", 1.0, 14000)):
        outer = outer_faces(transformed[name], tolerance)
        thinned = decimate(outer, target)
        before_low, before_size = bounds(outer)
        after_low, after_size = bounds(thinned)
        print(
            f"  {name}: outer {len(outer.faces)} tris -> {len(thinned.faces)} tris, "
            f"verts {len(thinned.vertices)}, size delta {np.round(after_size - before_size, 3)}"
        )
        if np.any(np.abs(after_low - before_low) > 0.25) or np.any(np.abs(after_size - before_size) > 0.35):
            raise SystemExit(f"{name} silhouette moved too far")
        transformed[name] = thinned

    for name, mesh in transformed.items():
        scene.geometry[name] = mesh
    scene.export(GLB_PATH)
    glb_bytes = GLB_PATH.stat().st_size

    attrs = json.loads(MUSCLE_PATH.read_text())
    moves = np.array(attrs["muscles"]["move"], dtype=np.float64).reshape(-1, 3)
    if len(moves) != len(transformed["muscles"].vertices):
        raise SystemExit("muscle move vectors do not match the muscle vertex count")
    spun = apply_vectors(moves, scale, rotation)
    attrs["muscles"]["move"] = [round(float(v), 5) for v in spun.reshape(-1)]
    MUSCLE_PATH.write_text(json.dumps(attrs, separators=(",", ":")))

    rewrite_labels(scale, rotation, translation)
    rewrite_anchors(scale, rotation, translation, glb_bytes)
    print(f"wrote {GLB_PATH.name} {glb_bytes} bytes")


if __name__ == "__main__":
    main()
