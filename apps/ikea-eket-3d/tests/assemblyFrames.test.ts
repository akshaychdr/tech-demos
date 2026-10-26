import { describe, expect, it } from 'vitest'
import { assemblyFrames } from '../src/data/assemblyFrames'

describe('assemblyFrames', () => {
  it('has context + closeup pairs for hardware steps', () => {
    const closeups = assemblyFrames.filter((f) => f.phase === 'closeup')
    expect(closeups.length).toBeGreaterThanOrEqual(6)
    for (const f of closeups) {
      expect(f.hardware?.partId).toBeTruthy()
      expect(f.camera.position.length).toBe(3)
    }
  })

  it('flat-pack is paginated', () => {
    const flat = assemblyFrames.filter((f) => f.phase === 'flatpack')
    expect(flat.map((f) => f.flatpackPage)).toEqual([0, 1, 2])
  })
})
