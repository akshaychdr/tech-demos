/**
 * Shared floor → pixel mapping for the building SVG (viewBox coordinates).
 * Every label, slab, call bubble, and car Y must use these helpers.
 */

export const LAYOUT = {
  floors: 10,
  /** SVG viewBox */
  viewW: 1000,
  viewH: 900,
  /** Front face of tower */
  frontLeft: 80,
  frontRight: 620,
  frontTop: 60,
  frontBottom: 860,
  /** Shaft inside front face */
  shaftLeft: 430,
  shaftWidth: 72,
  /** Call bubbles sit left of glass */
  callX: 200,
  shaftCenterX: 430 + 36,
  carWidth: 64,
  carHeight: 48,
}

/** Vertical center of floor N (1 = lobby at bottom). */
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

/** Car group translate Y (top-left of car rect). */
export function carTranslateY(floor, overshootPx = 0) {
  const cy = floorCenterY(floor) + overshootPx
  return cy - LAYOUT.carHeight / 2
}

export function carTranslateX() {
  return LAYOUT.shaftLeft + (LAYOUT.shaftWidth - LAYOUT.carWidth) / 2
}

/** Curved magenta path from hall call to shaft at same floor. */
export function callToShaftPath(floor) {
  const y = floorCenterY(floor)
  const x0 = LAYOUT.callX + 28
  const x1 = LAYOUT.shaftCenterX
  const cx = (x0 + x1) / 2
  return `M ${x0} ${y} Q ${cx} ${y - 36} ${x1} ${y}`
}

/**
 * @param {{ floor: number, cy: number }[]} placements
 */
export function assertFloorAlignment(placements) {
  for (const { floor, cy } of placements) {
    const expected = floorCenterY(floor)
    if (Math.abs(cy - expected) > 0.01) {
      throw new Error(`Floor ${floor} misaligned: cy=${cy} expected=${expected}`)
    }
  }
}
