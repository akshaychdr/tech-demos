#!/usr/bin/env python3
"""Cut out cab/passengers and measure floor Y positions on plate-tower (1920×1080)."""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "composition" / "art"
SRC = ART / "source"
OUT = ART / "processed"
STAGE_W, STAGE_H = 1920, 1080


def luminance_mask(img: Image.Image, thresh: int = 28) -> Image.Image:
    rgba = img.convert("RGBA")
    arr = np.array(rgba)
    rgb = arr[..., :3].astype(np.float32)
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    alpha = (lum > thresh).astype(np.uint8) * 255
    arr[..., 3] = alpha
    return Image.fromarray(arr)


def rembg_cut(img: Image.Image) -> Image.Image:
    try:
        from rembg import remove

        return remove(img.convert("RGBA"))
    except Exception:
        return luminance_mask(img)


def fit_cover(img: Image.Image, w: int, h: int) -> tuple[Image.Image, float, int, int]:
    """Scale image to cover w×h; return cropped image and scale + offsets."""
    iw, ih = img.size
    scale = max(w / iw, h / ih)
    nw, nh = int(iw * scale), int(ih * scale)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - w) // 2
    top = (nh - h) // 2
    return resized.crop((left, top, left + w, top + h)), scale, left, top


def detect_floors(plate: Image.Image) -> dict:
    """Find floor center Y (1F = bottom) from shaft horizontal banding."""
    from scipy.signal import find_peaks

    arr = np.array(plate.convert("RGB")).astype(np.float32)
    h, w, _ = arr.shape
    x0, x1 = int(w * 0.545), int(w * 0.595)
    cyan = arr[:, x0:x1, 2] - arr[:, x0:x1, 0]
    row = cyan.mean(axis=1)
    row_s = np.convolve(row, np.ones(15) / 15, mode="same")
    y0, y1 = int(h * 0.12), int(h * 0.96)
    seg = row_s[y0:y1]
    peaks, _ = find_peaks(seg, distance=48, prominence=2.5)
    slab_ys = sorted([y0 + int(p) for p in peaks])

    centers_asc = [
        int((slab_ys[i] + slab_ys[i + 1]) / 2) for i in range(len(slab_ys) - 1)
    ]
    if len(centers_asc) >= 2:
        step_top = centers_asc[1] - centers_asc[0]
        step_bot = centers_asc[-1] - centers_asc[-2]
        top = int(centers_asc[0] - step_top * 0.42)
        bottom = int(centers_asc[-1] + step_bot * 0.42)
        chain_asc = [top] + centers_asc + [bottom]
    else:
        chain_asc = centers_asc

    while len(chain_asc) > 9:
        chain_asc.pop(1)
    while len(chain_asc) < 9:
        chain_asc.append(int(chain_asc[-1] + 85))

    ys_sorted = sorted(chain_asc)
    floors = {str(f): int(ys_sorted[9 - f]) for f in range(1, 10)}

    col = arr[:, x0:x1, 2] - arr[:, x0:x1, 0]
    mask = col > 12
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    shaft_left = x0 + int(cols.min()) if len(cols) else int(w * 0.52)
    shaft_right = x0 + int(cols.max()) if len(cols) else int(w * 0.61)
    shaft_top = int(rows.min()) + 120 if len(rows) else int(h * 0.14)
    shaft_bottom = int(rows.max()) if len(rows) else int(h * 0.92)
    sheave_y = shaft_top
    sheave_x = (shaft_left + shaft_right) // 2

    return {
        "stage": {"width": STAGE_W, "height": STAGE_H},
        "floors": floors,
        "floorCount": 9,
        "shaft": {
            "left": shaft_left,
            "right": shaft_right,
            "top": shaft_top,
            "bottom": shaft_bottom,
            "centerX": sheave_x,
            "width": shaft_right - shaft_left,
        },
        "sheave": {"x": sheave_x, "y": sheave_y},
        "callZoneX": int(w * 0.36),
        "labelX": int(w * 0.34),
    }


def trim_alpha(img: Image.Image) -> Image.Image:
    bbox = img.getbbox()
    if bbox:
        return img.crop(bbox)
    return img


def split_passengers(img: Image.Image) -> list[Image.Image]:
    w, h = img.size
    figures: list[Image.Image] = []
    for i in range(4):
        pad = int(w * 0.02)
        a = int(i * w / 4) + pad
        b = int((i + 1) * w / 4) - pad
        crop = img.crop((a, 0, b, h))
        figures.append(trim_alpha(rembg_cut(crop)))
    return figures


def split_cab_doors(closed: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Left and right door panels from closed cab."""
    rgba = rembg_cut(closed)
    rgba = trim_alpha(rgba)
    w, h = rgba.size
    mid = w // 2
    left = rgba.crop((0, 0, mid, h))
    right = rgba.crop((mid, 0, w, h))
    return left, right


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    plate_src = Image.open(SRC / "plate-tower.jpg")
    plate, _, _, _ = fit_cover(plate_src, STAGE_W, STAGE_H)
    plate.save(OUT / "plate-tower-1080p.jpg", quality=92)

    layout = detect_floors(plate)
    (OUT / "layout-measurements.json").write_text(json.dumps(layout, indent=2))

    cab_closed = Image.open(SRC / "cab-closed.jpg")
    cab_open = Image.open(SRC / "cab-open.jpg")
    cab_closed_rgba = trim_alpha(rembg_cut(cab_closed))
    cab_open_rgba = trim_alpha(rembg_cut(cab_open))
    door_l, door_r = split_cab_doors(cab_closed)

    cab_closed_rgba.save(OUT / "cab-closed.png")
    cab_open_rgba.save(OUT / "cab-open.png")
    door_l.save(OUT / "door-left.png")
    door_r.save(OUT / "door-right.png")

    passengers = split_passengers(Image.open(SRC / "passengers.jpg"))
    for i, fig in enumerate(passengers):
        fig.save(OUT / f"passenger-{i + 1}.png")

    # Emit layout.js floor Y array
    floor_ys = [layout["floors"][str(i)] for i in range(1, layout["floorCount"] + 1)]
    js = f"""// Auto-generated by scripts/process-artwork.py — do not hand-edit floor Y values.
export const MEASURED_FLOOR_Y = {json.dumps(floor_ys)};
export const MEASURED_SHAFT = {json.dumps(layout["shaft"])};
export const MEASURED_SHEAVE = {json.dumps(layout["sheave"])};
export const MEASURED_CALL_X = {layout["callZoneX"]};
export const MEASURED_LABEL_X = {layout["labelX"]};
"""
    (ART / "measured-layout.js").write_text(js)
    print(json.dumps(layout, indent=2))
    print(f"Wrote {len(passengers)} passengers, cab PNGs, plate 1080p")


if __name__ == "__main__":
    main()
