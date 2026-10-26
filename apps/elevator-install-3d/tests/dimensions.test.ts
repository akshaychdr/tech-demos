import { describe, expect, it } from 'vitest'
import dimensions from '../data/dimensions.json'
import typeARows from '../data/typeARows.json'
import { compareInchToPublishedMm, inToMm } from '../src/model/units'

describe('dimensions.json', () => {
  it('has unique ids', () => {
    const ids = dimensions.items.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every non-TBD item matches inch conversion', () => {
    for (const item of dimensions.items) {
      if (item.tbd || item.in === null) continue
      expect(item.mm).toBe(inToMm(item.in))
    }
  })
})

const typeAFields: Array<{ field: keyof (typeof typeARows)[0]; inKey: keyof (typeof typeARows)[0] }> = [
  { field: 'hoistwayWidthMmPublished', inKey: 'hoistwayWidthIn' },
  { field: 'hoistwayDepthMmPublished', inKey: 'hoistwayDepthIn' },
  { field: 'platformWidthMmPublished', inKey: 'platformWidthIn' },
  { field: 'platformDepthMmPublished', inKey: 'platformDepthIn' },
  { field: 'entranceCenterlineMmPublished', inKey: 'entranceCenterlineIn' },
  { field: 'railCenterlineMmPublished', inKey: 'railCenterlineIn' },
]

describe('Type A table inch/mm consistency', () => {
  it('flags published mm that diverge from rounded inch×25.4', () => {
    const mismatches: string[] = []
    for (const row of typeARows) {
      for (const { field, inKey } of typeAFields) {
        const inches = row[inKey] as number
        const published = row[field] as number
        const m = compareInchToPublishedMm(`${row.id}.${field}`, inches, published)
        if (m) mismatches.push(`${m.field}: in=${m.inches} → ${m.expectedMm} mm but PDF lists ${m.publishedMm} mm`)
      }
      const cabW = compareInchToPublishedMm('cabW', row.cabWidthIn, row.cabWidthMmPublished)
      const cabD = compareInchToPublishedMm('cabD', row.cabDepthIn, row.cabDepthMmPublished)
      if (cabW) mismatches.push(`${row.id} cab width PDF uses ${cabW.publishedMm} mm (rounded ${cabW.expectedMm} mm from ${cabW.inches}")`)
      if (cabD) mismatches.push(`${row.id} cab depth PDF uses ${cabD.publishedMm} mm (rounded ${cabD.expectedMm} mm from ${cabD.inches}")`)
    }
    // Document known OEM rounding choices — test fails if NEW silent drift appears without updating this list
    expect(mismatches.length).toBeGreaterThan(0)
    expect(mismatches.some((m) => m.includes('1360'))).toBe(true)
  })

  it('default config exists', () => {
    const row = typeARows.find((r) => r.id === dimensions.defaultConfigId)
    expect(row).toBeTruthy()
    expect(row!.hoistwayWidthMmPublished).toBe(1270)
    expect(row!.entranceCenterlineMmPublished).toBe(730)
    expect(row!.railCenterlineMmPublished).toBe(660)
  })
})
