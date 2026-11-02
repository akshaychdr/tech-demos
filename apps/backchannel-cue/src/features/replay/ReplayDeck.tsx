import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { CueEngine } from "@/lib/model"
import { cueSlug, explainVerdict, presentCue, type PolicySettings } from "@/lib/policy"
import { assetUrl, buildTrace, stories, type Story, type TraceStep } from "@/lib/replay"
import { Pause, Play } from "lucide-react"

const PLAYLIST = ["bad-morning", "hard-news", "dont-answer"]

type Buffers = {
  narration: AudioBuffer
  cues: Map<string, AudioBuffer>
}

type Running = {
  ctx: AudioContext
  origin: number
  nodes: AudioBufferSourceNode[]
}

export function ReplayDeck({
  engine,
  settings,
}: {
  engine: CueEngine
  settings: PolicySettings
}) {
  const playlist = PLAYLIST.map((id) => stories.find((story) => story.id === id)).filter((story): story is Story => Boolean(story))
  const [story, setStory] = useState<Story>(playlist[0] ?? stories[0]!)
  const [trace, setTrace] = useState<TraceStep[] | null>(null)
  const [audioReady, setAudioReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const buffers = useRef<Buffers | null>(null)
  const running = useRef<Running | null>(null)
  const traceRef = useRef<TraceStep[] | null>(null)
  const timeRef = useRef(0)
  traceRef.current = trace
  timeRef.current = time

  useEffect(() => {
    let cancel = false
    const ctx = new AudioContext()
    setTrace(null)
    setAudioReady(false)
    setError(null)
    setPlaying(false)
    setTime(0)
    timeRef.current = 0
    setOpenId(null)
    buffers.current = null
    halt(running.current)
    running.current = null

    void (async () => {
      try {
        const steps = await buildTrace(story, settings, (text, clock, now) => engine.score(text, clock, now))
        if (cancel) return
        const narration = await decodeUrl(ctx, assetUrl(story.audio))
        const cues = new Map<string, AudioBuffer>()
        for (const step of steps) {
          if (!step.verdict.cue || cues.has(step.verdict.cue)) continue
          cues.set(step.verdict.cue, await decodeUrl(ctx, assetUrl(`audio/cues/${cueSlug(step.verdict.cue)}.opus`)))
        }
        if (cancel) return
        buffers.current = { narration, cues }
        running.current = { ctx, origin: 0, nodes: [] }
        setTrace(steps)
        setAudioReady(true)
      } catch (reason) {
        if (!cancel) setError(reason instanceof Error ? reason.message : "Could not prepare the story")
      }
    })()

    return () => {
      cancel = true
      halt(running.current)
      running.current = null
      void ctx.close()
    }
  }, [engine, settings, story])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const live = running.current
      const duration = buffers.current?.narration.duration ?? story.duration
      if (live && live.ctx.state === "running") {
        const next = Math.min(duration, Math.max(0, live.ctx.currentTime - live.origin))
        timeRef.current = next
        setTime(next)
        if (next >= duration - 0.05) {
          setPlaying(false)
          return
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, story.duration])

  function play() {
    const live = running.current
    const ready = buffers.current
    const steps = traceRef.current
    if (!live || !ready || !steps) return
    halt(live)
    const duration = ready.narration.duration
    const offset = timeRef.current >= duration - 0.08 ? 0 : timeRef.current
    if (offset === 0) {
      timeRef.current = 0
      setTime(0)
    }
    const now = live.ctx.currentTime
    live.origin = now - offset
    const narration = live.ctx.createBufferSource()
    narration.buffer = ready.narration
    narration.connect(live.ctx.destination)
    narration.start(now, offset)
    narration.onended = () => {
      if (!live.nodes.includes(narration)) return
      timeRef.current = duration
      setTime(duration)
      setPlaying(false)
    }
    const nodes = [narration]
    for (const step of steps) {
      if (!step.verdict.cue || step.at < offset - 0.03) continue
      const buffer = ready.cues.get(step.verdict.cue)
      if (!buffer) continue
      const source = live.ctx.createBufferSource()
      const gain = live.ctx.createGain()
      gain.gain.value = 1
      source.buffer = buffer
      source.connect(gain)
      gain.connect(live.ctx.destination)
      source.start(now + Math.max(0, step.at - offset))
      nodes.push(source)
    }
    live.nodes = nodes
    void live.ctx.resume()
    setPlaying(true)
  }

  function pause() {
    const live = running.current
    if (!live) return
    if (live.ctx.state === "running") {
      const next = Math.max(0, live.ctx.currentTime - live.origin)
      timeRef.current = next
      setTime(next)
    }
    halt(live)
    setPlaying(false)
  }

  const revealed = trace?.filter((step) => step.at <= time + 0.04) ?? []
  const latestSpoken = [...revealed].reverse().find((step) => step.verdict.cue)?.id ?? null

  useEffect(() => {
    if (latestSpoken) setOpenId(latestSpoken)
  }, [latestSpoken])
  const schedule = (trace ?? [])
    .filter((step) => step.verdict.cue)
    .map((step) => ({
      at: Number(step.at.toFixed(3)),
      cue: step.verdict.cue,
      file: `${cueSlug(step.verdict.cue!)}.opus`,
    }))
  const duration = buffers.current?.narration.duration || story.duration || 1
  const openStep = trace?.find((step) => step.id === openId) ?? null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Stories">
        {playlist.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStory(item)}
            className={`rounded-full px-3 py-1 text-sm ${item.id === story.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
          >
            {item.title}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Button
          type="button"
          size="lg"
          className="h-11 px-5"
          disabled={!audioReady}
          data-testid="replay-play"
          data-audio-state={playing ? "playing" : audioReady ? "ready" : "loading"}
          onClick={() => (playing ? pause() : play())}
        >
          {playing ? <Pause /> : <Play />}
          {playing ? "Pause" : "Play"}
        </Button>
        <div className="min-w-0 flex-1">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${Math.min(100, (time / duration) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground" data-testid={audioReady ? "trace-ready" : "trace-pending"}>
            {error ? error : audioReady ? story.kicker : "Scoring the pauses and loading both voices…"}
          </p>
        </div>
        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground" data-testid="story-time">
          {time.toFixed(1)}s
        </span>
      </div>

      <p className="text-xl leading-9" data-testid="cue-log">
        {story.words.map((word, index) => {
          const said = word.start <= time
          const current = said && (story.words[index + 1]?.start ?? Number.POSITIVE_INFINITY) > time
          const here = revealed.filter((step) => step.wordIndex === index)
          return (
            <span key={`${word.start}-${word.text}`}>
              <span className={current ? "font-medium text-foreground" : said ? "text-foreground/70" : "text-foreground/25"}>
                {word.text}{" "}
              </span>
              {here.map((step) => (
                <Reaction
                  key={step.id}
                  step={step}
                  open={openId === step.id}
                  onToggle={() => setOpenId((currentId) => (currentId === step.id ? "" : step.id))}
                />
              ))}
            </span>
          )
        })}
      </p>
      {openStep ? (
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground" data-testid="decision-reason">
          {explainVerdict(openStep.verdict, settings)}
          <span className="mt-1 block text-xs">
            Gate {openStep.verdict.gate.toFixed(3)} · bar {openStep.verdict.gateBar.toFixed(3)}
            {topMood(openStep.verdict.mood)}
          </span>
        </p>
      ) : null}
      <pre className="sr-only" data-testid="cue-schedule">
        {JSON.stringify({ story: story.audio, cues: schedule })}
      </pre>
    </div>
  )
}

function Reaction({
  step,
  open,
  onToggle,
}: {
  step: TraceStep
  open: boolean
  onToggle: () => void
}) {
  const spoken = step.verdict.cue
  return (
    <button
      type="button"
      onClick={onToggle}
      data-testid={spoken ? "cue-bubble" : "quiet-mark"}
      aria-expanded={open}
      className={`mx-0.5 inline-flex rounded-full px-2.5 py-0.5 align-middle text-sm font-medium ${
        spoken ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      } ${open ? "ring-2 ring-primary/40" : ""}`}
    >
      {spoken ? presentCue(spoken) : "quiet"}
    </button>
  )
}

function topMood(mood: Record<string, number>) {
  const top = Object.entries(mood).sort((a, b) => b[1] - a[1])[0]
  return top ? ` · mood ${top[0]} ${top[1].toFixed(2)}` : ""
}

async function decodeUrl(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Missing audio ${url}`)
  const bytes = await response.arrayBuffer()
  return ctx.decodeAudioData(bytes.slice(0))
}

function halt(live: Running | null) {
  if (!live) return
  for (const node of live.nodes) {
    try {
      node.onended = null
      node.stop()
    } catch {
      // already stopped
    }
  }
  live.nodes = []
}
