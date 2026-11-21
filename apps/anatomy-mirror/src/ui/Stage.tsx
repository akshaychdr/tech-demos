import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Hand, Layers, Smile, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { challengeUrl, formatScore, shareMessage } from '../domain/share.ts'
import { FACE_PROMPTS, structure } from '../domain/structures.ts'
import {
  advanceQuiz,
  answerQuestion,
  QUESTION_MS,
  remainingMs,
  startQuiz,
  type QuizState,
} from '../domain/quiz.ts'
import {
  CameraError,
  MirrorEngine,
  type Appearance,
  type EngineMode,
  type EngineSnapshot,
  type HoldEvent,
} from '../engine/MirrorEngine.ts'
import type { LookMode, RevealMode, SceneLayers } from '../scene/AnatomyScene.ts'
import type { StructureId } from '../domain/types.ts'
import { Credits } from './Credits.tsx'
import { drawScoreCard } from './scoreImage.ts'

const emptySnap = (): EngineSnapshot => ({
  face: true,
  finger: true,
  region: null,
  muscle: null,
  fps: 0,
  faceBottom: null,
  faceTooClose: false,
  lowFps: false,
})

const LOOKS: { id: LookMode; label: string }[] = [
  { id: 'xray', label: 'X-ray' },
  { id: 'solid', label: 'Solid' },
]

const REVEALS: { id: RevealMode; label: string }[] = [
  { id: 'lens', label: 'Lens' },
  { id: 'whole', label: 'Whole' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Lower' },
]

export default function Stage() {
  const host = useRef<HTMLDivElement>(null)
  const engine = useRef<MirrorEngine | null>(null)
  const onHold = useRef<(event: HoldEvent) => void>(() => {})
  const preview = new URLSearchParams(window.location.search).get('preview') === '1'
  const [status, setStatus] = useState<'loading' | 'live' | 'error'>('loading')
  const [progress, setProgress] = useState({ value: 0.05, label: 'Starting' })
  const [error, setError] = useState<CameraError | null>(null)
  const [snap, setSnap] = useState<EngineSnapshot>(emptySnap)
  const [mode, setMode] = useState<EngineMode>('explore')
  const [layers, setLayers] = useState<SceneLayers>({ skull: true, muscles: false, brain: false, hand: false })
  const [labelsOn, setLabelsOn] = useState(true)
  const [look, setLook] = useState<LookMode>('xray')
  const [reveal, setReveal] = useState<RevealMode>('lens')
  const [cut, setCut] = useState(0.42)
  const [feather, setFeather] = useState(0.22)
  const [skin, setSkin] = useState(0.32)
  const [lensPinned, setLensPinned] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(() => !window.matchMedia('(max-width: 800px)').matches)
  const [credits, setCredits] = useState(false)
  const [card, setCard] = useState<StructureId | null>(null)
  const [faceStep, setFaceStep] = useState(0)
  const [quiz, setQuiz] = useState<QuizState | null>(null)
  const [best, setBest] = useState(0)
  const [now, setNow] = useState(() => performance.now())
  const [fallback, setFallback] = useState(false)
  const [note, setNote] = useState('')
  const [scoreBlob, setScoreBlob] = useState<Blob | null>(null)
  const [scoreUrl, setScoreUrl] = useState<string | null>(null)

  const modeRef = useRef(mode)
  const faceStepRef = useRef(faceStep)
  modeRef.current = mode
  faceStepRef.current = faceStep

  onHold.current = (event) => {
    if (modeRef.current === 'touch' && event.correct) setCard(event.id as StructureId)
    if (modeRef.current === 'faces' && event.correct) {
      const prompt = FACE_PROMPTS[faceStepRef.current]
      setCard(event.id as StructureId)
      if (prompt && event.id === prompt.id) setFaceStep((step) => step + 1)
    }
    if (modeRef.current !== 'quiz') return
    setQuiz((current) => {
      if (!current || current.phase !== 'ask') return current
      const question = current.questions[current.index]
      if (!question) return current
      if (event.correct && event.id === question.id) return answerQuestion(current, true, performance.now())
      if (!event.correct && question.kind === 'touch') return answerQuestion(current, false, performance.now())
      return current
    })
  }

  useEffect(() => {
    const node = host.current
    if (!node) return
    let dead = false
    const eng = new MirrorEngine(
      (snapshot) => {
        if (!dead) setSnap(snapshot)
      },
      (event) => {
        if (!dead) onHold.current(event)
      },
    )
    eng.onLensPinned = (pinned) => {
      if (!dead) setLensPinned(pinned)
    }
    engine.current = eng
    void eng
      .start(
        node,
        (value, label) => {
          if (!dead) setProgress({ value, label })
        },
        preview,
      )
      .then(() => {
        if (!dead) setStatus('live')
      })
      .catch((reason: unknown) => {
        if (dead) return
        setError(reason instanceof CameraError ? reason : new CameraError('unknown', 'The camera did not start.'))
        setStatus('error')
      })
    return () => {
      dead = true
      eng.dispose()
    }
  }, [preview])

  useEffect(() => {
    const eng = engine.current
    if (!eng) return
    eng.setMode(mode)
    eng.setLayers(layers, labelsOn)
    if (mode === 'faces') {
      const prompt = FACE_PROMPTS[faceStep]
      eng.setWatch(prompt ? { kind: 'show', id: prompt.id } : null)
      return
    }
    if (mode === 'quiz' && quiz?.phase === 'ask') {
      const question = quiz.questions[quiz.index]
      if (!question) return
      eng.setWatch(question.kind === 'touch' ? { kind: 'touch', id: question.id } : { kind: 'show', id: question.id })
      return
    }
    eng.setWatch(null)
  }, [mode, layers, labelsOn, faceStep, quiz])

  useEffect(() => {
    const appearance: Appearance = { look, reveal, cut, feather, skin }
    engine.current?.setAppearance(appearance)
  }, [look, reveal, cut, feather, skin, status])

  useEffect(() => {
    const eng = engine.current
    if (!eng || status !== 'live') return
    if (mode === 'quiz' && quiz?.phase === 'reveal') {
      eng.setHighlight(quiz.questions[quiz.index]?.id ?? null)
      return
    }
    if (mode === 'faces') {
      eng.setHighlight(FACE_PROMPTS[faceStep]?.id ?? null)
      return
    }
    if (mode === 'touch' && card) {
      eng.setHighlight(card)
      return
    }
    eng.setHighlight(null)
  }, [mode, quiz, faceStep, card, status])

  useEffect(() => {
    if (card) setSheetOpen(true)
  }, [card])

  useEffect(() => {
    if (!quiz || quiz.phase === 'done') return
    const timer = window.setInterval(() => setNow(performance.now()), 100)
    return () => window.clearInterval(timer)
  }, [quiz])

  useEffect(() => {
    if (!quiz || quiz.phase !== 'ask') return
    const left = remainingMs(quiz, performance.now())
    const timer = window.setTimeout(() => {
      setQuiz((current) => (current && current.phase === 'ask' ? answerQuestion(current, false, performance.now()) : current))
    }, left + 30)
    return () => window.clearTimeout(timer)
  }, [quiz])

  useEffect(() => {
    if (!quiz || quiz.phase !== 'reveal') return
    const wait = quiz.revealCorrect ? 1200 : 2000
    const timer = window.setTimeout(() => {
      setQuiz((current) => (current ? advanceQuiz(current, performance.now()) : current))
    }, wait)
    return () => window.clearTimeout(timer)
  }, [quiz])

  useEffect(() => {
    if (quiz?.phase === 'done') setBest((value) => Math.max(value, quiz.score))
  }, [quiz])

  useEffect(() => {
    if (quiz?.phase !== 'done') return
    let cancel = false
    let url = ''
    void drawScoreCard(quiz.score, quiz.muscleCorrect, quiz.muscleAsked).then((blob) => {
      if (cancel) return
      url = URL.createObjectURL(blob)
      setScoreBlob(blob)
      setScoreUrl(url)
    })
    return () => {
      cancel = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [quiz])

  function chooseMode(next: EngineMode) {
    setMode(next)
    setFallback(false)
    setNote('')
    setSheetOpen(true)
    if (next === 'touch') setLayers((value) => ({ ...value, skull: true }))
    if (next === 'faces') setLayers((value) => ({ ...value, muscles: true }))
    if (next === 'quiz' && (!quiz || quiz.phase === 'done')) setQuiz(startQuiz(performance.now()))
    if (next !== 'touch' && next !== 'faces') setCard(null)
  }

  async function share() {
    if (!quiz) return
    const url = challengeUrl(window.location.origin, import.meta.env.BASE_URL, quiz.score)
    const text = shareMessage(quiz.score, quiz.muscleCorrect, quiz.muscleAsked, url)
    const file = scoreBlob ? new File([scoreBlob], 'anatomy-mirror-score.png', { type: 'image/png' }) : null
    const withFile = file ? { title: 'Anatomy Mirror', text, url, files: [file] } : null
    try {
      if (withFile && navigator.canShare?.(withFile)) {
        await navigator.share(withFile)
        return
      }
      if (navigator.share) {
        await navigator.share({ title: 'Anatomy Mirror', text, url })
        return
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
    }
    setFallback(true)
  }

  async function copyLink() {
    if (!quiz) return
    const url = challengeUrl(window.location.origin, import.meta.env.BASE_URL, quiz.score)
    await navigator.clipboard.writeText(url)
    setNote('Link copied')
  }

  const question = quiz?.questions[quiz.index]
  const prompt = FACE_PROMPTS[faceStep]
  const info = card ? structure(card) : null
  const shareText = quiz
    ? shareMessage(
        quiz.score,
        quiz.muscleCorrect,
        quiz.muscleAsked,
        challengeUrl(window.location.origin, import.meta.env.BASE_URL, quiz.score),
      )
    : ''
  const cutLabel = reveal === 'lens' ? 'Lens size' : 'How much to show'

  return (
    <div className="stage-shell">
      <div className="stage-host" ref={host} />
      <header className="top-chip">
        <p>Anatomy Mirror</p>
        {status === 'live' && <p className="fps">{snap.fps} fps</p>}
        <button type="button" className="text-link" onClick={() => setCredits(true)}>
          Credits
        </button>
      </header>
      {status === 'live' && !snap.face && <p className="status-chip">Move into the light and face the camera</p>}
      {status === 'live' && snap.face && snap.faceTooClose && <p className="status-chip">Move back a little so your whole face fits</p>}
      {status === 'live' && snap.face && !snap.finger && (mode === 'touch' || (mode === 'quiz' && question?.kind === 'touch')) && (
        <p className="status-chip">Bring your finger closer to your face</p>
      )}
      {status === 'live' && snap.lowFps && <p className="status-chip quiet">This works best on a newer device. The mirror is still running.</p>}

      {status === 'loading' && (
        <div className="overlay-card">
          <p className="eyebrow">Getting the mirror ready</p>
          <p className="panel-title">{progress.label}</p>
          <div className="bar" aria-valuenow={Math.round(progress.value * 100)} aria-valuemin={0} aria-valuemax={100} role="progressbar">
            <span style={{ width: `${Math.round(progress.value * 100)}%` }} />
          </div>
        </div>
      )}

      {status === 'error' && error && (
        <div className="overlay-card">
          <p className="panel-title">
            {error.reason === 'denied' ? 'Camera is blocked' : error.reason === 'missing' ? 'No camera was found' : 'Something went wrong'}
          </p>
          <p>
            {error.reason === 'denied'
              ? 'In the address bar, open the site settings, set Camera to Allow, then try again.'
              : error.reason === 'missing'
                ? 'Plug in a webcam, or open this page on a phone with a front camera.'
                : error.message}
          </p>
          <Button className="start-btn" size="lg" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      )}

      {status === 'live' && (
        <aside className={sheetOpen ? 'panel' : 'panel collapsed'}>
          <div className="panel-body">
            {mode === 'touch' &&
              (info ? (
                <Fact infoId={info.id} />
              ) : (
                <p>Touch a bone with one fingertip and hold still. The part you touch lights up.</p>
              ))}

            {mode === 'faces' &&
              (prompt ? (
                <>
                  <p className="prompt">{prompt.prompt}</p>
                  {snap.muscle && (
                    <p>
                      That is your {structure(snap.muscle).everyday.toLowerCase()} ({structure(snap.muscle).science}).
                    </p>
                  )}
                  {info && snap.muscle === info.id && <p>{info.fact}</p>}
                </>
              ) : (
                <>
                  <p className="panel-title">You found all five muscles.</p>
                  <Button
                    className="start-btn"
                    size="lg"
                    onClick={() => {
                      setFaceStep(0)
                      setCard(null)
                    }}
                  >
                    Practice again
                  </Button>
                </>
              ))}

            {mode === 'quiz' && quiz && quiz.phase === 'ask' && question && (
              <div className="quiz-row">
                <p className="prompt">{question.prompt}</p>
                <Ring remaining={remainingMs(quiz, now)} />
              </div>
            )}

            {mode === 'quiz' && quiz && quiz.phase === 'reveal' && question && (
              <>
                <p className="eyebrow">{quiz.revealCorrect ? 'Yes' : 'Here it is'}</p>
                <p className="panel-title">{structure(question.id).everyday}</p>
                <p>
                  {structure(question.id).science}. {structure(question.id).fact}
                </p>
              </>
            )}

            {mode === 'quiz' && quiz && quiz.phase === 'done' && (
              <div className="score-end">
                <p className="eyebrow">Score</p>
                <p className="panel-title">{formatScore(quiz.score)}/10</p>
                <p>
                  Time {Math.round(quiz.elapsedMs / 1000)}s{best > 0 ? ` · Best this session ${formatScore(best)}` : ''}
                </p>
                {quiz.misses.length > 0 ? (
                  <div className="chip-row">
                    {quiz.misses.map((miss) => (
                      <button
                        key={miss.id}
                        type="button"
                        className="pill"
                        onClick={() => {
                          setCard(miss.id)
                          setSheetOpen(true)
                          if (structure(miss.id).layer === 'muscles') {
                            setMode('faces')
                            setLayers((value) => ({ ...value, muscles: true }))
                          } else {
                            setMode('touch')
                            setLayers((value) => ({ ...value, skull: true }))
                          }
                        }}
                      >
                        Revisit {structure(miss.id).everyday.toLowerCase()}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>You named every one in this round.</p>
                )}
                {scoreUrl && <img className="score-preview" alt="Score card with a skull drawing and your points" src={scoreUrl} />}
                <div className="chip-row">
                  <Button size="lg" onClick={() => void share()}>
                    Share score
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    onClick={() => {
                      setQuiz(startQuiz(performance.now()))
                      setFallback(false)
                    }}
                  >
                    Play again
                  </Button>
                </div>
                {(fallback || typeof navigator.share !== 'function') && (
                  <div className="chip-row">
                    <a className="pill" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
                      WhatsApp
                    </a>
                    <a className="pill" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
                      X
                    </a>
                    <a className="pill" href={`mailto:?subject=${encodeURIComponent('Anatomy Mirror')}&body=${encodeURIComponent(shareText)}`}>
                      Email
                    </a>
                    <button type="button" className="pill" onClick={() => void copyLink()}>
                      Copy link
                    </button>
                    {scoreUrl && (
                      <a className="pill" href={scoreUrl} download="anatomy-mirror-score.png">
                        Save image
                      </a>
                    )}
                  </div>
                )}
                {note && <p>{note}</p>}
              </div>
            )}

            <Pills label="Look" value={look} options={LOOKS} onChange={setLook} />
            <Pills label="Reveal" value={reveal} options={REVEALS} onChange={setReveal} />
            {reveal !== 'whole' && <Slider label={cutLabel} value={cut} onChange={setCut} />}
            {reveal === 'lens' && (
              <button
                type="button"
                className={lensPinned ? 'pill' : 'pill on'}
                onClick={() => {
                  engine.current?.followLens()
                  setLensPinned(false)
                }}
              >
                {lensPinned ? 'Follow face' : 'Following the face'}
              </button>
            )}
            <Slider label="Skin" value={skin} onChange={setSkin} />
            <Slider label="Soft edge" value={feather} onChange={setFeather} />

            <div className="chip-row" role="group" aria-label="Layers">
              <Chip on={layers.skull} onClick={() => setLayers((value) => ({ ...value, skull: !value.skull }))}>
                Skull
              </Chip>
              <Chip on={layers.muscles} onClick={() => setLayers((value) => ({ ...value, muscles: !value.muscles }))}>
                Muscles
              </Chip>
              <Chip on={layers.brain} onClick={() => setLayers((value) => ({ ...value, brain: !value.brain }))}>
                Brain
              </Chip>
              <Chip on={layers.hand} onClick={() => setLayers((value) => ({ ...value, hand: !value.hand }))}>
                Hand bones
              </Chip>
              <Chip on={labelsOn} onClick={() => setLabelsOn((value) => !value)}>
                Labels
              </Chip>
            </div>
            {layers.hand && <p>Hand bones follow the joints the camera can see.</p>}
          </div>
          <div className="panel-bar">
            <button type="button" className="sheet-toggle" aria-expanded={sheetOpen} onClick={() => setSheetOpen((value) => !value)}>
              {sheetOpen ? 'Hide controls' : 'Show controls'}
            </button>
            <nav className="mode-row" aria-label="Activities">
              <NavButton icon={<Layers />} label="Explore" on={mode === 'explore'} onClick={() => chooseMode('explore')} />
              <NavButton icon={<Hand />} label="Touch" on={mode === 'touch'} onClick={() => chooseMode('touch')} />
              <NavButton icon={<Smile />} label="Faces" on={mode === 'faces'} onClick={() => chooseMode('faces')} />
              <NavButton icon={<Timer />} label="Quiz" on={mode === 'quiz'} onClick={() => chooseMode('quiz')} />
            </nav>
          </div>
        </aside>
      )}
      {credits && <Credits onClose={() => setCredits(false)} />}
    </div>
  )
}

function Fact({ infoId }: { infoId: StructureId }) {
  const info = structure(infoId)
  return (
    <div className="fact">
      <span className="swatch" style={{ background: info.color }} />
      <p className="panel-title">{info.everyday}</p>
      <p className="science">{info.science}</p>
      <p>{info.fact}</p>
    </div>
  )
}

function Pills<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (id: T) => void
}) {
  return (
    <div className="pills" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={value === option.id ? 'pill on' : 'pill'}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = `slider-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <label className="slider" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="range" min={0} max={1} step={0.01} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className={on ? 'pill on' : 'pill'} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

function NavButton({ icon, label, on, onClick }: { icon: ReactNode; label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={on ? 'nav-btn on' : 'nav-btn'} aria-current={on ? 'page' : undefined} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function Ring({ remaining }: { remaining: number }) {
  const radius = 22
  const circ = 2 * Math.PI * radius
  const offset = circ * (1 - remaining / QUESTION_MS)
  return (
    <svg className="timer-ring" viewBox="0 0 64 64" role="img" aria-label={`${Math.ceil(remaining / 1000)} seconds left`}>
      <circle cx="32" cy="32" r={radius} className="ring-track" />
      <circle cx="32" cy="32" r={radius} className="ring-value" strokeDasharray={circ} strokeDashoffset={offset} />
      <text x="32" y="38" textAnchor="middle">
        {Math.ceil(remaining / 1000)}
      </text>
    </svg>
  )
}
