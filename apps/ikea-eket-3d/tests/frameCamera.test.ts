import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  approachFromClearance,
  approachOffsets,
  insertionAxis,
  nearestInPlaneEdge,
  orientOutward,
  principalAxis,
  thinAxis,
  viewDistance,
} from '../src/scene/frameCamera'

describe('frameCamera', () => {
  it('picks the long fastener axis and the thin panel axis', () => {
    expect(principalAxis(new THREE.Vector3(0.008, 0.008, 0.03)).z).toBe(1)
    expect(thinAxis(new THREE.Vector3(0.002, 0.32, 0.67)).x).toBe(1)
  })

  it('points the back-panel normal away from the cabinet centre', () => {
    const axis = thinAxis(new THREE.Vector3(0.0025, 0.32, 0.67))
    const face = new THREE.Vector3(-0.15, 0.17, 0)
    const centre = new THREE.Vector3(0.01, 0.17, 0)
    const outward = orientOutward(axis, face, centre)
    expect(outward.x).toBeLessThan(0)
  })

  it('places a 0.11 m joint at about 55% of a 28° frame', () => {
    const d = viewDistance(0.11, 28, 0.55)
    expect(d).toBeGreaterThan(0.15)
    expect(d).toBeLessThan(0.6)
  })

  it('uses the thin axis for a flat clip and the long axis for a screw', () => {
    expect(insertionAxis(new THREE.Vector3(0.0018, 0.012, 0.01)).x).toBe(1)
    expect(insertionAxis(new THREE.Vector3(0.0415, 0.012, 0.012)).x).toBe(1)
    expect(insertionAxis(new THREE.Vector3(0.008, 0.008, 0.013)).z).toBe(1)
  })

  it('approaches from the side that is clear of the host box', () => {
    const host = new THREE.Box3(new THREE.Vector3(-0.02, -0.05, -0.05), new THREE.Vector3(0.2, 0.05, 0.05))
    const approach = approachFromClearance(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), [host])
    expect(approach.x).toBeLessThan(0)
  })

  it('measures the in-plane distance to the nearest panel edge', () => {
    const box = new THREE.Box3(new THREE.Vector3(-0.17, 0, -0.35), new THREE.Vector3(0.18, 0.35, -0.33))
    const edge = nearestInPlaneEdge(box, new THREE.Vector3(0, 0.22, -0.34), new THREE.Vector3(0, 0, -1))
    expect(edge).toBeGreaterThan(0.1)
    expect(edge).toBeLessThan(0.14)
  })

  it('offsets the close-up about 40° from the fastener axis', () => {
    const dirs = approachOffsets(new THREE.Vector3(1, 0, 0), 40)
    expect(dirs).toHaveLength(4)
    for (const dir of dirs) {
      const deg = (Math.acos(dir.x) * 180) / Math.PI
      expect(deg).toBeGreaterThan(35)
      expect(deg).toBeLessThan(45)
    }
  })
})
