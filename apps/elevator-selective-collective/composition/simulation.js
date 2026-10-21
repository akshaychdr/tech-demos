/**
 * Discrete-event elevator simulation — hall calls only, one car.
 * Used for on-screen average wait times (FCFS vs selective collective / SCAN).
 */

/** @typedef {{ floor: number, direction: 'up' | 'down', registeredAt: number }} HallCall */

export const SIM = {
  floors: 10,
  travelPerFloor: 1.0,
  dwell: 1.5,
}

/** Fixed call list for the reel (see STORYBOARD.md). */
export const DEMO_CALLS = [
  { floor: 9, direction: 'up', registeredAt: 0 },
  { floor: 4, direction: 'up', registeredAt: 0 },
  { floor: 7, direction: 'up', registeredAt: 0 },
]

/**
 * @param {HallCall[]} calls
 * @param {'fcfs' | 'scan'} policy
 */
export function simulate(calls, policy) {
  const sorted = [...calls].sort((a, b) => a.registeredAt - b.registeredAt)
  let time = 0
  let floor = 1
  let direction = 'up'
  const pending = sorted.map((c) => ({ ...c, served: false }))
  const waits = []

  const travel = (to) => {
    const dist = Math.abs(to - floor)
    time += dist * SIM.travelPerFloor
    floor = to
  }

  const serveAt = (call) => {
    travel(call.floor)
    time += SIM.dwell
    waits.push(time - call.registeredAt)
    call.served = true
  }

  if (policy === 'fcfs') {
    for (const call of pending) {
      serveAt(call)
    }
    return { meanWait: mean(waits), waits, finishTime: time }
  }

  // Selective collective: SCAN-style hall-call service
  while (pending.some((c) => !c.served)) {
    const active = pending.filter((c) => !c.served)
    const ahead = active.filter((c) =>
      direction === 'up' ? c.floor >= floor : c.floor <= floor,
    )
    const inDirection = ahead.filter((c) => c.direction === direction)

    if (inDirection.length === 0) {
      direction = direction === 'up' ? 'down' : 'up'
      continue
    }

    const next =
      direction === 'up'
        ? inDirection.reduce((a, b) => (a.floor < b.floor ? a : b))
        : inDirection.reduce((a, b) => (a.floor > b.floor ? a : b))

    serveAt(next)
  }

  return { meanWait: mean(waits), waits, finishTime: time }
}

function mean(arr) {
  if (!arr.length) return 0
  return arr.reduce((s, x) => s + x, 0) / arr.length
}

export function formatSeconds(s) {
  return s.toFixed(1) + ' s'
}
