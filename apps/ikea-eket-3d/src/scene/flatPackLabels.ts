import * as THREE from 'three'
import hardwareTotals from '../../data/parts.json'
import { hardwareLabel, isHardwareName } from './partKind'
import { partNameForMatch } from './partNames'

export type FlatPackLabel = { id: string; text: string; object: THREE.Object3D }

const PANEL_LABELS: [RegExp, string][] = [
  [/bottom panel/, 'Bottom panel'],
  [/top panel/, 'Top panel'],
  [/back panel/, 'Back panel'],
  [/side panel left/, 'Side panel (L)'],
  [/side panel right/, 'Side panel (R)'],
]

export function buildFlatPackLabels(
  partRoots: Map<string, THREE.Object3D>,
): FlatPackLabel[] {
  const out: FlatPackLabel[] = []
  const totals = hardwareTotals.hardwareTotals as Record<string, number>

  for (const [re, label] of PANEL_LABELS) {
    const hit = [...partRoots.entries()].find(([n]) => re.test(partNameForMatch(n)))
    if (hit) out.push({ id: label, text: label, object: hit[1] })
  }

  const hwSeen = new Set<string>()
  for (const [name, obj] of partRoots) {
    if (!isHardwareName(name)) continue
    const id = name.split('_')[0]
    if (hwSeen.has(id)) continue
    hwSeen.add(id)
    const count = totals[id] ?? 1
    const text = `${hardwareLabel(name)} ×${count}`
    out.push({ id, text, object: obj })
  }

  const drawerFront = (suffix: '_01' | '_02', label: string) => {
    const hit = [...partRoots.entries()].find(([n]) => {
      const m = partNameForMatch(n)
      return m.includes('drawer front') && n.endsWith(suffix)
    })
    if (hit) out.push({ id: label, text: label, object: hit[1] })
  }
  drawerFront('_01', 'Drawer 1 kit')
  drawerFront('_02', 'Drawer 2 kit')

  const slide = [...partRoots.entries()].find(([n]) => partNameForMatch(n).includes('drawer_slide'))
  if (slide) out.push({ id: 'slides', text: 'Drawer slides ×4', object: slide[1] })

  return out
}
