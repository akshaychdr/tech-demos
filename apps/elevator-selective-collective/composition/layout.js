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
  const y = floorCenterY(floor)
  const x0 = LAYOUT.callX + 34
  const x1 = LAYOUT.shaftLeft + 6
  const cx = (x0 + x1) / 2
  return `M ${x0} ${y} Q ${cx} ${y - 32} ${x1} ${y}`
}

export function assertFloorAlignment(placements) {
  for (const { floor, cy } of placements) {
    const expected = floorCenterY(floor)
    if (Math.abs(cy - expected) > 0.5) {
      throw new Error(`Floor ${floor} misaligned: cy=${cy} expected=${expected}`)
    }
  }
}
