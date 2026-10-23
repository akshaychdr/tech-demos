import { describe, expect, it } from 'vitest'
import { assertFloorAlignment, floorCenterY, LAYOUT } from '../../composition/layout.js'
import { simulatePassengers } from '../../composition/simulation.js'

describe('floor layout', () => {
  it('aligns call floors to floorCenterY', () => {
    assertFloorAlignment([4, 7, 8].map((f) => ({ floor: f, cy: floorCenterY(f) })))
  })

  it('keeps floors inside building band', () => {
    for (let f = 1; f <= LAYOUT.floors; f++) {
      const y = floorCenterY(f)
      expect(y).toBeGreaterThanOrEqual(LAYOUT.frontTop)
      expect(y).toBeLessThanOrEqual(LAYOUT.frontBottom)
    }
  })
})

describe('down collective vs selective collective (A–D scenario)', () => {
  const down = simulatePassengers('down-collective')
  const sel = simulatePassengers('selective-collective')

  it('down collective full cycle including second up trip for B and C', () => {
    const a = down.passengers.find((p) => p.id === 'a')!
    const b = down.passengers.find((p) => p.id === 'b')!
    const c = down.passengers.find((p) => p.id === 'c')!
    const d = down.passengers.find((p) => p.id === 'd')!
    expect(a.wait).toBe(0)
    expect(a.journey).toBe(9.5)
    expect(d.wait).toBe(12)
    expect(d.journey).toBe(23.5)
    expect(c.wait).toBe(14.5)
    expect(c.journey).toBe(34.5)
    expect(b.wait).toBe(19)
    expect(b.journey).toBe(31)
  })

  it('selective collective serves 4F and 7F up, skips 8F up, returns for 8F down', () => {
    const b = sel.passengers.find((p) => p.id === 'b')!
    const c = sel.passengers.find((p) => p.id === 'c')!
    const d = sel.passengers.find((p) => p.id === 'd')!
    expect(b.wait).toBe(4.5)
    expect(b.journey).toBe(9)
    expect(c.wait).toBe(9)
    expect(c.journey).toBe(12.5)
    expect(d.wait).toBe(15)
    expect(d.journey).toBe(23.5)
  })

  it('matches owner mean wait and journey table', () => {
    expect(down.meanWait).toBeCloseTo(11.375, 3)
    expect(down.meanJourney).toBeCloseTo(24.625, 3)
    expect(sel.meanWait).toBeCloseTo(7.125, 3)
    expect(sel.meanJourney).toBeCloseTo(14.375, 3)
  })
})
