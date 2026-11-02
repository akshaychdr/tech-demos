"""Python twin of src/lib/policy.ts. The parity test runs this on the fixture."""

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
META = json.loads((ROOT / "src/data/meta.json").read_text())

DEFAULTS = {
    "clauseGateBar": 0.10,
    "openGateBar": 0.018,
    "echoBar": 0.7,
    "minSpacingSec": 6.0,
    "maxCuesPerMinute": 4,
    "badMoodBlock": 0.3,
    "pauseDelaySec": 0.45,
}

REACTION_BARS = {
    "continuer": 0.15, "receipt": 0.35, "agree": 0.35, "surprise": 0.4, "wow": 0.45,
    "sympathy": 0.4, "praise": 0.45, "laugh": 0.6,
}
REACTION_ORDER = ["continuer", "receipt", "agree", "surprise", "wow", "sympathy", "praise", "laugh"]
ECHOES = {
    "like": "Like what?", "if": "If what?", "about": "About what?", "with": "With?", "for": "For?",
    "to": "To what?", "because": "Because?", "when": "When?", "where": "Where?",
    "which": "Which one?", "and": "And?", "but": "But what?", "into": "Into what?",
    "then": "And then?",
}
NOT_HANGING_AFTER = {
    "to": {"trying", "want", "wanted", "going", "need", "have", "had", "able", "used", "try"},
    "if": {"know", "wonder", "wondering", "see", "ask", "sure", "even", "as", "what"},
    "about": {"thinking", "think", "thought", "talk", "talking", "how"},
    "then": {"back", "since", "by", "until", "till", "just", "now", "even", "from"},
}
OPEN_ENDINGS = set(ECHOES) | {"a", "an", "the", "my", "your", "of", "in", "on", "at", "some", "am", "is", "was"}
FILLER_LIKE_PREV = {
    "was", "is", "were", "am", "are", "be", "been", "being", "just", "so", "really",
    "kinda", "sorta", "kind", "sort", "literally", "actually", "basically", "totally", "honestly", "know",
}
MID_FORMS = ("mhm", "yeah", "uh-huh")
QUESTION_START = re.compile(r"^(what|who|whom|whose|why|which)\b")
AUX_REQUEST = re.compile(r"^(can|could|would|will|shall|should|do|did|does|are|is|was|were|have|has|had)\s+(you|i|we|it|there|he|she|they)\b")
WH_AUX = re.compile(r"^(when|where|how)\s+(do|did|does|is|are|was|were|can|could|would|will|should|have|has|had)\b")
FORMS = META["forms"]
FORM_REACTIONS = META["form_reactions"]


def clean(text: str) -> str:
    words = re.sub(r"[^a-z' -]", " ", text.lower().replace("’", "'").replace("‘", "'")).split()
    kept = [word.strip("-'") for word in words if word.strip("-'")]
    return " ".join(kept[-30:])


def word_count(text: str) -> int:
    cleaned = clean(text)
    return 0 if not cleaned else len(cleaned.split())


REQUEST = re.compile(r"\b(can|could|would|will) you\b|\b(do|did) you know\b")
QUESTION_CLAUSE = re.compile(
    r"^(what|who|whom|whose|why|which|when|where|how)\s+(is|are|was|were|do|did|does|can|could|would|will|should|have|has|had|time|about)\b"
)


def looks_like_question(text: str) -> bool:
    return bool(
        QUESTION_START.search(text)
        or AUX_REQUEST.search(text)
        or WH_AUX.search(text)
        or REQUEST.search(text)
    )


def is_direct_question(text: str) -> bool:
    cleaned = clean(text)
    if not cleaned:
        return False
    if looks_like_question(cleaned):
        return True
    tail = cleaned.split()[-8:]
    return any(
        bool(QUESTION_CLAUSE.search(slice_) or AUX_REQUEST.search(slice_) or WH_AUX.search(slice_) or REQUEST.search(slice_))
        for slice_ in (" ".join(tail[index:]) for index in range(len(tail)))
    )


def timing_features(text, seconds_since_cue, words_since_cue, cues_this_turn):
    count = word_count(text)
    since = min(120.0 if seconds_since_cue is None else seconds_since_cue, 120.0)
    words = min(count if words_since_cue is None else words_since_cue, 300)
    return [
        math.log1p(count / 3.0), math.log1p(count), math.log1p(since),
        math.log1p(words), min(cues_this_turn, 6) / 3.0,
    ]


def fresh_clock():
    return {"lastCueAt": None, "wordsAtCue": 0, "cueTimes": []}


def history_from_clock(text, clock, now_sec):
    if clock["lastCueAt"] is None:
        return None, None, 0
    return now_sec - clock["lastCueAt"], word_count(text) - clock["wordsAtCue"], len(clock["cueTimes"])


def spoken_form(form: str) -> str:
    return form.capitalize() + "."


def argmax_index(indices, values):
    best = indices[0]
    for index in indices:
        if values[index] > values[best]:
            best = index
    return best


def forms_for(reaction):
    return [i for i, form in enumerate(FORMS) if FORM_REACTIONS.get(form) == reaction]


def hanging(text):
    words = clean(text).split()
    if not words or words[-1] not in ECHOES:
        return None
    last = words[-1]
    prev = words[-2] if len(words) > 1 else ""
    if last == "like" and (len(words) == 1 or prev in FILLER_LIKE_PREV):
        return {"phrase": ECHOES[last], "blocked": "filler-like"}
    if prev in NOT_HANGING_AFTER.get(last, ()):
        return None
    return {"phrase": ECHOES[last], "blocked": None}


def is_open(text):
    words = clean(text).split()
    return bool(words) and words[-1] in OPEN_ENDINGS


def decide_from_scores(text, scores, clock, now_sec, settings=None):
    settings = {**DEFAULTS, **(settings or {})}
    reactions = scores["reactions"]
    mood = scores["mood"]
    forms = scores["forms"]
    echo_score = reactions.get("echo", 0.0)
    hang = hanging(text)
    open_clause = is_open(text)
    gate_bar = settings["openGateBar"] if open_clause else settings["clauseGateBar"]

    def finish(cue, candidate, blocked_by, quiet_because, reaction):
        verdict = {
            "cue": cue,
            "candidate": candidate,
            "blockedBy": blocked_by,
            "quietBecause": quiet_because,
            "reaction": reaction,
            "echoBlocked": None if hang is None else hang["blocked"],
            "clean": clean(text),
        }
        if not cue:
            return verdict, clock
        return verdict, {
            "lastCueAt": now_sec,
            "wordsAtCue": word_count(text),
            "cueTimes": [*clock["cueTimes"], now_sec],
        }

    if not clean(text):
        return finish(None, None, None, "empty", None)
    if is_direct_question(text):
        return finish(None, None, None, "question", None)

    candidate = None
    reaction = None
    if hang and not hang["blocked"] and echo_score >= settings["echoBar"]:
        candidate = hang["phrase"]
        reaction = "echo"
    elif scores["gate"] < gate_bar:
        return finish(None, None, None, "gate", None)
    elif open_clause:
        if reactions.get("continuer", 0.0) < REACTION_BARS["continuer"]:
            return finish(None, None, None, "no-reaction", None)
        indices = [FORMS.index(form) for form in MID_FORMS]
        candidate = spoken_form(FORMS[argmax_index(indices, forms)])
        reaction = "continuer"
    else:
        allowed = []
        for name in REACTION_ORDER:
            score = reactions.get(name, 0.0)
            if score < REACTION_BARS[name]:
                continue
            if name in ("laugh", "praise", "wow") and mood.get("bad", 0.0) > settings["badMoodBlock"]:
                continue
            if name == "laugh" and (mood.get("funny", 0.0) < 0.5 or reactions.get("sympathy", 0.0) > 0.25):
                continue
            allowed.append((name, score))
        specific = [item for item in allowed if item[0] != "continuer"]
        pool = specific or [item for item in allowed if item[0] == "continuer"]
        if not pool:
            return finish(None, None, None, "no-reaction", None)
        chosen = pool[0]
        for item in pool[1:]:
            if item[1] > chosen[1]:
                chosen = item
        indices = forms_for(chosen[0]) or forms_for("continuer")
        candidate = spoken_form(FORMS[argmax_index(indices, forms)])
        reaction = chosen[0]

    blocked = None
    if clock["lastCueAt"] is not None and now_sec - clock["lastCueAt"] < settings["minSpacingSec"]:
        blocked = "spacing"
    elif sum(1 for t in clock["cueTimes"] if now_sec - t < 60) >= settings["maxCuesPerMinute"]:
        blocked = "rate"
    if blocked:
        return finish(None, candidate, blocked, None, reaction)
    return finish(candidate, candidate, None, None, reaction)


def walk(steps, settings=None):
    clock = fresh_clock()
    out = []
    for step in steps:
        verdict, clock = decide_from_scores(step["text"], step, clock, step.get("t", 0), settings)
        out.append({"id": step["id"], **verdict})
    return out


def main():
    import sys
    fixture = json.loads(Path(sys.argv[1]).read_text())
    settings = fixture.get("settings", DEFAULTS)
    sentences = []
    for row in fixture["sentences"]:
        verdict, _clock = decide_from_scores(row["text"], row, fresh_clock(), 0, settings)
        sentences.append({"id": row["id"], **verdict})
    report = {
        "sentences": sentences,
        "monologue": walk(fixture["monologue"], settings),
        "rate": walk(fixture["rate"], settings),
    }
    json.dump(report, sys.stdout)


if __name__ == "__main__":
    main()
