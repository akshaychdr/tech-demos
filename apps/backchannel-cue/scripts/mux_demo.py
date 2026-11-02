"""Mux narration and cue clips onto a Playwright screen recording.

The page clock and this mix share the story timeline. offsetSec is the
recording time when Play was pressed, so the voices start with the highlight.
"""

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def probe_duration(path: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        text=True,
    )
    return float(out.strip())


def main() -> None:
    video = Path(sys.argv[1])
    sync = json.loads((ROOT / "test-results" / "sync.json").read_text())
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "test-results" / "story-with-voices.mp4"
    video_dur = probe_duration(video)
    offset_ms = int(round(float(sync["offsetSec"]) * 1000))
    story = ROOT / "public" / sync["story"]
    cues = sync["cues"]

    inputs = ["-i", str(story)]
    filters = [f"[0:a]aresample=48000,adelay={offset_ms}|{offset_ms},volume=1[a0]"]
    labels = ["[a0]"]
    for index, cue in enumerate(cues, start=1):
        inputs += ["-i", str(ROOT / "public" / "audio" / "cues" / cue["file"])]
        at_ms = offset_ms + int(round(float(cue["at"]) * 1000))
        filters.append(f"[{index}:a]aresample=48000,adelay={at_ms}|{at_ms},volume=1.2[a{index}]")
        labels.append(f"[a{index}]")
    filters.append(
        f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:dropout_transition=0:normalize=0,"
        f"apad=whole_dur={video_dur:.3f},alimiter=limit=0.95[a]"
    )
    video_index = 1 + len(cues)
    cmd = [
        "ffmpeg", "-y",
        *inputs,
        "-i", str(video),
        "-filter_complex", ";".join(filters),
        "-map", f"{video_index}:v:0",
        "-map", "[a]",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "veryfast",
        "-crf", "20",
        "-c:a", "aac",
        "-b:a", "160k",
        "-movflags", "+faststart",
        "-shortest",
        str(out),
    ]
    subprocess.check_call(cmd)
    print(out)


if __name__ == "__main__":
    main()
