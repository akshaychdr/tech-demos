import type { LayoutGeometry } from './geometry'

/** Plan coordinates in mm: origin at rear-left inside corner of hoistway; +X right, +Y down on SVG. */
export type PlanRect = { x: number; y: number; w: number; h: number }

export function planRects(g: LayoutGeometry) {
  const hoistway: PlanRect = { x: 0, y: 0, w: g.hoistwayW, h: g.hoistwayD }
  const px = (g.hoistwayW - g.platformW) / 2
  const py = (g.hoistwayD - g.platformD) / 2
  const platform: PlanRect = { x: px, y: py, w: g.platformW, h: g.platformD }
  const entranceX = g.entranceCL
  const railX = g.railCL
  const cylinderX = g.hoistwayW - g.wallToCylinder
  const cylinderY = g.hoistwayD - g.wallToCylinder
  const cabInset = g.wallToCab
  const cab: PlanRect = {
    x: cabInset,
    y: cabInset,
    w: g.hoistwayW - cabInset * 2,
    h: g.hoistwayD - cabInset * 2,
  }
  const doorWidth = Math.min(900, g.platformW * 0.85)
  const door: PlanRect = {
    x: entranceX - doorWidth / 2,
    y: g.hoistwayD - 40,
    w: doorWidth,
    h: 40,
  }
  return { hoistway, platform, cab, door, entranceX, railX, cylinderX, cylinderY, g }
}
