import dimensions from '../../data/dimensions.json'
import type { TypeARow } from './typeA'

export type LayoutGeometry = {
  hoistwayW: number
  hoistwayD: number
  platformW: number
  platformD: number
  entranceCL: number
  railCL: number
  wallToRail: number
  wallToCylinder: number
  wallToCab: number
  pit: number
  overhead: number
  travel: number
  cabH: number
  shaftHeight: number
}

export function buildLayoutGeometry(row: TypeARow, travelMm: number): LayoutGeometry {
  const pit = dimensions.items.find((d) => d.id === 'pit_depth_min')!.mm!
  const overhead = dimensions.items.find((d) => d.id === 'overhead_min')!.mm!
  const wallToRail = dimensions.items.find((d) => d.id === 'wall_to_rail_cl')!.mm!
  const wallToCylinder = dimensions.items.find((d) => d.id === 'wall_to_cylinder_cl')!.mm!
  const wallToCab = dimensions.items.find((d) => d.id === 'wall_to_cab')!.mm!
  const cabH = dimensions.items.find((d) => d.id === 'cab_height_std')!.mm!

  const travel = Math.min(Math.max(travelMm, 1000), dimensions.maxTravelMm)

  return {
    hoistwayW: row.hoistwayWidthMmPublished,
    hoistwayD: row.hoistwayDepthMmPublished,
    platformW: row.platformWidthMmPublished,
    platformD: row.platformDepthMmPublished,
    entranceCL: row.entranceCenterlineMmPublished,
    railCL: row.railCenterlineMmPublished,
    wallToRail,
    wallToCylinder,
    wallToCab,
    pit,
    overhead,
    travel,
    cabH,
    shaftHeight: pit + travel + overhead,
  }
}
