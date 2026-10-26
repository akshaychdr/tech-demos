import { describe, expect, it } from 'vitest'
import { normalizePartName } from '../src/scene/partNames'

describe('normalizePartName', () => {
  it('matches Three.js GLTF name sanitization', () => {
    expect(normalizePartName('bottom panel dr ut 70x35_02')).toBe(
      'bottom_panel_dr_ut_70x35_02',
    )
    expect(normalizePartName('Drawer Back cs 652x110x12_01')).toBe(
      'Drawer_Back_cs_652x110x12_01',
    )
  })
})
