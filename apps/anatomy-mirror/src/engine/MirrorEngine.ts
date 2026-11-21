import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type FaceLandmarker as FaceLandmarkerType,
  type HandLandmarker as HandLandmarkerType,
} from '@mediapipe/tasks-vision'
import { emptyHold, stepHold, type HoldState } from '../domain/hold.ts'
import { dist } from '../domain/math.ts'
import { classifyTouch, matchesBone } from '../domain/regions.ts'
import { matchesMuscle, scoreMuscles } from '../domain/expressions.ts'
import { structure } from '../domain/structures.ts'
import type { BlendshapeMap, BoneId, MuscleId, StructureId, Vec3 } from '../domain/types.ts'
import { paintCallouts } from '../scene/callouts.ts'
import {
  AnatomyScene,
  type LookMode,
  type RevealMode,
  type SceneLayers,
} from '../scene/AnatomyScene.ts'
import { coverPoint } from './cover.ts'

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const MUSCLES: MuscleId[] = ['frontalis', 'corrugator', 'orbicularis', 'zygomaticus', 'masseter']

export class CameraError extends Error {
  reason: 'denied' | 'missing' | 'unknown'
  constructor(reason: 'denied' | 'missing' | 'unknown', message: string) {
    super(message)
    this.reason = reason
  }
}

export type EngineMode = 'explore' | 'touch' | 'faces' | 'quiz'

export type EngineSnapshot = {
  face: boolean
  finger: boolean
  region: BoneId | null
  muscle: MuscleId | null
  fps: number
  faceBottom: number | null
  faceTooClose: boolean
  lowFps: boolean
}

export type HoldEvent = { kind: 'touch' | 'show'; id: string; correct: boolean }

export type Appearance = {
  look: LookMode
  reveal: RevealMode
  cut: number
  feather: number
  skin: number
}

type Watch = { kind: 'touch'; id: BoneId } | { kind: 'show'; id: MuscleId } | null

type RawPoint = { x: number; y: number; z: number }

export class MirrorEngine {
  private container: HTMLElement | null = null
  private video: HTMLVideoElement | null = null
  private headCanvas: HTMLCanvasElement | null = null
  private hud: HTMLCanvasElement | null = null
  private scene: AnatomyScene | null = null
  private face: FaceLandmarkerType | null = null
  private hand: HandLandmarkerType | null = null
  private stream: MediaStream | null = null
  private raf = 0
  private disposed = false
  private preview = false
  private lastTime = -1
  private frames: number[] = []
  private lowSince = 0
  private noFaceSince = 0
  private noFingerSince = 0
  private snapAt = 0
  private mode: EngineMode = 'explore'
  private layers: SceneLayers = { skull: true, muscles: false, brain: false, hand: false }
  private showLabels = true
  private look: LookMode = 'xray'
  private reveal: RevealMode = 'lens'
  private cut = 0.42
  private feather = 0.22
  private skin = 0.32
  private lensPin: { x: number; y: number } | null = null
  private dragging = false
  private watch: Watch = null
  private highlight: StructureId | null = null
  private correctHold: HoldState = emptyHold()
  private wrongHold: HoldState = emptyHold()
  private cardHold: HoldState = emptyHold()
  onSnapshot: (snapshot: EngineSnapshot) => void
  onHold: (event: HoldEvent) => void
  onLensPinned: (pinned: boolean) => void = () => {}

  constructor(onSnapshot: (snapshot: EngineSnapshot) => void, onHold: (event: HoldEvent) => void) {
    this.onSnapshot = onSnapshot
    this.onHold = onHold
  }

  async start(
    container: HTMLElement,
    onProgress: (value: number, label: string) => void,
    preview = false,
  ): Promise<void> {
    this.container = container
    this.preview = preview
    this.mount(container)
    if (preview) {
      onProgress(0.35, 'Loading the anatomy')
      await this.loadAnatomy()
      onProgress(1, 'Ready')
      this.resize()
      this.raf = requestAnimationFrame((time) => this.frame(time))
      return
    }
    onProgress(0.08, 'Asking for the camera')
    this.stream = await this.openCamera()
    onProgress(0.22, 'Starting the camera')
    if (this.video) this.video.srcObject = this.stream
    await this.playVideo()
    onProgress(0.4, 'Loading face tracking')
    const vision = await FilesetResolver.forVisionTasks(WASM)
    onProgress(0.62, 'Reading the anatomy')
    const [, face, hand] = await Promise.all([this.loadAnatomy(), this.makeFace(vision), this.makeHand(vision)])
    this.face = face
    this.hand = hand
    onProgress(1, 'Ready')
    this.resize()
    this.raf = requestAnimationFrame((time) => this.frame(time))
  }

  setMode(mode: EngineMode): void {
    this.mode = mode
    this.correctHold = emptyHold()
    this.wrongHold = emptyHold()
    this.cardHold = emptyHold()
  }

  setLayers(layers: SceneLayers, labels: boolean): void {
    this.layers = layers
    this.showLabels = labels
  }

  setAppearance(appearance: Appearance): void {
    this.look = appearance.look
    this.reveal = appearance.reveal
    this.cut = appearance.cut
    this.feather = appearance.feather
    this.skin = appearance.skin
    if (appearance.reveal !== 'lens') this.applyMask(null)
  }

  followLens(): void {
    this.lensPin = null
    this.onLensPinned(false)
  }

  setWatch(watch: Watch): void {
    if (watch?.kind !== this.watch?.kind || watch?.id !== this.watch?.id) {
      this.correctHold = emptyHold()
      this.wrongHold = emptyHold()
    }
    this.watch = watch
  }

  setHighlight(id: StructureId | null): void {
    this.highlight = id
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.stream?.getTracks().forEach((track) => track.stop())
    this.face?.close()
    this.hand?.close()
    this.scene?.dispose()
    this.container?.replaceChildren()
  }

  private async loadAnatomy(): Promise<void> {
    const base = import.meta.env.BASE_URL
    try {
      await this.scene?.load(`${base}anatomy/bodyparts3d/anatomy.glb`, `${base}anatomy/bodyparts3d/anchors.json`)
    } catch {
      throw new CameraError('unknown', 'The anatomy model did not load. Check your connection and try again.')
    }
  }

  private async openCamera(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new CameraError('missing', 'This browser has no camera API.')
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
    } catch (error) {
      const name = error instanceof DOMException ? error.name : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw new CameraError('denied', 'Camera permission was denied.')
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
        throw new CameraError('missing', 'No camera was found.')
      }
      throw new CameraError('unknown', 'The camera did not start.')
    }
  }

  private mount(container: HTMLElement): void {
    container.replaceChildren()
    const mirror = document.createElement('div')
    mirror.className = 'mirror-video'
    const video = document.createElement('video')
    video.playsInline = true
    video.muted = true
    video.autoplay = true
    video.setAttribute('playsinline', '')
    const headCanvas = document.createElement('canvas')
    headCanvas.className = 'mirror-head'
    const handCanvas = document.createElement('canvas')
    handCanvas.className = 'mirror-hands'
    const hud = document.createElement('canvas')
    hud.className = 'mirror-hud'
    if (!this.preview) mirror.append(video)
    mirror.append(headCanvas, handCanvas, hud)
    container.append(mirror)
    this.video = video
    this.headCanvas = headCanvas
    this.hud = hud
    this.scene = new AnatomyScene(headCanvas, handCanvas)
    mirror.addEventListener('pointerdown', (event) => this.onPointerDown(event))
    mirror.addEventListener('pointermove', (event) => this.onPointerMove(event))
    mirror.addEventListener('pointerup', () => {
      this.dragging = false
    })
    mirror.addEventListener('pointercancel', () => {
      this.dragging = false
    })
    new ResizeObserver(() => this.resize()).observe(container)
  }

  private onPointerDown(event: PointerEvent): void {
    if (this.reveal !== 'lens' || event.button !== 0) return
    const local = this.pointerLocal(event)
    if (!local) return
    this.dragging = true
    this.lensPin = local
    this.onLensPinned(true)
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragging || this.reveal !== 'lens') return
    const local = this.pointerLocal(event)
    if (local) this.lensPin = local
  }

  private pointerLocal(event: PointerEvent): { x: number; y: number } | null {
    const rect = this.container?.getBoundingClientRect()
    if (!rect || rect.width < 2) return null
    const visualX = event.clientX - rect.left
    const visualY = event.clientY - rect.top
    return { x: rect.width - visualX, y: visualY }
  }

  private playVideo(): Promise<void> {
    const video = this.video
    if (!video) return Promise.resolve()
    return new Promise((resolve) => {
      const go = () => {
        void video.play().finally(() => resolve())
      }
      if (video.readyState >= 1) go()
      else video.onloadedmetadata = go
    })
  }

  private async makeFace(vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>) {
    const options = {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' as const },
      runningMode: 'VIDEO' as const,
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    }
    try {
      return await FaceLandmarker.createFromOptions(vision, options)
    } catch {
      return FaceLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'CPU' },
      })
    }
  }

  private async makeHand(vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>) {
    const options = {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' as const },
      runningMode: 'VIDEO' as const,
      numHands: 2,
    }
    try {
      return await HandLandmarker.createFromOptions(vision, options)
    } catch {
      return HandLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'CPU' },
      })
    }
  }

  private resize(): void {
    const container = this.container
    const scene = this.scene
    if (!container || !scene) return
    const rect = container.getBoundingClientRect()
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.6)
    const videoW = this.preview ? rect.width : this.video?.videoWidth || rect.width
    const videoH = this.preview ? rect.height : this.video?.videoHeight || rect.height
    scene.setSize(rect.width, rect.height, videoW, videoH, dpr)
    const hud = this.hud
    if (hud) {
      hud.width = Math.max(2, Math.round(rect.width * dpr))
      hud.height = Math.max(2, Math.round(rect.height * dpr))
    }
  }

  private wantsHand(): boolean {
    return this.layers.hand || this.mode === 'touch' || (this.mode === 'quiz' && this.watch?.kind === 'touch')
  }

  private frame(time: number): void {
    if (this.disposed) return
    this.raf = requestAnimationFrame((next) => this.frame(next))
    if (this.preview) {
      this.previewFrame(time)
      return
    }
    const video = this.video
    const scene = this.scene
    if (!video || !scene || !this.face || video.readyState < 2) return
    if (time <= this.lastTime) return
    this.lastTime = time
    const view = this.container?.getBoundingClientRect()
    if (!view || view.width < 2) return

    const faceResult = this.face.detectForVideo(video, time)
    const raw = faceResult.faceLandmarks[0] ?? null
    const placed = this.coverLandmarks(raw, video.videoWidth, video.videoHeight, view.width, view.height)
    const blends: BlendshapeMap = {}
    for (const category of faceResult.faceBlendshapes?.[0]?.categories ?? []) {
      blends[category.categoryName ?? ''] = category.score ?? 0
    }
    const matrix = readMatrix(faceResult.facialTransformationMatrixes?.[0])
    const scored = scoreMuscles(blends)
    const muscle = strongestMuscle(scored)

    let hands: Vec3[][] = []
    if (this.hand && this.wantsHand()) {
      const seen = this.hand.detectForVideo(video, time)
      hands = seen.landmarks.map((hand) =>
        hand.map((point) => coverPoint(point.x, point.y, point.z, video.videoWidth, video.videoHeight, view.width, view.height)),
      )
    }
    const finger = closestFinger(hands, placed)
    const region = placed && finger ? classifyTouch(placed, finger)?.bone ?? null : null
    const live = this.liveStructure(region, muscle)
    this.trackHolds(time, placed, finger, region, scored)
    scene.update({
      matrix,
      landmarks: raw,
      jaw: blends.jawOpen ?? 0,
      hands,
      layers: this.layers,
      highlight: this.highlight ?? live,
      look: this.look,
      reveal: this.reveal,
      cut: this.cut,
      feather: this.feather,
      skin: this.skin,
      time,
    })
    this.paintHud(view.width, view.height)
    this.publish(time, placed, Boolean(finger), region, muscle, view)
  }

  private previewFrame(time: number): void {
    const scene = this.scene
    const view = this.container?.getBoundingClientRect()
    if (!scene || !view || view.width < 2) return
    const yaw = 0.42
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    const jaw = 0.22 + 0.4 * (0.5 + 0.5 * Math.sin(time / 900))
    const hands = this.layers.hand ? [previewHand(view.width, view.height)] : []
    scene.update({
      matrix: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, -0.6, -30, 1],
      landmarks: [
        { x: 0.5, y: 0.5, z: 0 },
        { x: 0.5, y: 0.46, z: 0 },
      ],
      jaw,
      hands,
      layers: this.layers,
      highlight: this.highlight,
      look: this.look,
      reveal: this.reveal,
      cut: this.cut,
      feather: this.feather,
      skin: this.skin,
      time,
    })
    this.paintHud(view.width, view.height)
    if (time - this.snapAt < 200) return
    this.snapAt = time
    this.frames.push(time)
    this.frames = this.frames.filter((stamp) => time - stamp < 1000)
    this.onSnapshot({
      face: true,
      finger: true,
      region: null,
      muscle: null,
      fps: this.frames.length,
      faceBottom: view.height * 0.62,
      faceTooClose: false,
      lowFps: false,
    })
  }

  private coverLandmarks(
    raw: RawPoint[] | null,
    videoW: number,
    videoH: number,
    viewW: number,
    viewH: number,
  ): Vec3[] | null {
    if (!raw) return null
    return raw.map((point) => coverPoint(point.x, point.y, point.z, videoW, videoH, viewW, viewH))
  }

  private liveStructure(region: BoneId | null, muscle: MuscleId | null): StructureId | null {
    if (this.mode === 'touch' || (this.mode === 'quiz' && this.watch?.kind === 'touch')) return region
    if (this.mode === 'faces' || (this.mode === 'quiz' && this.watch?.kind === 'show')) return muscle
    return null
  }

  private trackHolds(
    time: number,
    landmarks: Vec3[] | null,
    finger: Vec3 | null,
    region: BoneId | null,
    scored: ReturnType<typeof scoreMuscles>,
  ): void {
    const iod = landmarks ? dist(landmarks[33] ?? [0, 0, 0], landmarks[263] ?? [1, 0, 0]) : 40
    const still = 0.2 * iod
    if (this.mode === 'touch' && region) {
      const step = stepHold(this.cardHold, region, finger, time, { holdMs: 420, gapMs: 140, stillRadius: still })
      this.cardHold = step.state
      if (step.ready) this.onHold({ kind: 'touch', id: region, correct: true })
    }
    const watch = this.watch
    if (!watch) return
    if (watch.kind === 'touch' && landmarks && finger) {
      const correct = matchesBone(landmarks, finger, watch.id)
      const good = stepHold(this.correctHold, correct ? watch.id : null, finger, time, { holdMs: 1000, gapMs: 150, stillRadius: still })
      this.correctHold = good.state
      if (good.ready) this.onHold({ kind: 'touch', id: watch.id, correct: true })
      const wrongId = !correct && region && region !== watch.id ? region : null
      const bad = stepHold(this.wrongHold, wrongId, finger, time, { holdMs: 1000, gapMs: 150, stillRadius: still })
      this.wrongHold = bad.state
      if (bad.ready && wrongId) this.onHold({ kind: 'touch', id: wrongId, correct: false })
    }
    if (watch.kind === 'show') {
      const correct = matchesMuscle(scored, watch.id)
      const good = stepHold(this.correctHold, correct ? watch.id : null, landmarks?.[1] ?? [0, 0, 0], time, {
        holdMs: 1000,
        gapMs: 160,
        stillRadius: 1e9,
      })
      this.correctHold = good.state
      if (good.ready) this.onHold({ kind: 'show', id: watch.id, correct: true })
    }
  }

  private paintHud(viewW: number, viewH: number): void {
    const hud = this.hud
    const scene = this.scene
    const ctx = hud?.getContext('2d')
    if (!hud || !ctx || !scene) return
    const dpr = hud.width / Math.max(viewW, 1)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const labels = this.showLabels ? scene.projectedLabels(this.layers, this.highlight) : []
    const nose = scene.noseLocal
    const centerX = nose ? viewW - nose.x : viewW / 2
    paintCallouts(
      ctx,
      viewW,
      viewH,
      labels.map((item) => ({
        text: structure(item.id).everyday,
        color: labelColor(item.id),
        x: viewW - item.x,
        y: item.y,
      })),
      centerX,
    )
    if (this.reveal !== 'lens') {
      this.applyMask(null)
      return
    }
    const lens = this.lensPin ?? nose ?? { x: viewW / 2, y: viewH * 0.42 }
    const radius = (0.18 + this.cut * 0.5) * Math.min(viewW, viewH)
    this.applyMask(lens, radius)
    ctx.strokeStyle = 'rgba(186, 224, 255, 0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(viewW - lens.x, lens.y, radius, 0, Math.PI * 2)
    ctx.stroke()
  }

  private applyMask(lens: { x: number; y: number } | null, radius = 0): void {
    const canvas = this.headCanvas
    if (!canvas) return
    if (!lens || this.reveal !== 'lens') {
      canvas.style.maskImage = 'none'
      canvas.style.setProperty('-webkit-mask-image', 'none')
      return
    }
    const inner = Math.round((1 - this.feather) * 78)
    const image = `radial-gradient(circle ${radius.toFixed(1)}px at ${lens.x.toFixed(1)}px ${lens.y.toFixed(1)}px, #fff ${inner}%, transparent 100%)`
    canvas.style.maskImage = image
    canvas.style.setProperty('-webkit-mask-image', image)
  }

  private publish(
    time: number,
    landmarks: Vec3[] | null,
    finger: boolean,
    region: BoneId | null,
    muscle: MuscleId | null,
    view: DOMRect,
  ): void {
    this.frames.push(time)
    this.frames = this.frames.filter((stamp) => time - stamp < 1000)
    const fps = this.frames.length
    if (fps < 18) {
      if (!this.lowSince) this.lowSince = time
    } else this.lowSince = 0
    if (landmarks) this.noFaceSince = 0
    else if (!this.noFaceSince) this.noFaceSince = time
    if (finger || !this.wantsHand()) this.noFingerSince = 0
    else if (!this.noFingerSince) this.noFingerSince = time
    if (time - this.snapAt < 120) return
    this.snapAt = time
    let faceBottom: number | null = null
    let faceTooClose = false
    if (landmarks) {
      let maxY = 0
      for (const point of landmarks) {
        const screenY = view.height - point[1]
        if (screenY > maxY) maxY = screenY
      }
      faceBottom = Math.min(view.height * 0.78, maxY + 12)
      const span = Math.abs((landmarks[454]?.[0] ?? 0) - (landmarks[234]?.[0] ?? 0))
      faceTooClose = span > view.width * 0.92
    }
    this.onSnapshot({
      face: Boolean(landmarks) || time - this.noFaceSince < 1200,
      finger: finger || time - this.noFingerSince < 1200,
      region,
      muscle,
      fps,
      faceBottom,
      faceTooClose,
      lowFps: this.lowSince !== 0 && time - this.lowSince > 3000,
    })
  }
}

function readMatrix(matrix: { data: ArrayLike<number> } | undefined): number[] | null {
  if (!matrix?.data || matrix.data.length < 16) return null
  return Array.from(matrix.data).slice(0, 16)
}

function strongestMuscle(scored: ReturnType<typeof scoreMuscles>): MuscleId | null {
  let muscle: MuscleId | null = null
  let best = 0.4
  for (const id of MUSCLES) {
    if (scored[id] > best) {
      best = scored[id]
      muscle = id
    }
  }
  return muscle
}

function closestFinger(hands: Vec3[][], face: Vec3[] | null): Vec3 | null {
  const nose = face?.[1]
  let best: Vec3 | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const hand of hands) {
    const tip = hand[8]
    if (!tip) continue
    const gap = nose ? dist(tip, nose) : 0
    if (gap < bestDist) {
      bestDist = gap
      best = tip
    }
  }
  return best
}

function labelColor(id: StructureId): string {
  if (id === 'brain') return '#ffc4d6'
  if (MUSCLES.includes(id as MuscleId)) return '#ffb3aa'
  return '#d7ecff'
}

function previewHand(viewW: number, viewH: number): Vec3[] {
  const scale = Math.min(viewW, viewH) * 0.11
  const originX = viewW * 0.78
  const originY = viewH * 0.22
  const unit: [number, number, number][] = [
    [0, 0, 0],
    [-0.42, 0.38, 0.08],
    [-0.72, 0.78, 0.1],
    [-0.92, 1.12, 0.06],
    [-1.08, 1.4, 0.02],
    [-0.38, 0.95, 0.02],
    [-0.42, 1.45, 0.03],
    [-0.44, 1.82, 0.02],
    [-0.46, 2.12, 0],
    [-0.02, 1.02, 0.02],
    [-0.02, 1.58, 0.03],
    [-0.02, 1.98, 0.02],
    [-0.02, 2.3, 0],
    [0.32, 0.95, 0.01],
    [0.36, 1.42, 0.02],
    [0.38, 1.78, 0.02],
    [0.4, 2.05, 0],
    [0.62, 0.78, 0],
    [0.72, 1.18, 0.01],
    [0.78, 1.48, 0.01],
    [0.82, 1.7, 0],
  ]
  return unit.map(([x, y, z]) => [originX + x * scale, originY + y * scale, z * scale])
}
