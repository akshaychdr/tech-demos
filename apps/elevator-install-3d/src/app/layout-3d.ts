import * as THREE from 'three'
import type { LayoutGeometry } from '../model/geometry'
import { planRects } from '../model/layoutCoords'

export type Layout3DParts = {
  group: THREE.Group
  meshesById: Map<string, THREE.Object3D[]>
  floorPlan: THREE.Group
  fitCamera: (camera: THREE.PerspectiveCamera, controls: { target: THREE.Vector3 }) => void
}

export function buildLayout3D(g: LayoutGeometry): Layout3DParts {
  const s = 0.001
  const group = new THREE.Group()
  const meshesById = new Map<string, THREE.Object3D[]>()
  const add = (id: string, obj: THREE.Object3D) => {
    obj.userData.id = id
    const list = meshesById.get(id) ?? []
    list.push(obj)
    meshesById.set(id, list)
    group.add(obj)
  }

  const hw = g.hoistwayW * s
  const hd = g.hoistwayD * s
  const sh = g.shaftHeight * s
  const pitY = g.pit * s

  const edgeMat = new THREE.LineBasicMaterial({ color: 0x38d6ff })
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x38d6ff,
    transparent: true,
    opacity: 0.22,
    metalness: 0.15,
    roughness: 0.75,
  })

  const walls = new THREE.Group()
  const mkWall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat.clone())
    mesh.position.set(x, y, z)
    walls.add(mesh)
    walls.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat))
  }
  mkWall(hw, sh, 0.025, 0, sh / 2, -hd / 2)
  mkWall(hw, sh, 0.025, 0, sh / 2, hd / 2)
  mkWall(0.025, sh, hd, -hw / 2, sh / 2, 0)
  mkWall(0.025, sh, hd, hw / 2, sh / 2, 0)
  walls.userData.id = 'hoistway'
  add('hoistway', walls)

  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(g.platformW * s, 0.05, g.platformD * s),
    new THREE.MeshStandardMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.55, roughness: 0.5 }),
  )
  plat.position.set(0, pitY + 0.025, 0)
  add('platform', plat)
  add('platform', new THREE.LineSegments(new THREE.EdgesGeometry(plat.geometry), edgeMat))

  const railX = -hw / 2 + g.railCL * s
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, g.travel * s, 0.08),
    wallMat.clone(),
  )
  rail.position.set(railX, pitY + g.travel * s / 2, 0)
  add('rail', rail)

  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, g.travel * s * 0.9, 24),
    new THREE.MeshStandardMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.5, roughness: 0.4 }),
  )
  cyl.position.set(hw / 2 - g.wallToCylinder * s, pitY + g.travel * s / 2, hd / 2 - g.wallToCylinder * s)
  add('cylinder', cyl)

  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(g.platformW * s * 0.94, g.cabH * s, g.platformD * s * 0.94),
    new THREE.MeshStandardMaterial({ color: 0x38d6ff, transparent: true, opacity: 0.28, roughness: 0.45 }),
  )
  cab.position.set(0, pitY + g.cabH * s / 2, 0)
  add('cab', cab)
  add('cab', new THREE.LineSegments(new THREE.EdgesGeometry(cab.geometry), edgeMat))

  const gate = new THREE.Mesh(
    new THREE.BoxGeometry(g.platformW * s * 0.7, 0.04, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x331100 }),
  )
  gate.position.set(0, pitY + 0.08, hd / 2 - 0.02)
  add('gate', gate)

  const floorPlan = new THREE.Group()
  floorPlan.position.y = pitY + 0.002
  const { hoistway, platform, entranceX, railX: railPlanX, cylinderX, cylinderY } = planRects(g)
  const line = (x1: number, z1: number, x2: number, z2: number) => {
    const pts = [
      new THREE.Vector3(-hw / 2 + x1 * s, 0, -hd / 2 + z1 * s),
      new THREE.Vector3(-hw / 2 + x2 * s, 0, -hd / 2 + z2 * s),
    ]
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const mat = new THREE.LineBasicMaterial({ color: 0x38d6ff, transparent: true, opacity: 0.65 })
    floorPlan.add(new THREE.Line(geo, mat))
  }
  line(0, 0, hoistway.w, 0)
  line(hoistway.w, 0, hoistway.w, hoistway.h)
  line(hoistway.w, hoistway.h, 0, hoistway.h)
  line(0, hoistway.h, 0, 0)
  line(platform.x, platform.y, platform.x + platform.w, platform.y)
  line(platform.x + platform.w, platform.y, platform.x + platform.w, platform.y + platform.h)
  line(platform.x + platform.w, platform.y + platform.h, platform.x, platform.y + platform.h)
  line(platform.x, platform.y + platform.h, platform.x, platform.y)
  line(entranceX, 0, entranceX, hoistway.h)
  line(railPlanX, 0, railPlanX, hoistway.h)
  const cGeo = new THREE.RingGeometry(0.02, 0.035, 24)
  const cMesh = new THREE.Mesh(cGeo, new THREE.MeshBasicMaterial({ color: 0xff8a3d, side: THREE.DoubleSide }))
  cMesh.rotation.x = -Math.PI / 2
  cMesh.position.set(-hw / 2 + cylinderX * s, 0, -hd / 2 + cylinderY * s)
  floorPlan.add(cMesh)
  group.add(floorPlan)

  const pitSlab = new THREE.Mesh(
    new THREE.BoxGeometry(hw * 1.02, pitY, hd * 1.02),
    new THREE.MeshStandardMaterial({ color: 0x1a3050, roughness: 0.9 }),
  )
  pitSlab.position.y = pitY / 2
  group.add(pitSlab)

  const fitCamera = (camera: THREE.PerspectiveCamera, controls: { target: THREE.Vector3 }) => {
    const box = new THREE.Box3().setFromObject(group)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const fov = (camera.fov * Math.PI) / 180
    const dist = (maxDim / (2 * Math.tan(fov / 2))) * 1.35
    camera.position.set(center.x + dist * 0.75, center.y + dist * 0.55, center.z + dist * 0.85)
    controls.target.copy(center)
    camera.near = 0.01
    camera.far = dist * 8
    camera.updateProjectionMatrix()
  }

  return { group, meshesById, floorPlan, fitCamera }
}

export function setHighlight(meshesById: Map<string, THREE.Object3D[]>, id: string | null) {
  meshesById.forEach((objs, key) => {
    objs.forEach((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
        mats.forEach((m) => {
          if (m instanceof THREE.MeshStandardMaterial) {
            m.emissive.setHex(key === id ? 0xff8a3d : 0x000000)
            m.emissiveIntensity = key === id ? 0.35 : 0
          }
        })
      }
    })
  })
}
