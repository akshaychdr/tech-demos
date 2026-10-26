import * as THREE from 'three'

export type ScreenLabel = { world: THREE.Vector3; text: string }

export type OverlayState = {
  hole?: THREE.Vector3
  rings?: THREE.Vector3[]
  axisTip?: THREE.Vector3
  label?: string
  clockwise?: boolean
  showArrow?: boolean
  labels?: ScreenLabel[]
}

function project(p: THREE.Vector3, camera: THREE.Camera, w: number, h: number) {
  const s = p.clone().project(camera)
  if (s.z > 1) return null
  return { x: (s.x * 0.5 + 0.5) * w, y: (-s.y * 0.5 + 0.5) * h }
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
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svg.innerHTML = ''
  const ns = 'http://www.w3.org/2000/svg'

  const add = (el: SVGElement) => svg.appendChild(el)

  for (const ringWorld of state.rings ?? []) {
    const p = project(ringWorld, camera, w, h)
    if (!p) continue
    const ring = document.createElementNS(ns, 'circle')
    ring.setAttribute('cx', String(p.x))
    ring.setAttribute('cy', String(p.y))
    ring.setAttribute('r', '28')
    ring.setAttribute('class', 'pulse-ring')
    add(ring)
  }

  if (state.hole) {
    const hole = project(state.hole, camera, w, h)
    if (hole) {
      const ring = document.createElementNS(ns, 'circle')
      ring.setAttribute('cx', String(hole.x))
      ring.setAttribute('cy', String(hole.y))
    ring.setAttribute('r', '46')
    ring.setAttribute('class', 'pulse-ring')
    add(ring)

    if (state.axisTip) {
        const tip = project(state.axisTip, camera, w, h)
        if (tip) {
          const line = document.createElementNS(ns, 'line')
          line.setAttribute('x1', String(tip.x))
          line.setAttribute('y1', String(tip.y))
          line.setAttribute('x2', String(hole.x))
          line.setAttribute('y2', String(hole.y))
          line.setAttribute('class', 'insert-line')
          add(line)
          const head = document.createElementNS(ns, 'polygon')
          const ang = Math.atan2(hole.y - tip.y, hole.x - tip.x)
          const s = 16
          const p1 = [hole.x, hole.y]
          const p2 = [hole.x - s * Math.cos(ang - 0.45), hole.y - s * Math.sin(ang - 0.45)]
          const p3 = [hole.x - s * Math.cos(ang + 0.45), hole.y - s * Math.sin(ang + 0.45)]
          head.setAttribute('points', `${p1[0]},${p1[1]} ${p2[0]},${p2[1]} ${p3[0]},${p3[1]}`)
          head.setAttribute('class', 'insert-head')
          add(head)
        }
      }

      if (state.showArrow) {
        const r = 96
        const sweep = state.clockwise === false ? 0 : 1
        const a0 = Math.PI * 0.15
        const a1 = a0 + (sweep ? 1 : -1) * Math.PI * 1.35
        const x0 = hole.x + r * Math.cos(a0)
        const y0 = hole.y + r * Math.sin(a0)
        const x1 = hole.x + r * Math.cos(a1)
        const y1 = hole.y + r * Math.sin(a1)
        const arc = document.createElementNS(ns, 'path')
        arc.setAttribute('d', `M ${x0} ${y0} A ${r} ${r} 0 1 ${sweep} ${x1} ${y1}`)
        arc.setAttribute('class', 'rotate-arc')
        add(arc)
        const tangent = sweep ? a1 + Math.PI / 2 : a1 - Math.PI / 2
        const arrow = document.createElementNS(ns, 'polygon')
        const tip = [x1 + 16 * Math.cos(tangent), y1 + 16 * Math.sin(tangent)]
        const left = [x1 + 11 * Math.cos(tangent + 2.4), y1 + 11 * Math.sin(tangent + 2.4)]
        const right = [x1 + 11 * Math.cos(tangent - 2.4), y1 + 11 * Math.sin(tangent - 2.4)]
        arrow.setAttribute('points', `${tip[0]},${tip[1]} ${left[0]},${left[1]} ${right[0]},${right[1]}`)
        arrow.setAttribute('class', 'insert-head')
        add(arrow)
      }

      if (state.label) {
        const tx = hole.x + 48
        const ty = hole.y - 52
        const bg = document.createElementNS(ns, 'rect')
        const pad = 8
        const width = Math.max(120, state.label.length * 8)
        bg.setAttribute('x', String(tx - pad))
        bg.setAttribute('y', String(ty - 16))
        bg.setAttribute('width', String(width))
        bg.setAttribute('height', '26')
        bg.setAttribute('rx', '4')
        bg.setAttribute('class', 'label-bg')
        add(bg)
        const text = document.createElementNS(ns, 'text')
        text.setAttribute('x', String(tx))
        text.setAttribute('y', String(ty))
        text.setAttribute('class', 'hw-badge')
        text.textContent = state.label
        add(text)
      }
    }
  }

  for (const lab of state.labels ?? []) {
    const p = project(lab.world, camera, w, h)
    if (!p) continue
    const width = Math.max(72, lab.text.length * 8.2)
    const bg = document.createElementNS(ns, 'rect')
    bg.setAttribute('x', String(p.x - width / 2))
    bg.setAttribute('y', String(p.y - 16))
    bg.setAttribute('width', String(width))
    bg.setAttribute('height', '22')
    bg.setAttribute('rx', '4')
    bg.setAttribute('class', 'label-bg')
    add(bg)
    const text = document.createElementNS(ns, 'text')
    text.setAttribute('x', String(p.x))
    text.setAttribute('y', String(p.y))
    text.setAttribute('text-anchor', 'middle')
    text.setAttribute('class', 'tray-label')
    text.textContent = lab.text
    add(text)
  }
}
