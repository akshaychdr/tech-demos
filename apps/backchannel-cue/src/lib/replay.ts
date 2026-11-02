import {
  decideFromScores,
  freshClock,
  type Clock,
  type PolicySettings,
  type Scores,
  type Verdict,
} from "@/lib/policy"
import storiesJson from "@/data/stories.json"

export type StoryWord = { text: string; start: number; end: number }

export type StoryPause = {
  id: string
  phraseEnd: number
  nextStart: number | null
  wordIndex: number
}

export type Story = {
  id: string
  title: string
  kicker: string
  audio: string
  duration: number
  words: StoryWord[]
  pauses: StoryPause[]
}

export type TraceStep = {
  id: string
  at: number
  wordIndex: number
  text: string
  verdict: Verdict
}

export const stories = storiesJson as Story[]

export function audiblePauses(story: Story, delaySec: number) {
  return story.pauses.flatMap((pause) => {
    const gap = pause.nextStart == null ? Number.POSITIVE_INFINITY : pause.nextStart - pause.phraseEnd
    if (gap + 1e-3 < delaySec) return []
    return [{ ...pause, at: pause.phraseEnd + delaySec }]
  })
}

export async function buildTrace(
  story: Story,
  settings: PolicySettings,
  score: (text: string, clock: Clock, nowSec: number) => Promise<Scores>,
): Promise<TraceStep[]> {
  const moments = audiblePauses(story, settings.pauseDelaySec)
  let clock = freshClock()
  const steps: TraceStep[] = []
  for (const moment of moments) {
    const text = story.words
      .slice(0, moment.wordIndex + 1)
      .map((word) => word.text)
      .join(" ")
    const scores = await score(text, clock, moment.at)
    const decided = decideFromScores(text, scores, clock, moment.at, settings)
    clock = decided.clock
    steps.push({
      id: moment.id,
      at: moment.at,
      wordIndex: moment.wordIndex,
      text,
      verdict: decided.verdict,
    })
  }
  return steps
}

export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL
  return `${base}${path.replace(/^\//, "")}`
}
