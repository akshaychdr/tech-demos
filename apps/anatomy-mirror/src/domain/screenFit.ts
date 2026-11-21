export type PlanePoint = { x: number; y: number }

export type ScreenFit = { scale: number; x: number; y: number }

/**
 * Uniform scale and shift that carries `from` onto `to`.
 * Scale is around the cloud, then a translation lines up the centres.
 */
export function solveScreenFit(from: PlanePoint[], to: PlanePoint[]): ScreenFit | null {
  const count = from.length
  if (count < 3 || count !== to.length) return null
  let meanX = 0
  let meanY = 0
  let targetX = 0
  let targetY = 0
  for (let i = 0; i < count; i += 1) {
    meanX += from[i]!.x
    meanY += from[i]!.y
    targetX += to[i]!.x
    targetY += to[i]!.y
  }
  meanX /= count
  meanY /= count
  targetX /= count
  targetY /= count
  let match = 0
  let spread = 0
  for (let i = 0; i < count; i += 1) {
    const dx = from[i]!.x - meanX
    const dy = from[i]!.y - meanY
    match += dx * (to[i]!.x - targetX) + dy * (to[i]!.y - targetY)
    spread += dx * dx + dy * dy
  }
  if (spread < 1e-8) return { scale: 1, x: targetX - meanX, y: targetY - meanY }
  const scale = match / spread
  return { scale, x: targetX - scale * meanX, y: targetY - scale * meanY }
}

/** Landmarks used to pin the skull to the face on screen. Canonical face, centimetres. */
export const POSE_LANDMARKS: { index: number; at: [number, number, number] }[] = [
  { index: 33, at: [-4.445859, 2.663991, 3.173422] },
  { index: 263, at: [4.445859, 2.663991, 3.173422] },
  { index: 133, at: [-1.856432, 2.585245, 3.757904] },
  { index: 362, at: [1.856432, 2.585245, 3.757904] },
  { index: 1, at: [0, -1.126865, 7.475604] },
  { index: 2, at: [0, -2.089024, 6.058267] },
  { index: 168, at: [0, 3.271027, 5.236015] },
  { index: 10, at: [0, 8.261778, 4.481535] },
  { index: 152, at: [0, -9.403378, 4.264492] },
  { index: 234, at: [-7.664182, 0.673132, -2.435867] },
  { index: 454, at: [7.664182, 0.673132, -2.435867] },
  { index: 61, at: [-2.456206, -4.342621, 4.283884] },
  { index: 291, at: [2.456206, -4.342621, 4.283884] },
]
