import { describe, expect, it } from 'vitest'
import {
  computeElevatorParams,
  COUNTERWEIGHT_LOAD_FRACTION,
  EMPTY_CAR_MASS_KG,
  FLOOR_HEIGHT_M,
  RATED_LOAD_KG,
} from './elevatorPhysics'

describe('computeElevatorParams', () => {
  it('computes travel distance and time from floors and speed', () => {
    const p = computeElevatorParams(10, 2, 0)
    expect(p.travelM).toBe(9 * FLOOR_HEIGHT_M)
    expect(p.travelTimeS).toBeCloseTo(p.travelM / 2)
  })

  it('sizes counterweight at car + fraction of rated load', () => {
    const p = computeElevatorParams(5, 1.5, 200)
    expect(p.counterweightKg).toBe(
      EMPTY_CAR_MASS_KG + COUNTERWEIGHT_LOAD_FRACTION * RATED_LOAD_KG,
    )
    expect(p.carWithLoadKg).toBe(EMPTY_CAR_MASS_KG + 200)
  })
})
