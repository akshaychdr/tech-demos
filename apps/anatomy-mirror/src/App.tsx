import { lazy, Suspense, useState } from 'react'
import { parseBeat } from './domain/share.ts'
import { Credits } from './ui/Credits.tsx'
import { Welcome } from './ui/Welcome.tsx'

const Stage = lazy(() => import('./ui/Stage.tsx'))

type Screen = 'welcome' | 'live'

export default function App() {
  const [screen, setScreen] = useState<Screen>(() =>
    new URLSearchParams(window.location.search).get('live') === '1' ? 'live' : 'welcome',
  )
  const [credits, setCredits] = useState(false)
  const beat = parseBeat(window.location.search)

  return (
    <>
      {screen === 'welcome' ? (
        <Welcome beat={beat} onStart={() => setScreen('live')} onCredits={() => setCredits(true)} />
      ) : (
        <Suspense fallback={<main className="welcome"><p>Opening the mirror…</p></main>}>
          <Stage />
        </Suspense>
      )}
      {credits && screen === 'welcome' && <Credits onClose={() => setCredits(false)} />}
    </>
  )
}
