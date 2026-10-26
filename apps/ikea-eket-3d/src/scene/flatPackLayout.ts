import * as THREE from 'three'
import { isHardwareName, partKind } from './partKind'
import { partNameForMatch } from './partNames'

export type FlatPackSlot = {
  position: THREE.Vector3
  rotation: THREE.Euler
  scale: number
}

const floorY = 0.002
const PANEL_DX = 0.82
const PANEL_DZ = 0.62

/** Wide floor grid (metres), manual page 7 inspired. */
export function flatPackSlot(name: string, index: number): FlatPackSlot {
  const kind = partKind(name)
  const rot = new THREE.Euler(0, 0, 0)
  const matchName = partNameForMatch(name)

  if (kind === 'panel') {
    const panelSlots: Record<string, [number, number]> = {
      'bottom panel': [0, 0],
      'top panel': [1, 0],
      'back panel': [2, 0],
      'side panel left': [0, 1],
      'side panel right': [1, 1],
    }
    let slot = [3 + (index % 2), 2 + Math.floor(index / 2)]
    for (const [key, s] of Object.entries(panelSlots)) {
      if (matchName.includes(key)) {
        slot = s
        break
      }
    }
    rot.x = -Math.PI / 2
    if (matchName.includes('back panel')) rot.y = Math.PI / 2
    else if (matchName.includes('side panel')) rot.y = matchName.includes('left') ? -Math.PI / 2 : Math.PI / 2
    return {
      position: new THREE.Vector3(
        (slot[0] - 1) * PANEL_DX,
        floorY + 0.012,
        slot[1] * PANEL_DZ,
      ),
      rotation: rot,
      scale: 1,
    }
  }

  if (kind === 'drawer') {
    const isOne = matchName.includes('_01')
    const baseCol = isOne ? 0 : 2
    const col = baseCol + (index % 2)
    const row = Math.floor(index / 2)
    rot.x = -Math.PI / 2
    rot.y = matchName.includes('front') ? Math.PI : 0
    return {
      position: new THREE.Vector3(
        (col - 0.5) * 0.55,
        floorY + 0.01,
        1.35 + row * 0.42 + (isOne ? 0 : 0.85),
      ),
      rotation: rot,
      scale: 1,
    }
  }

  if (kind === 'slide') {
    rot.x = -Math.PI / 2
    return {
      position: new THREE.Vector3(1.65 + index * 0.48, floorY, 2.55),
      rotation: rot,
      scale: 1,
    }
  }

  const hwId = name.split('_')[0]
  const bins: Record<string, [number, number]> = {
    '100349': [0, 2.8],
    '109041': [0, 3.15],
    '110519': [0, 3.5],
    '120161': [0, 3.85],
    '120162': [0, 4.2],
    '128918': [0.55, 2.8],
    '139434': [0.55, 3.15],
    '141413': [0.55, 3.5],
    '145572': [1.1, 2.8],
    '147222': [1.1, 3.15],
    '150594': [1.1, 3.5],
    '147219': [1.1, 3.85],
    '145568': [1.65, 2.8],
    '145569': [1.65, 3.15],
    '147221': [1.65, 3.5],
  }
  const base = bins[hwId] ?? [0.4 + (index % 4) * 0.42, 2.6 + Math.floor(index / 4) * 0.32]
  return {
    position: new THREE.Vector3(2.05 + base[0], floorY + 0.04, base[1]),
    rotation: new THREE.Euler(0, (index % 5) * 0.25, 0),
    scale: 6.5,
  }
}

export function layoutAllFlatPack(names: string[]): Map<string, FlatPackSlot> {
  const hwCount = new Map<string, number>()
  const out = new Map<string, FlatPackSlot>()
  for (const name of names) {
    const id = isHardwareName(name) ? name.split('_')[0] : name
    const idx = hwCount.get(id) ?? 0
    hwCount.set(id, idx + 1)
    out.set(name, flatPackSlot(name, idx))
  }
  return out
}
