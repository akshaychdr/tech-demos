import {
  LAYOUT,
  floorCenterY,
  carTranslateY,
  carTranslateX,
  callToShaftPath,
  assertFloorAlignment,
} from './layout.js'
import {
  simulatePassengers,
  formatSeconds,
  SIM,
  WAIT_DEFINITION,
  DEMO_PASSENGERS,
  getStateAtSimTime,
} from './simulation.js'

const CALL_FLOORS = [4, 7, 8]
const GUTTER_X = 1188

export const STORYBOARD = {
  totalDuration: 80,
  termsEnd: 10,
  downStart: 10,
  downDuration: 30,
  selectiveStart: 40,
  selectiveDuration: 22,
  statsStart: 62,
}

const RIDER_IMG = {
  a: 'art/processed/passenger-1.png',
  b: 'art/processed/passenger-2.png',
  c: 'art/processed/passenger-3.png',
  d: 'art/processed/passenger-4.png',
}

export function initComposition() {
  window.__timelines = window.__timelines || {}
  const car = document.getElementById('car')
  const doorL = car.querySelector('.door-left')
  const doorR = car.querySelector('.door-right')
  const indicator = document.getElementById('car-indicator')

  car.style.width = `${LAYOUT.carWidth}px`
  car.style.height = `${LAYOUT.carHeight}px`

  buildFloorGutter()
  buildFloorLabels()
  buildLandings()
  buildCalls()
  placeLandingRiders()
  populateStatsRiders()

  const down = simulatePassengers('down-collective')
  const sel = simulatePassengers('selective-collective')
  const maxWait = Math.max(down.meanWait, sel.meanWait)

  document.getElementById('val-down-wait').textContent = formatSeconds(down.meanWait)
  document.getElementById('val-sel-wait').textContent = formatSeconds(sel.meanWait)
  document.getElementById('val-down-journey').textContent = formatSeconds(down.meanJourney)
  document.getElementById('val-sel-journey').textContent = formatSeconds(sel.meanJourney)
  document.getElementById('wait-footnote').textContent = `${WAIT_DEFINITION} ${SIM.travelPerFloor}s/floor, ${SIM.dwell}s dwell, car starts 1F.`
  document.getElementById('stats-takeaway').textContent =
    'Selective collective serves hall calls in the direction of travel, so average wait and journey are lower for the same four riders.'

  document.getElementById('bar-down-wait').style.width = `${(down.meanWait / maxWait) * 100}%`
  document.getElementById('bar-sel-wait').style.width = `${(sel.meanWait / maxWait) * 100}%`

  fillRiderStats(down, sel)

  const pathDown = document.getElementById('path-down')
  const pathSel = document.getElementById('path-selective')
  pathDown.setAttribute('d', routePathFromSegments(down.segments))
  pathSel.setAttribute('d', routePathFromSegments(sel.segments))

  const expHeadline = document.getElementById('exp-headline')
  const expSubtitle = document.getElementById('exp-subtitle')
  const expDir = document.getElementById('exp-direction')
  const expWaiting = document.getElementById('exp-waiting')
  const termsPanel = document.getElementById('terms-panel')
  const sceneTag = document.getElementById('scene-tag')
  const stats = document.getElementById('stats')
  const typography = document.getElementById('typography')
  const plateWrap = document.getElementById('plate-wrap')
  const camera = document.getElementById('camera')
  const logo = document.getElementById('logo-line')
  const riderCount = document.getElementById('rider-count')

  let prevF = 1
  let lastTravelDir = 'up'

  function setRopes(carFloor) {
    const carTop = carTranslateY(carFloor)
    const rope = document.getElementById('rope')
    rope.setAttribute(
      'd',
      `M ${LAYOUT.sheaveX} ${LAYOUT.sheaveY + 28} L ${LAYOUT.sheaveX} ${carTop + 6}`,
    )
  }

  function setDoors(open, amount = 1) {
    const spread = open ? 92 * amount : 0
    doorL.style.transform = `translateX(${-spread}%)`
    doorR.style.transform = `translateX(${spread}%)`
    doorL.style.opacity = open ? Math.max(0.15, 1 - amount * 0.9) : 1
    doorR.style.opacity = open ? Math.max(0.15, 1 - amount * 0.9) : 1
  }

  function setCarFloor(f, doorsOpen = false, doorAmt = 1, travelDir = null) {
    const x = carTranslateX()
    const y = carTranslateY(f)
    car.style.transform = `translate(${x}px, ${y}px)`
    setRopes(f)
    setDoors(doorsOpen, doorAmt)

    const rounded = Math.max(1, Math.min(LAYOUT.floors, Math.round(f)))
    let dir = travelDir
    if (!dir) {
      dir = Math.abs(f - prevF) < 0.02 ? lastTravelDir : f >= prevF ? 'up' : 'down'
    }
    lastTravelDir = dir
    if (Math.abs(f - prevF) >= 0.02) prevF = f
    const arrow = dir === 'up' ? '▲' : '▼'
    indicator.textContent = `${arrow} ${rounded}F`
  }

  function presentationToSim(t) {
    if (t < STORYBOARD.downStart) return { phase: 'terms', mode: null, simTime: 0 }
    if (t < STORYBOARD.selectiveStart) {
      const p = (t - STORYBOARD.downStart) / STORYBOARD.downDuration
      return { phase: 'down', mode: 'down-collective', simTime: p * down.finishTime }
    }
    if (t < STORYBOARD.statsStart) {
      const p = (t - STORYBOARD.selectiveStart) / STORYBOARD.selectiveDuration
      return { phase: 'selective', mode: 'selective-collective', simTime: p * sel.finishTime }
    }
    return { phase: 'stats', mode: null, simTime: 0 }
  }

  const liveExplainer = document.getElementById('live-explainer')
  const callsRoot = document.getElementById('calls')

  function setCallBadgeStyle(mode) {
    if (callsRoot) callsRoot.setAttribute('data-mode', mode)
    document.querySelectorAll('.call-badge').forEach((g) => {
      const dir = g.querySelector('.call-dir')
      const floor = Number(g.dataset.floor)
      if (!dir) return
      if (mode === 'down-collective') {
        dir.textContent = ''
      } else {
        dir.textContent = floor === 8 ? '▼' : '▲'
      }
    })
  }

  function positionLandingRider(el, floor) {
    const x = LAYOUT.shaftLeft - 118
    const y = floorCenterY(floor) + 8
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }

  function updateCallBadges(waitingIds) {
    const originByRider = { b: 4, c: 7, d: 8 }
    for (const f of CALL_FLOORS) {
      const badge = document.querySelector(`.call-badge[data-floor="${f}"]`)
      if (!badge) continue
      const lit = Object.entries(originByRider).some(
        ([id, fl]) => fl === f && waitingIds.includes(id),
      )
      badge.style.opacity = lit ? '1' : '0.22'
    }
  }

  function updateRiders(state, carFloor = 1, doorsOpen = false) {
    for (const spec of DEMO_PASSENGERS) {
      const landing = document.getElementById(`rider-${spec.id}-landing`)
      const inCab = document.getElementById(`rider-${spec.id}-cab`)
      if (!landing || !inCab) continue

      let showLanding = state.waiting.includes(spec.id)
      let showCab = state.inCar.includes(spec.id)
      let landingFloor = spec.origin

      if (
        doorsOpen &&
        showCab &&
        spec.destination === Math.round(carFloor) &&
        !state.delivered.includes(spec.id)
      ) {
        showLanding = true
        showCab = false
        landingFloor = Math.round(carFloor)
      }

      if (showLanding) positionLandingRider(landing, landingFloor)
      landing.style.opacity = showLanding ? '1' : '0'
      inCab.style.opacity = showCab ? '1' : '0'
    }
    const inCarCount = state.inCar.length
    riderCount.textContent = inCarCount ? `${inCarCount} in car` : ''
    riderCount.style.opacity = inCarCount ? '1' : '0'
  }

  function applyPresentationTime(t) {
    const { phase, mode, simTime } = presentationToSim(t)

    termsPanel.style.opacity = phase === 'terms' ? '1' : '0'
    stats.style.opacity = phase === 'stats' ? '1' : '0'
    typography.style.opacity = '0'
    liveExplainer.style.opacity = phase === 'stats' ? '0' : '1'
    plateWrap.classList.toggle('dimmed', phase === 'stats')
    if (phase === 'stats') plateWrap.style.opacity = '0.35'
    else plateWrap.style.opacity = '1'

    pathDown.style.opacity = phase === 'down' ? '0.85' : '0'
    pathSel.style.opacity = phase === 'selective' ? '0.88' : '0'
    if (phase === 'terms') {
      sceneTag.textContent = 'Scene 0 · Terms'
      setCallBadgeStyle('selective-collective')
      expHeadline.textContent = 'Car call, landing call, dwell'
      expSubtitle.textContent =
        'Same four riders (A–D) and the same calls at t=0 for both control systems.'
      expDir.textContent = '—'
      expWaiting.textContent = 'B @ 4F · C @ 7F · D @ 8F still waiting in the hallway'
      setCarFloor(1, true, 1)
      for (const spec of DEMO_PASSENGERS) {
        if (spec.id === 'a') continue
        const landing = document.getElementById(`rider-${spec.id}-landing`)
        if (landing) positionLandingRider(landing, spec.origin)
      }
      updateRiders({
        waiting: ['b', 'c', 'd'],
        inCar: ['a'],
        delivered: [],
      })
      updateCallBadges(['b', 'c', 'd'])
      car.style.opacity = '1'
      return
    }

    if (phase === 'stats') {
      sceneTag.textContent = 'Scene 3 · Comparison'
      expHeadline.textContent = 'Mean wait vs mean journey'
      expSubtitle.textContent = WAIT_DEFINITION
      expDir.textContent = '—'
      expDir.removeAttribute('data-dir')
      expWaiting.textContent = ''
      setCarFloor(1, false, 0)
      car.style.opacity = '0.35'
      updateRiders({ waiting: [], inCar: [], delivered: ['a', 'b', 'c', 'd'] })
      document.querySelectorAll('.call-badge').forEach((g) => {
        g.style.opacity = '0.35'
      })
      return
    }

    const sim = mode === 'down-collective' ? down : sel
    const state = getStateAtSimTime(sim, simTime)
    setCallBadgeStyle(mode)
    sceneTag.textContent =
      mode === 'down-collective' ? 'Scene 1 · Down collective' : 'Scene 2 · Selective collective'
    expHeadline.textContent = state.headline
    expSubtitle.textContent = state.subtitle
    expDir.textContent = state.direction === 'up' ? 'UP' : 'DOWN'
    expDir.dataset.dir = state.direction
    expWaiting.textContent = state.stillWaiting.length
      ? `Still waiting: ${state.stillWaiting.join(' · ')}`
      : 'No hallway waits left'
    setCarFloor(state.floor, state.doorsOpen, state.doorsOpen ? 1 : 0, state.direction)
    car.style.opacity = '1'
    updateRiders(state, state.floor, state.doorsOpen)
    updateCallBadges(state.waiting)
    if (
      mode === 'selective-collective' &&
      state.doorsOpen &&
      Math.abs(state.floor - 7) < 0.2 &&
      state.simTime >= 9.2
    ) {
      expSubtitle.textContent = 'B exits at 7F while C boards — same dwell, two riders.'
    }
  }

  gsap.set('#headline .word', { y: 28, opacity: 0 })
  gsap.set('#subhead', { opacity: 0 })
  applyPresentationTime(0)

  const tl = gsap.timeline({
    paused: true,
    onUpdate: () => applyPresentationTime(tl.time()),
  })

  tl.to('#headline .word', { opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: 'back.out(1.4)' }, 0.4)
  tl.to('#subhead', { opacity: 1, duration: 0.8, ease: 'power2.out' }, 1.1)
  tl.fromTo(camera, { scale: 1, x: 0, y: 0 }, { scale: 1.03, x: -10, y: 4, duration: STORYBOARD.totalDuration, ease: 'none' }, 0)
  tl.to(plateWrap, { opacity: 1, duration: 1.2, ease: 'power2.out' }, 0.2)
  tl.to(car, { opacity: 1, duration: 0.5 }, 1.2)
  tl.to('.call-badge', { opacity: 1, duration: 0.6, stagger: 0.08 }, 2)
  tl.to('.landing-rider', { opacity: 1, duration: 0.5, stagger: 0.06 }, 2.2)
  tl.to(logo, { opacity: 1, duration: 0.8 }, STORYBOARD.statsStart + 2)
  tl.to({}, { duration: STORYBOARD.totalDuration - 0.01 })

  window.__timelines['selective-collective'] = tl
  window.__storyboard = STORYBOARD
  window.__sims = { down, sel }

  window.__validateCab = (floor) => {
    applyPresentationTime(tl.time())
    return validateCabPlacement(floor)
  }

  tl.seek(0)
  applyPresentationTime(0)
}

function fillRiderStats(down, sel) {
  const tbody = document.getElementById('rider-stats-body')
  if (!tbody) return
  tbody.innerHTML = ''
  for (const spec of DEMO_PASSENGERS) {
    const pd = down.passengers.find((p) => p.id === spec.id)
    const ps = sel.passengers.find((p) => p.id === spec.id)
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${spec.label}</td>
      <td>${spec.origin}F → ${spec.destination}F</td>
      <td class="stat-down">${formatSeconds(pd?.wait ?? 0)}</td>
      <td class="stat-down">${formatSeconds(pd?.journey ?? 0)}</td>
      <td class="stat-sel">${formatSeconds(ps?.wait ?? 0)}</td>
      <td class="stat-sel">${formatSeconds(ps?.journey ?? 0)}</td>
    `
    tbody.appendChild(tr)
  }
}

function routePathFromSegments(segments) {
  const shaftX = LAYOUT.shaftCenterX
  const travels = segments.filter((s) => s.phase === 'travel')
  if (!travels.length) return `M ${shaftX} ${floorCenterY(1)}`
  let d = `M ${shaftX} ${floorCenterY(travels[0].fromFloor)}`
  for (const s of travels) {
    d += ` L ${shaftX} ${floorCenterY(s.toFloor)}`
  }
  return d
}

export function validateCabPlacement(floor) {
  const car = document.getElementById('car')
  const shell = car?.querySelector('.neon-cab-body')
  if (!car || !shell) return { ok: false, error: 'missing #car or neon cab body' }
  const rect = car.getBoundingClientRect()
  const shellRect = shell.getBoundingClientRect()
  if (rect.width < 48 || rect.height < 48) {
    return { ok: false, error: `cab box too small: ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}` }
  }
  if (shellRect.width < 40 || shellRect.height < 40) {
    return { ok: false, error: `neon cab shell too small: ${shellRect.width.toFixed(1)}×${shellRect.height.toFixed(1)}` }
  }
  const cx = rect.left + rect.width / 2
  if (cx < LAYOUT.shaftLeft - 12 || cx > LAYOUT.shaftRight + 12) {
    return {
      ok: false,
      error: `cab center x=${cx.toFixed(1)} outside shaft [${LAYOUT.shaftLeft}, ${LAYOUT.shaftRight}]`,
    }
  }
  const fy = floorCenterY(floor)
  if (fy < rect.top - 24 || fy > rect.bottom + 24) {
    return {
      ok: false,
      error: `floor ${floor} y=${fy.toFixed(1)} outside cab vertical span [${rect.top.toFixed(1)}, ${rect.bottom.toFixed(1)}]`,
    }
  }
  return { ok: true, cx, fy, width: rect.width, height: rect.height }
}

function placeLandingRiders() {
  for (const spec of DEMO_PASSENGERS) {
    if (spec.origin === 1 && spec.startsInCar) continue
    const el = document.getElementById(`rider-${spec.id}-landing`)
    if (!el) continue
    const x = LAYOUT.shaftLeft - 118
    const y = floorCenterY(spec.origin)
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }
}

function buildFloorGutter() {
  const g = document.getElementById('floor-gutter')
  const top = floorCenterY(LAYOUT.floors) - 18
  const bottom = floorCenterY(1) + 18
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('x', GUTTER_X - 52)
  rect.setAttribute('y', top)
  rect.setAttribute('width', 48)
  rect.setAttribute('height', bottom - top)
  rect.setAttribute('rx', 4)
  rect.setAttribute('class', 'floor-gutter-bg')
  g.appendChild(rect)
  for (let f = 1; f <= LAYOUT.floors; f++) {
    const cy = floorCenterY(f)
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    tick.setAttribute('x1', GUTTER_X - 8)
    tick.setAttribute('x2', GUTTER_X)
    tick.setAttribute('y1', cy)
    tick.setAttribute('y2', cy)
    tick.setAttribute('class', 'floor-tick')
    g.appendChild(tick)
  }
}

function buildFloorLabels() {
  const g = document.getElementById('floor-labels')
  for (let f = 1; f <= LAYOUT.floors; f++) {
    const cy = floorCenterY(f)
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    t.setAttribute('x', GUTTER_X - 14)
    t.setAttribute('y', cy + 5)
    t.setAttribute('text-anchor', 'end')
    t.setAttribute('class', 'floor-label')
    t.textContent = `${f}F`
    g.appendChild(t)
  }
}

function buildLandings() {
  const landingsG = document.getElementById('landings')
  for (let f = 1; f <= LAYOUT.floors; f++) {
    const cy = floorCenterY(f)
    const lg = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    lg.setAttribute('transform', `translate(${LAYOUT.hallPanelX}, ${cy})`)
    lg.innerHTML = `
      <rect class="hall-btn" x="-6" y="-7" width="10" height="14" rx="2"/>
      <circle class="hall-lantern" cx="10" cy="0" r="5" opacity="0"/>
    `
    landingsG.appendChild(lg)
  }
}

function buildCalls() {
  const callsG = document.getElementById('calls')
  const callPathsG = document.getElementById('call-paths')
  const align = []
  const arrowFor = (f) => (f === 8 ? '▼' : '▲')
  CALL_FLOORS.forEach((f) => {
    const cy = floorCenterY(f)
    align.push({ floor: f, cy })
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('class', 'call-badge')
    g.dataset.floor = String(f)
    g.setAttribute('transform', `translate(${LAYOUT.callX}, ${cy})`)
    g.innerHTML = `
      <circle class="call-circle" cx="0" cy="0" r="22"/>
      <circle class="call-dot" cx="0" cy="-2" r="5" opacity="0"/>
      <text class="call-num" x="0" y="6">${f}</text>
      <text class="call-dir" x="0" y="-14">${arrowFor(f)}</text>
    `
    callsG.appendChild(g)
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('class', 'call-path')
    p.setAttribute('d', callToShaftPath(f))
    callPathsG.appendChild(p)
  })
  assertFloorAlignment(align)
}

function populateStatsRiders() {
  // placeholder for HTML table built in fillRiderStats
}
