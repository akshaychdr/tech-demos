import * as THREE from 'three'
import { isHardwareName, partKind } from './partKind'
import { partNameForMatch } from './partNames'

export type FlatSlot = { position: THREE.Vector3; rotation: THREE.Euler; scale: number }

const floorY = 0.004

function panelSlot(name: string): FlatSlot {
  const m = partNameForMatch(name)
  const rot = new THREE.Euler(-Math.PI / 2, 0, 0)
  const grid: Record<string, number> = {
    'bottom panel': 0,
    'top panel': 1,
    'back panel': 2,
    'side panel left': 3,
    'side panel right': 4,
  }
  let col = 5
  for (const [k, c] of Object.entries(grid)) {
    if (m.includes(k)) col = c
  }
  if (m.includes('back panel')) rot.y = Math.PI / 2
  if (m.includes('side panel left')) rot.y = -Math.PI / 2
  if (m.includes('side panel right')) rot.y = Math.PI / 2
  return {
    position: new THREE.Vector3((col - 2) * 0.95, floorY, 0),
    rotation: rot,
    scale: 1,
  }
}

export function layoutFlatPackPage(
  names: string[],
  page: 0 | 1 | 2,
): Map<string, FlatSlot> {
  const out = new Map<string, FlatSlot>()
  const panels: string[] = []
  const drawers: string[] = []
  const hardware: string[] = []
  for (const n of names) {
    const k = partKind(n)
    if (k === 'panel') panels.push(n)
    else if (k === 'drawer' || k === 'slide') drawers.push(n)
    else if (isHardwareName(n)) hardware.push(n)
  }

  if (page === 0) {
    panels.forEach((n) => out.set(n, panelSlot(n)))
    return out
  }
  if (page === 1) {
    drawers.sort()
    drawers.forEach((n, i) => {
      const rot = new THREE.Euler(-Math.PI / 2, 0, 0)
      out.set(n, {
        position: new THREE.Vector3((i % 6) * 0.62 - 1.55, floorY, 0.35 + Math.floor(i / 6) * 0.45),
        rotation: rot,
        scale: 1,
      })
    })
    return out
  }

  const hwIds = [...new Set(hardware.map((n) => n.split('_')[0]))].sort()
  hwIds.forEach((id, i) => {
    const rep = hardware.find((n) => n.startsWith(id))!
    out.set(rep, {
      position: new THREE.Vector3((i % 4) * 0.72 - 1.08, floorY + 0.05, 0.25 + Math.floor(i / 4) * 0.55),
      rotation: new THREE.Euler(0, 0, 0),
      scale: 8,
    })
    hardware.filter((n) => n.startsWith(id)).forEach((n) => {
      if (n !== rep) out.set(n, { ...out.get(rep)!, scale: 0.001 })
    })
  })
  return out
}
