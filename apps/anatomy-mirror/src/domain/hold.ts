import { dist } from './math.ts'
import type { Vec3 } from './types.ts'

export type HoldState = {
  id: string | null
  started: number
  lastSeen: number
  origin: Vec3 | null
  latched: boolean
}

export const emptyHold = (): HoldState => ({
  id: null,
  started: 0,
  lastSeen: 0,
  origin: null,
  latched: false,
})

export type HoldOptions = {
  holdMs: number
  gapMs: number
  stillRadius: number
}

/** A placement counts once it stays on the same target, nearly still, for holdMs. */
export function stepHold(
  state: HoldState,
  id: string | null,
  point: Vec3 | null,
  now: number,
  options: HoldOptions,
): { state: HoldState; ready: boolean } {
  if (!id || !point) {
    if (state.id && now - state.lastSeen <= options.gapMs) return { state, ready: false }
    return { state: emptyHold(), ready: false }
  }
  const moved = state.origin ? dist(point, state.origin) > options.stillRadius : true
  if (state.id !== id || moved) {
    return {
      state: { id, started: now, lastSeen: now, origin: point, latched: false },
      ready: false,
    }
  }
  const next: HoldState = { ...state, lastSeen: now }
  const ready = !state.latched && now - state.started >= options.holdMs
  if (ready) next.latched = true
  return { state: next, ready }
}
