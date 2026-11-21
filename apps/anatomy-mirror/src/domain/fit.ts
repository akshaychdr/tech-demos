import type { Vec3 } from './types.ts'

/** Landmarks the skull was aligned to, in MediaPipe canonical face space (Y up, Z forward). */
export const FIT_INDEX = [10, 168, 152, 345, 116, 397, 172, 4, 234, 454, 61, 291, 33, 263] as const

export const CANONICAL_FIT: Vec3[] = [
  [0, 8.261778, 4.481535],
  [0, 3.271027, 5.236015],
  [0, -9.403378, 4.264492],
  [6.46517, 0.937119, 1.689873],
  [-6.46517, 0.937119, 1.689873],
  [5.940524, -6.223629, -0.631468],
  [-5.940524, -6.223629, -0.631468],
  [0, -0.46317, 7.58658],
  [-7.664182, 0.673132, -2.435867],
  [7.664182, 0.673132, -2.435867],
  [-2.456206, -4.342621, 4.283884],
  [2.456206, -4.342621, 4.283884],
  [-4.445859, 2.663991, 3.173422],
  [4.445859, 2.663991, 3.173422],
]

export type Similarity = {
  scale: number
  rot: number[][]
  trans: Vec3
}

function mean(pts: Vec3[]): Vec3 {
  const m: Vec3 = [0, 0, 0]
  for (const p of pts) {
    m[0] += p[0]
    m[1] += p[1]
    m[2] += p[2]
  }
  return [m[0] / pts.length, m[1] / pts.length, m[2] / pts.length]
}

/** Jacobi eigen-decomposition of a symmetric 3x3. */
function eigenSymmetric(m: number[][]): { values: number[]; vectors: number[][] } {
  const a = m.map((row) => [...row])
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  for (let iter = 0; iter < 16; iter += 1) {
    let p = 0
    let q = 1
    let max = Math.abs(a[0]![1]!)
    const candidates: [number, number][] = [
      [0, 2],
      [1, 2],
    ]
    for (const [i, j] of candidates) {
      const value = Math.abs(a[i]![j]!)
      if (value > max) {
        max = value
        p = i
        q = j
      }
    }
    if (max < 1e-12) break
    const app = a[p]![p]!
    const aqq = a[q]![q]!
    const apq = a[p]![q]!
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app)
    const c = Math.cos(phi)
    const s = Math.sin(phi)
    for (let k = 0; k < 3; k += 1) {
      const aik = a[k]![p]!
      const aiq = a[k]![q]!
      a[k]![p] = c * aik - s * aiq
      a[k]![q] = s * aik + c * aiq
    }
    for (let k = 0; k < 3; k += 1) {
      const akp = a[p]![k]!
      const akq = a[q]![k]!
      a[p]![k] = c * akp - s * akq
      a[q]![k] = s * akp + c * akq
    }
    for (let k = 0; k < 3; k += 1) {
      const vkp = v[k]![p]!
      const vkq = v[k]![q]!
      v[k]![p] = c * vkp - s * vkq
      v[k]![q] = s * vkp + c * vkq
    }
  }
  return { values: [a[0]![0]!, a[1]![1]!, a[2]![2]!], vectors: v }
}

function matMul(a: number[][], b: number[][]): number[][] {
  const out = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      out[i]![j] = a[i]![0]! * b[0]![j]! + a[i]![1]! * b[1]![j]! + a[i]![2]! * b[2]![j]!
    }
  }
  return out
}

function transpose(a: number[][]): number[][] {
  return [
    [a[0]![0]!, a[1]![0]!, a[2]![0]!],
    [a[0]![1]!, a[1]![1]!, a[2]![1]!],
    [a[0]![2]!, a[1]![2]!, a[2]![2]!],
  ]
}

function det(a: number[][]): number {
  return (
    a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!) -
    a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!) +
    a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!)
  )
}

/** Map src onto dst with a uniform scale, rotation, and translation. */
export function umeyama(src: Vec3[], dst: Vec3[]): Similarity {
  const n = src.length
  const muS = mean(src)
  const muD = mean(dst)
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  let variance = 0
  for (let i = 0; i < n; i += 1) {
    const s: Vec3 = [src[i]![0] - muS[0], src[i]![1] - muS[1], src[i]![2] - muS[2]]
    const d: Vec3 = [dst[i]![0] - muD[0], dst[i]![1] - muD[1], dst[i]![2] - muD[2]]
    variance += s[0] * s[0] + s[1] * s[1] + s[2] * s[2]
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) cov[r]![c]! += d[r]! * s[c]!
    }
  }
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) cov[r]![c]! /= n
  variance /= n

  const ata = matMul(transpose(cov), cov)
  const { values, vectors } = eigenSymmetric(ata)
  const order = [0, 1, 2].sort((i, j) => values[j]! - values[i]!)
  const vCols = order.map((index) => vectors.map((row) => row[index]!))
  const v = [
    [vCols[0]![0]!, vCols[1]![0]!, vCols[2]![0]!],
    [vCols[0]![1]!, vCols[1]![1]!, vCols[2]![1]!],
    [vCols[0]![2]!, vCols[1]![2]!, vCols[2]![2]!],
  ]
  const singular = order.map((index) => Math.sqrt(Math.max(0, values[index]!)))
  const uCols = singular.map((sigma, col) => {
    const vc = [v[0]![col]!, v[1]![col]!, v[2]![col]!]
    const uc = [
      cov[0]![0]! * vc[0]! + cov[0]![1]! * vc[1]! + cov[0]![2]! * vc[2]!,
      cov[1]![0]! * vc[0]! + cov[1]![1]! * vc[1]! + cov[1]![2]! * vc[2]!,
      cov[2]![0]! * vc[0]! + cov[2]![1]! * vc[1]! + cov[2]![2]! * vc[2]!,
    ]
    const norm = Math.hypot(uc[0]!, uc[1]!, uc[2]!) || 1
    return uc.map((value) => value / (sigma < 1e-10 ? 1 : norm))
  })
  let u = [
    [uCols[0]![0]!, uCols[1]![0]!, uCols[2]![0]!],
    [uCols[0]![1]!, uCols[1]![1]!, uCols[2]![1]!],
    [uCols[0]![2]!, uCols[1]![2]!, uCols[2]![2]!],
  ]
  let vt = transpose(v)
  if (det(u) * det(vt) < 0) {
    u = u.map((row) => [row[0]!, row[1]!, -row[2]!])
    singular[2] = -singular[2]!
  }
  const rot = matMul(u, vt)
  const trace = singular[0]! + singular[1]! + singular[2]!
  const fitScale = variance > 1e-12 ? trace / variance : 1
  const trans: Vec3 = [
    muD[0] - fitScale * (rot[0]![0]! * muS[0] + rot[0]![1]! * muS[1] + rot[0]![2]! * muS[2]),
    muD[1] - fitScale * (rot[1]![0]! * muS[0] + rot[1]![1]! * muS[1] + rot[1]![2]! * muS[2]),
    muD[2] - fitScale * (rot[2]![0]! * muS[0] + rot[2]![1]! * muS[1] + rot[2]![2]! * muS[2]),
  ]
  return { scale: fitScale, rot, trans }
}

export type Similarity2 = {
  scale: number
  cos: number
  sin: number
  tx: number
  ty: number
  tz: number
}

/** Image-plane fit. Keeps the skull on the face even when depth is noisy. */
export function umeyama2(src: Vec3[], dst: Vec3[]): Similarity2 {
  const n = src.length
  let msx = 0
  let msy = 0
  let msz = 0
  let mdx = 0
  let mdy = 0
  let mdz = 0
  for (const p of src) {
    msx += p[0]
    msy += p[1]
    msz += p[2]
  }
  for (const p of dst) {
    mdx += p[0]
    mdy += p[1]
    mdz += p[2]
  }
  msx /= n
  msy /= n
  msz /= n
  mdx /= n
  mdy /= n
  mdz /= n
  let a = 0
  let b = 0
  let variance = 0
  for (let i = 0; i < n; i += 1) {
    const sx = src[i]![0] - msx
    const sy = src[i]![1] - msy
    const dx = dst[i]![0] - mdx
    const dy = dst[i]![1] - mdy
    a += sx * dx + sy * dy
    b += sx * dy - sy * dx
    variance += sx * sx + sy * sy
  }
  const radius = Math.hypot(a, b) || 1
  const cos = a / radius
  const sin = b / radius
  const fitScale = variance > 1e-8 ? radius / variance : 1
  return {
    scale: fitScale,
    cos,
    sin,
    tx: mdx - fitScale * (cos * msx - sin * msy),
    ty: mdy - fitScale * (sin * msx + cos * msy),
    tz: mdz - fitScale * msz,
  }
}

export function applySimilarity(p: Vec3, fit: Similarity): Vec3 {
  const { scale: s, rot, trans } = fit
  return [
    s * (rot[0]![0]! * p[0] + rot[0]![1]! * p[1] + rot[0]![2]! * p[2]) + trans[0],
    s * (rot[1]![0]! * p[0] + rot[1]![1]! * p[1] + rot[1]![2]! * p[2]) + trans[1],
    s * (rot[2]![0]! * p[0] + rot[2]![1]! * p[1] + rot[2]![2]! * p[2]) + trans[2],
  ]
}
