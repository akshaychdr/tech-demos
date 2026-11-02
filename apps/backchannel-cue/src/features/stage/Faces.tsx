import { motion, useReducedMotion } from "framer-motion"
import { presentCue } from "@/lib/policy"

export function WallFace({ hearing }: { hearing: boolean }) {
  return (
    <figure className="flex flex-col items-center gap-4 text-center" aria-label="The wall, a silent assistant">
      <div className="relative grid h-36 w-36 place-items-center sm:h-44 sm:w-44">
        <div
          className="absolute inset-3 rounded-[1.6rem] border border-slate-300/80 bg-gradient-to-b from-slate-200 to-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
          aria-hidden
        />
        <div className="relative h-16 w-24 rounded-xl bg-slate-800 shadow-inner">
          <div className={`standby mx-auto mt-7 h-px w-10 bg-slate-400 ${hearing ? "opacity-80" : ""}`} />
        </div>
      </div>
      <figcaption>
        <p className="font-serif text-xl tracking-tight text-slate-700">The wall</p>
        <p className="mt-1 max-w-48 text-xs leading-relaxed text-slate-500">
          Today’s assistant. It waits until you are finished, then says nothing here.
        </p>
      </figcaption>
      <p className="h-9 text-xs tracking-[0.18em] text-slate-400 uppercase" data-testid="wall-status">
        Silent
      </p>
    </figure>
  )
}

export function ListenerFace({
  cue,
  hearing,
  speaking,
}: {
  cue: string | null
  hearing: boolean
  speaking: boolean
}) {
  const reduce = useReducedMotion()
  return (
    <figure className="flex flex-col items-center gap-4 text-center" aria-label="The listener">
      <div className="relative h-36 w-36 sm:h-44 sm:w-44">
        {cue ? (
          <motion.div
            key={cue}
            data-testid="cue-bubble"
            initial={reduce ? false : { opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-sm font-medium whitespace-nowrap text-primary-foreground shadow-md"
          >
            {presentCue(cue)}
          </motion.div>
        ) : (
          <div className="absolute -top-2 left-1/2 h-7 -translate-x-1/2" />
        )}
        <motion.svg
          viewBox="0 0 160 160"
          className="h-full w-full"
          animate={reduce || !speaking ? { rotate: 0 } : { rotate: [0, -5, 2, 0] }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          aria-hidden
        >
          <ellipse cx="80" cy="118" rx="46" ry="22" fill="#e7d3c3" />
          <circle cx="80" cy="74" r="40" fill="#f0d2bc" />
          <path d="M48 70c2-28 22-42 32-42s30 14 32 42" fill="#5c3b32" />
          <circle cx="66" cy="76" r="3.2" fill="#3a2a24" />
          <circle cx="94" cy="76" r="3.2" fill="#3a2a24" />
          <g className="eye-blink">
            <path d="M58 76h16M86 76h16" stroke="#3a2a24" strokeWidth="0" />
          </g>
          <motion.ellipse
            cx="80"
            cy="96"
            rx={speaking ? 7 : 9}
            ry={speaking ? 5 : 1.6}
            fill="#a15a4a"
            animate={{ ry: speaking ? 5.5 : 1.6 }}
          />
          {hearing && !speaking ? (
            <circle cx="80" cy="74" r="46" fill="none" stroke="#c46a45" strokeOpacity="0.35" strokeWidth="2" />
          ) : null}
        </motion.svg>
      </div>
      <figcaption>
        <p className="font-serif text-xl tracking-tight text-primary">The listener</p>
        <p className="mt-1 max-w-52 text-xs leading-relaxed text-muted-foreground">
          Same words. At the pause, a small sound — mhm, oh no, about what?
        </p>
      </figcaption>
      <p className="h-9 text-xs tracking-[0.18em] text-primary/80 uppercase">
        {speaking ? "Backchannel" : hearing ? "With you" : "Ready"}
      </p>
    </figure>
  )
}
