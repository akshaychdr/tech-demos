import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { POSE_LANDMARKS, solveScreenFit } from '../domain/screenFit.ts'
import type { StructureId, Vec3 } from '../domain/types.ts'
import { applyLook, createShadeMaterial, type ShadeRole, type XrayMaterial } from './materials.ts'

export type LookMode = 'xray' | 'solid'
export type RevealMode = 'lens' | 'whole' | 'left' | 'right' | 'top' | 'bottom'

export type SceneLayers = {
  skull: boolean
  muscles: boolean
  brain: boolean
  hand: boolean
}

export type AnchorFile = {
  jawPivot: [number, number, number]
  anchors: Partial<Record<StructureId, number[][]>>
  hands: { palm: string; bones: { name: string; a: number; b: number; span: number }[] }
}

type Part = {
  id: StructureId
  role: ShadeRole
  mesh: THREE.Object3D
  material: XrayMaterial
  jaw: boolean
}

type HandRig = {
  palm: THREE.Mesh
  bones: { mesh: THREE.Mesh; a: number; b: number; span: number }[]
  points: THREE.Vector3[] | null
}

const BONES: StructureId[] = ['frontal', 'parietal', 'temporal', 'occipital', 'nasal', 'zygomatic', 'maxilla', 'mandible']
const MUSCLES: StructureId[] = ['frontalis', 'corrugator', 'orbicularis', 'zygomaticus', 'masseter']
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
  private poseReady = false
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
    this.head.add(this.jawPivot)
    this.headScene.add(this.head)
  }

  async load(modelUrl: string, anchorUrl: string): Promise<void> {
    const [gltf, anchorFile] = await Promise.all([
      new GLTFLoader().loadAsync(modelUrl),
      fetch(anchorUrl).then((response) => response.json() as Promise<AnchorFile>),
    ])
    if (!findMesh(gltf.scene, 'frontal')) throw new Error('Anatomy model is missing the skull')
    const pivot = anchorFile.jawPivot
    this.jawPivot.position.set(pivot[0], pivot[1], pivot[2])
    const add = (id: StructureId, role: ShadeRole, jaw = false) => {
      const mesh = findMesh(gltf.scene, id)
      if (!mesh) return
      ensureNormals(mesh.geometry)
      const material = createShadeMaterial(role)
      mesh.material = material
      mesh.frustumCulled = false
      mesh.position.set(0, 0, 0)
      mesh.quaternion.identity()
      mesh.scale.set(1, 1, 1)
      if (jaw) {
        mesh.position.set(-pivot[0], -pivot[1], -pivot[2])
        this.jawPivot.add(mesh)
      } else {
        this.head.add(mesh)
      }
      this.parts.push({ id, role, mesh, material, jaw })
    }
    for (const id of BONES) add(id, 'bone', id === 'mandible')
    for (const id of MUSCLES) add(id, 'muscle')
    add('brain', 'brain')
    const shell = findMesh(gltf.scene, 'shell')
    if (shell) {
      ensureNormals(shell.geometry)
      const veil = shell
      const outline = shell.clone()
      veil.material = createShadeMaterial('veil')
      outline.material = createShadeMaterial('outline')
      veil.frustumCulled = false
      outline.frustumCulled = false
      this.head.add(veil)
      this.head.add(outline)
      this.parts.push({ id: 'brain', role: 'veil', mesh: veil, material: veil.material as XrayMaterial, jaw: false })
      this.parts.push({ id: 'brain', role: 'outline', mesh: outline, material: outline.material as XrayMaterial, jaw: false })
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
        geometries.set(bone.name, mesh.geometry)
      }
    }
    const palmMesh = findMesh(gltf.scene, anchorFile.hands.palm)
    if (palmMesh) ensureNormals(palmMesh.geometry)
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
    hands: Vec3[][]
    layers: SceneLayers
    highlight: StructureId | null
    look: LookMode
    reveal: RevealMode
    cut: number
    feather: number
    skin: number
    time: number
  }): void {
    this.poseHead(frame.matrix, frame.landmarks, frame.jaw)
    this.jawPivot.rotation.x = this.jawAngle
    this.jawPivot.updateMatrix()
    this.head.updateMatrixWorld(true)
    const plane = clipPlane(frame.reveal, frame.cut)
    const solid = frame.look === 'solid'
    const active = [frame.layers.skull, frame.layers.muscles, frame.layers.brain].filter(Boolean).length
    const share = 1 / (0.62 + 0.38 * Math.max(1, active))
    const showingHead =
      frame.layers.skull || frame.layers.muscles || frame.layers.brain || frame.highlight != null
    for (const part of this.parts) {
      const layerOn =
        (part.role === 'bone' && frame.layers.skull) ||
        (part.role === 'muscle' && frame.layers.muscles) ||
        (part.role === 'brain' && frame.layers.brain) ||
        part.role === 'veil' ||
        part.role === 'outline'
      const hot = part.role !== 'veil' && part.role !== 'outline' && part.id === frame.highlight
      part.mesh.visible = showingHead && (part.role === 'veil' || part.role === 'outline' ? layerOn : layerOn || hot)
      if (part.role === 'outline') part.mesh.visible = showingHead && frame.look === 'xray'
      applyLook(part.material, solid)
      const base = part.role === 'brain' ? 0.55 : part.role === 'muscle' ? 0.7 : part.role === 'outline' ? 0.42 : 1
      part.material.uniforms.uGain!.value = solid ? 1 : base * share
      part.material.uniforms.uBoost!.value = hot ? 1 : 0
      const veilStrength = solid ? (1 - frame.skin) * 0.35 : 1 - frame.skin
      part.material.uniforms.uCover!.value = part.role === 'veil' ? veilStrength : solid ? 0.88 : 1
      part.material.uniforms.uClip!.value = plane ? 1 : 0
      if (plane) part.material.uniforms.uPlane!.value.copy(plane)
      part.material.uniforms.uSoft!.value = 0.45 + frame.feather * 3.4
      const rim = part.role === 'outline' ? 0.35 : 0.08
      part.material.uniforms.uSilhouette!.value = solid ? 0.015 : rim + frame.feather * 0.55
      if (part.jaw) {
        part.material.uniforms.uHead!.value.copy(this.jawPivot.matrix).multiply(part.mesh.matrix)
      } else {
        part.material.uniforms.uHead!.value.identity()
      }
    }
    this.poseHands(frame.hands, frame.layers.hand, solid, frame.feather)
    this.camera.projectionMatrix.copy(this.fitProjection)
    this.camera.projectionMatrixInverse.copy(this.fitProjection).invert()
    this.headRenderer.render(this.headScene, this.camera)
    this.handRenderer.render(this.handScene, this.ortho)
  }

  projectedLabels(layers: SceneLayers, highlight: StructureId | null): { id: StructureId; x: number; y: number }[] {
    if (!this.poseReady) return []
    const grouped = new Map<StructureId, { x: number; y: number; depth: number }>()
    for (const anchor of this.anchors) {
      const role = roleOf(anchor.id)
      const layerOn =
        (role === 'bone' && layers.skull) || (role === 'muscle' && layers.muscles) || (role === 'brain' && layers.brain)
      if (!layerOn && anchor.id !== highlight) continue
      const point = anchor.point.clone()
      if (anchor.jaw) {
        point.sub(this.jawPivot.position).applyMatrix4(this.jawPivot.matrix)
      }
      point.applyMatrix4(this.head.matrix)
      const depth = point.z
      this.scratch.clip.set(point.x, point.y, point.z, 1).applyMatrix4(this.fitProjection)
      if (this.scratch.clip.w === 0) continue
      const ndcX = this.scratch.clip.x / this.scratch.clip.w
      const ndcY = this.scratch.clip.y / this.scratch.clip.w
      if (ndcX < -1.2 || ndcX > 1.2 || ndcY < -1.2 || ndcY > 1.2) continue
      const x = ((ndcX + 1) / 2) * this.viewW
      const y = ((1 - ndcY) / 2) * this.viewH
      const prev = grouped.get(anchor.id)
      if (!prev || depth > prev.depth) grouped.set(anchor.id, { x, y, depth })
    }
    return [...grouped.entries()].map(([id, at]) => ({ id, x: at.x, y: at.y }))
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

  private poseHead(matrix: number[] | null, landmarks: { x: number; y: number; z: number }[] | null, jaw: number): void {
    if (!matrix) {
      this.poseReady = false
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
    if (!this.poseReady) {
      this.displayPos.copy(this.scratch.pos)
      this.displayQuat.copy(this.scratch.quat)
      this.displayScale.copy(this.scratch.scale)
      this.jawAngle = Math.max(0, Math.min(1, jaw)) * 0.42
      this.fitScale = 1
      this.fitX = 0
      this.fitY = 0
    } else {
      this.displayPos.lerp(this.scratch.pos, 0.55)
      if (this.displayQuat.dot(this.scratch.quat) < 0) {
        this.scratch.quat.set(-this.scratch.quat.x, -this.scratch.quat.y, -this.scratch.quat.z, -this.scratch.quat.w)
      }
      this.displayQuat.slerp(this.scratch.quat, 0.5)
      this.displayScale.lerp(this.scratch.scale, 0.45)
      this.jawAngle += (Math.max(0, Math.min(1, jaw)) * 0.42 - this.jawAngle) * 0.45
    }
    this.poseReady = true
    this.head.visible = true
    this.head.matrix.compose(this.displayPos, this.displayQuat, this.displayScale)
    this.head.matrixWorldNeedsUpdate = true
    this.fitProjection.copy(this.baseProjection)
    if (landmarks && landmarks.length > 454) {
      const from: { x: number; y: number }[] = []
      const to: { x: number; y: number }[] = []
      const pose = new THREE.Matrix4().compose(this.displayPos, this.displayQuat, this.displayScale)
      for (const mark of POSE_LANDMARKS) {
        const seen = landmarks[mark.index]
        if (!seen) continue
        this.scratch.clip.set(mark.at[0], mark.at[1], mark.at[2], 1).applyMatrix4(pose).applyMatrix4(this.baseProjection)
        from.push({ x: this.scratch.clip.x / this.scratch.clip.w, y: this.scratch.clip.y / this.scratch.clip.w })
        const videoX = seen.x * 2 - 1
        const videoY = 1 - seen.y * 2
        to.push({ x: videoX * this.coverX, y: videoY * this.coverY })
      }
      const solved = solveScreenFit(from, to)
      if (solved && Number.isFinite(solved.scale)) {
        const scale = Math.min(1.45, Math.max(0.7, solved.scale))
        this.fitScale += (scale - this.fitScale) * 0.45
        this.fitX += (solved.x - this.fitX) * 0.55
        this.fitY += (solved.y - this.fitY) * 0.55
        const correction = new THREE.Matrix4().makeScale(this.fitScale, this.fitScale, 1)
        correction.elements[12] = this.fitX
        correction.elements[13] = this.fitY
        this.fitProjection.premultiply(correction)
      }
    }
    const nose = landmarks?.[1]
    if (nose) {
      const fit = Math.max(this.viewW / this.videoW, this.viewH / this.videoH)
      const dispW = this.videoW * fit
      const dispH = this.videoH * fit
      this.noseLocal = {
        x: (this.viewW - dispW) / 2 + nose.x * dispW,
        y: (this.viewH - dispH) / 2 + nose.y * dispH,
      }
    }
  }

  private poseHands(hands: Vec3[][], enabled: boolean, solid: boolean, feather: number): void {
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
        material.uniforms.uGain!.value = solid ? 1 : 0.95
        material.uniforms.uSilhouette!.value = 0.12 + feather * 0.4
        material.uniforms.uHead!.value.identity()
        material.uniforms.uClip!.value = 0
      }
      const palmMaterial = rig.palm.material as XrayMaterial
      if (palmMaterial?.uniforms) {
        applyLook(palmMaterial, solid)
        palmMaterial.uniforms.uGain!.value = solid ? 1 : 0.8
        palmMaterial.uniforms.uClip!.value = 0
      }
    })
  }
}

function ensureNormals(geometry: THREE.BufferGeometry): void {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
}

function roleOf(id: StructureId): ShadeRole {
  if (id === 'brain') return 'brain'
  if (MUSCLES.includes(id)) return 'muscle'
  return 'bone'
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
  const sweep = (from: number, to: number) => from + (to - from) * cut
  if (reveal === 'left') return new THREE.Vector4(1, 0, 0, sweep(7.5, -7.5))
  if (reveal === 'right') return new THREE.Vector4(-1, 0, 0, sweep(7.5, -7.5))
  if (reveal === 'top') return new THREE.Vector4(0, 1, 0, sweep(8.5, -8.5))
  if (reveal === 'bottom') return new THREE.Vector4(0, -1, 0, -sweep(-8.5, 8.5))
  return null
}
