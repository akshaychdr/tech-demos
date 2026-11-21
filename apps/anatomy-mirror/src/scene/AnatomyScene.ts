import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { CANONICAL_FIT, FIT_INDEX, umeyama2, type Similarity2 } from '../domain/fit.ts'
import { structure } from '../domain/structures.ts'
import type { StructureId, Vec3 } from '../domain/types.ts'

const HAND_PAIRS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
]

export type SceneLayers = {
  bones: boolean
  muscles: boolean
  brain: boolean
  hand: boolean
}

type Part = {
  id: StructureId
  object: THREE.Object3D
  material: THREE.MeshStandardMaterial
}

export class AnatomyScene {
  readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.OrthographicCamera
  private readonly fitGroup = new THREE.Group()
  private readonly parts = new Map<StructureId, Part>()
  private readonly handGroup = new THREE.Group()
  private readonly handBones: THREE.Mesh[] = []
  private display = {
    ready: false,
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    scale: 1,
  }
  private viewW = 1
  private viewH = 1

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' })
    this.renderer.setClearColor(0x000000, 0)
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 8000)
    this.camera.position.set(0, 0, 2500)
    this.scene.add(this.fitGroup)
    this.scene.add(new THREE.AmbientLight(0xfff4e8, 0.7))
    const key = new THREE.DirectionalLight(0xfff1df, 1.3)
    key.position.set(0.2, 0.4, 1)
    this.scene.add(key)
    const handMat = new THREE.MeshStandardMaterial({
      color: '#f4ecdf',
      emissive: '#d9c7a6',
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.62,
      roughness: 0.45,
      depthWrite: false,
    })
    for (let i = 0; i < HAND_PAIRS.length; i += 1) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), handMat)
      mesh.visible = false
      mesh.frustumCulled = false
      this.handBones.push(mesh)
      this.handGroup.add(mesh)
    }
    this.handGroup.visible = false
    this.scene.add(this.handGroup)
  }

  async load(url: string): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(url)
    gltf.scene.updateMatrixWorld(true)
    for (const id of [
      'frontal', 'parietal', 'temporal', 'occipital', 'nasal', 'zygomatic', 'maxilla', 'mandible',
      'frontalis', 'corrugator', 'orbicularis', 'zygomaticus', 'masseter', 'brain',
    ] as StructureId[]) {
      const object = gltf.scene.getObjectByName(id)
      if (!object) continue
      const info = structure(id)
      const material = new THREE.MeshStandardMaterial({
        color: info.color,
        emissive: info.color,
        emissiveIntensity: 0.22,
        transparent: true,
        opacity: info.layer === 'brain' ? 0.34 : 0.5,
        roughness: 0.42,
        metalness: 0.04,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      object.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.material = material
        mesh.frustumCulled = false
        mesh.renderOrder = info.layer === 'brain' ? 1 : 2
      })
      this.fitGroup.add(object)
      this.parts.set(id, { id, object, material })
    }
  }

  setSize(viewW: number, viewH: number, dpr: number): void {
    this.viewW = viewW
    this.viewH = viewH
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(viewW, viewH, false)
    this.camera.left = -viewW / 2
    this.camera.right = viewW / 2
    this.camera.top = viewH / 2
    this.camera.bottom = -viewH / 2
    this.camera.position.set(viewW / 2, viewH / 2, 2500)
    this.camera.lookAt(viewW / 2, viewH / 2, 0)
    this.camera.updateProjectionMatrix()
  }

  update(options: {
    landmarks: Vec3[] | null
    layers: SceneLayers
    highlight: StructureId | null
    live: StructureId | null
    hand: Vec3[] | null
    time: number
  }): void {
    if (options.landmarks && options.landmarks.length > 454) {
      const src: Vec3[] = []
      const dst: Vec3[] = []
      FIT_INDEX.forEach((index, i) => {
        const point = options.landmarks?.[index]
        const canonical = CANONICAL_FIT[i]
        if (!point || !canonical) return
        src.push(canonical)
        dst.push(point)
      })
      if (src.length >= 4) this.smoothFit(umeyama2(src, dst))
      this.fitGroup.visible = true
    }
    const pulse = 0.62 + 0.38 * Math.sin(options.time / 170)
    for (const part of this.parts.values()) {
      const info = structure(part.id)
      const layerOn =
        (info.layer === 'bones' && options.layers.bones) ||
        (info.layer === 'muscles' && options.layers.muscles) ||
        (info.layer === 'brain' && options.layers.brain)
      const hot = part.id === options.highlight || part.id === options.live
      part.object.visible = layerOn || hot
      part.material.opacity = hot ? 0.9 : info.layer === 'brain' ? 0.32 : 0.46
      part.material.emissiveIntensity = hot ? 0.95 * pulse : 0.16
    }
    this.poseHand(options.hand, options.layers.hand)
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.renderer.dispose()
    for (const part of this.parts.values()) part.material.dispose()
  }

  private smoothFit(fit: Similarity2): void {
    const s = fit.scale
    const m = new THREE.Matrix4().set(
      s * fit.cos, -s * fit.sin, 0, fit.tx,
      s * fit.sin, s * fit.cos, 0, fit.ty,
      0, 0, s, fit.tz,
      0, 0, 0, 1,
    )
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const scl = new THREE.Vector3()
    m.decompose(pos, quat, scl)
    const alpha = this.display.ready ? 0.38 : 1
    this.display.pos.lerp(pos, alpha)
    if (this.display.quat.dot(quat) < 0) quat.set(-quat.x, -quat.y, -quat.z, -quat.w)
    this.display.quat.slerp(quat, alpha)
    this.display.scale += (scl.x - this.display.scale) * alpha
    this.display.ready = true
    this.fitGroup.position.copy(this.display.pos)
    this.fitGroup.quaternion.copy(this.display.quat)
    this.fitGroup.scale.setScalar(this.display.scale)
    this.fitGroup.updateMatrixWorld(true)
  }

  private poseHand(points: Vec3[] | null, enabled: boolean): void {
    this.handGroup.visible = Boolean(enabled && points && points.length >= 21)
    if (!this.handGroup.visible || !points) return
    const dir = new THREE.Vector3()
    const up = new THREE.Vector3(0, 1, 0)
    HAND_PAIRS.forEach(([a, b], index) => {
      const mesh = this.handBones[index]
      const pa = points[a]
      const pb = points[b]
      if (!mesh || !pa || !pb) return
      const start = new THREE.Vector3(pa[0], pa[1], pa[2])
      const end = new THREE.Vector3(pb[0], pb[1], pb[2])
      const length = start.distanceTo(end)
      mesh.visible = length > 1
      mesh.position.copy(start).add(end).multiplyScalar(0.5)
      mesh.scale.set(Math.max(3, length * 0.08), length, Math.max(3, length * 0.08))
      dir.copy(end).sub(start).normalize()
      mesh.quaternion.setFromUnitVectors(up, dir)
    })
  }
}
