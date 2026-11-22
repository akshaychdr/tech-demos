export type PlanePoint = { x: number; y: number }

export type ScreenFit = { scale: number; x: number; y: number }

export type FaceFit = { sx: number; sy: number; x: number; y: number }

/**
 * Separate horizontal and vertical scales, then a shift that pins the first
 * `anchorCount` points (the eyes) exactly. Interpupillary distance drives
 * width, and the chin and forehead drive height.
 */
export function solveFaceFit(from: PlanePoint[], to: PlanePoint[], anchorCount = 4): FaceFit | null {
  const count = from.length
  if (count < 4 || count !== to.length || anchorCount < 2 || anchorCount > count) return null
  let anchorX = 0
  let anchorY = 0
  let targetX = 0
  let targetY = 0
  for (let i = 0; i < anchorCount; i += 1) {
    anchorX += from[i]!.x
    anchorY += from[i]!.y
    targetX += to[i]!.x
    targetY += to[i]!.y
  }
  anchorX /= anchorCount
  anchorY /= anchorCount
  targetX /= anchorCount
  targetY /= anchorCount
  let spreadX = 0
  let matchX = 0
  let spreadY = 0
  let matchY = 0
  for (let i = 0; i < count; i += 1) {
    const dx = from[i]!.x - anchorX
    const dy = from[i]!.y - anchorY
    spreadX += dx * dx
    matchX += dx * (to[i]!.x - targetX)
    spreadY += dy * dy
    matchY += dy * (to[i]!.y - targetY)
  }
  const sx = spreadX > 1e-8 ? matchX / spreadX : 1
  const sy = spreadY > 1e-8 ? matchY / spreadY : 1
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null
  return { sx, sy, x: targetX - sx * anchorX, y: targetY - sy * anchorY }
}

/** MediaPipe face-oval loop, used to feather the glow to the skin. */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149,
  150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]

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

/** Same fit as `solveScreenFit`, with a weight per point. Eyes can outweigh the chin. */
export function solveWeightedScreenFit(from: PlanePoint[], to: PlanePoint[], weights: number[]): ScreenFit | null {
  const count = from.length
  if (count < 3 || count !== to.length || weights.length !== count) return null
  let weight = 0
  let meanX = 0
  let meanY = 0
  let targetX = 0
  let targetY = 0
  for (let i = 0; i < count; i += 1) {
    const w = weights[i]!
    if (!(w > 0)) continue
    weight += w
    meanX += w * from[i]!.x
    meanY += w * from[i]!.y
    targetX += w * to[i]!.x
    targetY += w * to[i]!.y
  }
  if (weight <= 0) return null
  meanX /= weight
  meanY /= weight
  targetX /= weight
  targetY /= weight
  let match = 0
  let spread = 0
  for (let i = 0; i < count; i += 1) {
    const w = weights[i]!
    if (!(w > 0)) continue
    const dx = from[i]!.x - meanX
    const dy = from[i]!.y - meanY
    match += w * (dx * (to[i]!.x - targetX) + dy * (to[i]!.y - targetY))
    spread += w * (dx * dx + dy * dy)
  }
  if (spread < 1e-8) return { scale: 1, x: targetX - meanX, y: targetY - meanY }
  const scale = match / spread
  if (!Number.isFinite(scale)) return null
  return { scale, x: targetX - scale * meanX, y: targetY - scale * meanY }
}

/** Keep the on-screen correction inside the range the sliders can also reach. */
export function clampScreenScale(scale: number, min = 0.6, max = 1.6): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(max, Math.max(min, scale))
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
