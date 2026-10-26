import { describe, expect, it } from 'vitest'
import { energisedEdgeIds, isMotorEnergised, validateAmpTable } from '../src/model/circuit'

describe('circuit energisation', () => {
  it('main open → no motor phases', () => {
    const edges = energisedEdgeIds({ aux110: true, main: false })
    expect(edges.has('L1-motor')).toBe(false)
    expect(isMotorEnergised({ aux110: true, main: false })).toBe(false)
  })

  it('main and aux closed → motor path energised', () => {
    const edges = energisedEdgeIds({ aux110: true, main: true })
    expect(edges.has('L1-motor')).toBe(true)
    expect(isMotorEnergised({ aux110: true, main: true })).toBe(true)
  })

  it('amp table matches Appendix 3 transcription', () => {
    expect(validateAmpTable()).toBe(true)
  })
})
