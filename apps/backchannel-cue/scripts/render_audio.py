"""Render listener cues and story narration with Piper, then write stories.json."""

import json
import subprocess
import wave
from pathlib import Path

import numpy as np

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from policy_ref import (  # noqa: E402
    DEFAULTS,
    FORMS,
    decide_from_scores,
    fresh_clock,
    history_from_clock,
    timing_features,
)

ROOT = Path(__file__).resolve().parents[1]
VOICES = Path("/tmp/piper-voices")
LESSAC = VOICES / "en_US-lessac-medium.onnx"
RYAN = VOICES / "en_US-ryan-medium.onnx"
MODEL = Path("/tmp/bcc-model/model.onnx")
CUE_DIR = ROOT / "public" / "audio" / "cues"
STORY_DIR = ROOT / "public" / "audio" / "stories"
TMP = Path("/tmp/bcc-audio")

ECHOES = [
    "Like what?", "If what?", "About what?", "With?", "For?", "To what?", "Because?",
    "When?", "Where?", "Which one?", "And?", "But what?", "Into what?", "And then?",
]

SAY = {
    "mhm": "Mm-hmm.",
    "uh-huh": "Uh-huh.",
    "hmm": "Hmm.",
    "haha": "Ha ha.",
    "ooh": "Ooh.",
    "aw": "Aw.",
    "huh": "Huh?",
    "oh": "Oh.",
    "wow": "Wow!",
    "really": "Really?",
    "oh really": "Oh, really?",
    "is that right": "Is that right?",
    "no way": "No way.",
    "yeah": "Yeah.",
    "yep": "Yep.",
    "yes": "Yes.",
    "right": "Right.",
    "okay": "Okay.",
    "oh no": "Oh no.",
    "oh dear": "Oh dear.",
    "uh-oh": "Uh-oh.",
    "nice": "Nice.",
    "good": "Good.",
    "great": "Great.",
    "cool": "Cool.",
    "true": "True.",
    "sure": "Sure.",
    "exactly": "Exactly.",
    "absolutely": "Absolutely.",
    "definitely": "Definitely.",
    "interesting": "Interesting.",
    "man": "Man.",
    "jeez": "Jeez.",
    "gosh": "Gosh.",
    "aw": "Aw.",
    "that's great": "That's great.",
    "that's cool": "That's cool.",
    "that's good": "That's good.",
    "that's right": "That's right.",
    "that's true": "That's true.",
    "well that's good": "Well, that's good.",
    "oh i see": "Oh, I see.",
    "oh i know": "Oh, I know.",
    "oh uh-huh": "Oh, uh-huh.",
    "yeah it is": "Yeah, it is.",
    "i see": "I see.",
    "i know": "I know.",
    "i agree": "I agree.",
    "oh yeah": "Oh yeah.",
    "oh okay": "Oh, okay.",
    "oh wow": "Oh, wow.",
    "oh good": "Oh, good.",
    "oh my": "Oh my.",
    "oh boy": "Oh boy.",
    "oh gosh": "Oh gosh.",
    "my goodness": "My goodness.",
    "for sure": "For sure.",
    "there you go": "There you go.",
    "me too": "Me too.",
    "gotcha": "Gotcha.",
    "got you": "Got you.",
    "alright": "Alright.",
}


def slug(cue: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in cue)
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned.strip("-")


def spoken_form(form: str) -> str:
    return form.capitalize() + "."


def say_for(form: str) -> str:
    if form in SAY:
        return SAY[form]
    words = []
    for index, word in enumerate(form.split()):
        words.append("I" if word == "i" else (word.capitalize() if index == 0 else word))
    return " ".join(words) + "."


def synth(model: Path, text: str, wav: Path, length: float, reuse: bool = False) -> None:
    wav.parent.mkdir(parents=True, exist_ok=True)
    if reuse and wav.exists() and wav.stat().st_size > 800:
        return
    subprocess.check_call([
        "python3", "-m", "piper",
        "-m", str(model),
        "-c", str(model.with_suffix(".onnx.json")),
        "--length-scale", str(length),
        "--noise-scale", "0.667",
        "--noise-w-scale", "0.8",
        "-f", str(wav),
        "--", text,
    ], stdout=subprocess.DEVNULL)


def read_wav(path: Path):
    with wave.open(str(path)) as handle:
        rate = handle.getframerate()
        frames = handle.readframes(handle.getnframes())
        return rate, np.frombuffer(frames, dtype=np.int16).copy()


def write_wav(path: Path, rate: int, samples: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(samples.astype(np.int16).tobytes())


def to_opus(wav: Path, opus: Path, bitrate: str) -> None:
    opus.parent.mkdir(parents=True, exist_ok=True)
    subprocess.check_call([
        "ffmpeg", "-y", "-i", str(wav), "-ac", "1", "-c:a", "libopus",
        "-b:a", bitrate, "-vbr", "on", "-application", "voip", str(opus),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def render_cues() -> None:
    cues = [(spoken_form(form), say_for(form)) for form in FORMS]
    cues += [(echo, echo) for echo in ECHOES]
    print(f"cues {len(cues)}")
    for policy, say in cues:
        name = slug(policy)
        wav = TMP / "cues" / f"{name}.wav"
        synth(LESSAC, say, wav, 1.12, reuse=True)
        to_opus(wav, CUE_DIR / f"{name}.opus", "24k")


STORIES = [
    {
        "id": "hard-news",
        "title": "Hard news",
        "kicker": "Sympathy, then a pause the rule keeps quiet.",
        "lines": [
            ("My grandmother passed away on Sunday.", "fire"),
            ("She was the one who taught me to bake.", "suppress"),
            ("I lost my job this morning.", "fire"),
        ],
    },
    {
        "id": "good-news",
        "title": "Good news",
        "kicker": "Praise when the clause actually finishes.",
        "lines": [
            ("I just got promoted.", "fire"),
            ("We got the keys to the apartment today.", "fire"),
        ],
    },
    {
        "id": "bad-morning",
        "title": "A bad morning",
        "kicker": "Oh no, a blocked pile-up, then an echo, then the turn.",
        "lines": [
            ("So this morning my car wouldn't start.", "fire"),
            ("And I was already late for the big meeting.", "suppress"),
            ("And my phone died on the bus.", "suppress"),
            ("So I walked in soaking wet and I wanted to tell them about", "fire"),
            ("the delay, but my boss just laughed and handed me a towel.", "suppress"),
            ("And then she told me the client loved our proposal.", "suppress"),
            ("And they signed the contract for the whole year.", "fire"),
        ],
    },
    {
        "id": "tell-you-about",
        "title": "Tell you about",
        "kicker": "The sentence stops on a hanging word.",
        "lines": [
            ("I've been waiting to say this.", "skip"),
            ("I wanted to tell you about", "fire"),
            ("the offer they made me yesterday.", "fire"),
        ],
    },
    {
        "id": "dont-answer",
        "title": "Don't answer",
        "kicker": "A real question should not get a backchannel.",
        "lines": [
            ("I'm heading out in a minute.", "fire"),
            ("Can you tell me the weather tomorrow?", "show"),
            ("What time is it?", "show"),
        ],
    },
]


def place(lines, durations):
    from policy_ref import clean

    cursor = 0.18
    last_fire = None
    placed = []
    for (say, intent), duration in zip(lines, durations):
        if intent == "fire" and last_fire is not None:
            earliest = last_fire + 6.25 - duration - 0.45
            if cursor < earliest:
                cursor = earliest
        start = cursor
        end = start + duration
        cue_at = end + 0.45
        if intent == "fire":
            last_fire = cue_at
            gap = 1.4
        elif intent == "suppress":
            gap = 1.05
        elif intent == "show":
            gap = 1.35
        else:
            gap = 0.22
        placed.append({
            "say": say,
            "words": clean(say).split(),
            "intent": intent,
            "start": start,
            "end": end,
            "gap": gap,
        })
        cursor = end + gap
    return placed, cursor


def build_story(spec) -> dict:
    from policy_ref import clean

    wavs = []
    durations = []
    rate = None
    for index, (say, _intent) in enumerate(spec["lines"]):
        wav = TMP / "lines" / f"{spec['id']}-{index}.wav"
        synth(RYAN, say, wav, 1.0, reuse=False)
        rate, samples = read_wav(wav)
        wavs.append(samples)
        durations.append(len(samples) / rate)
    placed, total = place(spec["lines"], durations)
    pieces = []
    cursor = 0.0
    lead = int(0.18 * rate)
    pieces.append(np.zeros(lead, dtype=np.int16))
    cursor = 0.18
    for phrase, samples in zip(placed, wavs):
        gap_samples = int(round((phrase["start"] - cursor) * rate))
        if gap_samples > 0:
            pieces.append(np.zeros(gap_samples, dtype=np.int16))
        pieces.append(samples)
        cursor = phrase["end"]
    tail = int(round((total + 1.8 - cursor) * rate))
    if tail > 0:
        pieces.append(np.zeros(tail, dtype=np.int16))
    mix = np.concatenate(pieces)
    wav_path = TMP / "stories" / f"{spec['id']}.wav"
    write_wav(wav_path, rate, mix)
    to_opus(wav_path, STORY_DIR / f"{spec['id']}.opus", "32k")

    words = []
    pauses = []
    for index, phrase in enumerate(placed):
        weights = [max(len(word), 1) for word in phrase["words"]]
        span = max(phrase["end"] - phrase["start"] - 0.08, 0.2)
        begin = phrase["start"] + 0.04
        total_w = sum(weights)
        running = begin
        first = len(words)
        for word, weight in zip(phrase["words"], weights):
            dur = span * weight / total_w
            words.append({"text": word, "start": round(running, 3), "end": round(running + dur, 3)})
            running += dur
        if phrase["intent"] == "skip":
            continue
        next_start = placed[index + 1]["start"] if index + 1 < len(placed) else None
        pauses.append({
            "id": f"{spec['id']}-{index}",
            "phraseEnd": round(phrase["end"], 3),
            "nextStart": None if next_start is None else round(next_start, 3),
            "wordIndex": len(words) - 1,
        })
        _ = first
    return {
        "id": spec["id"],
        "title": spec["title"],
        "kicker": spec["kicker"],
        "audio": f"audio/stories/{spec['id']}.opus",
        "duration": round(len(mix) / rate, 3),
        "words": words,
        "pauses": pauses,
    }


def trace(stories):
    import onnxruntime as ort
    from tokenizers import Tokenizer

    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    tokenizer = Tokenizer.from_file("/tmp/bcc-model/tokenizer.json")
    meta = json.loads((ROOT / "src/data/meta.json").read_text())
    model = ort.InferenceSession(str(MODEL), options, providers=["CPUExecutionProvider"])

    def score(text, seconds, words, cues):
        from policy_ref import clean
        ids = tokenizer.encode(clean(text)).ids
        if len(ids) > meta["max_tokens"]:
            ids = ids[:1] + ids[-(meta["max_tokens"] - 1):]
        import numpy as np
        input_ids = np.asarray([ids], dtype=np.int64)
        timing = np.asarray([timing_features(text, seconds, words, cues)], dtype=np.float32)
        gate, reactions, mood, forms, _echo = model.run(None, {
            "input_ids": input_ids,
            "attention_mask": np.ones_like(input_ids),
            "timing": timing,
        })
        return {
            "gate": float(np.ravel(gate)[0]),
            "reactions": dict(zip(meta["reactions"], np.ravel(reactions).tolist())),
            "mood": dict(zip(meta["moods"], np.ravel(mood).tolist())),
            "forms": np.ravel(forms).astype(float).tolist(),
        }

    for story in stories:
        print(f"\n== {story['id']} {story['duration']}s ==")
        clock = fresh_clock()
        for pause in story["pauses"]:
            gap = 999 if pause["nextStart"] is None else pause["nextStart"] - pause["phraseEnd"]
            if gap < DEFAULTS["pauseDelaySec"]:
                print(f"  skip gap {gap:.2f}")
                continue
            at = pause["phraseEnd"] + DEFAULTS["pauseDelaySec"]
            text = " ".join(word["text"] for word in story["words"][: pause["wordIndex"] + 1])
            seconds, words, cues = history_from_clock(text, clock, at)
            scored = score(text, seconds, words, cues)
            verdict, clock = decide_from_scores(text, scored, clock, at, DEFAULTS)
            print(
                f"  t={at:6.2f} gate={scored['gate']:.3f} {verdict['cue'] or 'quiet':16} "
                f"{verdict['blockedBy'] or verdict['quietBecause'] or verdict['reaction']}"
            )


def main():
    render_cues()
    stories = [build_story(spec) for spec in STORIES]
    out = ROOT / "src" / "data" / "stories.json"
    out.write_text(json.dumps(stories, indent=2))
    print(f"wrote {out}")
    trace(stories)


if __name__ == "__main__":
    main()
