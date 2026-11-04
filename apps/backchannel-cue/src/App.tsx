import { useEffect, useState } from "react"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { ListenDeck } from "@/features/listen/ListenDeck"
import { ReplayDeck } from "@/features/replay/ReplayDeck"
import { SettingsDrawer } from "@/features/settings/SettingsDrawer"
import { loadEngine, type CueEngine, type LoadPhase } from "@/lib/model"
import { cueSlug, defaultSettings, type PolicySettings } from "@/lib/policy"
import { assetUrl } from "@/lib/replay"

function loadSettings(): PolicySettings {
  try {
    const raw = localStorage.getItem("backchannel-cue-settings")
    if (!raw) return defaultSettings
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<PolicySettings>) }
  } catch {
    return defaultSettings
  }
}

export default function App() {
  const [settings, setSettings] = useState<PolicySettings>(loadSettings)
  const [engine, setEngine] = useState<CueEngine | null>(null)
  const [load, setLoad] = useState<{ ratio: number; phase: LoadPhase }>({ ratio: 0, phase: "download" })
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [mic, setMic] = useState(false)

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

  return (
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.22em] text-muted-foreground uppercase">Backchannel cue</p>
          <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">She answers the pauses</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            A story plays out loud. At the gaps, a second voice — scored on this device — says “oh no”, “mhm”, or “about what?”.
          </p>
        </div>
        <SettingsDrawer settings={settings} onChange={setSettings} />
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
                    ? `Fetching the 129 MB model · ${Math.round(load.ratio * 100)}%`
                    : "Starting the model"}
                </ProgressLabel>
              </Progress>
              <p className="mt-2 text-xs text-muted-foreground">Kept in the Cache API after the first visit. Press Play to hear it.</p>
            </>
          )}
        </div>
      ) : (
        <p className="sr-only" data-testid="model-ready">
          Model ready
        </p>
      )}

      {engine && !mic ? <ReplayDeck engine={engine} settings={settings} /> : null}
      {engine && mic ? (
        <ListenDeck
          engine={engine}
          settings={settings}
          onVerdict={() => undefined}
          onCue={(cue) => {
            const clip = new Audio(assetUrl(`audio/cues/${cueSlug(cue)}.opus`))
            clip.volume = 1
            void clip.play()
          }}
          onHearing={() => undefined}
        />
      ) : null}
      {engine ? (
        <button type="button" className="self-start text-xs text-muted-foreground underline" onClick={() => setMic((value) => !value)}>
          {mic ? "Back to the story" : "Use a microphone instead"}
        </button>
      ) : null}
    </div>
  )
}
