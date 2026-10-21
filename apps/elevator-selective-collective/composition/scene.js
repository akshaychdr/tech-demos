import {
  LAYOUT,
  floorCenterY,
  floorSlabBand,
  carTranslateY,
  carTranslateX,
  counterweightY,
  callToShaftPath,
  assertFloorAlignment,
} from './layout.js'
import { simulatePassengers, formatSeconds, SIM, WAIT_DEFINITION } from './simulation.js'

const CALL_FLOORS = [4, 7, 8]

export function initComposition() {
  const shaftX = LAYOUT.shaftLeft + LAYOUT.shaftWidth / 2

  buildSkyline()
  buildBuilding()
  buildCalls()

  const down = simulatePassengers('down-collective')
  const sel = simulatePassengers('selective-collective')
  const maxWait = Math.max(down.meanWait, sel.meanWait)

  document.getElementById('val-down-wait').textContent = formatSeconds(down.meanWait)
  document.getElementById('val-sel-wait').textContent = formatSeconds(sel.meanWait)
  document.getElementById('val-down-journey').textContent = formatSeconds(down.meanJourney)
  document.getElementById('val-sel-journey').textContent = formatSeconds(sel.meanJourney)
  document.getElementById('wait-footnote').textContent = `${WAIT_DEFINITION} ${SIM.travelPerFloor}s/floor, ${SIM.dwell}s dwell, car starts 1F.`

  const car = document.getElementById('car')
  const counterweight = document.getElementById('counterweight')
  const doors = document.querySelectorAll('.door-panel')
  const waiter4 = document.getElementById('waiter-4')
  const callPaths = document.querySelectorAll('.call-path')
  const lanterns = document.querySelectorAll('.hall-lantern')
  const pathDown = document.getElementById('path-down')
  const pathSel = document.getElementById('path-selective')

  pathDown.setAttribute(
    'd',
    `M ${shaftX} ${floorCenterY(1)} L ${shaftX} ${floorCenterY(9)}`,
  )
  pathSel.setAttribute(
    'd',
    `M ${shaftX} ${floorCenterY(1)} L ${shaftX} ${floorCenterY(4)} L ${shaftX} ${floorCenterY(7)} L ${shaftX} ${floorCenterY(9)} L ${shaftX} ${floorCenterY(8)} L ${shaftX} ${floorCenterY(1)}`,
  )

  function setRopes(carFloor) {
    const cy = floorCenterY(carFloor)
    const rope = document.getElementById('ropes')
    rope.setAttribute(
      'd',
      `M ${shaftX} ${LAYOUT.machineY + 30} L ${shaftX} ${cy} M ${shaftX} ${LAYOUT.machineY + 30} L ${LAYOUT.cwLeft + 24} ${cy}`,
    )
  }

  function setCarFloor(f, overshoot = 0, doorsOpen = false) {
    const x = carTranslateX()
    const y = carTranslateY(f, overshoot)
    car.setAttribute('transform', `translate(${x}, ${y})`)
    counterweight.setAttribute(
      'transform',
      `translate(${LAYOUT.cwLeft}, ${counterweightY(11 - f, -overshoot)})`,
    )
    setRopes(f)
    const spread = doorsOpen ? 14 : 0
    doors[0].setAttribute('transform', `translate(${spread}, 0)`)
    doors[1].setAttribute('transform', `translate(${-spread}, 0)`)
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
  const buildingWrap = document.getElementById('building-wrap')

  gsap.set(headline, { y: 28, opacity: 0 })
  setCarFloor(1)

  const tl = gsap.timeline({ paused: true })

  tl.to(headline, { opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: 'back.out(1.4)' }, 0.4)
  tl.to(subhead, { opacity: 1, duration: 0.8, ease: 'power2.out' }, 1.1)
  tl.fromTo(camera, { scale: 1 }, { scale: 1.03, duration: 5, ease: 'power1.inOut' }, 0)
  tl.to(buildingWrap, { opacity: 1, duration: 1.2, ease: 'power2.out' }, 0.2)
  tl.to(car, { opacity: 1, duration: 0.5 }, 1.5)
  tl.to(typography, { opacity: 0, duration: 0.6 }, 5.2)

  // Scene 2 — down collective
  tl.add(() => {
    capTitle.textContent = 'Down collective'
    capBody.textContent =
      'One hall button per landing — up travel serves car calls only. The 4F rider is passed on the way up.'
    setCarFloor(1)
    gsap.set(waiter4, { opacity: 1 })
  }, 6)
  tl.to(sceneCaption, { opacity: 1, duration: 0.5 }, 6)
  tl.to(callPaths, { opacity: 0.9, duration: 0.5 }, 6.2)
  tl.to(lanterns, { opacity: 1, duration: 0.4 }, 6.2)
  tl.to(pathDown, { opacity: 0.85, duration: 0.5 }, 6.5)
  tl.to(
    {},
    {
      duration: 2.8,
      onUpdate() {
        const f = 1 + this.progress() * 8
        setCarFloor(f)
      },
      ease: 'power2.inOut',
    },
    7,
  )
  tl.to(sceneCaption, { opacity: 0, duration: 0.4 }, 13.5)
  tl.to(pathDown, { opacity: 0, duration: 0.4 }, 13.5)

  // Scene 3 — selective collective (LOOK)
  tl.add(() => {
    capTitle.textContent = 'Selective collective (LOOK)'
    capBody.textContent =
      'Up and down hall buttons — landing calls in the direction of travel, then reverse.'
    setCarFloor(1, 0, false)
  }, 14)
  tl.to(sceneCaption, { opacity: 1, duration: 0.5 }, 14)
  tl.to(pathSel, { opacity: 0.9, duration: 0.5 }, 14.2)
  tl.to(
    {},
    {
      duration: 1.6,
      onUpdate() {
        const f = 1 + this.progress() * 3
        setCarFloor(f)
      },
      ease: 'power2.inOut',
    },
    14.8,
  )
  tl.add(() => setCarFloor(4, 0, true), 16.4)
  tl.to(waiter4, { opacity: 0, duration: 0.4 }, 16.4)
  tl.to(
    {},
    {
      duration: 2.2,
      onUpdate() {
        const f = 4 + this.progress() * 4.5
        setCarFloor(f, 0, false)
      },
      ease: 'power2.inOut',
    },
    17.2,
  )
  tl.fromTo(camera, { scale: 1.03 }, { scale: 1.05, duration: 4, ease: 'power2.inOut' }, 17)

  tl.to(sceneCaption, { opacity: 0, duration: 0.5 }, 27.5)
  tl.to(pathSel, { opacity: 0, duration: 0.5 }, 27.5)

  // Scene 4 — stats
  tl.add(() => {
    capTitle.textContent = ''
    capBody.textContent = ''
  }, 28)
  tl.to(sceneCaption, { opacity: 0, duration: 0.3 }, 28)
  tl.add(() => buildingWrap.classList.add('dimmed'), 28)
  tl.to(buildingWrap, { opacity: 0.22, duration: 0.8 }, 28)
  tl.to(stats, { opacity: 1, duration: 0.6 }, 28.2)
  tl.to('#bar-down-wait', { width: `${(down.meanWait / maxWait) * 100}%`, duration: 1 }, 29)
  tl.to('#bar-sel-wait', { width: `${(sel.meanWait / maxWait) * 100}%`, duration: 1 }, 29.3)
  tl.to(logo, { opacity: 1, duration: 0.8 }, 34)
  tl.fromTo(camera, { scale: 1.05 }, { scale: 1, duration: 3, ease: 'power2.inOut' }, 28)

  window.__timelines = window.__timelines || {}
  window.__timelines['selective-collective'] = tl
  tl.seek(0)
}

function buildSkyline() {
  const svg = document.getElementById('city-skyline')
  svg.innerHTML = `
    <path fill="#0f1e36" d="M0 400 L0 280 L40 200 L70 260 L110 180 L150 240 L190 160 L230 220 L280 140 L320 210 L360 170 L400 230 L450 150 L500 200 L560 120 L620 190 L680 130 L740 200 L800 160 L800 400 Z"/>
    <path fill="#142a4a" opacity="0.6" d="M0 400 L0 300 L60 250 L120 300 L200 240 L280 310 L360 260 L440 320 L520 250 L600 300 L700 270 L800 310 L800 400 Z"/>
  `
}

function buildBuilding() {
  const floorsG = document.getElementById('floors')
  const landingsG = document.getElementById('landings')
  for (let f = LAYOUT.floors; f >= 1; f--) {
    const { y, height, cy } = floorSlabBand(f)
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.innerHTML = `
      <rect x="${LAYOUT.frontLeft}" y="${y}" width="${LAYOUT.frontRight - LAYOUT.frontLeft}" height="${height}" class="glass-slab"/>
      <rect x="${LAYOUT.frontLeft + 20}" y="${cy - 8}" width="55" height="5" class="desk"/>
      <rect x="${LAYOUT.frontLeft + 90}" y="${cy - 8}" width="80" height="5" class="desk"/>
      <rect x="${LAYOUT.frontLeft + 200}" y="${cy - 12}" width="14" height="16" class="plant"/>
      <rect x="${LAYOUT.frontLeft + 280}" y="${cy - 3}" width="120" height="6" class="interior-warm"/>
      <rect x="${LAYOUT.frontLeft + 420}" y="${cy - 5}" width="40" height="8" class="interior-warm"/>
      <text x="${LAYOUT.frontLeft - 16}" y="${cy + 5}" text-anchor="end" class="floor-label">${f}F</text>
    `
    floorsG.appendChild(g)

    const lg = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    lg.setAttribute('class', 'landing-fixtures')
    lg.setAttribute('transform', `translate(${LAYOUT.lanternX}, ${cy})`)
    lg.innerHTML = `
      <rect class="hall-btn" x="0" y="-8" width="10" height="16" rx="2"/>
      <circle class="hall-lantern" cx="18" cy="0" r="6" opacity="0"/>
    `
    landingsG.appendChild(lg)
  }

  for (let x = LAYOUT.frontLeft + 30; x < LAYOUT.frontRight; x += 48) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', x)
    line.setAttribute('x2', x)
    line.setAttribute('y1', LAYOUT.frontTop)
    line.setAttribute('y2', LAYOUT.frontBottom)
    line.setAttribute('class', 'mullion')
    document.getElementById('mullions').appendChild(line)
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
