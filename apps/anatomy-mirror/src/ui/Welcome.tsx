import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatScore } from '../domain/share.ts'

const TIPS = [
  { title: 'Hold the phone at arm’s length', body: 'Keep your whole face in the frame. A laptop webcam works the same way.' },
  { title: 'Face the light', body: 'A window or a lamp in front of you is enough. The camera stays on this device.' },
  { title: 'Touch with one finger', body: 'Use a fingertip, rest it on the bone, and hold still for a moment.' },
]

const TIPS_KEY = 'anatomy-mirror-tips-v1'

export function tipsSeen(): boolean {
  try {
    return localStorage.getItem(TIPS_KEY) === '1'
  } catch {
    return false
  }
}

export function markTipsSeen(): void {
  try {
    localStorage.setItem(TIPS_KEY, '1')
  } catch {
    /* private mode */
  }
}

export function Welcome({
  beat,
  onStart,
  onCredits,
}: {
  beat: number | null
  onStart: () => void
  onCredits: () => void
}) {
  const [step, setStep] = useState<number | null>(null)
  const tip = step == null ? null : TIPS[step]

  function begin() {
    if (!tipsSeen()) {
      setStep(0)
      return
    }
    onStart()
  }

  function nextTip() {
    if (step == null) return
    if (step < TIPS.length - 1) {
      setStep(step + 1)
      return
    }
    markTipsSeen()
    onStart()
  }

  return (
    <main className="welcome">
      <div className="welcome-mark" aria-hidden>
        <SkullMark />
      </div>
      {beat != null && (
        <p className="beat-banner">Your friend scored {formatScore(beat)}/10. Can you beat it?</p>
      )}
      <p className="eyebrow">A mirror for the bones and muscles of your face</p>
      <h1>Anatomy Mirror</h1>
      <p className="lede">Learn eight bones and five muscles on your own face. Touch, make a face, then try a short quiz.</p>
      <p className="privacy">Your camera stays on your device. Nothing is recorded or uploaded.</p>
      {tip ? (
        <section className="tip-card" aria-live="polite">
          <p className="eyebrow">Tip {step! + 1} of {TIPS.length}</p>
          <h2>{tip.title}</h2>
          <p>{tip.body}</p>
          <Button className="start-btn" size="lg" onClick={nextTip}>
            {step === TIPS.length - 1 ? 'I’m ready' : 'Next'}
          </Button>
        </section>
      ) : (
        <Button className="start-btn" size="lg" onClick={begin}>
          Start
        </Button>
      )}
      <button type="button" className="text-link" onClick={onCredits}>
        Credits and licences
      </button>
    </main>
  )
}

function SkullMark() {
  return (
    <svg viewBox="0 0 120 140" className="skull-svg">
      <ellipse cx="60" cy="58" rx="38" ry="42" fill="none" stroke="currentColor" strokeWidth="2" />
      <ellipse cx="46" cy="58" rx="8" ry="10" fill="currentColor" opacity="0.85" />
      <ellipse cx="74" cy="58" rx="8" ry="10" fill="currentColor" opacity="0.85" />
      <path d="M60 70 L54 86 L66 86 Z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M38 98 Q60 118 82 98" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}
