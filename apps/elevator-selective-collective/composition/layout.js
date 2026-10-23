/**
 * Floor → pixel mapping from measured plate artwork (1920×1080).
 */
import {
  MEASURED_FLOOR_Y,
  MEASURED_SHAFT,
  MEASURED_SHEAVE,
  MEASURED_HALL_X,
  MEASURED_CALL_X,
  MEASURED_LABEL_X,
} from './art/measured-layout.js'

const pitches = []
for (let i = 0; i < MEASURED_FLOOR_Y.length - 1; i++) {
  pitches.push(MEASURED_FLOOR_Y[i] - MEASURED_FLOOR_Y[i + 1])
}
const medianPitch = pitches.sort((a, b) => a - b)[Math.floor(pitches.length / 2)]

/** Left of facade over sky (under ~460px at 1024-wide preview). */
export const FLOOR_LABEL_X = 780
/** Where horizontal ticks meet the building face. */
export const FACADE_TICK_X = 1108

export const LAYOUT = {
  floors: MEASURED_FLOOR_Y.length,
  viewW: 1920,
  viewH: 1080,
  shaftLeft: MEASURED_SHAFT.left,
  shaftRight: MEASURED_SHAFT.right,
  shaftWidth: MEASURED_SHAFT.width,
  shaftCenterX: MEASURED_SHAFT.centerX,
  sheaveX: MEASURED_SHEAVE.x,
  sheaveY: MEASURED_SHEAVE.y,
  hallPanelX: MEASURED_HALL_X,
  callX: MEASURED_CALL_X,
  labelX: MEASURED_LABEL_X,
  carWidth: Math.round(MEASURED_SHAFT.width * 0.94),
  carHeight: Math.round(medianPitch * 0.92),
  medianPitch,
  landingRiderMaxHeight: Math.round(medianPitch * 0.85),
  cabRiderHeight: Math.round(medianPitch * 0.38),
  /** Landing figure — just left of shaft, clear of call bubble. */
  landingX: MEASURED_SHAFT.left - 18,
  /** Pink call bubble — well left of the waiting figure. */
  callBubbleX: 1055,
  frontTop: MEASURED_FLOOR_Y[MEASURED_FLOOR_Y.length - 1],
  frontBottom: MEASURED_FLOOR_Y[0],
}

export function floorCenterY(floor) {
  const maxF = LAYOUT.floors
  const f = Math.max(1, Math.min(maxF, floor))
  const lo = Math.floor(f)
  const hi = Math.ceil(f)
  if (lo === hi) return MEASURED_FLOOR_Y[lo - 1]
  const t = f - lo
  const y0 = MEASURED_FLOOR_Y[lo - 1]
  const y1 = MEASURED_FLOOR_Y[hi - 1]
  return y0 + (y1 - y0) * t
}

export function carTranslateY(floor, overshootPx = 0) {
  return floorCenterY(floor) + overshootPx - LAYOUT.carHeight / 2
}

export function carTranslateX() {
  return LAYOUT.shaftCenterX - LAYOUT.carWidth / 2
}

export function callToShaftPath(floor) {
  return callToShaftPathFromBubble(floor)
}

/** @returns {{ top: number, bottom: number, center: number, pitch: number }} */
export function floorBand(floor) {
  const f = Math.max(1, Math.min(LAYOUT.floors, Math.round(floor)))
  const center = floorCenterY(f)
  const above =
    f < LAYOUT.floors ? (floorCenterY(f) - floorCenterY(f + 1)) / 2 : (MEASURED_FLOOR_Y[f - 2] - MEASURED_FLOOR_Y[f - 1]) / 2
  const below =
    f > 1 ? (floorCenterY(f - 1) - floorCenterY(f)) / 2 : (MEASURED_FLOOR_Y[0] - MEASURED_FLOOR_Y[1]) / 2
  const pitch = above + below
  return { top: center - above, bottom: center + below, center, pitch }
}

export function landingSlabY(floor) {
  const band = floorBand(floor)
  return band.bottom - band.pitch * 0.06
}

export function landingRiderHeightPx(floor) {
  return Math.floor(floorBand(floor).pitch * 0.86)
}

export function callToShaftPathFromBubble(floor) {
  const y = floorCenterY(floor)
  const x0 = LAYOUT.callBubbleX + 26
  const x1 = LAYOUT.shaftLeft + 6
  const cx = (x0 + x1) / 2
  return `M ${x0} ${y} Q ${cx} ${y - 28} ${x1} ${y}`
}

export function assertFloorAlignment(placements) {
  for (const { floor, cy } of placements) {
    const expected = floorCenterY(floor)
    if (Math.abs(cy - expected) > 0.5) {
      throw new Error(`Floor ${floor} misaligned: cy=${cy} expected=${expected}`)
    }
  }
}
