import { useEffect, useRef, useState } from "react"
import type { MicVAD } from "@ricky0123/vad-web"
import { Button } from "@/components/ui/button"
import { configureOrt, ortWasmPaths, type CueEngine } from "@/lib/model"
import {
  clean,
  decideFromScores,
  explainVerdict,
  freshClock,
  presentCue,
  wordCount,
  type Clock,
  type PolicySettings,
  type Verdict,
} from "@/lib/policy"
import { Mic, Square } from "lucide-react"

type WorkerIn =
  | { type: "ready" }
  | { type: "progress"; status: string; file: string; progress: number }
  | { type: "text"; id: number; text: string }
  | { type: "error"; message: string; id?: number }

const FRAME_RATE = 16_000
const MIN_SPEECH_MS = 280
const TURN_GAP_MS = 8000

export function ListenDeck({
  engine,
  settings,
  onVerdict,
  onCue,
  onHearing,
}: {
  engine: CueEngine
  settings: PolicySettings
  onVerdict: (verdict: Verdict | null) => void
  onCue: (cue: string) => void
  onHearing: (hearing: boolean) => void
}) {
  const [armed, setArmed] = useState(false)
  const [stt, setStt] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [sttNote, setSttNote] = useState("Speech model loads when you start listening.")
  const [micError, setMicError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState("")
  const [log, setLog] = useState<{ id: number; line: string }[]>([])
  const settingsRef = useRef(settings)
  const engineRef = useRef(engine)
  const onVerdictRef = useRef(onVerdict)
  const onCueRef = useRef(onCue)
  const onHearingRef = useRef(onHearing)
  settingsRef.current = settings
  engineRef.current = engine
  onVerdictRef.current = onVerdict
  onCueRef.current = onCue
  onHearingRef.current = onHearing

  const workerRef = useRef<Worker | null>(null)
  const vadRef = useRef<MicVAD | null>(null)
  const live = useRef({
    frames: [] as Float32Array[],
    speechMs: 0,
    silenceMs: 0,
    generation: 0,
    pending: false,
    armed: false,
    transcript: "",
    clock: freshClock(),
    hearing: false,
  })

  useEffect(() => {
    if (!armed) return
    const worker = new Worker(new URL("../../workers/stt.worker.ts", import.meta.url), { type: "module" })
    workerRef.current = worker
    setStt("loading")
    worker.onmessage = (event: MessageEvent<WorkerIn>) => {
      const data = event.data
      if (data.type === "progress") {
        const file = data.file ? data.file.split("/").pop() : "weights"
        setSttNote(`${data.status || "Loading"} ${file ?? ""} ${Math.round(data.progress)}%`.trim())
        return
      }
      if (data.type === "ready") {
        setStt("ready")
        setSttNote("Moonshine-tiny is ready. Nothing is sent to a server.")
        return
      }
      if (data.type === "error") {
        setStt("error")
        setSttNote(data.message)
        live.current.pending = false
        return
      }
      if (data.type === "text") void onTranscript(data.id, data.text)
    }
    worker.postMessage({ type: "load", wasmPaths: ortWasmPaths })
    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [armed])

  useEffect(() => {
    if (!armed || stt !== "ready") return
    let cancelled = false
    configureOrt()
    void loadMicVad().then((MicVAD) => MicVAD.new({
      model: "v5",
      baseAssetPath: `${import.meta.env.BASE_URL}vad/`,
      onnxWASMBasePath: ortWasmPaths as unknown as string,
      redemptionMs: 8000,
      onFrameProcessed: (probs: { isSpeech: number }, frame: Float32Array) => {
        const speech = probs.isSpeech >= 0.5
        const ms = (frame.length / FRAME_RATE) * 1000
        const state = live.current
        if (speech) {
          if (state.pending) {
            state.generation += 1
            state.pending = false
          }
          state.silenceMs = 0
          state.speechMs += ms
          state.armed = true
          state.frames.push(frame.slice())
          if (!state.hearing) {
            state.hearing = true
            onHearingRef.current(true)
          }
          return
        }
        if (state.speechMs < MIN_SPEECH_MS && !state.transcript) {
          state.silenceMs = 0
          return
        }
        if (state.hearing) {
          state.hearing = false
          onHearingRef.current(false)
        }
        state.silenceMs += ms
        if (state.silenceMs >= TURN_GAP_MS && state.transcript) {
          state.transcript = ""
          state.clock = freshClock()
          state.frames = []
          state.speechMs = 0
          state.silenceMs = 0
          state.armed = false
          setTranscript("")
          onVerdictRef.current(null)
          return
        }
        if (
          state.armed &&
          state.speechMs >= MIN_SPEECH_MS &&
          state.silenceMs >= settingsRef.current.pauseDelaySec * 1000 &&
          !state.pending
        ) {
          state.pending = true
          state.armed = false
          state.generation += 1
          const id = state.generation
          const audio = concat(state.frames)
          workerRef.current?.postMessage({ type: "transcribe", id, audio }, [audio.buffer])
        }
      },
    })
      .then(async (vad) => {
        if (cancelled) {
          await vad.destroy()
          return
        }
        vadRef.current = vad
        await vad.start()
      })
      .catch((error: unknown) => {
        setMicError(error instanceof Error ? error.message : "Microphone unavailable")
      })
    )
    return () => {
      cancelled = true
      const vad = vadRef.current
      vadRef.current = null
      void vad?.destroy()
      onHearingRef.current(false)
    }
  }, [armed, stt])

  async function onTranscript(id: number, text: string) {
    const state = live.current
    state.pending = false
    if (id !== state.generation) return
    const next = clean(text)
    if (!next || wordCount(next) <= wordCount(state.transcript)) return
    state.transcript = next
    setTranscript(next)
    const now = performance.now() / 1000
    const scores = await engineRef.current.score(next, state.clock, now)
    const decided = decideFromScores(next, scores, state.clock, now, settingsRef.current)
    state.clock = decided.clock
    onVerdictRef.current(decided.verdict)
    const line = decided.verdict.cue
      ? presentCue(decided.verdict.cue)
      : `Quiet — ${explainVerdict(decided.verdict, settingsRef.current)}`
    setLog((items) => [...items, { id, line }].slice(-8))
    if (decided.verdict.cue) onCueRef.current(decided.verdict.cue)
  }

  function stop() {
    setArmed(false)
    setStt("idle")
    live.current = {
      frames: [],
      speechMs: 0,
      silenceMs: 0,
      generation: 0,
      pending: false,
      armed: false,
      transcript: "",
      clock: freshClock() as Clock,
      hearing: false,
    }
    setTranscript("")
    onVerdict(null)
    onHearing(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {armed ? (
          <Button type="button" variant="outline" onClick={stop}>
            <Square />
            Stop
          </Button>
        ) : (
          <Button type="button" onClick={() => setArmed(true)}>
            <Mic />
            Listen
          </Button>
        )}
        <p className="text-sm text-muted-foreground">{micError ?? sttNote}</p>
      </div>
      <p className="min-h-16 text-lg leading-relaxed" data-testid="live-transcript">
        {transcript || <span className="text-foreground/30">Your words will show up here, on this device.</span>}
      </p>
      <ol className="space-y-1 text-sm" data-testid="cue-log">
        {log.map((item) => (
          <li key={item.id}>{item.line}</li>
        ))}
      </ol>
    </div>
  )
}

async function loadMicVad() {
  const mod = (await import("@ricky0123/vad-web")) as {
    MicVAD?: { new: (options?: object) => Promise<MicVAD> }
    default?: { MicVAD?: { new: (options?: object) => Promise<MicVAD> } }
  }
  const MicVAD = mod.MicVAD ?? mod.default?.MicVAD
  if (!MicVAD) throw new Error("Silero VAD did not load")
  return MicVAD
}

function concat(frames: Float32Array[]): Float32Array {
  const length = frames.reduce((sum, frame) => sum + frame.length, 0)
  const audio = new Float32Array(length)
  let offset = 0
  for (const frame of frames) {
    audio.set(frame, offset)
    offset += frame.length
  }
  return audio
}
