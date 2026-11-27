import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  HEAD_LABELS,
  LABEL_COLOR,
  anchorFacingAmount,
  labelVisible,
  type ScreenLabel,
} from '../domain/headLabels.ts'
import { FACE_OVAL, clampScreenScale, solveOrbitFit, solveWeightedScreenFit } from '../domain/screenFit.ts'
import type { MuscleId, StructureId, Vec3 } from '../domain/types.ts'
import { applyLook, createShadeMaterial, type ShadeRole, type XrayMaterial } from './materials.ts'

export type LookMode = 'xray' | 'solid'
export type RevealMode = 'whole' | 'half' | 'lens'

export type SceneLayers = {
  skull: boolean
  muscles: boolean
  brain: boolean
  hand: boolean
  outline: boolean
  eyes: boolean
}

export const DEFAULT_LAYERS: SceneLayers = {
  skull: true,
  muscles: true,
  brain: true,
  hand: false,
  outline: true,
  eyes: true,
}

export type ManualFit = {
  size: number
  width: number
  height: number
  depth: number
  x: number
  y: number
  z: number
}

export const DEFAULT_FIT: ManualFit = { size: 1, width: 1, height: 1, depth: 1, x: 0, y: 0, z: 0 }

export type AnchorFile = {
  jawPivot: [number, number, number]
  anchors: Partial<Record<StructureId, number[][]>>
  hands: { palm: string; bones: { name: string; a: number; b: number; span: number }[] }
  orbits?: { center: [number, number, number]; radius: number }[]
  fit?: { id: number; at: [number, number, number] }[]
  neck?: [number, number]
}

export type MuscleMotion = Partial<Record<MuscleId, number>>

type MuscleAttrs = Record<string, { uv: number[]; move: number[] }>

type Part = {
  id: StructureId
  role: ShadeRole
  mesh: THREE.Object3D
  material: XrayMaterial
  jaw: boolean
  gain: number
  accepts: (id: StructureId | null) => boolean
}

type HandRig = {
  palm: THREE.Mesh
  bones: { mesh: THREE.Mesh; a: number; b: number; span: number }[]
  points: THREE.Vector3[] | null
}

const BONES: StructureId[] = ['frontal', 'parietal', 'temporal', 'occipital', 'nasal', 'zygomatic', 'maxilla', 'mandible']
const MUSCLES: StructureId[] = ['frontalis', 'corrugator', 'orbicularis', 'oris', 'zygomaticus', 'masseter', 'temporalis']
const RINGS = new Set<StructureId>(['orbicularis', 'oris'])
const FIT_EYES: { index: number; at: [number, number, number] }[] = [
  { index: 33, at: [-4.445859, 2.663991, 3.173422] },
  { index: 133, at: [-1.856432, 2.585245, 3.757904] },
  { index: 263, at: [4.445859, 2.663991, 3.173422] },
  { index: 362, at: [1.856432, 2.585245, 3.757904] },
  { index: 468, at: [-3.151, 2.625, 3.55] },
  { index: 473, at: [3.151, 2.625, 3.55] },
]
const FIT_SPAN: { index: number; at: [number, number, number] }[] = [
  { index: 10, at: [0, 8.261778, 4.481535] },
  { index: 152, at: [0, -9.403378, 4.264492] },
  { index: 234, at: [-7.664182, 0.673132, -2.435867] },
  { index: 454, at: [7.664182, 0.673132, -2.435867] },
  { index: 1, at: [0, -1.126865, 7.475604] },
  { index: 61, at: [-2.456206, -4.342621, 4.283884] },
  { index: 291, at: [2.456206, -4.342621, 4.283884] },
]
const VERTICAL_FOV = 63

export class AnatomyScene {
  readonly headCanvas: HTMLCanvasElement
  readonly handCanvas: HTMLCanvasElement
  noseLocal: { x: number; y: number } | null = null
  private readonly headRenderer: THREE.WebGLRenderer
  private readonly handRenderer: THREE.WebGLRenderer
  private readonly headScene = new THREE.Scene()
  private readonly handScene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly ortho: THREE.OrthographicCamera
  private readonly head = new THREE.Group()
  private readonly jawPivot = new THREE.Group()
  private readonly parts: Part[] = []
  private readonly anchors: { id: StructureId; point: THREE.Vector3; jaw: boolean }[] = []
  private readonly rigs: HandRig[] = []
  private readonly baseProjection = new THREE.Matrix4()
  private readonly fitProjection = new THREE.Matrix4()
  private readonly poseMatrix = new THREE.Matrix4()
  private viewW = 2
  private viewH = 2
  private videoW = 2
  private videoH = 2
  private coverX = 1
  private coverY = 1
  private jawAngle = 0
  private fitScale = 1
  private fitX = 0
  private fitY = 0
  private fitReady = false
  private manual: ManualFit = { ...DEFAULT_FIT }
  private fitMarks: { index: number; at: [number, number, number] }[] = []
  private poseReady = false
  private readonly orbits = [new THREE.Vector4(), new THREE.Vector4()]
  private havePose = false
  private readonly displayPos = new THREE.Vector3()
  private readonly displayQuat = new THREE.Quaternion()
  private readonly displayScale = new THREE.Vector3(1, 1, 1)
  private readonly scratch = {
    matrix: new THREE.Matrix4(),
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    scale: new THREE.Vector3(),
    point: new THREE.Vector3(),
    clip: new THREE.Vector4(),
    handSample: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    cam: new THREE.Vector3(),
  }

  constructor(headCanvas: HTMLCanvasElement, handCanvas: HTMLCanvasElement) {
    this.headCanvas = headCanvas
    this.handCanvas = handCanvas
    const coarse = window.matchMedia('(pointer: coarse)').matches
    this.headRenderer = new THREE.WebGLRenderer({
      canvas: headCanvas,
      alpha: true,
      antialias: !coarse,
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
    })
    this.handRenderer = new THREE.WebGLRenderer({
      canvas: handCanvas,
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
    })
    for (const renderer of [this.headRenderer, this.handRenderer]) {
      renderer.setClearColor(0x000000, 0)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.NoToneMapping
    }
    this.camera = new THREE.PerspectiveCamera(VERTICAL_FOV, 1, 0.5, 5000)
    this.ortho = new THREE.OrthographicCamera(0, 1, 1, 0, -4000, 4000)
    this.ortho.position.set(0, 0, 800)
    this.ortho.lookAt(0, 0, 0)
    this.head.matrixAutoUpdate = false
    this.jawPivot.matrixAutoUpdate = false
    this.head.add(this.jawPivot)
    this.headScene.add(this.head)
  }

  async load(modelUrl: string, anchorUrl: string): Promise<void> {
    const muscleUrl = anchorUrl.replace('anchors.json', 'muscle-attrs.json')
    const [gltf, anchorFile, muscleAttrs] = await Promise.all([
      new GLTFLoader().loadAsync(modelUrl),
      fetch(anchorUrl).then((response) => response.json() as Promise<AnchorFile>),
      fetch(muscleUrl).then(async (response): Promise<MuscleAttrs> => (response.ok ? await response.json() : {})),
    ])
    if (!findMesh(gltf.scene, 'cranium') && !findMesh(gltf.scene, 'frontal')) {
      throw new Error('Anatomy model is missing the skull')
    }
    this.fitMarks = (anchorFile.fit ?? [])
      .filter((mark) => Number.isFinite(mark.id) && mark.at?.length === 3)
      .map((mark) => ({ index: mark.id, at: mark.at }))
    const pivot = anchorFile.jawPivot
    this.jawPivot.position.set(pivot[0], pivot[1], pivot[2])
    for (const [index, orbit] of (anchorFile.orbits ?? []).slice(0, 2).entries()) {
      this.orbits[index]!.set(orbit.center[0], orbit.center[1], orbit.center[2], orbit.radius)
    }
    const boneIds = new Set<StructureId>(BONES)
    const muscleIds = new Set<StructureId>(MUSCLES)
    const add = (
      name: string,
      id: StructureId,
      role: ShadeRole,
      jaw: boolean,
      gain: number,
      accepts: (highlight: StructureId | null) => boolean,
    ) => {
      const mesh = findMesh(gltf.scene, name)
      if (!mesh) return false
      ensureNormals(mesh.geometry)
      ensureShadeAttrs(mesh.geometry)
      const spec = muscleAttrs[name]
      if (spec?.uv && spec.move) {
        mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(spec.uv), 2))
        mesh.geometry.setAttribute('aMove', new THREE.BufferAttribute(Float32Array.from(spec.move), 3))
      }
      const material = createShadeMaterial(role)
      if (anchorFile.neck && (role === 'veil' || role === 'outline')) {
        material.uniforms.uNeck0!.value = anchorFile.neck[0]
        material.uniforms.uNeck1!.value = anchorFile.neck[1]
      }
      mesh.material = material
      mesh.frustumCulled = false
      mesh.matrixAutoUpdate = false
      mesh.position.set(0, 0, 0)
      mesh.quaternion.identity()
      mesh.scale.set(1, 1, 1)
      if (jaw) {
        mesh.position.set(-pivot[0], -pivot[1], -pivot[2])
        this.jawPivot.add(mesh)
      } else {
        this.head.add(mesh)
      }
      mesh.updateMatrix()
      this.parts.push({ id, role, mesh, material, jaw, gain, accepts })
      return true
    }
    const mergedSkull = add('cranium', 'frontal', 'bone', false, 1, (id) => id != null && boneIds.has(id) && id !== 'mandible')
    if (!mergedSkull) {
      for (const id of BONES) {
        if (id === 'mandible') continue
        add(id, id, 'bone', false, 1, (highlight) => highlight === id)
      }
    }
    const mergedJaw = add('jaw', 'mandible', 'bone', true, 1, (id) => id === 'mandible')
    if (!mergedJaw) add('mandible', 'mandible', 'bone', true, 1, (id) => id === 'mandible')
    const mergedMuscles = add('muscles', 'frontalis', 'muscle', false, 0.5, (id) => id != null && muscleIds.has(id))
    if (!mergedMuscles) {
      for (const id of MUSCLES) add(id, id, 'muscle', false, 0.5, (highlight) => highlight === id)
    }
    if (!add('cerebrum', 'brain', 'brain', false, 0.8, (id) => id === 'brain')) {
      add('brain', 'brain', 'brain', false, 0.8, (id) => id === 'brain')
    }
    add('hindbrain', 'brain', 'hindbrain', false, 0.85, (id) => id === 'brain')
    if (!add('eyes', 'frontal', 'eye', false, 0.42, () => false)) this.addEyes(anchorFile)
    const skin = findMesh(gltf.scene, 'skin') ?? findMesh(gltf.scene, 'shell')
    if (skin) {
      ensureNormals(skin.geometry)
      ensureShadeAttrs(skin.geometry)
      const veil = skin
      const outline = skin.clone()
      veil.material = createShadeMaterial('veil')
      outline.material = createShadeMaterial('outline')
      for (const material of [veil.material, outline.material] as XrayMaterial[]) {
        if (!anchorFile.neck) continue
        material.uniforms.uNeck0!.value = anchorFile.neck[0]
        material.uniforms.uNeck1!.value = anchorFile.neck[1]
      }
      veil.frustumCulled = false
      outline.frustumCulled = false
      veil.matrixAutoUpdate = false
      outline.matrixAutoUpdate = false
      veil.updateMatrix()
      outline.updateMatrix()
      this.head.add(veil)
      this.head.add(outline)
      this.parts.push({
        id: 'brain',
        role: 'veil',
        mesh: veil,
        material: veil.material as XrayMaterial,
        jaw: false,
        gain: 1,
        accepts: () => false,
      })
      this.parts.push({
        id: 'brain',
        role: 'outline',
        mesh: outline,
        material: outline.material as XrayMaterial,
        jaw: false,
        gain: 0.22,
        accepts: () => false,
      })
    }
    for (const [id, points] of Object.entries(anchorFile.anchors)) {
      for (const point of points ?? []) {
        this.anchors.push({
          id: id as StructureId,
          point: new THREE.Vector3(point[0], point[1], point[2]),
          jaw: id === 'mandible',
        })
      }
    }
    const geometries = new Map<string, THREE.BufferGeometry>()
    for (const bone of anchorFile.hands.bones) {
      const mesh = findMesh(gltf.scene, bone.name)
      if (mesh) {
        ensureNormals(mesh.geometry)
        ensureShadeAttrs(mesh.geometry)
        geometries.set(bone.name, mesh.geometry)
      }
    }
    const palmMesh = findMesh(gltf.scene, anchorFile.hands.palm)
    if (palmMesh) {
      ensureNormals(palmMesh.geometry)
      ensureShadeAttrs(palmMesh.geometry)
    }
    const palmGeo = palmMesh?.geometry
    for (let slot = 0; slot < 2; slot += 1) {
      const rig: HandRig = { palm: new THREE.Mesh(), bones: [], points: null }
      if (palmGeo) {
        const palm = new THREE.Mesh(palmGeo, createShadeMaterial('hand'))
        palm.frustumCulled = false
        palm.matrixAutoUpdate = false
        palm.visible = false
        this.handScene.add(palm)
        rig.palm = palm
      }
      for (const bone of anchorFile.hands.bones) {
        const geometry = geometries.get(bone.name)
        if (!geometry) continue
        const mesh = new THREE.Mesh(geometry, createShadeMaterial('hand'))
        mesh.frustumCulled = false
        mesh.matrixAutoUpdate = false
        mesh.visible = false
        this.handScene.add(mesh)
        rig.bones.push({ mesh, a: bone.a, b: bone.b, span: bone.span })
      }
      this.rigs.push(rig)
    }
  }

  setSize(viewW: number, viewH: number, videoW: number, videoH: number, dpr: number): void {
    this.viewW = Math.max(2, viewW)
    this.viewH = Math.max(2, viewH)
    this.videoW = Math.max(2, videoW)
    this.videoH = Math.max(2, videoH)
    for (const renderer of [this.headRenderer, this.handRenderer]) {
      renderer.setPixelRatio(dpr)
      renderer.setSize(this.viewW, this.viewH, false)
    }
    const videoAspect = this.videoW / this.videoH
    const fit = Math.max(this.viewW / this.videoW, this.viewH / this.videoH)
    this.coverX = (this.videoW * fit) / this.viewW
    this.coverY = (this.videoH * fit) / this.viewH
    this.camera.fov = VERTICAL_FOV
    this.camera.aspect = videoAspect
    this.camera.updateProjectionMatrix()
    this.camera.projectionMatrix.elements[0]! *= this.coverX
    this.camera.projectionMatrix.elements[5]! *= this.coverY
    this.baseProjection.copy(this.camera.projectionMatrix)
    this.ortho.left = 0
    this.ortho.right = this.viewW
    this.ortho.top = this.viewH
    this.ortho.bottom = 0
    this.ortho.updateProjectionMatrix()
  }

  update(frame: {
    matrix: number[] | null
    landmarks: { x: number; y: number; z: number }[] | null
    jaw: number
    motion: MuscleMotion
    lensPin: { x: number; y: number } | null
    lensRadius: number
    hands: Vec3[][]
    layers: SceneLayers
    highlight: StructureId | null
    look: LookMode
    reveal: RevealMode
    cut: number
    feather: number
    real: number
    brightness: number
    fit: ManualFit
  }): void {
    this.manual = frame.fit
    this.poseHead(frame.matrix, frame.landmarks, frame.jaw)
    this.jawPivot.rotation.x = this.jawAngle
    this.jawPivot.updateMatrix()
    this.head.updateMatrixWorld(true)
    const plane = clipPlane(frame.reveal, frame.cut)
    const solid = frame.look === 'solid'
    const layersOn =
      (frame.layers.skull ? 2 : 0) +
      (frame.layers.muscles ? 1 : 0) +
      (frame.layers.brain ? 1 : 0) +
      (frame.layers.eyes ? 1 : 0) +
      (frame.look === 'xray' && frame.layers.outline ? 1 : 0)
    const share = 1 / (0.75 + 0.2 * Math.max(1, layersOn))
    const showingHead =
      frame.layers.skull ||
      frame.layers.muscles ||
      frame.layers.brain ||
      frame.layers.outline ||
      frame.layers.eyes ||
      frame.highlight != null
    const lens = this.lensLayout(frame.lensPin, frame.lensRadius, frame.landmarks)
    this.paintMask(frame.landmarks, lens, frame.feather, frame.reveal === 'lens')
    for (const part of this.parts) {
      const layerOn =
        (part.role === 'bone' && frame.layers.skull) ||
        (part.role === 'eye' && frame.layers.eyes) ||
        (part.role === 'muscle' && frame.layers.muscles) ||
        ((part.role === 'brain' || part.role === 'hindbrain') && frame.layers.brain) ||
        part.role === 'veil' ||
        (part.role === 'outline' && frame.layers.outline)
      const hot = part.accepts(frame.highlight)
      part.mesh.visible = showingHead && (part.role === 'veil' || part.role === 'outline' ? layerOn : layerOn || hot)
      if (part.role === 'outline') part.mesh.visible = showingHead && frame.layers.outline && frame.look === 'xray'
      applyLook(part.material, solid)
      const shared = part.role === 'outline' ? 1 : share
      part.material.uniforms.uGain!.value = (solid ? 1 : part.gain * shared) * frame.brightness
      // The merged muscle mesh stores the jaw-open travel in aMove. Expression
      // still lights a selected muscle through uBoost.
      part.material.uniforms.uAction!.value = part.role === 'muscle' ? frame.jaw : 0
      part.material.uniforms.uStrap!.value = RINGS.has(part.id) ? 0 : 1
      part.material.uniforms.uBoost!.value = hot ? 1 : 0
      part.material.uniforms.uCover!.value = part.role === 'veil' ? (1 - frame.real) * 0.22 : solid ? 0.9 : 1
      part.material.uniforms.uClip!.value = plane ? 1 : 0
      if (plane) part.material.uniforms.uPlane!.value.copy(plane)
      part.material.uniforms.uSoft!.value = frame.feather * 5
      part.material.uniforms.uFeather!.value = frame.feather * 0.75
      part.material.uniforms.uFade!.value = 1
      part.material.uniforms.uSilhouette!.value = part.role === 'outline' ? 0.17 : 0.08
      if (part.jaw) {
        part.material.uniforms.uHead!.value.copy(this.jawPivot.matrix).multiply(part.mesh.matrix)
      } else {
        part.material.uniforms.uHead!.value.identity()
      }
    }
    this.poseHands(frame.hands, frame.layers.hand, solid, frame.feather, frame.brightness)
    this.camera.projectionMatrix.copy(this.fitProjection)
    this.camera.projectionMatrixInverse.copy(this.fitProjection).invert()
    this.headRenderer.render(this.headScene, this.camera)
    this.handRenderer.render(this.handScene, this.ortho)
  }

  projectedLabels(layers: SceneLayers, look: LookMode, reveal: RevealMode, cut: number): ScreenLabel[] {
    if (!this.poseReady) return []
    const solid = look === 'solid'
    this.scratch.matrix.copy(this.poseMatrix).invert()
    this.scratch.cam.set(0, 0, 0).applyMatrix4(this.scratch.matrix)
    const labels: ScreenLabel[] = []
    for (const label of HEAD_LABELS) {
      const on =
        (label.layer === 'skull' && layers.skull) ||
        (label.layer === 'brain' && layers.brain) ||
        (label.layer === 'muscle' && layers.muscles) ||
        (label.layer === 'eye' && layers.eyes)
      if (!on) continue
      let best: { facing: number; x: number; y: number } | null = null
      for (const at of label.at) {
        this.scratch.point.set(at.p[0], at.p[1], at.p[2])
        this.scratch.normal.set(at.n[0], at.n[1], at.n[2])
        if (label.jaw) {
          this.scratch.point.sub(this.jawPivot.position).applyMatrix4(this.jawPivot.matrix)
          this.scratch.normal.transformDirection(this.jawPivot.matrix)
        }
        if (reveal === 'half' && this.scratch.point.x - (8 - 16 * cut) <= 0.4) continue
        const toCamera = {
          x: this.scratch.cam.x - this.scratch.point.x,
          y: this.scratch.cam.y - this.scratch.point.y,
          z: this.scratch.cam.z - this.scratch.point.z,
        }
        const facing = anchorFacingAmount(this.scratch.point, this.scratch.normal, toCamera)
        if (!labelVisible(facing, solid)) continue
        this.scratch.point.applyMatrix4(this.head.matrix)
        this.scratch.clip.set(this.scratch.point.x, this.scratch.point.y, this.scratch.point.z, 1).applyMatrix4(this.fitProjection)
        if (this.scratch.clip.w <= 0) continue
        const ndcX = this.scratch.clip.x / this.scratch.clip.w
        const ndcY = this.scratch.clip.y / this.scratch.clip.w
        if (ndcX < -1.2 || ndcX > 1.2 || ndcY < -1.2 || ndcY > 1.2) continue
        const x = ((ndcX + 1) / 2) * this.viewW
        const y = ((1 - ndcY) / 2) * this.viewH
        if (!best || facing > best.facing) best = { facing, x, y }
      }
      if (!best) continue
      labels.push({ id: label.id, text: label.text, color: LABEL_COLOR[label.layer], x: best.x, y: best.y })
    }
    return labels
  }

  dispose(): void {
    this.headRenderer.dispose()
    this.handRenderer.dispose()
    for (const part of this.parts) part.material.dispose()
    for (const rig of this.rigs) {
      rig.palm.geometry?.dispose()
      ;(rig.palm.material as THREE.Material | undefined)?.dispose?.()
      for (const bone of rig.bones) (bone.mesh.material as THREE.Material).dispose()
    }
  }

  private poseHead(
    matrix: number[] | null,
    landmarks: { x: number; y: number; z: number }[] | null,
    jaw: number,
  ): void {
    if (!matrix) {
      this.poseReady = false
      this.fitReady = false
      this.havePose = false
      this.head.visible = false
      this.noseLocal = null
      return
    }
    const raw = this.scratch.matrix.fromArray(matrix)
    const elements = raw.elements
    const columnShift = Math.abs(elements[12]!) + Math.abs(elements[13]!) + Math.abs(elements[14]!)
    const rowShift = Math.abs(elements[3]!) + Math.abs(elements[7]!) + Math.abs(elements[11]!)
    if (columnShift < 1e-5 && rowShift > 1e-3) raw.transpose()
    raw.decompose(this.scratch.pos, this.scratch.quat, this.scratch.scale)
    if (this.displayQuat.dot(this.scratch.quat) < 0) {
      this.scratch.quat.set(-this.scratch.quat.x, -this.scratch.quat.y, -this.scratch.quat.z, -this.scratch.quat.w)
    }
    if (!this.havePose) {
      this.displayPos.copy(this.scratch.pos)
      this.displayQuat.copy(this.scratch.quat)
      this.displayScale.copy(this.scratch.scale)
      this.havePose = true
    } else {
      this.displayPos.lerp(this.scratch.pos, 0.6)
      this.displayQuat.slerp(this.scratch.quat, 0.55)
      this.displayScale.lerp(this.scratch.scale, 0.5)
    }
    const jawTarget = Math.max(0, Math.min(1, jaw)) * 0.42
    this.jawAngle += (jawTarget - this.jawAngle) * (this.poseReady ? 0.45 : 1)
    this.poseReady = true
    this.head.visible = true
    this.head.matrix.compose(this.displayPos, this.displayQuat, this.displayScale)
    this.poseMatrix.copy(this.head.matrix)
    this.head.matrixWorldNeedsUpdate = true
    this.fitProjection.copy(this.baseProjection)
    const marks = this.fitMarks.length >= 4 ? this.fitMarks : [...FIT_EYES, ...FIT_SPAN]
    if (landmarks && landmarks.length > 454) {
      const from: { x: number; y: number }[] = []
      const to: { x: number; y: number }[] = []
      const weights: number[] = []
      const pose = new THREE.Matrix4().copy(this.head.matrix)
      const project = (at: [number, number, number]) => {
        this.scratch.clip.set(at[0], at[1], at[2], 1).applyMatrix4(pose).applyMatrix4(this.baseProjection)
        if (this.scratch.clip.w === 0) return null
        return { x: this.scratch.clip.x / this.scratch.clip.w, y: this.scratch.clip.y / this.scratch.clip.w }
      }
      const seenAt = (index: number) => {
        const seen = landmarks[index]
        if (!seen) return null
        return { x: this.coverX * (seen.x * 2 - 1), y: this.coverY * (1 - seen.y * 2) }
      }
      const markAt = (index: number) => marks.find((mark) => mark.index === index)?.at
      const right = markAt(468)
      const left = markAt(473)
      const chin = markAt(152)
      const fromRight = right ? project(right) : null
      const fromLeft = left ? project(left) : null
      const fromChin = chin ? project(chin) : null
      const toRight = seenAt(468)
      const toLeft = seenAt(473)
      const toChin = seenAt(152)
      const orbitFit =
        fromRight && fromLeft && fromChin && toRight && toLeft && toChin
          ? solveOrbitFit(fromRight, fromLeft, fromChin, toRight, toLeft, toChin)
          : null
      const push = (mark: { index: number; at: [number, number, number] }) => {
        const seen = seenAt(mark.index)
        const projected = project(mark.at)
        if (!seen || !projected) return false
        from.push(projected)
        to.push(seen)
        weights.push(fitWeight(mark.index))
        return true
      }
      if (!orbitFit) {
        for (const mark of marks) push(mark)
      }
      const solved = orbitFit ?? solveWeightedScreenFit(from, to, weights)
      if (solved) {
        const scale = clampScreenScale(solved.scale)
        const blendScale = this.fitReady ? 0.5 : 1
        const blendShift = this.fitReady ? 0.7 : 1
        this.fitScale += (scale - this.fitScale) * blendScale
        this.fitX += (solved.x - this.fitX) * blendShift
        this.fitY += (solved.y - this.fitY) * blendShift
        this.fitReady = true
        const correction = new THREE.Matrix4().makeScale(this.fitScale, this.fitScale, 1)
        correction.elements[12] = this.fitX
        correction.elements[13] = this.fitY
        this.fitProjection.premultiply(correction)
      }
    }
    const fit = this.manual
    const localFit = new THREE.Matrix4().compose(
      new THREE.Vector3(-fit.x, fit.y, fit.z),
      new THREE.Quaternion(),
      new THREE.Vector3(fit.size * fit.width, fit.size * fit.height, fit.size * fit.depth),
    )
    this.head.matrix.multiply(localFit)
    this.head.matrixWorldNeedsUpdate = true
    const nose = landmarks?.[1]
    this.noseLocal = nose ? this.layoutPoint(nose.x, nose.y) : null
  }

  private layoutPoint(nx: number, ny: number): { x: number; y: number } {
    const fit = Math.max(this.viewW / this.videoW, this.viewH / this.videoH)
    const dispW = this.videoW * fit
    const dispH = this.videoH * fit
    return {
      x: (this.viewW - dispW) / 2 + nx * dispW,
      y: (this.viewH - dispH) / 2 + ny * dispH,
    }
  }

  private lensLayout(
    pin: { x: number; y: number } | null,
    radius: number,
    landmarks: { x: number; y: number }[] | null,
  ): { x: number; y: number; radius: number } | null {
    if (pin) return { ...pin, radius }
    const nose = landmarks?.[1]
    if (!nose) return this.noseLocal ? { ...this.noseLocal, radius } : null
    return { ...this.layoutPoint(nose.x, nose.y), radius }
  }

  private paintMask(
    landmarks: { x: number; y: number }[] | null,
    lens: { x: number; y: number; radius: number } | null,
    feather: number,
    lensOn: boolean,
  ): void {
    const oval = landmarks && landmarks.length > 454 ? FACE_OVAL.map((index) => this.layoutPoint(landmarks[index]!.x, landmarks[index]!.y)) : []
    for (const part of this.parts) {
      const uniforms = part.material.uniforms
      uniforms.uView!.value.set(this.viewW, this.viewH)
      uniforms.uOrbitOn!.value = this.orbits[0]!.w > 0 ? 1 : 0
      uniforms.uOrbit0!.value.copy(this.orbits[0]!)
      uniforms.uOrbit1!.value.copy(this.orbits[1]!)
      uniforms.uOvalCount!.value = oval.length
      uniforms.uOvalSoft!.value = 14 + feather * 42
      const points = uniforms.uOval!.value as THREE.Vector2[]
      for (let i = 0; i < points.length; i += 1) {
        const point = oval[i]
        points[i]!.set(point?.x ?? 0, point?.y ?? 0)
      }
      uniforms.uLensOn!.value = lensOn && lens ? 1 : 0
      if (lens) uniforms.uLens!.value.set(lens.x, lens.y, lens.radius)
      uniforms.uLensSoft!.value = 22 + feather * Math.max(lens?.radius ?? 40, 20) * 1.15
    }
  }

  private addEyes(anchorFile: AnchorFile): void {
    for (const orbit of anchorFile.orbits ?? []) {
      const radius = Math.min(1.02, Math.max(0.72, orbit.radius * 0.68))
      const geometry = new THREE.SphereGeometry(radius, 32, 24)
      ensureNormals(geometry)
      ensureShadeAttrs(geometry)
      const material = createShadeMaterial('eye')
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(orbit.center[0], orbit.center[1], orbit.center[2] - radius * 0.5)
      mesh.frustumCulled = false
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      this.head.add(mesh)
      this.parts.push({
        id: 'frontal',
        role: 'eye',
        mesh,
        material,
        jaw: false,
        gain: 0.42,
        accepts: () => false,
      })
    }
  }

  private poseHands(hands: Vec3[][], enabled: boolean, solid: boolean, feather: number, brightness: number): void {
    this.rigs.forEach((rig, index) => {
      const points = hands[index]
      const show = Boolean(enabled && points && points.length >= 21)
      rig.palm.visible = show
      for (const bone of rig.bones) bone.mesh.visible = show
      if (!show || !points) return
      if (!rig.points) rig.points = points.map((point) => new THREE.Vector3(point[0], point[1], point[2]))
      else {
        points.forEach((point, joint) => {
          this.scratch.handSample.set(point[0], point[1], point[2])
          rig.points![joint]!.lerp(this.scratch.handSample, 0.62)
        })
      }
      const joints = rig.points
      const wrist = joints[0]!
      const indexKnuckle = joints[5]!
      const pinky = joints[17]!
      const alongIndex = new THREE.Vector3().subVectors(indexKnuckle, wrist)
      const alongPinky = new THREE.Vector3().subVectors(pinky, wrist)
      const palmNormal = new THREE.Vector3().crossVectors(alongIndex, alongPinky)
      if (palmNormal.lengthSq() < 1e-6) return
      const unitNormal = palmNormal.clone().normalize()
      const palmSpan = Math.sqrt(alongIndex.length() * alongPinky.length())
      const palmThick = unitNormal.clone().multiplyScalar(palmSpan)
      rig.palm.matrix.set(
        alongIndex.x, alongPinky.x, palmThick.x, wrist.x,
        alongIndex.y, alongPinky.y, palmThick.y, wrist.y,
        alongIndex.z, alongPinky.z, palmThick.z, wrist.z,
        0, 0, 0, 1,
      )
      rig.palm.matrixWorldNeedsUpdate = true
      for (const bone of rig.bones) {
        const start = joints[bone.a]
        const end = joints[bone.b]
        if (!start || !end) continue
        const direction = new THREE.Vector3().subVectors(end, start)
        const length = direction.length()
        if (length < 1) continue
        direction.multiplyScalar(1 / length)
        const side = new THREE.Vector3().crossVectors(direction, unitNormal)
        if (side.lengthSq() < 1e-8) side.set(0, 1, 0)
        side.normalize()
        const binormal = new THREE.Vector3().crossVectors(direction, side)
        const long = direction.multiplyScalar(length * bone.span)
        const wide = side.multiplyScalar(length)
        const thick = binormal.multiplyScalar(length)
        bone.mesh.matrix.set(
          long.x, wide.x, thick.x, start.x,
          long.y, wide.y, thick.y, start.y,
          long.z, wide.z, thick.z, start.z,
          0, 0, 0, 1,
        )
        bone.mesh.matrixWorldNeedsUpdate = true
        const material = bone.mesh.material as XrayMaterial
        applyLook(material, solid)
        material.uniforms.uGain!.value = (solid ? 1 : 0.95) * brightness
        material.uniforms.uFeather!.value = feather * 0.75
        material.uniforms.uFade!.value = 0
        material.uniforms.uSilhouette!.value = 0.12
        material.uniforms.uHead!.value.identity()
        material.uniforms.uClip!.value = 0
      }
      const palmMaterial = rig.palm.material as XrayMaterial
      if (palmMaterial?.uniforms) {
        applyLook(palmMaterial, solid)
        palmMaterial.uniforms.uGain!.value = (solid ? 1 : 0.8) * brightness
        palmMaterial.uniforms.uFeather!.value = feather * 0.75
        palmMaterial.uniforms.uFade!.value = 0
        palmMaterial.uniforms.uClip!.value = 0
      }
    })
  }
}

function ensureNormals(geometry: THREE.BufferGeometry): void {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
}

function ensureShadeAttrs(geometry: THREE.BufferGeometry): void {
  const count = geometry.getAttribute('position')?.count ?? 0
  if (!geometry.getAttribute('uv')) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2))
  if (!geometry.getAttribute('aMove')) geometry.setAttribute('aMove', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
}

function fitWeight(index: number): number {
  if (index === 468 || index === 473) return 5
  if (index === 33 || index === 133 || index === 263 || index === 362) return 4
  return 1
}

function findMesh(root: THREE.Object3D, name: string): THREE.Mesh | null {
  let found: THREE.Mesh | null = null
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!found && mesh.isMesh && mesh.name === name) found = mesh
  })
  if (found) return found
  const node = root.getObjectByName(name)
  node?.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!found && mesh.isMesh) found = mesh
  })
  return found
}

function clipPlane(reveal: RevealMode, cut: number): THREE.Vector4 | null {
  if (reveal !== 'half') return null
  const w = 8 + (-8 - 8) * cut
  return new THREE.Vector4(1, 0, 0, w)
}
