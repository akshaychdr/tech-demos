import type { BlendshapeMap, MuscleId } from './types.ts'

export const MUSCLE_IDS: MuscleId[] = [
  'frontalis',
  'corrugator',
  'orbicularis',
  'oris',
  'zygomaticus',
  'masseter',
  'temporalis',
]

/** A muscle counts as held once its score clears this. */
export const ACTIVE_THRESHOLD = 0.4

const clamp = (n: number) => Math.min(1, Math.max(0, n))

function read(scores: BlendshapeMap, name: string): number {
  return scores[name] ?? 0
}

function pair(scores: BlendshapeMap, left: string, right: string): number {
  const a = read(scores, left)
  const b = read(scores, right)
  return 0.5 * (a + b) * 0.5 + 0.5 * Math.max(a, b)
}

export function scoreMuscles(scores: BlendshapeMap): Record<MuscleId, number> {
  const browUp = (read(scores, 'browInnerUp') + pair(scores, 'browOuterUpLeft', 'browOuterUpRight')) / 2
  const browDown = pair(scores, 'browDownLeft', 'browDownRight')
  const squint = pair(scores, 'eyeSquintLeft', 'eyeSquintRight')
  const blink = pair(scores, 'eyeBlinkLeft', 'eyeBlinkRight')
  const smile = pair(scores, 'mouthSmileLeft', 'mouthSmileRight')
  const press = pair(scores, 'mouthPressLeft', 'mouthPressRight')
  const cheek = pair(scores, 'cheekSquintLeft', 'cheekSquintRight')
  const jaw = read(scores, 'jawOpen')
  const close = read(scores, 'mouthClose')

  const frontalis = clamp(browUp * 1.2 - browDown * 0.85)
  const corrugator = clamp(browDown * 1.2 - browUp * 0.8)
  const squeeze = clamp(squint * 0.7 + blink * 0.4 - smile * 0.45)
  const orbicularis = squint >= 0.32 && blink >= 0.28 ? squeeze : squeeze * 0.2
  const zygomaticus = clamp(smile * 1.1)
  const clench = Math.max(press, close * 0.85, cheek * 0.4)
  const masseter =
    jaw < 0.2 && smile < 0.4 ? clamp(((0.2 - jaw) / 0.2) * clench * 1.45) : clamp(clench * 0.12)
  const pucker = Math.max(read(scores, 'mouthPucker'), read(scores, 'mouthFunnel'))
  // Kept below the five game muscles unless the lips are actually pursed or the jaw is wide open.
  const oris = clamp(pucker * 1.15)
  const temporalis = clamp(jaw * 0.32)

  return { frontalis, corrugator, orbicularis, oris, zygomaticus, masseter, temporalis }
}

/** How far each muscle should move. This follows the blendshape, not the quiz threshold. */
export function muscleMotion(scores: BlendshapeMap): Record<MuscleId, number> {
  const browUp = (read(scores, 'browInnerUp') + pair(scores, 'browOuterUpLeft', 'browOuterUpRight')) / 2
  const browDown = pair(scores, 'browDownLeft', 'browDownRight')
  const squint = pair(scores, 'eyeSquintLeft', 'eyeSquintRight')
  const blink = pair(scores, 'eyeBlinkLeft', 'eyeBlinkRight')
  const smile = pair(scores, 'mouthSmileLeft', 'mouthSmileRight')
  const jaw = read(scores, 'jawOpen')
  const pucker = Math.max(read(scores, 'mouthPucker'), read(scores, 'mouthFunnel'))
  return {
    frontalis: clamp(browUp),
    corrugator: clamp(browDown),
    orbicularis: clamp(Math.max(squint, blink * 0.9)),
    oris: clamp(pucker),
    zygomaticus: clamp(smile),
    masseter: clamp(jaw),
    temporalis: clamp(jaw),
  }
}

export function activeMuscle(scored: Record<MuscleId, number>): MuscleId | null {
  let best: MuscleId | null = null
  let value = ACTIVE_THRESHOLD
  for (const id of MUSCLE_IDS) {
    if (scored[id] > value) {
      value = scored[id]
      best = id
    }
  }
  return best
}

/** True when the asked muscle is clearly the one being held. */
export function matchesMuscle(scored: Record<MuscleId, number>, target: MuscleId): boolean {
  const mine = scored[target]
  let other = 0
  for (const id of MUSCLE_IDS) {
    if (id !== target) other = Math.max(other, scored[id])
  }
  return mine >= ACTIVE_THRESHOLD && mine >= other - 0.04
}
