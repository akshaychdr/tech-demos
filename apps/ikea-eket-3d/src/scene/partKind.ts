/** Classify GLB top-level node names for layout, scale, and labels. */
export type PartKind = 'panel' | 'drawer' | 'slide' | 'hardware'

import { partNameForMatch } from './partNames'

export function partKind(name: string): PartKind {
  const n = partNameForMatch(name)
  if (/^10\d{4}_|^11\d{4}_|^12\d{4}_|^128918|^139434|^141413|^145|^147|^150|^152/.test(name)) {
    return 'hardware'
  }
  if (n.includes('drawer_slide') || n.includes('slide')) return 'slide'
  if (n.includes('drawer') || n.includes('109041')) return 'drawer'
  return 'panel'
}

export function hardwareLabel(name: string): string {
  const id = name.split('_')[0]
  const map: Record<string, string> = {
    '100349': 'Dowel',
    '109041': 'Screw',
    '110519': 'Screw',
    '120161': 'Cam lock',
    '120162': 'Cam screw',
    '128918': 'Plug',
    '139434': 'Connector',
    '141413': 'Wall fitting',
    '145568': 'Slide, left',
    '145569': 'Slide, right',
    '145572': 'Rail',
    '147219': 'Slide end',
    '147221': 'Slide end',
    '147222': 'Slide clip',
    '150594': 'Rod',
  }
  return map[id] ?? id
}

export function isHardwareName(name: string): boolean {
  return partKind(name) === 'hardware'
}
