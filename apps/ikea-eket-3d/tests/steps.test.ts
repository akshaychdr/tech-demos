import { describe, expect, it } from 'vitest'
import { hardwareIntroducedOnSteps, steps } from '../src/model/stepsData'
import partsJson from '../data/parts.json'

describe('assembly steps data', () => {
  it('covers every GLB top-level part exactly once', () => {
    const seen = new Set<string>()
    for (const step of steps) {
      for (const n of step.nodes) {
        expect(seen.has(n)).toBe(false)
        seen.add(n)
      }
    }
    expect(seen.size).toBe(83)
  })

  it('hardware callouts on steps do not exceed manual totals', () => {
    const rolled = hardwareIntroducedOnSteps()
    for (const [id, count] of Object.entries(rolled)) {
      const max = partsJson.hardwareTotals[id as keyof typeof partsJson.hardwareTotals]
      expect(max).toBeDefined()
      expect(count).toBeLessThanOrEqual(max!)
    }
  })

  it('has a final drawer-open step', () => {
    expect(steps[steps.length - 1].openDrawers).toBe(true)
  })
})
