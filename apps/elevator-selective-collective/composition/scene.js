import {
  LAYOUT,
  floorCenterY,
  carTranslateY,
  carTranslateX,
  callToShaftPath,
  assertFloorAlignment,
} from './layout.js'
import { simulatePassengers, formatSeconds, SIM, WAIT_DEFINITION } from './simulation.js'

const CALL_FLOORS = [4, 7, 8]

export function initComposition() {
  window.__timelines = window.__timelines || {}
  const car = document.getElementById('car')
  const doorL = car.querySelector('.door-left')
  const doorR = car.querySelector('.door-right')
  const indicator = document.getElementById('car-indicator')
  const riderLobby = document.getElementById('rider-lobby')

  car.style.width = `${LAYOUT.carWidth}px`
  car.style.height = `${LAYOUT.carHeight}px`

  buildFloorLabels()
  buildLandings()
  buildCalls()
  placeLandingWaiters()

  const down = simulatePassengers('down-collective')
  const sel = simulatePassengers('selective-collective')
  const maxWait = Math.max(down.meanWait, sel.meanWait)

  document.getElementById('val-down-wait').textContent = formatSeconds(down.meanWait)
  document.getElementById('val-sel-wait').textContent = formatSeconds(sel.meanWait)
  document.getElementById('val-down-journey').textContent = formatSeconds(down.meanJourney)
  document.getElementById('val-sel-journey').textContent = formatSeconds(sel.meanJourney)
  document.getElementById('wait-footnote').textContent = `${WAIT_DEFINITION} ${SIM.travelPerFloor}s/floor, ${SIM.dwell}s dwell, car starts 1F.`

  const shaftX = LAYOUT.shaftCenterX
  const pathDown = document.getElementById('path-down')
  const pathSel = document.getElementById('path-selective')
  pathDown.setAttribute('d', `M ${shaftX} ${floorCenterY(1)} L ${shaftX} ${floorCenterY(9)}`)
  pathSel.setAttribute(
    'd',
    `M ${shaftX} ${floorCenterY(1)} L ${shaftX} ${floorCenterY(4)} L ${shaftX} ${floorCenterY(7)} L ${shaftX} ${floorCenterY(9)} L ${shaftX} ${floorCenterY(8)} L ${shaftX} ${floorCenterY(1)}`,
  )

  const waiter4 = document.getElementById('waiter-4')
  const callPaths = document.querySelectorAll('.call-path')
  const callBadges = document.querySelectorAll('.call-badge')
  const lanterns = document.querySelectorAll('.hall-lantern')

  let prevF = 1

  function setRopes(carFloor) {
    const cy = floorCenterY(carFloor)
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

  function setCarFloor(f, overshoot = 0, doorsOpen = false, doorAmt = 1) {
    const x = carTranslateX()
    const y = carTranslateY(f, overshoot)
    car.style.transform = `translate(${x}px, ${y}px)`
    setRopes(f)
    setDoors(doorsOpen, doorAmt)

    const rounded = Math.max(1, Math.min(LAYOUT.floors, Math.round(f)))
    const dir = f >= prevF ? 'up' : 'down'
    prevF = f
    const arrow = dir === 'up' ? '▲' : '▼'
    indicator.textContent = `${arrow} ${rounded}`
  }

  const capTitle = document.getElementById('cap-title')
  const capBody = document.getElementById('cap-body')
  const sceneCaption = document.getElementById('scene-caption')
  const headline = document.querySelectorAll('#headline .word')
  const subhead = document.getElementById('subhead')
  const camera = document.getElementById('camera')
  const stats = document.getElementById('stats')
  const logo = document.getElementById('logo-line')
  const typography = document.getElementById('typography')
  const plateWrap = document.getElementById('plate-wrap')

  function applyCarStateAtTime(t) {
    if (t < 7) {
      setCarFloor(1, 0, true, 1)
      return
    }
    if (t < 9.8) {
      const p = Math.min(1, (t - 7) / 2.8)
      setCarFloor(1 + p * 8, 0, false, 0)
      return
    }
    if (t < 14) {
      setCarFloor(9, 0, false, 0)
      return
    }
    if (t < 14.8) {
      setCarFloor(1, 0, true, 1)
      return
    }
    if (t < 16.4) {
      const p = Math.min(1, (t - 14.8) / 1.6)
      setCarFloor(1 + p * 3, 0, false, 0)
      return
    }
    if (t < 17.2) {
      setCarFloor(4, 0, true, 1)
      return
    }
    if (t < 19.4) {
      const p = Math.min(1, (t - 17.2) / 2.2)
      setCarFloor(4 + p * 4.5, 0, false, 0)
      return
    }
    if (t < 28) {
      setCarFloor(8.5, 0, false, 0)
      return
    }
    setCarFloor(9, 0, false, 0)
  }

  gsap.set(headline, { y: 28, opacity: 0 })
  gsap.set(riderLobby, { opacity: 1 })
  applyCarStateAtTime(0)

  const tl = gsap.timeline({
    paused: true,
    onUpdate: () => applyCarStateAtTime(tl.time()),
  })

  tl.to(headline, { opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: 'back.out(1.4)' }, 0.4)
  tl.to(subhead, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 1.1)
  tl.fromTo(camera, { scale: 1, x: 0, y: 0 }, { scale: 1.04, x: -12, y: 6, duration: 5, ease: 'power1.inOut' }, 0)
  tl.to(plateWrap, { opacity: 1, duration: 1.2, ease: 'power2.out' }, 0.2)
  tl.to(car, { opacity: 1, duration: 0.5 }, 1.5)
  tl.to(callBadges, { opacity: 1, duration: 0.6, stagger: 0.08 }, 2)
  tl.to(['#waiter-4', '#waiter-7', '#waiter-8'], { opacity: 1, duration: 0.5, stagger: 0.06 }, 2.2)
  tl.to(typography, { opacity: 0, duration: 0.6 }, 5.2)

  tl.add(() => {
    capTitle.textContent = 'Down collective'
    capBody.textContent =
      'One hall button per landing — up travel serves car calls only. The 4F rider is passed on the way up.'
    gsap.set(waiter4, { opacity: 1 })
  }, 6)
  tl.to(sceneCaption, { opacity: 1, duration: 0.5 }, 6)
  tl.to(callPaths, { opacity: 0.92, duration: 0.5 }, 6.2)
  tl.to(lanterns, { opacity: 1, duration: 0.4 }, 6.2)
  tl.to(pathDown, { opacity: 0.88, duration: 0.5 }, 6.5)
  tl.to({}, { duration: 2.8, ease: 'power2.inOut' }, 7)
  tl.to(sceneCaption, { opacity: 0, duration: 0.4 }, 13.5)
  tl.to(pathDown, { opacity: 0, duration: 0.4 }, 13.5)

  tl.add(() => {
    capTitle.textContent = 'Selective collective (LOOK)'
    capBody.textContent =
      'Up and down hall buttons — landing calls in the direction of travel, then reverse.'
  }, 14)
  tl.to(sceneCaption, { opacity: 1, duration: 0.5 }, 14)
  tl.to(pathSel, { opacity: 0.9, duration: 0.5 }, 14.2)
  tl.to({}, { duration: 1.6, ease: 'power2.inOut' }, 14.8)
  tl.add(() => {}, 16.4)
  tl.to(waiter4, { opacity: 0, duration: 0.4 }, 16.4)
  tl.to({}, { duration: 2.2, ease: 'power2.inOut' }, 17.2)
  tl.fromTo(camera, { scale: 1.04 }, { scale: 1.06, x: -18, y: 8, duration: 4, ease: 'power2.inOut' }, 17)

  tl.to(sceneCaption, { opacity: 0, duration: 0.5 }, 27.5)
  tl.to(pathSel, { opacity: 0, duration: 0.5 }, 27.5)

  tl.add(() => {
    capTitle.textContent = ''
    capBody.textContent = ''
  }, 28)
  tl.to(sceneCaption, { opacity: 0, duration: 0.3 }, 28)
  tl.add(() => plateWrap.classList.add('dimmed'), 28)
  tl.to(plateWrap, { opacity: 0.35, duration: 0.8 }, 28)
  tl.to(stats, { opacity: 1, duration: 0.6 }, 28.2)
  tl.to('#bar-down-wait', { width: `${(down.meanWait / maxWait) * 100}%`, duration: 1 }, 29)
  tl.to('#bar-sel-wait', { width: `${(sel.meanWait / maxWait) * 100}%`, duration: 1 }, 29.3)
  tl.to(logo, { opacity: 1, duration: 0.8 }, 34)
  tl.fromTo(camera, { scale: 1.06 }, { scale: 1, x: 0, y: 0, duration: 3, ease: 'power2.inOut' }, 28)

  window.__timelines['selective-collective'] = tl

  window.__validateCab = (floor) => {
    applyCarStateAtTime(tl.time())
    return validateCabPlacement(floor)
  }

  tl.seek(0)
  applyCarStateAtTime(0)
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

function placeLandingWaiters() {
  for (const el of document.querySelectorAll('.landing-waiter')) {
    const f = Number(el.dataset.floor)
    const x = LAYOUT.shaftLeft - 92
    const y = floorCenterY(f)
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }
}

function buildFloorLabels() {
  const g = document.getElementById('floor-labels')
  for (let f = 1; f <= LAYOUT.floors; f++) {
    const cy = floorCenterY(f)
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    t.setAttribute('x', LAYOUT.labelX)
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
  CALL_FLOORS.forEach((f) => {
    const cy = floorCenterY(f)
    align.push({ floor: f, cy })
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('class', 'call-badge')
    g.setAttribute('transform', `translate(${LAYOUT.callX}, ${cy})`)
    const arrow = f === 8 ? '▼' : '▲'
    g.innerHTML = `
      <circle class="call-circle" cx="0" cy="0" r="22"/>
      <text class="call-num" x="0" y="6">${f}</text>
      <text class="call-dir" x="0" y="-14">${arrow}</text>
    `
    callsG.appendChild(g)
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('class', 'call-path')
    p.setAttribute('d', callToShaftPath(f))
    callPathsG.appendChild(p)
  })
  assertFloorAlignment(align)
}
