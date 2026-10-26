import * as THREE from 'three'
import type { HardwareAction } from '../data/assemblyFrames'

export type OverlayState = {
  hardware?: HardwareAction
  pulseWorld?: THREE.Vector3[]
  showInset: boolean
  insetLabel?: string
}

export function renderOverlays(
  svg: SVGSVGElement,
  w: number,
  h: number,
  camera: THREE.Camera,
  state: OverlayState,
) {
  svg.setAttribute('width', String(w))
  svg.setAttribute('height', String(h))
  svg.innerHTML = ''

  if (state.pulseWorld) {
    for (const p of state.pulseWorld) {
      const s = p.clone().project(camera)
      if (s.z > 1) continue
      const x = (s.x * 0.5 + 0.5) * w
      const y = (-s.y * 0.5 + 0.5) * h
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      ring.setAttribute('cx', String(x))
      ring.setAttribute('cy', String(y))
      ring.setAttribute('r', '14')
      ring.setAttribute('class', 'pulse-ring')
      svg.appendChild(ring)
    }
  }

  const hw = state.hardware
  if (!hw) return

  const anchor = new THREE.Vector3()
  anchor.copy(hw.nodes.length ? new THREE.Vector3() : new THREE.Vector3())
  // anchor set by caller via pulseWorld[0]
  if (state.pulseWorld?.[0]) anchor.copy(state.pulseWorld[0])
  const end = anchor.clone().project(camera)
  const x2 = (end.x * 0.5 + 0.5) * w
  const y2 = (-end.y * 0.5 + 0.5) * h

  const axis = hw.insertAxis
  const len = 42
  let x1 = x2
  let y1 = y2
  if (axis === 'y') y1 = y2 - len
  else if (axis === 'x') x1 = x2 - len
  else x1 = x2 - len * 0.7

  const dash = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  dash.setAttribute('x1', String(x1))
  dash.setAttribute('y1', String(y1))
  dash.setAttribute('x2', String(x2))
  dash.setAttribute('y2', String(y2))
  dash.setAttribute('class', 'insert-line')
  svg.appendChild(dash)

  if (hw.rotate) {
    const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    const r = 26
    const sweep = hw.rotate.clockwise ? 1 : 0
    arc.setAttribute(
      'd',
      `M ${x2 - r} ${y2} A ${r} ${r} 0 0 ${sweep} ${x2} ${y2 - r}`,
    )
    arc.setAttribute('class', 'rotate-arc')
    svg.appendChild(arc)
  }

  const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  badge.setAttribute('x', String(x2 + 12))
  badge.setAttribute('y', String(y2 - 12))
  badge.setAttribute('class', 'hw-badge')
  badge.textContent = `${hw.count}× ${hw.partId}`
  svg.appendChild(badge)

  if (state.showInset && state.insetLabel) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    g.setAttribute('class', 'inset-bubble')
    const cx = w - 130
    const cy = h - 110
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    circle.setAttribute('cx', String(cx))
    circle.setAttribute('cy', String(cy))
    circle.setAttribute('r', '58')
    g.appendChild(circle)
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    t.setAttribute('x', String(cx))
    t.setAttribute('y', String(cy + 4))
    t.setAttribute('text-anchor', 'middle')
    t.setAttribute('class', 'inset-text')
    t.textContent = state.insetLabel
    g.appendChild(t)
    svg.appendChild(g)
  }
}
