import { useEffect, useRef, useState } from "react"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { ListenDeck } from "@/features/listen/ListenDeck"
import { CuePanel } from "@/features/panel/CuePanel"
import { ReplayDeck } from "@/features/replay/ReplayDeck"
import { SettingsDrawer } from "@/features/settings/SettingsDrawer"
import { ListenerFace, WallFace } from "@/features/stage/Faces"
import { loadEngine, type CueEngine, type LoadPhase } from "@/lib/model"
import { cueSlug, defaultSettings, type PolicySettings, type Verdict } from "@/lib/policy"
import { assetUrl } from "@/lib/replay"

type Mode = "replay" | "listen"

function loadSettings(): PolicySettings {
  try {
    const raw = localStorage.getItem("backchannel-cue-settings")
    if (!raw) return defaultSettings
    const parsed = JSON.parse(raw) as Partial<PolicySettings>
    return { ...defaultSettings, ...parsed }
  } catch {
    return defaultSettings
  }
}

export default function App() {
  const [mode, setMode] = useState<Mode>("replay")
  const [settings, setSettings] = useState<PolicySettings>(loadSettings)
  const [engine, setEngine] = useState<CueEngine | null>(null)
  const [load, setLoad] = useState<{ ratio: number; phase: LoadPhase }>({ ratio: 0, phase: "download" })
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [hearing, setHearing] = useState(false)
  const [spoken, setSpoken] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)
  const cueAudio = useRef<HTMLAudioElement | null>(null)
  const cueToken = useRef(0)

  useEffect(() => {
    localStorage.setItem("backchannel-cue-settings", JSON.stringify(settings))
  }, [settings])

  useEffect(() => {
    let cancel = false
    setError(null)
    setEngine(null)
    void loadEngine((ratio, phase) => {
      if (!cancel) setLoad({ ratio, phase })
    })
      .then((next) => {
        if (!cancel) setEngine(next)
      })
      .catch((reason: unknown) => {
        if (!cancel) setError(reason instanceof Error ? reason.message : "The model did not load")
      })
    return () => {
      cancel = true
    }
  }, [attempt])

  function cueElement() {
    const audio = cueAudio.current ?? new Audio()
    cueAudio.current = audio
    return audio
  }

  function primeCueAudio() {
    const audio = cueElement()
    const token = cueToken.current
    audio.muted = true
    if (!audio.src) audio.src = assetUrl("audio/cues/mhm.opus")
    void audio.play().then(() => {
      if (cueToken.current !== token) return
      audio.pause()
      audio.muted = false
      audio.currentTime = 0
    }).catch(() => {
      audio.muted = false
    })
  }

  function playCue(cue: string) {
    cueToken.current += 1
    setSpoken(cue)
    setSpeaking(true)
    const audio = cueElement()
    audio.muted = false
    audio.volume = 1
    audio.src = assetUrl(`audio/cues/${cueSlug(cue)}.opus`)
    audio.onended = () => setSpeaking(false)
    void audio.play().catch(() => setSpeaking(false))
  }

  const waiting = !engine
    ? error
      ? null
      : load.phase === "start"
        ? "Weights are in the cache. Starting the runtime…"
        : null
    : null

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.22em] text-muted-foreground uppercase">Backchannel cue</p>
          <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">Wall vs Listener</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            One side stays quiet at every pause. The other answers the way a person does — locally, from the words so far.
          </p>
        </div>
        <SettingsDrawer
          settings={settings}
          onChange={(next) => {
            setSettings(next)
            setVerdict(null)
          }}
        />
      </header>

      {!engine ? (
        <div className="rounded-3xl border bg-card/80 p-4" data-testid="model-loading">
          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm">{error}</p>
              <button type="button" className="text-sm underline" onClick={() => setAttempt((value) => value + 1)}>
                Try again
              </button>
            </div>
          ) : (
            <>
              <Progress value={Math.round(load.ratio * 100)}>
                <ProgressLabel className="text-sm">
                  {load.phase === "download"
                    ? `Fetching the 129 MB fp32 model · ${Math.round(load.ratio * 100)}%`
                    : "Starting the model"}
                </ProgressLabel>
              </Progress>
              <p className="mt-2 text-xs text-muted-foreground">
                Downloaded once, then kept in the Cache API. Audio never leaves this browser.
              </p>
            </>
          )}
        </div>
      ) : (
        <p className="sr-only" data-testid="model-ready">
          Model ready
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1.8rem] border border-slate-300/80 bg-slate-100/80 px-4 py-6">
          <WallFace hearing={hearing} />
        </div>
        <div className="rounded-[1.8rem] border border-primary/20 bg-[#fbf6ef] px-4 py-6">
          <ListenerFace cue={spoken} hearing={hearing} speaking={speaking} />
        </div>
      </div>

      <div className="flex gap-2">
        <ModeButton active={mode === "replay"} onClick={() => { setMode("replay"); setVerdict(null); setHearing(false) }}>
          Story replay
        </ModeButton>
        <ModeButton active={mode === "listen"} onClick={() => { setMode("listen"); setVerdict(null); setHearing(false) }}>
          Microphone
        </ModeButton>
      </div>

      {engine && mode === "replay" ? (
        <ReplayDeck
          engine={engine}
          settings={settings}
          onVerdict={setVerdict}
          onCue={playCue}
          onHearing={setHearing}
          onPrime={primeCueAudio}
        />
      ) : null}
      {engine && mode === "listen" ? (
        <ListenDeck
          engine={engine}
          settings={settings}
          onVerdict={setVerdict}
          onCue={playCue}
          onHearing={setHearing}
        />
      ) : null}

      <CuePanel verdict={verdict} settings={settings} waiting={engine ? null : waiting} />
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm ${active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
    >
      {children}
    </button>
  )
}
