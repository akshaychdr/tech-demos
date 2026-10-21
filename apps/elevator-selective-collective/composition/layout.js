/**
 * Shared floor → pixel mapping (SVG viewBox).
 */

export const LAYOUT = {
  floors: 10,
  viewW: 1100,
  viewH: 920,
  frontLeft: 180,
  frontRight: 760,
  frontTop: 100,
  frontBottom: 880,
  shaftLeft: 548,
  shaftWidth: 84,
  cwLeft: 860,
  cwWidth: 48,
  callX: 120,
  lanternX: 96,
  carWidth: 76,
  carHeight: 56,
  machineY: 40,
}

export function floorCenterY(floor) {
  const f = Math.max(1, Math.min(LAYOUT.floors, floor))
  const t = (f - 1) / (LAYOUT.floors - 1)
  return LAYOUT.frontBottom - t * (LAYOUT.frontBottom - LAYOUT.frontTop)
}

export function floorSlabBand(floor) {
  const band = (LAYOUT.frontBottom - LAYOUT.frontTop) / LAYOUT.floors
  const cy = floorCenterY(floor)
  return { y: cy - band / 2, height: band, cy }
}

export function carTranslateY(floor, overshootPx = 0) {
  return floorCenterY(floor) + overshootPx - LAYOUT.carHeight / 2
}

export function carTranslateX() {
  return LAYOUT.shaftLeft + (LAYOUT.shaftWidth - LAYOUT.carWidth) / 2
}

export function counterweightY(floor, overshootPx = 0) {
  const h = 120
  return floorCenterY(floor) + overshootPx - h / 2
}

export function callToShaftPath(floor) {
  const y = floorCenterY(floor)
  const x0 = LAYOUT.callX + 32
  const x1 = LAYOUT.shaftLeft + 8
  const cx = (x0 + x1) / 2
  return `M ${x0} ${y} Q ${cx} ${y - 40} ${x1} ${y}`
}

export function assertFloorAlignment(placements) {
  for (const { floor, cy } of placements) {
    const expected = floorCenterY(floor)
    if (Math.abs(cy - expected) > 0.01) {
      throw new Error(`Floor ${floor} misaligned: cy=${cy} expected=${expected}`)
    }
  }
}
