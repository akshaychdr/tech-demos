import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  HEAD_LABELS,
  LABEL_COLOR,
  anchorFacingAmount,
  labelVisible,
  type ScreenLabel,
} from '../domain/headLabels.ts'
import { POSE_LANDMARKS, stepCanonicalFit } from '../domain/screenFit.ts'
import type { MuscleId, StructureId, Vec3 } from '../domain/types.ts'
import { RENDER_ORDER, applyLook, createShadeMaterial, veilOpacity, xrayLayerGain, type ShadeRole, type XrayMaterial } from './materials.ts'

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

export type SceneNode = {
  kind: 'Mesh' | 'Points' | 'Line' | 'LineSegments'
  name: string
  role: string
  parent: string
  vertices: number
  color: string
  blending: string
  depthTest: boolean
  min: [number, number, number]
  max: [number, number, number]
}

export type FitDebug = {
  fitS: number
  fitX: number
  fitY: number
  meanPx: number
  maxPx: number
  aspectDelta: number
  markers: { index: number; x: number; y: number; err: number; dx: number; dy: number }[]
  graph: SceneNode[]
}

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
  accepts: (id: StructureId | null) => boolean
}

type HandRig = {
  palm: THREE.Mesh
  bones: { mesh: THREE.Mesh; a: number; b: number; span: number }[]
  points: THREE.Vector3[] | null
}

const BONES: StructureId[] = ['frontal', 'parietal', 'temporal', 'occipital', 'nasal', 'zygomatic', 'maxilla', 'mandible']
const MUSCLES: StructureId[] = ['frontalis', 'corrugator', 'orbicularis', 'oris', 'zygomaticus', 'masseter', 'temporalis']
const VERTICAL_FOV = 63
/**
 * The pose is solved for MediaPipe's 63° virtual camera. On a close webcam that
 * depth is stronger than the picture: the ears sit about 10 cm behind the nose,
 * so they collapse inward and the forehead rides high. Keeping a quarter of the
 * camera-space depth leaves the rigid pose and the 2D scale-and-shift, and the
 * 13 fit points land on the face with fitS near 1.
 */
const DEPTH_RELIEF = 0.25

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
  private readonly rigs: HandRig[] = []
  private readonly baseProjection = new THREE.Matrix4()
  private readonly fitProjection = new THREE.Matrix4()
  private readonly poseMatrix = new THREE.Matrix4()
  private viewW = 2
  private viewH = 2
  private videoW = 2
  private videoH = 2
  private aspectDelta = 0
  fitDebug: FitDebug = {
    fitS: 1,
    fitX: 0,
    fitY: 0,
    meanPx: 0,
    maxPx: 0,
    aspectDelta: 0,
    markers: [],
    graph: [],
  }
  private jawAngle = 0
  private fitScale = 1
  private fitX = 0
  private fitY = 0
  private jawBlend = 0
  private lostAt = -1
  private manual: ManualFit = { ...DEFAULT_FIT }
  private poseReady = false
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
    this.headScene.name = 'head-scene'
    this.handScene.name = 'hands'
    this.head.name = 'head'
    this.jawPivot.name = 'jawPivot'
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
    const pivot = anchorFile.jawPivot
    this.jawPivot.position.set(pivot[0], pivot[1], pivot[2])
    const boneIds = new Set<StructureId>(BONES)
    const muscleIds = new Set<StructureId>(MUSCLES)
    const add = (
      name: string,
      id: StructureId,
      role: ShadeRole,
      jaw: boolean,
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
      mesh.material = material
      mesh.frustumCulled = false
      mesh.matrixAutoUpdate = false
      mesh.renderOrder = RENDER_ORDER[role]
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
      this.parts.push({ id, role, mesh, material, jaw, accepts })
      return true
    }
    const mergedSkull = add('cranium', 'frontal', 'bone', false, (id) => id != null && boneIds.has(id) && id !== 'mandible')
    if (!mergedSkull) {
      for (const id of BONES) {
        if (id === 'mandible') continue
        add(id, id, 'bone', false, (highlight) => highlight === id)
      }
    }
    const mergedJaw = add('jaw', 'mandible', 'bone', true, (id) => id === 'mandible')
    if (!mergedJaw) add('mandible', 'mandible', 'bone', true, (id) => id === 'mandible')
    const mergedMuscles = add('muscles', 'frontalis', 'muscle', false, (id) => id != null && muscleIds.has(id))
    if (!mergedMuscles) {
      for (const id of MUSCLES) add(id, id, 'muscle', false, (highlight) => highlight === id)
    }
    if (!add('cerebrum', 'brain', 'brain', false, (id) => id === 'brain')) {
      add('brain', 'brain', 'brain', false, (id) => id === 'brain')
    }
    add('hindbrain', 'brain', 'hindbrain', false, (id) => id === 'brain')
    add('eyes', 'frontal', 'eye', false, () => false)
    const skin = findMesh(gltf.scene, 'skin') ?? findMesh(gltf.scene, 'shell')
    if (skin) {
      ensureNormals(skin.geometry)
      ensureShadeAttrs(skin.geometry)
      skin.name = skin.name || 'skin'
      skin.material = createShadeMaterial('outline')
      skin.frustumCulled = false
      skin.matrixAutoUpdate = false
      skin.renderOrder = RENDER_ORDER.outline
      skin.updateMatrix()
      this.head.add(skin)
      this.parts.push({
        id: 'brain',
        role: 'outline',
        mesh: skin,
        material: skin.material as XrayMaterial,
        jaw: false,
        accepts: () => false,
      })
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
        palm.name = `hand-${slot}-palm`
        palm.frustumCulled = false
        palm.matrixAutoUpdate = false
        palm.renderOrder = RENDER_ORDER.hand
        palm.visible = false
        this.handScene.add(palm)
        rig.palm = palm
      }
      for (const bone of anchorFile.hands.bones) {
        const geometry = geometries.get(bone.name)
        if (!geometry) continue
        const mesh = new THREE.Mesh(geometry, createShadeMaterial('hand'))
        mesh.name = `hand-${slot}-${bone.name}`
        mesh.frustumCulled = false
        mesh.matrixAutoUpdate = false
        mesh.renderOrder = RENDER_ORDER.hand
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
    const viewAspect = this.viewW / this.viewH
    this.aspectDelta = Math.abs(videoAspect - viewAspect)
    // The stage matches the video and the video fills the canvas, so a landmark
    // maps straight into NDC. Cover scaling would crop that mapping.
    this.camera.fov = VERTICAL_FOV
    this.camera.aspect = viewAspect
    this.camera.updateProjectionMatrix()
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
    now: number
  }): void {
    this.manual = frame.fit
    this.poseHead(frame.matrix, frame.landmarks, frame.jaw, frame.now)
    this.jawPivot.rotation.x = this.jawAngle
    this.jawPivot.updateMatrix()
    this.head.updateMatrixWorld(true)
    const plane = clipPlane(frame.reveal, frame.cut)
    const solid = frame.look === 'solid'
    const heavy = (frame.layers.skull ? 1 : 0) + (frame.layers.brain ? 1 : 0) + (frame.layers.muscles ? 1 : 0)
    const showingHead =
      frame.layers.skull ||
      frame.layers.muscles ||
      frame.layers.brain ||
      frame.layers.outline ||
      frame.layers.eyes ||
      frame.highlight != null
    const lens = this.lensLayout(frame.lensPin, frame.lensRadius, frame.landmarks)
    this.paintMask(lens, frame.feather, frame.reveal === 'lens')
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
      if (part.role === 'veil') part.mesh.visible = showingHead && !solid
      if (part.role === 'outline') part.mesh.visible = showingHead && frame.layers.outline && frame.look === 'xray'
      applyLook(part.material, solid)
      const gain = xrayLayerGain(part.role, heavy, frame.brightness)
      part.material.uniforms.uGain!.value = solid ? 1 : gain * (hot ? 1.35 : 1)
      part.material.uniforms.uOpacity!.value = part.role === 'veil' ? veilOpacity(frame.real) : solid ? 0.94 : 1
      part.material.uniforms.uPick!.value = hot ? 1 : 0
      // The merged muscle mesh stores the jaw-open travel in aMove.
      part.material.uniforms.uAction!.value = part.role === 'muscle' ? frame.jaw : 0
      part.material.uniforms.uClip!.value = plane ? 1 : 0
      if (plane) part.material.uniforms.uPlane!.value.copy(plane)
      part.material.uniforms.uSoft!.value = frame.feather * 5
      part.material.uniforms.uFeather!.value = frame.feather * 0.75
      part.material.uniforms.uFade!.value = 1
      if (part.jaw) {
        part.material.uniforms.uHead!.value.copy(this.jawPivot.matrix).multiply(part.mesh.matrix)
      } else {
        part.material.uniforms.uHead!.value.identity()
      }
    }
    this.poseHands(frame.hands, frame.layers.hand, solid, frame.feather, frame.brightness, heavy)
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
    now: number,
  ): void {
    if (!matrix) {
      if (!this.havePose) {
        this.poseReady = false
        this.head.visible = false
        this.noseLocal = null
        return
      }
      if (this.lostAt < 0) this.lostAt = now
      if (now - this.lostAt > 250) {
        this.havePose = false
        this.poseReady = false
        this.fitScale = 1
        this.fitX = 0
        this.fitY = 0
        this.lostAt = -1
        this.head.visible = false
        this.noseLocal = null
      }
      return
    }
    this.lostAt = -1
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
      this.fitScale = 1
      this.fitX = 0
      this.fitY = 0
      this.havePose = true
    } else {
      this.displayPos.lerp(this.scratch.pos, 0.6)
      this.displayQuat.slerp(this.scratch.quat, 0.55)
      this.displayScale.lerp(this.scratch.scale, 0.5)
    }
    const jawOpen = Math.max(0, Math.min(1, jaw))
    this.jawBlend += (jawOpen - this.jawBlend) * 0.6
    this.jawAngle = Math.max(0, Math.min(1, this.jawBlend)) * 0.36
    this.poseReady = true
    this.head.visible = true
    this.head.matrix.compose(this.displayPos, this.displayQuat, this.displayScale)
    let depth = 0
    for (const mark of POSE_LANDMARKS) {
      this.scratch.clip.set(mark.at[0], mark.at[1], mark.at[2], 1).applyMatrix4(this.head.matrix)
      depth += this.scratch.clip.z
    }
    const center = depth / POSE_LANDMARKS.length
    const flat = new THREE.Matrix4().makeScale(1, 1, DEPTH_RELIEF)
    flat.elements[14] = (1 - DEPTH_RELIEF) * center
    this.head.matrix.premultiply(flat)
    this.poseMatrix.copy(this.head.matrix)
    this.head.matrixWorldNeedsUpdate = true
    this.fitProjection.copy(this.baseProjection)
    const from: { x: number; y: number }[] = []
    const to: { x: number; y: number }[] = []
    if (landmarks && landmarks.length > 454) {
      for (const mark of POSE_LANDMARKS) {
        const seen = landmarks[mark.index]
        if (!seen) continue
        this.scratch.clip.set(mark.at[0], mark.at[1], mark.at[2], 1).applyMatrix4(this.head.matrix).applyMatrix4(this.baseProjection)
        if (this.scratch.clip.w === 0) continue
        from.push({ x: this.scratch.clip.x / this.scratch.clip.w, y: this.scratch.clip.y / this.scratch.clip.w })
        to.push({ x: seen.x * 2 - 1, y: 1 - seen.y * 2 })
      }
      const stepped = stepCanonicalFit({ fitS: this.fitScale, fitX: this.fitX, fitY: this.fitY }, from, to)
      if (stepped) {
        this.fitScale = stepped.fitS
        this.fitX = stepped.fitX
        this.fitY = stepped.fitY
      }
    }
    const correction = new THREE.Matrix4().makeScale(this.fitScale, this.fitScale, 1)
    correction.elements[12] = this.fitX
    correction.elements[13] = this.fitY
    this.fitProjection.premultiply(correction)
    const fit = this.manual
    const localFit = new THREE.Matrix4().compose(
      new THREE.Vector3(-fit.x, fit.y, fit.z),
      new THREE.Quaternion(),
      new THREE.Vector3(fit.size * fit.width, fit.size * fit.height, fit.size * fit.depth),
    )
    this.head.matrix.multiply(localFit)
    this.head.matrixWorldNeedsUpdate = true
    this.noteFit(landmarks)
    const nose = landmarks?.[1]
    this.noseLocal = nose ? this.layoutPoint(nose.x, nose.y) : null
  }

  screenFromNorm(nx: number, ny: number): { x: number; y: number } {
    return { x: nx * this.viewW, y: ny * this.viewH }
  }

  private noteFit(landmarks: { x: number; y: number; z: number }[] | null): void {
    const markers: FitDebug['markers'] = []
    const errors: number[] = []
    if (landmarks && landmarks.length > 454) {
      for (const mark of POSE_LANDMARKS) {
        const seen = landmarks[mark.index]
        if (!seen) continue
        this.scratch.clip.set(mark.at[0], mark.at[1], mark.at[2], 1).applyMatrix4(this.head.matrix).applyMatrix4(this.fitProjection)
        if (this.scratch.clip.w === 0) continue
        const ndcX = this.scratch.clip.x / this.scratch.clip.w
        const ndcY = this.scratch.clip.y / this.scratch.clip.w
        const x = ((ndcX + 1) / 2) * this.viewW
        const y = ((1 - ndcY) / 2) * this.viewH
        const face = this.screenFromNorm(seen.x, seen.y)
        const err = Math.hypot(x - face.x, y - face.y)
        errors.push(err)
        markers.push({ index: mark.index, x, y, err, dx: x - face.x, dy: y - face.y })
      }
    }
    const meanPx = errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : 0
    this.fitDebug = {
      fitS: this.fitScale,
      fitX: this.fitX,
      fitY: this.fitY,
      meanPx,
      maxPx: errors.length ? Math.max(...errors) : 0,
      aspectDelta: this.aspectDelta,
      markers,
      graph: this.inventory(),
    }
  }

  inventory(): SceneNode[] {
    this.head.updateMatrixWorld(true)
    const nodes: SceneNode[] = []
    const visit = (root: THREE.Object3D) => {
      root.traverse((object) => {
        const kind = object instanceof THREE.Mesh
          ? 'Mesh'
          : object instanceof THREE.Points
            ? 'Points'
            : object instanceof THREE.LineSegments
              ? 'LineSegments'
              : object instanceof THREE.Line
                ? 'Line'
                : null
        if (!kind) return
        const drawable = object as THREE.Mesh
        const geometry = drawable.geometry
        const position = geometry?.getAttribute('position')
        const material = drawable.material as XrayMaterial | THREE.Material
        const shader = material as Partial<XrayMaterial>
        const color = shader.uniforms?.uColor?.value as THREE.Color | undefined
        geometry?.computeBoundingBox()
        const box = geometry?.boundingBox?.clone()
        if (box) box.applyMatrix4(drawable.matrixWorld)
        nodes.push({
          kind,
          name: drawable.name || '(unnamed)',
          role: shader.userData?.role ?? '',
          parent: drawable.parent?.name || '(root)',
          vertices: position?.count ?? 0,
          color: color ? `#${color.getHexString()}` : '',
          blending: blendName(shader.blending),
          depthTest: Boolean(shader.depthTest),
          min: box ? [roundCm(box.min.x), roundCm(box.min.y), roundCm(box.min.z)] : [0, 0, 0],
          max: box ? [roundCm(box.max.x), roundCm(box.max.y), roundCm(box.max.z)] : [0, 0, 0],
        })
      })
    }
    visit(this.headScene)
    visit(this.handScene)
    return nodes
  }

  private layoutPoint(nx: number, ny: number): { x: number; y: number } {
    return this.screenFromNorm(nx, ny)
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
    lens: { x: number; y: number; radius: number } | null,
    feather: number,
    lensOn: boolean,
  ): void {
    for (const part of this.parts) {
      const uniforms = part.material.uniforms
      uniforms.uView!.value.set(this.viewW, this.viewH)
      uniforms.uLensOn!.value = lensOn && lens ? 1 : 0
      if (lens) uniforms.uLens!.value.set(lens.x, lens.y, lens.radius)
      uniforms.uLensSoft!.value = 22 + feather * Math.max(lens?.radius ?? 40, 20) * 1.15
    }
  }

  private poseHands(hands: Vec3[][], enabled: boolean, solid: boolean, feather: number, brightness: number, heavy: number): void {
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
        material.uniforms.uGain!.value = solid ? 1 : xrayLayerGain('hand', heavy, brightness)
        material.uniforms.uOpacity!.value = solid ? 0.94 : 1
        material.uniforms.uFeather!.value = feather * 0.75
        material.uniforms.uFade!.value = 0
        material.uniforms.uHead!.value.identity()
        material.uniforms.uClip!.value = 0
      }
      const palmMaterial = rig.palm.material as XrayMaterial
      if (palmMaterial?.uniforms) {
        applyLook(palmMaterial, solid)
        palmMaterial.uniforms.uGain!.value = solid ? 1 : xrayLayerGain('hand', heavy, brightness)
        palmMaterial.uniforms.uOpacity!.value = solid ? 0.94 : 1
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

function roundCm(value: number): number {
  return Math.round(value * 100) / 100
}

function blendName(blending: THREE.Blending | undefined): string {
  if (blending === THREE.AdditiveBlending) return 'additive'
  if (blending === THREE.NormalBlending) return 'normal'
  if (blending === THREE.NoBlending) return 'none'
  return blending == null ? '' : String(blending)
}

function clipPlane(reveal: RevealMode, cut: number): THREE.Vector4 | null {
  if (reveal !== 'half') return null
  const w = 8 + (-8 - 8) * cut
  return new THREE.Vector4(1, 0, 0, w)
}
