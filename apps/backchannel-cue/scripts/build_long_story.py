"""Render the long default story and write stories.json from real durations.

Pauses are placed so cue times stay at least 6.6 seconds apart. The model
is scored on the cumulative turn, and the decisions are printed.
"""

import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

sys.path.insert(0, str(Path(__file__).resolve().parent))
import policy_ref as pr

ROOT = Path(__file__).resolve().parents[1]
RYAN = Path("/tmp/piper-voices/en_US-ryan-medium.onnx")
MODEL = Path("/tmp/bcc-model")
TMP = Path("/tmp/bcc-long-story")
STORY_ID = "long-day"
SETTINGS = dict(pr.DEFAULTS)
SETTINGS["clauseGateBar"] = 0.09
SETTINGS["maxCuesPerMinute"] = 12

BEATS = [
    ("So this morning my car wouldn't start.", "fire"),
    ("So yesterday I was walking down the", "fire"),
    ("side street.", "glue"),
    ("Octopuses actually have three hearts.", "fire"),
    ("It turns out my neighbor is a retired astronaut.", "fire"),
    ("He pulled a rabbit out of his hat on stage.", "fire"),
    ("I just got promoted.", "fire"),
    ("I wanted to tell you about", "fire"),
    ("the new office by the river.", "glue"),
    ("I couldn't go because", "fire"),
    ("the car was still sitting there.", "glue"),
    ("I usually take the bus to work in the morning.", "fire"),
    ("Can you believe that?", "fire"),
]


def synth(text: str, wav: Path) -> None:
    wav.parent.mkdir(parents=True, exist_ok=True)
    if wav.exists() and wav.stat().st_size > 1000:
        return
    subprocess.check_call([
        "python3", "-m", "piper",
        "-m", str(RYAN),
        "-c", str(RYAN.with_suffix(".onnx.json")),
        "--length-scale", "1.0",
        "--noise-scale", "0.667",
        "--noise-w-scale", "0.8",
        "-f", str(wav),
        "--", text,
    ], stdout=subprocess.DEVNULL)


def read_wav(path: Path):
    with wave.open(str(path)) as handle:
        rate = handle.getframerate()
        frames = np.frombuffer(handle.readframes(handle.getnframes()), dtype=np.int16).copy()
        return rate, frames


def write_wav(path: Path, rate: int, samples: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(samples.astype(np.int16).tobytes())


def layout(durations: list[float]):
    cursor = 0.35
    last = None
    placed = []
    for (say, kind), dur in zip(BEATS, durations):
        if kind == "fire" and last is not None:
            earliest = last + 7.6 - dur - 0.45
            if cursor < earliest:
                cursor = earliest
        start, end = cursor, cursor + dur
        placed.append({
            "say": say,
            "kind": kind,
            "start": start,
            "end": end,
            "words": pr.clean(say).split(),
        })
        cursor = end + (1.25 if kind == "fire" else 0.28)
        if kind == "fire":
            last = end + 0.45
    return placed, cursor + 1.6


def load_model():
    meta = json.loads((ROOT / "src/data/meta.json").read_text())
    tok = Tokenizer.from_file(str(MODEL / "tokenizer.json"))
    sess = ort.InferenceSession(str(MODEL / "model.onnx"), providers=["CPUExecutionProvider"])
    return meta, tok, sess


def score(meta, tok, sess, text, seconds, words, cues):
    ids = tok.encode(pr.clean(text)).ids
    if len(ids) > meta["max_tokens"]:
        ids = ids[:1] + ids[-(meta["max_tokens"] - 1):]
    x = np.asarray([ids], np.int64)
    gate, reactions, mood, forms, _echo = sess.run(None, {
        "input_ids": x,
        "attention_mask": np.ones_like(x),
        "timing": np.asarray([pr.timing_features(text, seconds, words, cues)], np.float32),
    })
    return {
        "gate": float(np.ravel(gate)[0]),
        "reactions": dict(zip(meta["reactions"], np.ravel(reactions).tolist())),
        "mood": dict(zip(meta["moods"], np.ravel(mood).tolist())),
        "forms": np.ravel(forms).astype(float).tolist(),
    }


def trace(placed, meta, tok, sess):
    clock = pr.fresh_clock()
    words = []
    rows = []
    for phrase in placed:
        words.extend(phrase["words"])
        if phrase["kind"] != "fire":
            continue
        full = " ".join(words)
        at = phrase["end"] + 0.45
        seconds, since, cues = pr.history_from_clock(full, clock, at)
        scored = score(meta, tok, sess, full, seconds, since, cues)
        verdict, clock = pr.decide_from_scores(full, scored, clock, at, SETTINGS)
        rows.append((at, verdict, " ".join(phrase["words"])))
    return rows


def main() -> None:
    clips = []
    durations = []
    rate = None
    for index, (say, _kind) in enumerate(BEATS):
        wav = TMP / f"line-{index}.wav"
        synth(say, wav)
        rate, samples = read_wav(wav)
        clips.append(samples)
        durations.append(len(samples) / rate)
        print(f"line {index:02d} {durations[-1]:.2f}s {say}")
    placed, total = layout(durations)
    meta, tok, sess = load_model()
    print(f"\nplaced end {total:.2f}s")
    rows = trace(placed, meta, tok, sess)
    for at, verdict, text in rows:
        cue = verdict["cue"] or f"quiet/{verdict['blockedBy'] or verdict['quietBecause']}"
        print(f"t={at:6.2f} {cue:18} {verdict['reaction'] or '-':10} {text}")

    pieces = [np.zeros(int(0.35 * rate), dtype=np.int16)]
    cursor = 0.35
    for phrase, samples in zip(placed, clips):
        gap = int(round((phrase["start"] - cursor) * rate))
        if gap > 0:
            pieces.append(np.zeros(gap, dtype=np.int16))
        pieces.append(samples)
        cursor = phrase["end"]
    tail = int(round((total - cursor) * rate))
    if tail > 0:
        pieces.append(np.zeros(tail, dtype=np.int16))
    mix = np.concatenate(pieces)
    wav_path = TMP / "story.wav"
    write_wav(wav_path, rate, mix)
    opus = ROOT / "public" / "audio" / "stories" / f"{STORY_ID}.opus"
    opus.parent.mkdir(parents=True, exist_ok=True)
    subprocess.check_call([
        "ffmpeg", "-y", "-i", str(wav_path), "-ac", "1", "-c:a", "libopus",
        "-b:a", "32k", "-vbr", "on", "-application", "voip", str(opus),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    words = []
    pauses = []
    for index, phrase in enumerate(placed):
        weights = [max(len(word), 1) for word in phrase["words"]]
        span = max(phrase["end"] - phrase["start"] - 0.08, 0.2)
        running = phrase["start"] + 0.04
        total_w = sum(weights)
        for word, weight in zip(phrase["words"], weights):
            dur = span * weight / total_w
            words.append({"text": word, "start": round(running, 3), "end": round(running + dur, 3)})
            running += dur
        if phrase["kind"] != "fire":
            continue
        nxt = next((item["start"] for item in placed[index + 1:]), None)
        pauses.append({
            "id": f"{STORY_ID}-{index}",
            "phraseEnd": round(phrase["end"], 3),
            "nextStart": None if nxt is None else round(nxt, 3),
            "wordIndex": len(words) - 1,
        })
    story = {
        "id": STORY_ID,
        "title": "A long day",
        "kicker": "A morning that will not sit still.",
        "audio": f"audio/stories/{STORY_ID}.opus",
        "duration": round(len(mix) / rate, 3),
        "words": words,
        "pauses": pauses,
    }
    (ROOT / "src" / "data" / "stories.json").write_text(json.dumps([story], indent=2) + "\n")
    print(f"\nwrote {opus} duration {story['duration']}")


if __name__ == "__main__":
    main()
