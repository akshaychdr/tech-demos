import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import type { CueEngine } from "@/lib/model"
import { explainVerdict, presentCue, type PolicySettings, type Verdict } from "@/lib/policy"
import { assetUrl, buildTrace, stories, type Story, type TraceStep } from "@/lib/replay"
import { Pause, Play } from "lucide-react"

export function ReplayDeck({
  engine,
  settings,
  onVerdict,
  onCue,
  onHearing,
  onPrime,
}: {
  engine: CueEngine
  settings: PolicySettings
  onVerdict: (verdict: Verdict | null) => void
  onCue: (cue: string) => void
  onHearing: (hearing: boolean) => void
  onPrime: () => void
}) {
  const [story, setStory] = useState<Story>(
    () => stories.find((item) => item.id === "bad-morning") ?? stories[0]!,
  )
  const [trace, setTrace] = useState<TraceStep[] | null>(null)
  const [traceError, setTraceError] = useState<string | null>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const played = useRef(new Set<string>())
  const onVerdictRef = useRef(onVerdict)
  const onCueRef = useRef(onCue)
  onVerdictRef.current = onVerdict
  onCueRef.current = onCue

  useEffect(() => {
    let cancel = false
    setTrace(null)
    setTraceError(null)
    setPlaying(false)
    setTime(0)
    played.current.clear()
    onVerdictRef.current(null)
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.src = assetUrl(story.audio)
      audio.load()
    }
    void buildTrace(story, settings, (text, clock, now) => engine.score(text, clock, now))
      .then((steps) => {
        if (!cancel) setTrace(steps)
      })
      .catch((error: unknown) => {
        if (!cancel) setTraceError(error instanceof Error ? error.message : "Could not score this story")
      })
    return () => {
      cancel = true
    }
  }, [engine, settings, story])

  useEffect(() => {
    onHearing(playing)
  }, [onHearing, playing])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      const audio = audioRef.current
      if (audio) setTime(audio.currentTime)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  useEffect(() => {
    if (!trace) return
    for (const id of played.current) {
      const step = trace.find((item) => item.id === id)
      if (step && step.at > time + 0.08) played.current.delete(id)
    }
    const visible = trace.filter((step) => step.at <= time + 0.04)
    onVerdictRef.current(visible[visible.length - 1]?.verdict ?? null)
    for (const step of visible) {
      if (played.current.has(step.id)) continue
      played.current.add(step.id)
      if (step.verdict.cue) onCueRef.current(step.verdict.cue)
    }
  }, [time, trace])

  const revealed = trace?.filter((step) => step.at <= time + 0.04) ?? []

  async function toggle() {
    const audio = audioRef.current
    if (!audio || !trace) return
    onPrime()
    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }
    if (audio.currentTime >= (story.duration || audio.duration || 0) - 0.05) {
      audio.currentTime = 0
      played.current.clear()
      setTime(0)
    }
    await audio.play()
    setPlaying(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {stories.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStory(item)}
            className={`max-w-64 rounded-2xl border px-3 py-2 text-left ${
              item.id === story.id ? "border-primary bg-primary/10" : "bg-card hover:bg-muted"
            }`}
          >
            <span className="block text-sm font-medium">{item.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{item.kicker}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" size="lg" onClick={() => void toggle()} disabled={!trace} data-testid="replay-play">
          {playing ? <Pause /> : <Play />}
          {playing ? "Pause" : "Play"}
        </Button>
        <input
          aria-label="Story position"
          className="h-1 flex-1 accent-primary"
          type="range"
          min={0}
          max={story.duration || 1}
          step={0.01}
          value={Math.min(time, story.duration || 0)}
          onChange={(event) => {
            const next = Number(event.target.value)
            const audio = audioRef.current
            if (audio) audio.currentTime = next
            setTime(next)
          }}
        />
        <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
          {time.toFixed(1)}s
        </span>
      </div>
      <p className="text-xs text-muted-foreground" data-testid={trace ? "trace-ready" : "trace-pending"}>
        {traceError
          ? traceError
          : trace
            ? "Replay is scored on the story clock, so the same story always cues the same way."
            : "Scoring each pause with the model…"}
      </p>

      <p className="min-h-16 text-lg leading-relaxed">
        {story.words.map((word, index) => {
          const said = word.start <= time
          const current = said && (story.words[index + 1]?.start ?? Infinity) > time
          return (
            <span key={`${word.start}-${word.text}`} className={current ? "font-medium text-foreground" : said ? "text-foreground/55" : "text-foreground/25"}>
              {word.text}{" "}
            </span>
          )
        })}
      </p>

      <ol className="space-y-1 text-sm" data-testid="cue-log">
        {revealed.map((step) => (
          <li key={step.id} className="flex gap-3 text-muted-foreground">
            <span className="w-12 shrink-0 tabular-nums">{step.at.toFixed(1)}s</span>
            <span className="text-foreground">
              {step.verdict.cue ? presentCue(step.verdict.cue) : "Quiet"}
              <span className="text-muted-foreground"> — {explainVerdict(step.verdict, settings)}</span>
            </span>
          </li>
        ))}
      </ol>
      <audio
        ref={audioRef}
        preload="auto"
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
    </div>
  )
}
