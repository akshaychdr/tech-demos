import * as THREE from 'three'
import { hardwareLabel, isHardwareName, partKind } from './partKind'
import { partNameForMatch } from './partNames'

export type FlatPackSlot = {
  position: THREE.Vector3
  rotation: THREE.Euler
  scale: number
  label?: string
}

const floorY = 0.002
const panelPitch = 0.68
const panelRow = 0.52

/** Flat-pack floor plan (metres), inspired by manual page 7 groupings. */
export function flatPackSlot(name: string, index: number): FlatPackSlot {
  const kind = partKind(name)
  const rot = new THREE.Euler(0, 0, 0)

  if (kind === 'panel') {
    const panelSlots: Record<string, [number, number]> = {
      'bottom panel': [0, 0],
      'top panel': [1, 0],
      'back panel': [2, 0],
      'side panel left': [0, 1],
      'side panel right': [1, 1],
    }
    let slot = [2.5 + (index % 3) * 0.5, 2 + Math.floor(index / 3) * 0.45]
    const matchName = partNameForMatch(name)
    for (const [key, s] of Object.entries(panelSlots)) {
      if (matchName.includes(key)) {
        slot = s
        break
      }
    }
    rot.x = -Math.PI / 2
    if (matchName.includes('back panel')) rot.y = Math.PI / 2
    else if (matchName.includes('side panel')) rot.y = matchName.includes('left') ? -Math.PI / 2 : Math.PI / 2
    else rot.y = 0
    rot.z = 0
    return {
      position: new THREE.Vector3(slot[0] * panelPitch, floorY + 0.012, slot[1] * panelRow),
      rotation: rot,
      scale: 1,
      label: name.replace(/_\d+$/, '').replace(/ dr ut.*/, ''),
    }
  }

  if (kind === 'drawer') {
    const col = index % 4
    const row = Math.floor(index / 4)
    rot.x = -Math.PI / 2
    rot.y = partNameForMatch(name).includes('front') ? Math.PI : 0
    return {
      position: new THREE.Vector3(0.15 + col * 0.5, floorY + 0.01, 2.35 + row * 0.4),
      rotation: rot,
      scale: 1,
      label: name.split('_')[0],
    }
  }

  if (kind === 'slide') {
    rot.x = -Math.PI / 2
    return {
      position: new THREE.Vector3(2.4 + index * 0.55, floorY, 2.5),
      rotation: rot,
      scale: 1,
      label: 'Drawer slide',
    }
  }

  const hwId = name.split('_')[0]
  const bins: Record<string, [number, number]> = {
    '100349': [3.15, 0.15],
    '109041': [3.15, 0.48],
    '110519': [3.15, 0.81],
    '120161': [3.15, 1.14],
    '120162': [3.15, 1.47],
    '128918': [3.65, 0.15],
    '139434': [3.65, 0.48],
    '141413': [3.65, 0.81],
    '145572': [4.15, 0.15],
    '147222': [4.15, 0.48],
    '150594': [4.15, 0.81],
    '147219': [4.15, 1.14],
    '145568': [4.65, 0.15],
    '145569': [4.65, 0.48],
    '147221': [4.65, 0.81],
  }
  const base = bins[hwId] ?? [3.15 + (index % 5) * 0.1, 1.75 + Math.floor(index / 5) * 0.1]
  const jitter = (index % 5) * 0.012
  return {
    position: new THREE.Vector3(base[0] + jitter, floorY + 0.035, base[1]),
    rotation: new THREE.Euler(0, (index % 6) * 0.35, 0),
    scale: 5.2,
    label: `${hardwareLabel(name)} (${hwId})`,
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
