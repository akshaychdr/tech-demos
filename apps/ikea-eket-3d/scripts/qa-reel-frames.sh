#!/usr/bin/env bash
set -euo pipefail
VIDEO="${1:?video path}"
OUT_DIR="$(dirname "$VIDEO")/qa-frames"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
ffmpeg -y -i "$VIDEO" -vf "fps=1/3" "$OUT_DIR/frame-%03d.png" 2>/dev/null
COUNT=$(ls -1 "$OUT_DIR"/*.png 2>/dev/null | wc -l)
echo "Extracted $COUNT frames (every 3s) to $OUT_DIR"
if [ "$COUNT" -lt 10 ]; then
  echo "WARN: expected more frames for 45s+ video"
  exit 1
fi
