import { REGION_ANCHORS } from './anchors.ts'
import { add, dist, mid, normalize, scale, sub } from './math.ts'
import type { BoneId, Vec3 } from './types.ts'

/** Free-classify radius, in units of inter-ocular distance. */
export const TOUCH_RADIUS = 0.48
/** Quiz accepts a point this much farther than the nearest rival. */
export const QUIZ_MARGIN = 0.12
/** Hard cap for a quiz hit, in iod units. */
export const QUIZ_MAX = 0.55

export type TouchHit = {
  bone: BoneId
  distance: number
  iod: number
}

type Anchor = { bone: BoneId; at: Vec3 }

function iodOf(landmarks: Vec3[]): number {
  return dist(landmarks[33]!, landmarks[263]!) || 1
}

function extraAnchors(landmarks: Vec3[], iod: number): Anchor[] {
  const up = normalize(sub(landmarks[10]!, landmarks[152]!))
  const forward = normalize(sub(landmarks[4]!, mid(landmarks[234]!, landmarks[454]!)))
  const parietal = add(landmarks[10]!, scale(up, iod * 0.62))
  const side = normalize(sub(landmarks[263]!, landmarks[33]!))
  const occipital = add(mid(landmarks[10]!, landmarks[152]!), scale(forward, -iod * 0.95))
  return [
    { bone: 'parietal', at: parietal },
    { bone: 'parietal', at: add(parietal, scale(side, iod * 0.28)) },
    { bone: 'parietal', at: add(parietal, scale(side, -iod * 0.28)) },
    { bone: 'occipital', at: occipital },
    { bone: 'occipital', at: add(landmarks[234]!, scale(forward, -iod * 0.45)) },
    { bone: 'occipital', at: add(landmarks[454]!, scale(forward, -iod * 0.45)) },
  ]
}

export function anchorsFor(landmarks: Vec3[]): { iod: number; anchors: Anchor[] } {
  const iod = iodOf(landmarks)
  const anchors: Anchor[] = []
  for (const bone of Object.keys(REGION_ANCHORS) as (keyof typeof REGION_ANCHORS)[]) {
    for (const index of REGION_ANCHORS[bone]) {
      const at = landmarks[index]
      if (at) anchors.push({ bone, at })
    }
  }
  anchors.push(...extraAnchors(landmarks, iod))
  return { iod, anchors }
}

function nearest(anchors: Anchor[], point: Vec3, bone?: BoneId): { bone: BoneId; distance: number } | null {
  let best: { bone: BoneId; distance: number } | null = null
  for (const anchor of anchors) {
    if (bone && anchor.bone !== bone) continue
    const distance = dist(anchor.at, point)
    if (!best || distance < best.distance) best = { bone: anchor.bone, distance }
  }
  return best
}

/** Nearest bone under a fingertip, or null when the finger is off the face. */
export function classifyTouch(landmarks: Vec3[], point: Vec3): TouchHit | null {
  if (landmarks.length < 468) return null
  const { iod, anchors } = anchorsFor(landmarks)
  const hit = nearest(anchors, point)
  if (!hit || hit.distance > TOUCH_RADIUS * iod) return null
  return { bone: hit.bone, distance: hit.distance, iod }
}

/**
 * Quiz check. A point within a small margin of the asked bone still counts,
 * so a wobble on the temple/forehead border is not marked wrong.
 */
export function matchesBone(landmarks: Vec3[], point: Vec3, target: BoneId): boolean {
  if (landmarks.length < 468) return false
  const { iod, anchors } = anchorsFor(landmarks)
  const mine = nearest(anchors, point, target)
  const other = nearest(
    anchors.filter((anchor) => anchor.bone !== target),
    point,
  )
  if (!mine) return false
  if (mine.distance > QUIZ_MAX * iod) return false
  if (!other) return true
  return mine.distance <= other.distance + QUIZ_MARGIN * iod
}
