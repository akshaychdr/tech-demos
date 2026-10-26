#!/usr/bin/env bash
set -euo pipefail
MP4="${1:-out/elevator-install-3d-reel.mp4}"
OUT_DIR="${2:-/tmp/reel-qa-frames}"
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.png
DUR=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$MP4")
echo "Reel duration: ${DUR}s"
for t in $(seq 0 3 $(printf '%.0f' "$DUR")); do
  ffmpeg -y -ss "$t" -i "$MP4" -frames:v 1 -q:v 2 "$OUT_DIR/frame-$(printf '%03d' "$t")s.png" 2>/dev/null
done
for f in "$OUT_DIR"/*.png; do
  base=$(basename "$f")
  t="${base#frame-}"
  t="${t%s.png}"
  bytes=$(wc -c <"$f")
  if [ "$bytes" -lt 18000 ]; then
    echo "FAIL: frame too small: $f ($bytes bytes)"
    exit 1
  fi
  # Skip title card (0–3s); main scenes must not be washed out
  if [ "$t" -ge 12 ]; then
    mean=$(ffmpeg -i "$f" -vf "scale=32:18,format=gray" -f rawvideo - 2>/dev/null | od -An -tu1 | awk '{s+=$1;n++}END{if(n)print int(s/n);else print 0}')
    if [ "${mean:-0}" -lt 14 ]; then
      echo "FAIL: frame too dark: $f mean~$mean"
      exit 1
    fi
  fi
done
echo "OK: $(ls "$OUT_DIR"/*.png | wc -l) frames passed checks in $OUT_DIR"
