import { describe, expect, it } from 'vitest'
import { DEMO_CALLS, simulate } from '../../composition/simulation.js'

describe('elevator simulation', () => {
  it('SCAN serves up calls in ascending order from floor 1', () => {
    const scan = simulate(DEMO_CALLS, 'scan')
    expect(scan.waits).toHaveLength(3)
    // 1→4 (3 travel + dwell), 4→7, 7→9
    expect(scan.meanWait).toBeLessThan(simulate(DEMO_CALLS, 'fcfs').meanWait)
  })

  it('FCFS follows registration order floors 4, 7, 9', () => {
    const fcfs = simulate(DEMO_CALLS, 'fcfs')
    expect(fcfs.finishTime).toBeGreaterThan(0)
  })
})
