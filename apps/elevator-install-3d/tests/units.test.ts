import { describe, expect, it } from 'vitest'
import { inToMm } from '../src/model/units'

describe('inToMm', () => {
  it('converts standard layout values', () => {
    expect(inToMm(50)).toBe(1270)
    expect(inToMm(37.5)).toBe(953)
    expect(inToMm(8.875)).toBe(225)
    expect(inToMm(37.5)).toBe(953)
    expect(inToMm(9.75)).toBe(248)
    expect(inToMm(1.25)).toBe(32)
    expect(inToMm(5.5)).toBe(140)
    expect(inToMm(10)).toBe(254)
    expect(inToMm(96)).toBe(2438)
    expect(inToMm(8)).toBe(203)
  })
})
