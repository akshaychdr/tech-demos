/**
 * Discrete-event elevator simulation — hall calls only, one car.
 */

/** @typedef {{ floor: number, direction: 'up' | 'down', registeredAt: number }} HallCall */
/** @typedef {{ floor: number, direction: string, registeredAt: number, arrivalTime: number, wait: number }} PassengerResult */

export const SIM = {
  floors: 10,
  travelPerFloor: 1.0,
  dwell: 1.5,
}

/** Wait = seconds from call registration until the car arrives at that floor (before door dwell). */
export const WAIT_DEFINITION =
  'Wait = time from call registration until the car reaches that floor (excludes the 1.5 s door-open dwell after arrival).'

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
  let time = 0
  let floor = 1
  let direction = 'up'
  const pending = calls.map((c) => ({ ...c, served: false }))
  /** @type {PassengerResult[]} */
  const passengers = []

  const travel = (to) => {
    time += Math.abs(to - floor) * SIM.travelPerFloor
    floor = to
  }

  const arriveAt = (call) => {
    travel(call.floor)
    const arrivalTime = time
    const wait = arrivalTime - call.registeredAt
    passengers.push({
      floor: call.floor,
      direction: call.direction,
      registeredAt: call.registeredAt,
      arrivalTime,
      wait,
    })
    time += SIM.dwell
    call.served = true
  }

  if (policy === 'fcfs') {
    for (const call of pending) {
      arriveAt(call)
    }
  } else {
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

      arriveAt(next)
    }
  }

  const waits = passengers.map((p) => p.wait)
  return {
    meanWait: mean(waits),
    waits,
    passengers,
    finishTime: time,
  }
}

function mean(arr) {
  if (!arr.length) return 0
  return arr.reduce((s, x) => s + x, 0) / arr.length
}

export function formatSeconds(s) {
  return s.toFixed(1) + ' s'
}
