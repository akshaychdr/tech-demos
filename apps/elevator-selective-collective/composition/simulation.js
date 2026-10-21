/**
 * Elevator traffic simulation — down collective vs selective collective (LOOK).
 * Gina Barney, "The History of Lift Traffic Control"; Harris terminology.
 */

export const SIM = {
  floors: 10,
  travelPerFloor: 1.0,
  dwell: 1.5,
}

export const WAIT_DEFINITION =
  'Wait = registration → car arrives at your floor (excludes dwell). Journey = registration → you reach your destination floor (includes dwell at intervening stops).'

/** @typedef {{ id: string, label: string, origin: number, destination: number, registeredAt: number }} PassengerSpec */

export const DEMO_PASSENGERS = [
  { id: 'p1', label: 'Lobby → 9F', origin: 1, destination: 9, registeredAt: 0 },
  { id: 'p2', label: '4F → 7F (up)', origin: 4, destination: 7, registeredAt: 0 },
  { id: 'p3', label: '8F → 1F (down)', origin: 8, destination: 1, registeredAt: 0 },
]

/**
 * @param {'down-collective' | 'selective-collective'} mode
 */
export function simulatePassengers(mode) {
  const passengers = DEMO_PASSENGERS.map((p) => ({
    ...p,
    pickedUpAt: null,
    deliveredAt: null,
    wait: null,
    journey: null,
  }))

  let time = 0
  let floor = 1
  let direction = 'up'

  /** @type {typeof passengers} */
  let inCar = []
  /** @type {typeof passengers} */
  let waiting = [...passengers]

  /** @type {Set<number>} */
  const carCalls = new Set()

  const landingCalls = () => {
    /** @type {{ floor: number, dir: 'up' | 'down' }[]} */
    const list = []
    for (const p of waiting) {
      if (mode === 'selective-collective') {
        list.push({
          floor: p.origin,
          dir: p.destination > p.origin ? 'up' : 'down',
        })
      } else if (p.origin > 1) {
        list.push({ floor: p.origin, dir: 'down' })
      }
    }
    return list
  }

  const stopAt = (f) => {
    const land = landingCalls()

    for (const p of [...inCar]) {
      if (p.destination === f) {
        inCar = inCar.filter((x) => x !== p)
        p.deliveredAt = time
        p.journey = time - p.registeredAt
        carCalls.delete(p.destination)
      }
    }

    const toBoard = waiting.filter((p) => p.origin === f)
    const mayBoard =
      f === 1 ||
      (mode === 'selective-collective' &&
        land.some((lc) => lc.floor === f && lc.dir === direction)) ||
      (mode === 'down-collective' && direction === 'down' && f > 1)

    if (mayBoard || f === 1) {
      for (const p of toBoard) {
        if (f === 1 || mayBoard) {
          waiting = waiting.filter((x) => x !== p)
          inCar.push(p)
          p.pickedUpAt = time
          p.wait = p.origin === 1 && time === 0 ? 0 : time - p.registeredAt
          carCalls.add(p.destination)
        }
      }
    }

    time += SIM.dwell
  }

  const nextStop = () => {
    const land = landingCalls()
    const stops = new Set()

    if (direction === 'up') {
      if (mode === 'selective-collective') {
        for (const lc of land) {
          if (lc.dir === 'up' && lc.floor > floor) stops.add(lc.floor)
        }
      }
      for (const d of carCalls) {
        if (d > floor) stops.add(d)
      }
      if (stops.size) return Math.min(...stops)
      direction = 'down'
    }

    if (direction === 'down') {
      if (mode === 'selective-collective') {
        for (const lc of land) {
          if (lc.dir === 'down' && lc.floor < floor) stops.add(lc.floor)
        }
      } else {
        for (const lc of land) {
          if (lc.floor < floor) stops.add(lc.floor)
        }
      }
      for (const d of carCalls) {
        if (d < floor) stops.add(d)
      }
      if (stops.size) return Math.max(...stops)
      direction = 'up'
    }

    if (direction === 'up') {
      for (const d of carCalls) {
        if (d > floor) stops.add(d)
      }
      if (stops.size) return Math.min(...stops)
    }

    return null
  }

  stopAt(1)

  let guard = 0
  while (passengers.some((p) => p.deliveredAt === null) && guard++ < 100) {
    const target = nextStop()
    if (target === null) break
    time += Math.abs(target - floor) * SIM.travelPerFloor
    floor = target
    stopAt(floor)
  }

  const waits = passengers.map((p) => p.wait ?? 0)
  const journeys = passengers.map((p) => p.journey ?? 0)

  return {
    mode,
    passengers,
    meanWait: mean(waits),
    meanJourney: mean(journeys),
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
