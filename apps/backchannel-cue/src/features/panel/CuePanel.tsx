import { explainVerdict, presentCue, type PolicySettings, type Verdict } from "@/lib/policy"

const MOODS = ["neutral", "bad", "good", "funny"] as const

export function CuePanel({
  verdict,
  settings,
  waiting,
}: {
  verdict: Verdict | null
  settings: PolicySettings
  waiting: string | null
}) {
  return (
    <section className="rounded-3xl border bg-card/90 p-4 shadow-sm sm:p-5" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg tracking-tight">This pause</h2>
        <p className="text-xs text-muted-foreground">
          {verdict?.openClause ? "Mid-sentence bar" : "Clause-end bar"}
        </p>
      </div>

      {waiting ? (
        <p className="mt-6 text-sm text-muted-foreground">{waiting}</p>
      ) : verdict ? (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div>
            <GateMeter gate={verdict.gate} bar={verdict.gateBar} />
            <p className="mt-4 text-sm leading-relaxed" data-testid="decision-reason">
              {explainVerdict(verdict, settings)}
            </p>
            {verdict.echoText ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Echo “{verdict.echoText}” scored {verdict.echoScore.toFixed(2)}
                {verdict.echoBlocked === "filler-like" ? " · blocked as filler like" : ""}
                {verdict.echoScore < settings.echoBar && verdict.echoBlocked == null
                  ? ` · under ${settings.echoBar.toFixed(2)}`
                  : ""}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Bars title="Mood" rows={MOODS.map((name) => ({ name, score: verdict.mood[name] ?? 0 }))} />
            <Bars title="Top reactions" rows={verdict.topReactions} />
            <div>
              <p className="text-xs tracking-wide text-muted-foreground uppercase">Top forms</p>
              <p className="mt-1 text-sm">
                {verdict.topForms.map((form) => `${form.name} ${form.score.toFixed(2)}`).join(" · ")}
              </p>
              {verdict.candidate && verdict.candidate !== verdict.cue ? (
                <p className="mt-1 text-sm">
                  Candidate <span className="font-medium">{presentCue(verdict.candidate)}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          A pause of about {settings.pauseDelaySec.toFixed(2)}s sends the words so far through the model.
        </p>
      )}
    </section>
  )
}

function GateMeter({ gate, bar }: { gate: number; bar: number }) {
  const max = Math.max(0.5, gate, bar)
  const gatePct = Math.min(100, (gate / max) * 100)
  const barPct = Math.min(100, (bar / max) * 100)
  const open = gate >= bar
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Gate {gate.toFixed(3)}</span>
        <span>Bar {bar.toFixed(3)}</span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${open ? "bg-primary" : "bg-foreground/25"}`}
          style={{ width: `${gatePct}%` }}
        />
        <div
          className="absolute top-[-4px] h-4 w-px bg-foreground"
          style={{ left: `${barPct}%` }}
          title="Threshold"
        />
      </div>
    </div>
  )
}

function Bars({ title, rows }: { title: string; rows: { name: string; score: number }[] }) {
  return (
    <div>
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <li key={row.name} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-2 text-xs">
            <span className="capitalize">{row.name}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-foreground/70" style={{ width: `${Math.min(100, row.score * 100)}%` }} />
            </span>
            <span className="text-right tabular-nums text-muted-foreground">{row.score.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
