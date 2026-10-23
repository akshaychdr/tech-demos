/**
 * Elevator traffic simulation — down collective vs selective collective.
 * Gina Barney, "The History of Lift Traffic Control"; Harris terminology.
 */

export const SIM = {
  floors: 9,
  travelPerFloor: 1.0,
  dwell: 1.5,
}

export const WAIT_DEFINITION =
  'Wait = time from t=0 until the car arrives at your floor. Journey = time from t=0 until you reach your destination floor (includes dwell at stops along the way).'

/** @typedef {'a'|'b'|'c'|'d'} RiderId */

/** @typedef {{ id: RiderId, label: string, origin: number, destination: number, registeredAt: number, startsInCar?: boolean }} PassengerSpec */

export const DEMO_PASSENGERS = [
  { id: 'a', label: 'A', origin: 1, destination: 9, registeredAt: 0, startsInCar: true },
  { id: 'b', label: 'B', origin: 4, destination: 7, registeredAt: 0 },
  { id: 'c', label: 'C', origin: 7, destination: 9, registeredAt: 0 },
  { id: 'd', label: 'D', origin: 8, destination: 1, registeredAt: 0 },
]

/**
 * @typedef {object} SimEvent
 * @property {number} time
 * @property {string} kind
 * @property {number} [floor]
 * @property {'up'|'down'} [direction]
 * @property {RiderId[]} [boarded]
 * @property {RiderId[]} [alighted]
 * @property {string} [headline]
 * @property {string} [subtitle]
 */

/**
 * @typedef {object} SimSegment
 * @property {number} t0
 * @property {number} t1
 * @property {number} fromFloor
 * @property {number} toFloor
 * @property {'travel'|'dwell'} phase
 * @property {'up'|'down'} direction
 */

/**
 * @param {'down-collective' | 'selective-collective'} mode
 */
export function simulatePassengers(mode) {
  const run = runSimulation(mode)
  return {
    mode,
    passengers: run.passengers,
    meanWait: mean(run.passengers.map((p) => p.wait ?? 0)),
    meanJourney: mean(run.passengers.map((p) => p.journey ?? 0)),
    finishTime: run.finishTime,
    events: run.events,
    segments: run.segments,
  }
}

/**
 * @param {'down-collective' | 'selective-collective'} mode
 */
export function runSimulation(mode) {
  /** @type {import('./simulation.js').PassengerSpec & { pickedUpAt: number|null, deliveredAt: number|null, wait: number|null, journey: number|null }} */
  const passengers = DEMO_PASSENGERS.map((p) => ({
    ...p,
    pickedUpAt: p.startsInCar ? 0 : null,
    deliveredAt: null,
    wait: p.startsInCar ? 0 : null,
    journey: null,
  }))

  /** @type {SimEvent[]} */
  const events = []
  /** @type {SimSegment[]} */
  const segments = []

  let time = 0
  let floor = 1
  let direction = 'up'

  /** @type {typeof passengers} */
  let inCar = passengers.filter((p) => p.startsInCar)
  /** @type {typeof passengers} */
  let waiting = passengers.filter((p) => !p.startsInCar)

  /** @type {Set<number>} */
  const carCalls = new Set()
  for (const p of inCar) carCalls.add(p.destination)

  const landingCalls = () => {
    /** @type {{ floor: number, dir: 'up' | 'down', rider: RiderId }[]} */
    const list = []
    for (const p of waiting) {
      if (mode === 'selective-collective') {
        list.push({
          floor: p.origin,
          dir: p.destination > p.origin ? 'up' : 'down',
          rider: p.id,
        })
      } else if (p.origin > 1) {
        list.push({ floor: p.origin, dir: 'down', rider: p.id })
      }
    }
    return list
  }

  const pendingCallLabels = () => {
    const land = landingCalls()
    const parts = []
    for (const p of waiting) {
      const dir =
        mode === 'selective-collective'
          ? p.destination > p.origin
            ? 'up'
            : 'down'
          : 'hall'
      parts.push(`${p.label} @ ${p.origin}F (${dir})`)
    }
    for (const d of [...carCalls].sort((a, b) => a - b)) {
      parts.push(`Car call ${d}F`)
    }
    return parts
  }

  const pushEvent = (kind, extra = {}) => {
    events.push({ time, kind, direction, ...extra })
  }

  const dwellAt = (f) => {
    const t0 = time
    pushEvent('dwell_start', {
      floor: f,
      headline: `Doors open at ${f}F`,
      subtitle: captionForStop(mode, f, direction, 'dwell'),
    })
    segments.push({
      t0,
      t1: t0 + SIM.dwell,
      fromFloor: f,
      toFloor: f,
      phase: 'dwell',
      direction,
    })

    const land = landingCalls()
    /** @type {RiderId[]} */
    const alighted = []
    for (const p of [...inCar]) {
      if (p.destination === f) {
        inCar = inCar.filter((x) => x !== p)
        p.deliveredAt = time
        p.journey = time - p.registeredAt
        carCalls.delete(p.destination)
        alighted.push(p.id)
      }
    }

    const toBoard = waiting.filter((p) => p.origin === f)
    /** @type {RiderId[]} */
    const boarded = []
    const mayBoardLanding =
      f === 1 ||
      (mode === 'selective-collective' &&
        land.some((lc) => lc.floor === f && lc.dir === direction)) ||
      (mode === 'down-collective' && direction === 'down' && f > 1)

    if (mayBoardLanding || f === 1) {
      for (const p of toBoard) {
        if (f === 1 || mayBoardLanding) {
          waiting = waiting.filter((x) => x !== p)
          inCar.push(p)
          p.pickedUpAt = time
          if (p.origin === 1 && time === 0) p.wait = 0
          else p.wait = time - p.registeredAt
          carCalls.add(p.destination)
          boarded.push(p.id)
        }
      }
    }

    time += SIM.dwell
    pushEvent('dwell_end', {
      floor: f,
      boarded,
      alighted,
      headline: boarded.length || alighted.length ? `Serving ${f}F` : `Leaving ${f}F`,
      subtitle: describeBoardAlight(boarded, alighted),
    })
  }

  const travelTo = (target) => {
    const dist = Math.abs(target - floor)
    if (dist === 0) return
    const dir = target > floor ? 'up' : 'down'
    direction = dir
    const t0 = time
    const travelTime = dist * SIM.travelPerFloor
    pushEvent('travel_start', {
      floor,
      direction: dir,
      headline: dir === 'up' ? 'Going UP' : 'Going DOWN',
      subtitle: travelCaption(mode, dir, floor, target, waiting, carCalls),
    })
    segments.push({
      t0,
      t1: t0 + travelTime,
      fromFloor: floor,
      toFloor: target,
      phase: 'travel',
      direction: dir,
    })
    time += travelTime
    floor = target
    pushEvent('arrive', {
      floor: target,
      direction: dir,
      headline: `Arrived ${target}F`,
      subtitle: `Car at ${target}F`,
    })
  }

  dwellAt(1)

  let guard = 0
  while (passengers.some((p) => p.deliveredAt === null) && guard++ < 120) {
    const target = nextStop(mode, floor, direction, landingCalls, carCalls)
    if (target === null) {
      const flipped = direction === 'up' ? 'down' : 'up'
      if (nextStop(mode, floor, flipped, landingCalls, carCalls) === null) break
      pushEvent('reverse', {
        floor,
        direction: flipped,
        headline: 'Top reached. The car turns around.',
        subtitle:
          mode === 'down-collective'
            ? 'Down collective: landing calls are served on the way down.'
            : 'Selective collective: now serving calls in the opposite direction.',
      })
      direction = flipped
      continue
    }
    travelTo(target)
    dwellAt(floor)
  }

  for (const ev of events) {
    ev.pending = pendingAtTime(events, ev.time, mode, passengers)
  }

  return {
    passengers,
    finishTime: time,
    events,
    segments,
  }
}

function pendingAtTime(events, t, mode, passengers) {
  // approximate: not used for runtime state
  return []
}

function nextStop(mode, floor, direction, landingCalls, carCalls) {
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
    return null
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
    return null
  }

  return null
}

function describeBoardAlight(boarded, alighted) {
  const bits = []
  if (alighted.length) bits.push(`${alighted.join(', ')} exit`)
  if (boarded.length) bits.push(`${boarded.join(', ')} board`)
  return bits.length ? bits.join(' · ') : 'Doors closing'
}

function travelCaption(mode, dir, from, to, waiting, carCalls) {
  if (mode === 'down-collective' && dir === 'up') {
    return 'Down collective: car ignores landing calls while going up.'
  }
  const skipped = []
  if (mode === 'selective-collective' && dir === 'up') {
    for (const p of waiting) {
      if (p.origin > from && p.origin < to && p.destination < p.origin) {
        skipped.push(`${p.origin}F wants DOWN`)
      }
    }
    if (skipped.length) {
      return `Going UP. ${skipped[0]}, so the car skips it for now.`
    }
    for (const p of waiting) {
      if (p.origin > from && p.origin <= to && p.destination > p.origin) {
        return `Going UP. ${p.origin}F wants to go up too, so the car stops.`
      }
    }
  }
  if (dir === 'down' && mode === 'selective-collective') {
    for (const p of waiting) {
      if (p.origin < from && p.origin >= to && p.destination < p.origin) {
        return `Going DOWN. Now it picks up ${p.origin}F.`
      }
    }
  }
  return dir === 'up' ? 'Travelling up the shaft.' : 'Travelling down the shaft.'
}

function captionForStop(mode, f, direction, _phase) {
  if (f === 1 && direction === 'up') return 'Car starts at lobby with rider A (car call 9F).'
  return `Dwell = the pause with doors open at ${f}F.`
}

/**
 * Snapshot of car + riders for a simulation time (seconds from t=0).
 * @param {ReturnType<typeof simulatePassengers>} sim
 * @param {number} simTime
 */
export function getStateAtSimTime(sim, simTime) {
  const t = Math.max(0, Math.min(simTime, sim.finishTime))
  let floor = 1
  let direction = 'up'
  let doorsOpen = false
  /** @type {Set<RiderId>} */
  const inCar = new Set(DEMO_PASSENGERS.filter((p) => p.startsInCar).map((p) => p.id))
  /** @type {Set<RiderId>} */
  const waiting = new Set(DEMO_PASSENGERS.filter((p) => !p.startsInCar).map((p) => p.id))
  /** @type {Set<RiderId>} */
  const delivered = new Set()

  let headline = 'Elevator simulation'
  let subtitle = ''

  const sorted = [...sim.events].sort((a, b) => a.time - b.time)
  for (const ev of sorted) {
    if (ev.time > t) break
    if (ev.headline) headline = ev.headline
    if (ev.subtitle) subtitle = ev.subtitle
    if (ev.kind === 'reverse') direction = ev.direction ?? direction
    if (ev.kind === 'dwell_start') {
      doorsOpen = true
      floor = ev.floor ?? floor
    }
    if (ev.kind === 'dwell_end') {
      doorsOpen = false
      floor = ev.floor ?? floor
      if (ev.boarded) for (const id of ev.boarded) {
        waiting.delete(id)
        inCar.add(id)
      }
      if (ev.alighted) for (const id of ev.alighted) {
        inCar.delete(id)
        delivered.add(id)
      }
    }
    if (ev.kind === 'arrive') {
      floor = ev.floor ?? floor
      direction = ev.direction ?? direction
    }
  }

  let dwellProgress = 0
  let dwellFloor = null
  let activeDwellEnd = null

  for (const seg of sim.segments) {
    if (t >= seg.t0 && t < seg.t1) {
      if (seg.phase === 'travel') {
        const p = (t - seg.t0) / (seg.t1 - seg.t0)
        floor = seg.fromFloor + (seg.toFloor - seg.fromFloor) * p
        direction = seg.direction
        doorsOpen = false
      } else {
        floor = seg.fromFloor
        doorsOpen = true
        direction = seg.direction
        dwellFloor = seg.fromFloor
        dwellProgress = (t - seg.t0) / (seg.t1 - seg.t0)
        activeDwellEnd = seg.t1
      }
      break
    }
  }

  if (doorsOpen && dwellFloor !== null && dwellProgress >= 0.5 && activeDwellEnd !== null) {
    const endEv = sorted.find(
      (ev) =>
        ev.kind === 'dwell_end' &&
        ev.floor === dwellFloor &&
        Math.abs(ev.time - activeDwellEnd) < 0.001,
    )
    if (endEv) {
      if (endEv.boarded) for (const id of endEv.boarded) {
        waiting.delete(id)
        inCar.add(id)
      }
      if (endEv.alighted) for (const id of endEv.alighted) {
        inCar.delete(id)
        delivered.add(id)
      }
    }
  }

  const stillWaiting = DEMO_PASSENGERS.filter((p) => waiting.has(p.id)).map(
    (p) => `${p.label} @ ${p.origin}F → ${p.destination}F`,
  )

  return {
    simTime: t,
    floor,
    direction,
    doorsOpen,
    inCar: [...inCar],
    waiting: [...waiting],
    delivered: [...delivered],
    headline,
    subtitle,
    stillWaiting,
  }
}

function mean(arr) {
  if (!arr.length) return 0
  return arr.reduce((s, x) => s + x, 0) / arr.length
}

export function formatSeconds(s) {
  return s.toFixed(1) + ' s'
}
