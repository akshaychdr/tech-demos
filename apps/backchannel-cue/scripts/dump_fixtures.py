"""Score the prototype sentences with the fp32 model and write the parity fixture."""

import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

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
MODEL_DIR = Path("/tmp/bcc-model")
META = json.loads((ROOT / "src/data/meta.json").read_text())

SENTENCES = [
    ("sad", "my dad got really sick last week"),
    ("sad", "we had to put our dog down yesterday"),
    ("sad", "i lost my job this morning and i don't know what to do"),
    ("sad", "my grandmother passed away on sunday"),
    ("good", "i just got the job offer i was hoping for"),
    ("good", "we finally closed on the house today"),
    ("good", "my sister had a healthy baby girl last night"),
    ("funny", "so the cat jumped on the table and knocked the cake right onto my boss"),
    ("funny", "i walked into a glass door in front of the whole office"),
    ("funny", "he showed up to the wedding wearing pajamas"),
    ("surprise", "octopuses actually have three hearts"),
    ("surprise", "it turns out my neighbor is a retired astronaut"),
    ("surprise", "the whole bridge was built in just six weeks"),
    ("fragment", "so yesterday i was walking down the"),
    ("fragment", "and then my manager said that the"),
    ("fragment", "we were going to go to the"),
    ("hanging", "i wanted to tell you about"),
    ("hanging", "it was like"),
    ("hanging", "i was wondering if"),
    ("hanging", "we were talking and"),
    ("hanging", "i couldn't go because"),
    ("hanging", "i'm trying to"),
    ("question", "what time is it"),
    ("question", "can you tell me the weather tomorrow"),
    ("question", "do you know where my keys are"),
    ("neutral", "so yesterday we finally moved into the new apartment"),
    ("neutral", "i usually take the bus to work in the morning"),
    ("neutral", "we went to the store and bought some groceries"),
    ("filler", "and it was like really big you know like"),
    ("filler", "so i was like"),
]

MONOLOGUE = [
    (2.5, "so this morning my car wouldn't start"),
    (6.0, "and i was already late for the big meeting"),
    (9.0, "and then it started pouring rain"),
    (12.5, "and my phone died on the bus"),
    (17.5, "so i walked in soaking wet and i wanted to tell them about"),
    (22.5, "the delay but my boss just laughed and handed me a towel"),
    (27.0, "and then she told me the client loved our proposal"),
    (31.0, "and they signed the contract for the whole year"),
]


def session():
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    tokenizer = Tokenizer.from_file(str(MODEL_DIR / "tokenizer.json"))
    model = ort.InferenceSession(str(MODEL_DIR / "model.onnx"), options, providers=["CPUExecutionProvider"])
    return tokenizer, model


def score(tokenizer, model, text, seconds, words, cues):
    from policy_ref import clean

    cleaned = clean(text)
    ids = tokenizer.encode(cleaned).ids
    if len(ids) > META["max_tokens"]:
        ids = ids[:1] + ids[-(META["max_tokens"] - 1):]
    input_ids = np.asarray([ids], dtype=np.int64)
    timing = np.asarray([timing_features(text, seconds, words, cues)], dtype=np.float32)
    gate, reactions, mood, forms, _echo = model.run(None, {
        "input_ids": input_ids,
        "attention_mask": np.ones_like(input_ids),
        "timing": timing,
    })
    return {
        "gate": float(np.ravel(gate)[0]),
        "reactions": dict(zip(META["reactions"], np.ravel(reactions).tolist())),
        "mood": dict(zip(META["moods"], np.ravel(mood).tolist())),
        "forms": np.ravel(forms).astype(float).tolist(),
        "tokens": ids,
    }


def pack(row_id, text, scored, t):
    return {"id": row_id, "text": text, "t": t, **scored}


def synthetic_rate():
    """Five pauses, 6s apart, each one a clear sympathy cue. The fifth hits the per-minute cap."""
    forms = [0.0] * len(FORMS)
    forms[FORMS.index("oh no")] = 0.9
    forms[FORMS.index("mhm")] = 0.2
    reactions = {name: 0.0 for name in META["reactions"]}
    reactions["sympathy"] = 0.95
    reactions["continuer"] = 0.99
    mood = {"neutral": 0.0, "bad": 1.0, "good": 0.0, "funny": 0.0}
    steps = []
    for index in range(5):
        steps.append({
            "id": f"rate-{index}",
            "text": "my dad got really sick last week",
            "t": index * 6.0,
            "gate": 0.4,
            "reactions": reactions,
            "mood": mood,
            "forms": forms,
        })
    return steps


def main():
    tokenizer, model = session()
    sentences = []
    for index, (cat, text) in enumerate(SENTENCES):
        scored = score(tokenizer, model, text, None, None, 0)
        sentences.append(pack(f"{cat}-{index}", text, scored, 0))

    monologue = []
    clock = fresh_clock()
    full = ""
    for index, (t, segment) in enumerate(MONOLOGUE):
        full = (full + " " + segment).strip()
        seconds, words, cues = history_from_clock(full, clock, t)
        scored = score(tokenizer, model, full, seconds, words, cues)
        step = pack(f"mono-{index}", full, scored, t)
        monologue.append(step)
        _verdict, clock = decide_from_scores(full, step, clock, t, DEFAULTS)

    fixture = {
        "settings": DEFAULTS,
        "sentences": [{k: v for k, v in row.items() if k != "tokens"} | {"tokens": row["tokens"]} for row in sentences],
        "monologue": [{k: v for k, v in row.items() if k != "tokens"} for row in monologue],
        "rate": synthetic_rate(),
    }
    out = ROOT / "fixtures" / "prototype-scores.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(fixture))
    print(f"wrote {out} ({out.stat().st_size} bytes)")

    print("\nsentences")
    for row in sentences:
        verdict, _ = decide_from_scores(row["text"], row, fresh_clock(), 0, DEFAULTS)
        print(f"{row['id']:16} {verdict['cue'] or 'quiet':16} {verdict['quietBecause'] or verdict['blockedBy'] or verdict['reaction']}")

    print("\nmonologue")
    clock = fresh_clock()
    for row in monologue:
        verdict, clock = decide_from_scores(row["text"], row, clock, row["t"], DEFAULTS)
        tail = " ".join(row["text"].split()[-8:])
        print(f"t={row['t']:5} {verdict['cue'] or 'quiet':16} {verdict['blockedBy'] or verdict['quietBecause'] or verdict['reaction']:12} …{tail}")


if __name__ == "__main__":
    main()
