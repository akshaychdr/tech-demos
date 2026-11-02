import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import fixture from "../fixtures/prototype-scores.json"
import {
  clean,
  decideFromScores,
  freshClock,
  isDirectQuestion,
  type PolicySettings,
  type Scores,
  wordCount,
} from "../src/lib/policy"

const settings = fixture.settings as PolicySettings

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

type Step = Scores & { id: string; text: string; t?: number }

type PyVerdict = {
  id: string
  cue: string | null
  candidate: string | null
  blockedBy: "spacing" | "rate" | null
  quietBecause: "empty" | "question" | "gate" | "no-reaction" | null
  reaction: string | null
  echoBlocked: "filler-like" | null
  clean: string
}

function walk(steps: Step[]) {
  let clock = freshClock()
  return steps.map((step) => {
    const { verdict, clock: next } = decideFromScores(step.text, step, clock, step.t ?? 0, settings)
    clock = next
    return { id: step.id, verdict }
  })
}

function comparable(verdict: PyVerdict | ReturnType<typeof decideFromScores>["verdict"]) {
  return {
    cue: verdict.cue,
    candidate: verdict.candidate,
    blockedBy: verdict.blockedBy,
    quietBecause: verdict.quietBecause,
    reaction: verdict.reaction,
    echoBlocked: verdict.echoBlocked,
  }
}

describe("python policy parity", () => {
  const py = spawnSync("python3", ["scripts/policy_ref.py", "fixtures/prototype-scores.json"], {
    cwd: root,
    encoding: "utf8",
  })

  it("runs the python reference", () => {
    expect(py.status, py.stderr).toBe(0)
  })

  const report = py.status === 0 ? (JSON.parse(py.stdout) as {
    sentences: PyVerdict[]
    monologue: PyVerdict[]
    rate: PyVerdict[]
  }) : null

  it("matches python on every prototype sentence", () => {
    expect(report).not.toBeNull()
    const ts = (fixture.sentences as Step[]).map((step) => {
      const { verdict } = decideFromScores(step.text, step, freshClock(), 0, settings)
      return { id: step.id, verdict, clean: clean(step.text) }
    })
    expect(ts.map((row) => row.id)).toEqual(report!.sentences.map((row) => row.id))
    ts.forEach((row, index) => {
      const pyRow = report!.sentences[index]!
      expect(comparable(row.verdict), row.id).toEqual(comparable(pyRow))
      expect(row.clean, row.id).toBe(pyRow.clean)
    })
  })

  it("matches python on the prototype monologue, including 6s suppression", () => {
    expect(report).not.toBeNull()
    const ts = walk(fixture.monologue as Step[])
    ts.forEach((row, index) => {
      expect(comparable(row.verdict), row.id).toEqual(comparable(report!.monologue[index]!))
    })
    expect(ts.some((row) => row.verdict.blockedBy === "spacing")).toBe(true)
    expect(ts.some((row) => row.verdict.cue === "About what?")).toBe(true)
  })

  it("matches python on the per-minute cap", () => {
    expect(report).not.toBeNull()
    const ts = walk(fixture.rate as Step[])
    ts.forEach((row, index) => {
      expect(comparable(row.verdict), row.id).toEqual(comparable(report!.rate[index]!))
    })
    expect(ts[4]?.verdict.blockedBy).toBe("rate")
    expect(ts[4]?.verdict.candidate).toBe("Oh no.")
    expect(ts.slice(0, 4).every((row) => row.verdict.cue === "Oh no.")).toBe(true)
  })
})

describe("prototype behavior", () => {
  function cueFor(text: string) {
    const step = (fixture.sentences as Step[]).find((row) => row.text === text)
    if (!step) throw new Error(`missing fixture sentence: ${text}`)
    return decideFromScores(text, step, freshClock(), 0, settings).verdict
  }

  it("answers sad news with oh no, not a laugh", () => {
    expect(cueFor("my dad got really sick last week").cue).toBe("Oh no.")
    expect(cueFor("i lost my job this morning and i don't know what to do").cue).toBe("Oh no.")
    expect(cueFor("my grandmother passed away on sunday").cue).toBe("Oh no.")
  })

  it("echoes a hanging word and blocks filler like", () => {
    expect(cueFor("i wanted to tell you about").cue).toBe("About what?")
    expect(cueFor("we were talking and").cue).toBe("And?")
    expect(cueFor("i couldn't go because").cue).toBe("Because?")
    expect(cueFor("it was like").cue).not.toBe("Like what?")
    expect(cueFor("it was like").echoBlocked).toBe("filler-like")
    expect(cueFor("so i was like").cue).not.toBe("Like what?")
    expect(cueFor("and it was like really big you know like").cue).not.toBe("Like what?")
    expect(cueFor("i was wondering if").cue).not.toBe("If what?")
    expect(cueFor("i'm trying to").cue).not.toBe("To what?")
  })

  it("hears a request that shows up after other words", () => {
    expect(isDirectQuestion("i'm heading out in a minute can you tell me the weather tomorrow")).toBe(true)
    expect(isDirectQuestion("what time is it")).toBe(true)
    expect(isDirectQuestion("when i was a kid we moved to ohio")).toBe(false)
    expect(isDirectQuestion("i wanted to tell you about")).toBe(false)
    expect(isDirectQuestion("i lost my job this morning and i don't know what to do")).toBe(false)
  })

  it("stays quiet on direct questions", () => {
    for (const text of [
      "what time is it",
      "can you tell me the weather tomorrow",
      "do you know where my keys are",
    ]) {
      const verdict = cueFor(text)
      expect(verdict.cue, text).toBeNull()
      expect(verdict.quietBecause, text).toBe("question")
    }
  })

  it("keeps an unfinished clause to mhm, yeah, or uh-huh", () => {
    const verdict = cueFor("so yesterday i was walking down the")
    expect(verdict.cue && ["Mhm.", "Yeah.", "Uh-huh."]).toContain(verdict.cue)
    expect(cueFor("and then my manager said that the").quietBecause).toBe("gate")
  })

  it("cleans to the newest 30 lowercase words", () => {
    const words = Array.from({ length: 40 }, (_, index) => `w${"x".repeat(index + 1)}`)
    expect(wordCount(words.join(" "))).toBe(30)
    expect(clean(words.join(" ")).startsWith(words[10]!)).toBe(true)
    expect(clean(`  "Hello," WORLD! `)).toBe("hello world")
    expect(clean("I’m trying")).toBe("i'm trying")
  })
})
