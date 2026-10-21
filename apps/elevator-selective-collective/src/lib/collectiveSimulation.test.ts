import { describe, expect, it } from 'vitest'
import { assertFloorAlignment, floorCenterY, LAYOUT } from '../../composition/layout.js'
import { simulatePassengers } from '../../composition/simulation.js'

describe('floor layout', () => {
  it('aligns call floors to floorCenterY', () => {
    assertFloorAlignment([4, 7, 8, 9].map((f) => ({ floor: f, cy: floorCenterY(f) })))
  })

  it('keeps floors inside building band', () => {
    for (let f = 1; f <= LAYOUT.floors; f++) {
      const y = floorCenterY(f)
      expect(y).toBeGreaterThanOrEqual(LAYOUT.frontTop)
      expect(y).toBeLessThanOrEqual(LAYOUT.frontBottom)
    }
  })
})

describe('down collective vs selective collective (LOOK)', () => {
  const down = simulatePassengers('down-collective')
  const sel = simulatePassengers('selective-collective')

  it('down collective passes 4F interfloor rider on the up trip', () => {
    const p2 = down.passengers.find((p) => p.id === 'p2')!
    expect(p2.wait).toBe(17.5)
    expect(p2.journey).toBe(29.5)
  })

  it('selective collective picks up 4F rider while ascending', () => {
    const p2 = sel.passengers.find((p) => p.id === 'p2')!
    expect(p2.wait).toBe(4.5)
    expect(p2.journey).toBe(9)
  })

  it('matches frozen simulation table', () => {
    expect(down.meanWait).toBeCloseTo(9.8, 1)
    expect(down.meanJourney).toBeCloseTo(20.3, 1)
    expect(sel.meanWait).toBeCloseTo(6.5, 1)
    expect(sel.meanJourney).toBeCloseTo(15, 1)

    const p1d = down.passengers.find((p) => p.id === 'p1')!
    expect(p1d.wait).toBe(0)
    expect(p1d.journey).toBe(9.5)

    const p3s = sel.passengers.find((p) => p.id === 'p3')!
    expect(p3s.wait).toBe(15)
    expect(p3s.journey).toBe(23.5)
  })
})
