#!/usr/bin/env bash
set -euo pipefail
MP4="${1:-out/elevator-install-3d-reel.mp4}"
OUT_DIR="${2:-/tmp/reel-qa-frames}"
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.png
DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$MP4")
echo "Reel duration: ${DUR}s"
for t in $(seq 0 5 $(printf '%.0f' "$DUR")); do
  ffmpeg -y -ss "$t" -i "$MP4" -frames:v 1 -q:v 2 "$OUT_DIR/frame-$(printf '%03d' "$t")s.png" 2>/dev/null
done
# Fail if any frame is tiny (empty/navy-only)
for f in "$OUT_DIR"/*.png; do
  bytes=$(wc -c <"$f")
  if [ "$bytes" -lt 12000 ]; then
    echo "FAIL: frame too small (likely empty): $f ($bytes bytes)"
    exit 1
  fi
done
echo "OK: $(ls "$OUT_DIR"/*.png | wc -l) frames passed size check in $OUT_DIR"
