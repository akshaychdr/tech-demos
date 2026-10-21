import { describe, expect, it } from 'vitest'
import {
  assertFloorAlignment,
  floorCenterY,
  LAYOUT,
} from '../../composition/layout.js'
import { DEMO_CALLS, simulate } from '../../composition/simulation.js'

describe('floor layout', () => {
  it('places call floors on exact center Y', () => {
    const floors = [4, 7, 9]
    assertFloorAlignment(
      floors.map((f) => ({ floor: f, cy: floorCenterY(f) })),
    )
    expect(floorCenterY(1)).toBeGreaterThan(floorCenterY(10))
    expect(floorCenterY(9)).not.toBe(floorCenterY(8))
  })

  it('keeps labels inside building band', () => {
    for (let f = 1; f <= LAYOUT.floors; f++) {
      const y = floorCenterY(f)
      expect(y).toBeGreaterThanOrEqual(LAYOUT.frontTop)
      expect(y).toBeLessThanOrEqual(LAYOUT.frontBottom)
    }
  })
})

describe('elevator simulation (arrival-time wait)', () => {
  it('FCFS 9→4→7 matches owner spreadsheet', () => {
    const fcfs = simulate(DEMO_CALLS, 'fcfs')
    const byFloor = (fl: number) => fcfs.passengers.find((p) => p.floor === fl)!
    expect(byFloor(9).arrivalTime).toBe(8)
    expect(byFloor(4).arrivalTime).toBe(14.5)
    expect(byFloor(7).arrivalTime).toBe(19)
    expect(fcfs.meanWait).toBeCloseTo(13.8, 1)
  })

  it('SCAN 4→7→9 matches owner spreadsheet', () => {
    const scan = simulate(DEMO_CALLS, 'scan')
    const byFloor = (fl: number) => scan.passengers.find((p) => p.floor === fl)!
    expect(byFloor(4).arrivalTime).toBe(3)
    expect(byFloor(7).arrivalTime).toBe(7.5)
    expect(byFloor(9).arrivalTime).toBe(11)
    expect(scan.meanWait).toBeCloseTo(7.2, 1)
  })
})
