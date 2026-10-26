import * as THREE from 'three'

/** Longest bbox axis. */
export function principalAxis(size: THREE.Vector3): THREE.Vector3 {
  if (size.x >= size.y && size.x >= size.z) return new THREE.Vector3(1, 0, 0)
  if (size.y >= size.z) return new THREE.Vector3(0, 1, 0)
  return new THREE.Vector3(0, 0, 1)
}

/**
 * Axis the fastener travels along.
 * A long screw or dowel uses its long axis. A flat head or clip (one axis much
 * thinner, the other two similar) enters along the thin axis.
 */
export function insertionAxis(size: THREE.Vector3): THREE.Vector3 {
  const dims = [size.x, size.y, size.z]
  const order = [0, 1, 2].sort((a, b) => dims[b] - dims[a])
  const longest = dims[order[0]]
  const mid = dims[order[1]]
  const thin = dims[order[2]]
  const plate = thin < longest * 0.45 && longest < mid * 2.2
  const axis = new THREE.Vector3()
  axis.setComponent(plate ? order[2] : order[0], 1)
  return axis
}

/** Which way along `axis` is clear of solid boxes (the side the fastener approaches from). */
export function approachFromClearance(
  axis: THREE.Vector3,
  origin: THREE.Vector3,
  boxes: THREE.Box3[],
): THREE.Vector3 {
  const unit = axis.clone().normalize()
  const penalty = (dir: THREE.Vector3) => {
    let n = 0
    for (const d of [0.012, 0.028, 0.05]) {
      const p = origin.clone().addScaledVector(dir, d)
      if (boxes.some((b) => b.containsPoint(p))) n += 1
    }
    return n
  }
  const forward = penalty(unit)
  const back = penalty(unit.clone().negate())
  return forward <= back ? unit : unit.clone().negate()
}

/** Directions ~degrees off `approach`, one in each perpendicular. */
export function approachOffsets(approach: THREE.Vector3, degrees = 40): THREE.Vector3[] {
  const hint = Math.abs(approach.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const side = new THREE.Vector3().crossVectors(approach, hint).normalize()
  const lift = new THREE.Vector3().crossVectors(side, approach).normalize()
  const a = (degrees * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return [side, lift, side.clone().negate(), lift.clone().negate()].map((perp) =>
    approach.clone().multiplyScalar(cos).add(perp.multiplyScalar(sin)).normalize(),
  )
}

/** Distance from `point` to the nearest box edge lying on the face we look along `approach`. */
export function nearestInPlaneEdge(box: THREE.Box3, point: THREE.Vector3, approach: THREE.Vector3): number {
  const n = approach.clone().normalize()
  const axes = [
    { w: Math.abs(n.x), d: Math.min(Math.abs(point.x - box.min.x), Math.abs(point.x - box.max.x)) },
    { w: Math.abs(n.y), d: Math.min(Math.abs(point.y - box.min.y), Math.abs(point.y - box.max.y)) },
    { w: Math.abs(n.z), d: Math.min(Math.abs(point.z - box.min.z), Math.abs(point.z - box.max.z)) },
  ].sort((a, b) => b.w - a.w)
  return Math.min(axes[1].d, axes[2].d)
}

/** Point on the box face whose outward normal best matches `approach`. */
export function facePoint(box: THREE.Box3, approach: THREE.Vector3, ref: THREE.Vector3): THREE.Vector3 {
  const c = ref.clone().clamp(box.min, box.max)
  const n = approach.clone().normalize()
  const faces = [
    new THREE.Vector3(box.max.x, c.y, c.z),
    new THREE.Vector3(box.min.x, c.y, c.z),
    new THREE.Vector3(c.x, box.max.y, c.z),
    new THREE.Vector3(c.x, box.min.y, c.z),
    new THREE.Vector3(c.x, c.y, box.max.z),
    new THREE.Vector3(c.x, c.y, box.min.z),
  ]
  const normals = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ]
  let best = faces[0]
  let bestDot = -Infinity
  normals.forEach((fn, i) => {
    const d = fn.dot(n)
    if (d > bestDot) {
      bestDot = d
      best = faces[i]
    }
  })
  return best
}

/** Thinnest bbox axis — panel normal. */
export function thinAxis(size: THREE.Vector3): THREE.Vector3 {
  if (size.x <= size.y && size.x <= size.z) return new THREE.Vector3(1, 0, 0)
  if (size.y <= size.z) return new THREE.Vector3(0, 1, 0)
  return new THREE.Vector3(0, 0, 1)
}

/** Flip axis so it points away from the cabinet centre. */
export function orientOutward(axis: THREE.Vector3, from: THREE.Vector3, cabinetCenter: THREE.Vector3): THREE.Vector3 {
  const out = from.clone().sub(cabinetCenter)
  if (axis.dot(out) < 0) axis.negate()
  return axis
}

/** Distance so a region of `regionM` metres fills `fill` of the vertical frame. */
export function viewDistance(regionM: number, fovDeg: number, fill: number): number {
  const fov = (fovDeg * Math.PI) / 180
  return regionM / (fill * 2 * Math.tan(fov / 2))
}

/** Direction ~degrees off `axis`, in the plane of axis × world up. */
export function offsetDirection(axis: THREE.Vector3, degrees = 40): THREE.Vector3 {
  const up = Math.abs(axis.y) > 0.85 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
  const side = new THREE.Vector3().crossVectors(axis, up).normalize()
  const a = (degrees * Math.PI) / 180
  return axis.clone().multiplyScalar(Math.cos(a)).add(side.multiplyScalar(Math.sin(a))).normalize()
}

export function worldBox(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  return { box, center, size }
}

export function closeupPose(
  joint: THREE.Vector3,
  axisOut: THREE.Vector3,
  fovDeg: number,
  regionM = 0.11,
  fill = 0.55,
) {
  const dist = viewDistance(regionM, fovDeg, fill)
  const dir = offsetDirection(axisOut, 40)
  return {
    position: joint.clone().add(dir.multiplyScalar(dist)),
    target: joint.clone(),
  }
}

export function sidePose(
  faceCenter: THREE.Vector3,
  outward: THREE.Vector3,
  regionM: number,
  fovDeg: number,
  fill = 0.62,
) {
  const dist = viewDistance(regionM, fovDeg, fill)
  const position = faceCenter.clone().add(outward.clone().multiplyScalar(dist))
  position.y += regionM * 0.06
  return { position, target: faceCenter.clone() }
}
