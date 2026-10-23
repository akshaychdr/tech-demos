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


def detect_shaft_x(arr: np.ndarray) -> tuple[int, int]:
    """Cyan glow column of the elevator shaft (stage coordinates)."""
    h, w, _ = arr.shape
    cyan = arr[:, :, 2] - arr[:, :, 0]
    col_score = cyan.mean(axis=0)
    x_start = int(w * 0.55)
    region = col_score[x_start:]
    thresh = np.percentile(region, 98.5)
    xs = np.where(region > thresh)[0] + x_start
    if len(xs) < 10:
        return int(w * 0.68), int(w * 0.75)
    return int(xs.min()), int(xs.max())


def detect_floors(plate: Image.Image) -> dict:
    """Floor center Y (1F = bottom) from evenly spaced lit bands in the shaft."""
    from scipy.signal import find_peaks

    arr = np.array(plate.convert("RGB")).astype(np.float32)
    h, w, _ = arr.shape
    shaft_left, shaft_right = detect_shaft_x(arr)
    cx0 = shaft_left + int((shaft_right - shaft_left) * 0.15)
    cx1 = shaft_right - int((shaft_right - shaft_left) * 0.15)
    bright = arr[:, cx0:cx1].mean(axis=1).mean(axis=1)
    row_s = np.convolve(bright, np.ones(11) / 11, mode="same")
    y0, y1 = int(h * 0.14), int(h * 0.94)
    seg = row_s[y0:y1]
    peaks, _ = find_peaks(seg, distance=65, prominence=3.0)
    band_ys = sorted([y0 + int(p) for p in peaks])

    centers_asc = [
        int((band_ys[i] + band_ys[i + 1]) / 2) for i in range(len(band_ys) - 1)
    ]
    if len(centers_asc) >= 2:
        step = float(np.median(np.diff(centers_asc)))
        top = int(centers_asc[0] - step * 0.5)
        bottom = int(centers_asc[-1] + step * 0.5)
        chain_asc = [top] + centers_asc + [bottom]
    else:
        chain_asc = centers_asc

    while len(chain_asc) > 9:
        chain_asc.pop(1)
    while len(chain_asc) < 9:
        chain_asc.append(int(chain_asc[-1] + 90))

    ys_sorted = sorted(chain_asc)
    y_bottom = int(ys_sorted[-1])
    y_top = int(ys_sorted[0])
    even_ys = [int(round(y_bottom - (y_bottom - y_top) * i / 8)) for i in range(9)]
    floors = {str(f): even_ys[f - 1] for f in range(1, 10)}

    sheave_x = (shaft_left + shaft_right) // 2
    sheave_y = int(h * 0.11)
    hall_x = shaft_left - 32
    label_x = shaft_left - 175
    call_x = shaft_left - 66

    return {
        "stage": {"width": STAGE_W, "height": STAGE_H},
        "floors": floors,
        "floorCount": 9,
        "shaft": {
            "left": shaft_left,
            "right": shaft_right,
            "top": sheave_y,
            "bottom": int(h * 0.93),
            "centerX": sheave_x,
            "width": shaft_right - shaft_left,
        },
        "sheave": {"x": sheave_x, "y": sheave_y},
        "hallPanelX": hall_x,
        "callZoneX": call_x,
        "labelX": label_x,
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
export const MEASURED_HALL_X = {layout["hallPanelX"]};
export const MEASURED_CALL_X = {layout["callZoneX"]};
export const MEASURED_LABEL_X = {layout["labelX"]};
"""
    (ART / "measured-layout.js").write_text(js)
    print(json.dumps(layout, indent=2))
    print(f"Wrote {len(passengers)} passengers, cab PNGs, plate 1080p")


if __name__ == "__main__":
    main()
