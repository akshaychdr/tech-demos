import meta from "@/data/meta.json"

/** Card defaults, with the clause-end gate lifted from 0.09 to 0.10. */
export const defaultSettings = {
  clauseGateBar: 0.1,
  openGateBar: 0.018,
  echoBar: 0.7,
  minSpacingSec: 6,
  maxCuesPerMinute: 4,
  badMoodBlock: 0.3,
  pauseDelaySec: 0.45,
}

export type PolicySettings = typeof defaultSettings

const REACTION_BARS: Record<string, number> = {
  continuer: 0.15,
  receipt: 0.35,
  agree: 0.35,
  surprise: 0.4,
  wow: 0.45,
  sympathy: 0.4,
  praise: 0.45,
  laugh: 0.6,
}

const REACTION_ORDER = [
  "continuer",
  "receipt",
  "agree",
  "surprise",
  "wow",
  "sympathy",
  "praise",
  "laugh",
] as const

const ECHOES: Record<string, string> = {
  like: "Like what?",
  if: "If what?",
  about: "About what?",
  with: "With?",
  for: "For?",
  to: "To what?",
  because: "Because?",
  when: "When?",
  where: "Where?",
  which: "Which one?",
  and: "And?",
  but: "But what?",
  into: "Into what?",
  then: "And then?",
}

const NOT_HANGING_AFTER: Record<string, readonly string[]> = {
  to: ["trying", "want", "wanted", "going", "need", "have", "had", "able", "used", "try"],
  if: ["know", "wonder", "wondering", "see", "ask", "sure", "even", "as", "what"],
  about: ["thinking", "think", "thought", "talk", "talking", "how"],
  then: ["back", "since", "by", "until", "till", "just", "now", "even", "from"],
}

const OPEN_ENDINGS = new Set([
  ...Object.keys(ECHOES),
  "a",
  "an",
  "the",
  "my",
  "your",
  "of",
  "in",
  "on",
  "at",
  "some",
  "am",
  "is",
  "was",
])

const FILLER_LIKE_PREV = new Set([
  "was",
  "is",
  "were",
  "am",
  "are",
  "be",
  "been",
  "being",
  "just",
  "so",
  "really",
  "kinda",
  "sorta",
  "kind",
  "sort",
  "literally",
  "actually",
  "basically",
  "totally",
  "honestly",
  "know",
])

const MID_FORMS = ["mhm", "yeah", "uh-huh"] as const

const QUESTION_START = /^(what|who|whom|whose|why|which)\b/
const AUX_REQUEST =
  /^(can|could|would|will|shall|should|do|did|does|are|is|was|were|have|has|had)\s+(you|i|we|it|there|he|she|they)\b/
const WH_AUX =
  /^(when|where|how)\s+(do|did|does|is|are|was|were|can|could|would|will|should|have|has|had)\b/

const FORMS = meta.forms
const FORM_REACTIONS = meta.form_reactions as Record<string, string>

export type Scores = {
  gate: number
  reactions: Record<string, number>
  mood: Record<string, number>
  forms: number[]
}

export type Clock = {
  lastCueAt: number | null
  wordsAtCue: number
  cueTimes: number[]
}

export type Verdict = {
  cue: string | null
  candidate: string | null
  blockedBy: "spacing" | "rate" | null
  quietBecause: "empty" | "question" | "gate" | "no-reaction" | null
  reaction: string | null
  echoBlocked: "filler-like" | null
  echoText: string | null
  echoScore: number
  gate: number
  gateBar: number
  openClause: boolean
  topReactions: { name: string; score: number }[]
  topForms: { name: string; score: number }[]
  mood: Record<string, number>
}

export function freshClock(): Clock {
  return { lastCueAt: null, wordsAtCue: 0, cueTimes: [] }
}

/** Lowercase words, punctuation stripped, newest 30. Matches example.py `clean`. */
export function clean(text: string): string {
  const normalized = text.toLowerCase().replaceAll("’", "'").replaceAll("‘", "'")
  const rough = normalized.replace(/[^a-z' -]/g, " ").trim()
  if (!rough) return ""
  const kept: string[] = []
  for (const word of rough.split(/\s+/)) {
    const trimmed = word.replace(/^[-']+|[-']+$/g, "")
    if (trimmed) kept.push(trimmed)
  }
  return kept.slice(-30).join(" ")
}

export function wordCount(text: string): number {
  const cleaned = clean(text)
  return cleaned ? cleaned.split(" ").length : 0
}

const REQUEST = /\b(can|could|would|will) you\b|\b(do|did) you know\b/
const QUESTION_CLAUSE =
  /^(what|who|whom|whose|why|which|when|where|how)\s+(is|are|was|were|do|did|does|can|could|would|will|should|have|has|had|time|about)\b/

function looksLikeQuestion(text: string): boolean {
  return QUESTION_START.test(text) || AUX_REQUEST.test(text) || WH_AUX.test(text) || REQUEST.test(text)
}

export function isDirectQuestion(text: string): boolean {
  const cleaned = clean(text)
  if (!cleaned) return false
  if (looksLikeQuestion(cleaned)) return true
  const words = cleaned.split(" ")
  const tail = words.slice(-8)
  for (let index = 0; index < tail.length; index += 1) {
    const slice = tail.slice(index).join(" ")
    if (QUESTION_CLAUSE.test(slice) || AUX_REQUEST.test(slice) || WH_AUX.test(slice) || REQUEST.test(slice)) {
      return true
    }
  }
  return false
}

export function timingFeatures(
  text: string,
  secondsSinceCue: number | null,
  wordsSinceCue: number | null,
  cuesThisTurn: number,
): number[] {
  const count = wordCount(text)
  const since = Math.min(secondsSinceCue == null ? 120 : secondsSinceCue, 120)
  const words = Math.min(wordsSinceCue == null ? count : wordsSinceCue, 300)
  return [
    Math.log1p(count / 3),
    Math.log1p(count),
    Math.log1p(since),
    Math.log1p(words),
    Math.min(cuesThisTurn, 6) / 3,
  ]
}

export function historyFromClock(text: string, clock: Clock, nowSec: number) {
  if (clock.lastCueAt == null) {
    return { secondsSinceCue: null as number | null, wordsSinceCue: null as number | null, cuesThisTurn: 0 }
  }
  return {
    secondsSinceCue: nowSec - clock.lastCueAt,
    wordsSinceCue: wordCount(text) - clock.wordsAtCue,
    cuesThisTurn: clock.cueTimes.length,
  }
}

function spokenForm(form: string): string {
  return form.charAt(0).toUpperCase() + form.slice(1) + "."
}

function argmaxIndex(indices: number[], values: number[]): number {
  let best = indices[0] ?? 0
  for (const index of indices) {
    if ((values[index] ?? -Infinity) > (values[best] ?? -Infinity)) best = index
  }
  return best
}

function formsFor(reaction: string): number[] {
  const indices: number[] = []
  FORMS.forEach((form, index) => {
    if (FORM_REACTIONS[form] === reaction) indices.push(index)
  })
  return indices
}

function hanging(text: string): { phrase: string; blocked: "filler-like" | null } | null {
  const words = clean(text).split(" ").filter(Boolean)
  if (words.length === 0) return null
  const last = words[words.length - 1] ?? ""
  const phrase = ECHOES[last]
  if (!phrase) return null
  const prev = words.length > 1 ? words[words.length - 2] ?? "" : ""
  if (last === "like" && (words.length === 1 || FILLER_LIKE_PREV.has(prev))) {
    return { phrase, blocked: "filler-like" }
  }
  const blockers = NOT_HANGING_AFTER[last]
  if (blockers?.includes(prev)) return null
  return { phrase, blocked: null }
}

function openClause(text: string): boolean {
  const words = clean(text).split(" ").filter(Boolean)
  const last = words[words.length - 1]
  return Boolean(last && OPEN_ENDINGS.has(last))
}

/**
 * Deterministic port of example.py `decide`, plus the prototype fixes:
 * argmax wording, direct questions stay quiet, mid-sentence is only
 * mhm/yeah/uh-huh, filler "like" does not echo, and spacing / rate limits
 * suppress a cue without hiding what it would have been.
 * Continuer saturates near 1, so a specific reaction that clears its bar wins.
 */
export function decideFromScores(
  text: string,
  scores: Scores,
  clock: Clock,
  nowSec: number,
  settings: PolicySettings = defaultSettings,
): { verdict: Verdict; clock: Clock } {
  const echoScore = scores.reactions.echo ?? 0
  const topReactions = Object.entries(scores.reactions)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
  const topForms = scores.forms
    .map((score, index) => ({ name: FORMS[index] ?? "", score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  const hang = hanging(text)
  const open = openClause(text)
  const gateBar = open ? settings.openGateBar : settings.clauseGateBar

  const base = {
    echoBlocked: hang?.blocked ?? null,
    echoText: hang?.phrase ?? null,
    echoScore,
    gate: scores.gate,
    gateBar,
    openClause: open,
    topReactions,
    topForms,
    mood: scores.mood,
  }

  const finish = (
    partial: Pick<Verdict, "cue" | "candidate" | "blockedBy" | "quietBecause" | "reaction">,
  ) => {
    const verdict: Verdict = { ...base, ...partial }
    if (!verdict.cue) return { verdict, clock }
    return {
      verdict,
      clock: {
        lastCueAt: nowSec,
        wordsAtCue: wordCount(text),
        cueTimes: [...clock.cueTimes, nowSec],
      },
    }
  }

  if (!clean(text)) {
    return finish({
      cue: null,
      candidate: null,
      blockedBy: null,
      quietBecause: "empty",
      reaction: null,
    })
  }

  if (isDirectQuestion(text)) {
    return finish({
      cue: null,
      candidate: null,
      blockedBy: null,
      quietBecause: "question",
      reaction: null,
    })
  }

  let candidate: string | null = null
  let reaction: string | null = null

  if (hang && !hang.blocked && echoScore >= settings.echoBar) {
    candidate = hang.phrase
    reaction = "echo"
  } else if (scores.gate < gateBar) {
    return finish({
      cue: null,
      candidate: null,
      blockedBy: null,
      quietBecause: "gate",
      reaction: null,
    })
  } else if (open) {
    if ((scores.reactions.continuer ?? 0) < REACTION_BARS.continuer) {
      return finish({
        cue: null,
        candidate: null,
        blockedBy: null,
        quietBecause: "no-reaction",
        reaction: null,
      })
    }
    const indices = MID_FORMS.map((form) => FORMS.indexOf(form))
    candidate = spokenForm(FORMS[argmaxIndex(indices, scores.forms)] ?? "mhm")
    reaction = "continuer"
  } else {
    const allowed: { name: string; score: number }[] = []
    for (const name of REACTION_ORDER) {
      const score = scores.reactions[name] ?? 0
      if (score < REACTION_BARS[name]) continue
      if (
        (name === "laugh" || name === "praise" || name === "wow") &&
        (scores.mood.bad ?? 0) > settings.badMoodBlock
      ) {
        continue
      }
      if (name === "laugh" && ((scores.mood.funny ?? 0) < 0.5 || (scores.reactions.sympathy ?? 0) > 0.25)) {
        continue
      }
      allowed.push({ name, score })
    }
    const specific = allowed.filter((item) => item.name !== "continuer")
    const chosen = specific.length > 0 ? best(specific) : allowed.find((item) => item.name === "continuer")
    if (!chosen) {
      return finish({
        cue: null,
        candidate: null,
        blockedBy: null,
        quietBecause: "no-reaction",
        reaction: null,
      })
    }
    const indices = formsFor(chosen.name)
    const fallback = formsFor("continuer")
    const pool = indices.length > 0 ? indices : fallback
    candidate = spokenForm(FORMS[argmaxIndex(pool, scores.forms)] ?? "mhm")
    reaction = chosen.name
  }

  let blockedBy: Verdict["blockedBy"] = null
  if (clock.lastCueAt != null && nowSec - clock.lastCueAt < settings.minSpacingSec) {
    blockedBy = "spacing"
  } else {
    const recent = clock.cueTimes.filter((time) => nowSec - time < 60).length
    if (recent >= settings.maxCuesPerMinute) blockedBy = "rate"
  }

  if (blockedBy) {
    return finish({
      cue: null,
      candidate,
      blockedBy,
      quietBecause: null,
      reaction,
    })
  }

  return finish({
    cue: candidate,
    candidate,
    blockedBy: null,
    quietBecause: null,
    reaction,
  })
}

function best(items: { name: string; score: number }[]): { name: string; score: number } {
  let winner = items[0]
  for (const item of items) {
    if (item.score > winner.score) winner = item
  }
  return winner
}

export function presentCue(cue: string): string {
  const pretty: Record<string, string> = {
    "Oh i see.": "Oh, I see.",
    "Oh i know.": "Oh, I know.",
    "Oh uh-huh.": "Oh, uh-huh.",
    "Yeah it is.": "Yeah, it is.",
    "Well that's good.": "Well, that's good.",
    "That's great.": "That's great.",
    "That's cool.": "That's cool.",
    "That's good.": "That's good.",
    "That's right.": "That's right.",
    "That's true.": "That's true.",
  }
  return pretty[cue] ?? cue
}

export function cueSlug(cue: string): string {
  return cue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

const RATE_WINDOW_SEC = 60

export function explainVerdict(verdict: Verdict, settings: PolicySettings = defaultSettings): string {
  if (verdict.quietBecause === "empty") return "Nothing to respond to yet."
  if (verdict.quietBecause === "question") {
    return "Stayed quiet. This is a direct question, so a backchannel would sound like an answer."
  }
  if (verdict.quietBecause === "gate") {
    return `Stayed quiet. Gate ${verdict.gate.toFixed(3)} is under the ${verdict.openClause ? "mid-sentence" : "clause-end"} bar ${verdict.gateBar.toFixed(3)}.`
  }
  if (verdict.quietBecause === "no-reaction") {
    return "Stayed quiet. The gate opened, but no allowed reaction cleared its bar."
  }
  if (verdict.blockedBy === "spacing" && verdict.candidate) {
    return `Would have said “${presentCue(verdict.candidate)}”, but the last cue was under ${settings.minSpacingSec.toFixed(0)} seconds ago.`
  }
  if (verdict.blockedBy === "rate" && verdict.candidate) {
    return `Would have said “${presentCue(verdict.candidate)}”, but that’s more than ${settings.maxCuesPerMinute} cues in ${RATE_WINDOW_SEC} seconds.`
  }
  if (verdict.cue) {
    const echoNote =
      verdict.echoBlocked === "filler-like"
        ? " Filler “like” blocked an echo."
        : ""
    const kind =
      verdict.reaction === "echo"
        ? "an echo, because the sentence was left hanging"
        : verdict.openClause
          ? "a mid-sentence continuer"
          : verdict.reaction
    return `Said “${presentCue(verdict.cue)}” — ${kind}.${echoNote}`
  }
  return "Stayed quiet."
}
