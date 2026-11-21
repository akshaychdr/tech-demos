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
import { AnatomyScene, type SceneLayers } from '../scene/AnatomyScene.ts'
import { coverPoint } from './cover.ts'

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm'
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

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

type Watch = { kind: 'touch'; id: BoneId } | { kind: 'show'; id: MuscleId } | null

export class MirrorEngine {
  private container: HTMLElement | null = null
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private labels: HTMLElement | null = null
  private scene: AnatomyScene | null = null
  private face: FaceLandmarkerType | null = null
  private hand: HandLandmarkerType | null = null
  private stream: MediaStream | null = null
  private raf = 0
  private disposed = false
  private lastTime = -1
  private frames: number[] = []
  private lowSince = 0
  private noFaceSince = 0
  private noFingerSince = 0
  private snapAt = 0
  private mode: EngineMode = 'explore'
  private layers: SceneLayers = { bones: true, muscles: false, brain: false, hand: false }
  private showLabels = false
  private watch: Watch = null
  private highlight: StructureId | null = null
  private correctHold: HoldState = emptyHold()
  private wrongHold: HoldState = emptyHold()
  private cardHold: HoldState = emptyHold()

  onSnapshot: (snapshot: EngineSnapshot) => void
  onHold: (event: HoldEvent) => void

  constructor(onSnapshot: (snapshot: EngineSnapshot) => void, onHold: (event: HoldEvent) => void) {
    this.onSnapshot = onSnapshot
    this.onHold = onHold
  }

  async start(container: HTMLElement, onProgress: (value: number, label: string) => void): Promise<void> {
    this.container = container
    onProgress(0.08, 'Asking for the camera')
    this.stream = await this.openCamera()
    onProgress(0.22, 'Starting the camera')
    this.mount(container)
    await this.playVideo()
    onProgress(0.4, 'Loading face tracking')
    const vision = await FilesetResolver.forVisionTasks(WASM)
    onProgress(0.62, 'Reading the anatomy')
    const [, face, hand] = await Promise.all([
      this.scene?.load(`${import.meta.env.BASE_URL}anatomy/bodyparts3d/anatomy.glb`) ?? Promise.resolve(),
      this.makeFace(vision),
      this.makeHand(vision),
    ])
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
    if (this.labels) this.labels.hidden = !labels
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
    const canvas = document.createElement('canvas')
    mirror.append(video, canvas)
    const labels = document.createElement('div')
    labels.className = 'mirror-labels'
    labels.hidden = true
    container.append(mirror, labels)
    this.video = video
    this.canvas = canvas
    this.labels = labels
    this.scene = new AnatomyScene(canvas)
    video.srcObject = this.stream
    new ResizeObserver(() => this.resize()).observe(container)
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
      numHands: 1,
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
    const canvas = this.canvas
    if (!container || !canvas || !this.scene) return
    const rect = container.getBoundingClientRect()
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.6)
    this.scene.setSize(rect.width, rect.height, dpr)
  }

  private wantsHand(): boolean {
    return this.layers.hand || this.mode === 'touch' || (this.mode === 'quiz' && this.watch?.kind === 'touch')
  }

  private frame(time: number): void {
    if (this.disposed) return
    this.raf = requestAnimationFrame((next) => this.frame(next))
    const video = this.video
    const scene = this.scene
    if (!video || !scene || !this.face || video.readyState < 2) return
    if (time <= this.lastTime) return
    this.lastTime = time
    const view = this.container?.getBoundingClientRect()
    if (!view || view.width < 2) return

    const faceResult = this.face.detectForVideo(video, time)
    const raw = faceResult.faceLandmarks[0]
    const landmarks = raw?.map((point) => coverPoint(point.x, point.y, point.z, video.videoWidth, video.videoHeight, view.width, view.height)) ?? null
    const blends: BlendshapeMap = {}
    for (const category of faceResult.faceBlendshapes?.[0]?.categories ?? []) {
      blends[category.categoryName] = category.score
    }
    const scored = scoreMuscles(blends)
    let muscle: MuscleId | null = null
    let best = 0.4
    for (const id of ['frontalis', 'corrugator', 'orbicularis', 'zygomaticus', 'masseter'] as MuscleId[]) {
      if (scored[id] > best) {
        best = scored[id]
        muscle = id
      }
    }

    let handPoints: Vec3[] | null = null
    if (this.hand && this.wantsHand()) {
      const hands = this.hand.detectForVideo(video, time)
      const rawHand = hands.landmarks[0]
      if (rawHand) {
        handPoints = rawHand.map((point) =>
          coverPoint(point.x, point.y, point.z, video.videoWidth, video.videoHeight, view.width, view.height),
        )
      }
    }
    const finger = handPoints?.[8] ?? null
    const region = landmarks && finger ? classifyTouch(landmarks, finger)?.bone ?? null : null

    let live: StructureId | null = null
    if (this.mode === 'touch' || (this.mode === 'quiz' && this.watch?.kind === 'touch')) live = region
    if (this.mode === 'faces' || (this.mode === 'quiz' && this.watch?.kind === 'show')) live = muscle
    this.trackHolds(time, landmarks, finger, region, scored)

    scene.update({
      landmarks,
      layers: this.layers,
      highlight: this.highlight,
      live: this.highlight ? null : live,
      hand: handPoints,
      time,
    })
    this.paintLabels(landmarks, view.width, view.height)
    this.publish(time, landmarks, Boolean(finger), region, muscle, video, view)
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

  private paintLabels(landmarks: Vec3[] | null, viewW: number, viewH: number): void {
    const host = this.labels
    if (!host) return
    host.hidden = !this.showLabels
    if (!this.showLabels || !landmarks) {
      host.replaceChildren()
      return
    }
    const spot = (index: number, dx = 0, dy = 0) => {
      const point = landmarks[index]
      if (!point) return null
      return { x: viewW - point[0] + dx, y: viewH - point[1] + dy }
    }
    const pins: { id: StructureId; at: { x: number; y: number } | null }[] = []
    if (this.layers.bones) {
      pins.push(
        { id: 'frontal', at: spot(10, 0, -18) },
        { id: 'parietal', at: spot(10, 0, -52) },
        { id: 'temporal', at: spot(234, 8, 0) },
        { id: 'occipital', at: spot(454, -8, 28) },
        { id: 'nasal', at: spot(6, 0, -8) },
        { id: 'zygomatic', at: spot(116, 0, 8) },
        { id: 'maxilla', at: spot(2, 0, 6) },
        { id: 'mandible', at: spot(152, 0, 16) },
      )
    }
    if (this.layers.muscles) {
      pins.push(
        { id: 'frontalis', at: spot(67, 0, -8) },
        { id: 'corrugator', at: spot(8, 0, -6) },
        { id: 'orbicularis', at: spot(33, 0, 0) },
        { id: 'zygomaticus', at: spot(61, 0, 0) },
        { id: 'masseter', at: spot(172, 0, 0) },
      )
    }
    if (this.layers.brain) pins.push({ id: 'brain', at: spot(168, 0, -36) })
    host.replaceChildren()
    for (const pin of pins) {
      if (!pin.at) continue
      const info = structure(pin.id)
      const chip = document.createElement('span')
      chip.className = 'mirror-label'
      chip.textContent = info.everyday
      chip.style.left = `${pin.at.x}px`
      chip.style.top = `${pin.at.y}px`
      chip.style.color = info.color
      host.append(chip)
    }
  }

  private publish(
    time: number,
    landmarks: Vec3[] | null,
    finger: boolean,
    region: BoneId | null,
    muscle: MuscleId | null,
    video: HTMLVideoElement,
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
      const fit = Math.max(view.width / video.videoWidth, view.height / video.videoHeight)
      const dispH = video.videoHeight * fit
      const offY = (view.height - dispH) / 2
      let maxY = 0
      for (const point of landmarks) {
        const screenY = view.height - point[1]
        if (screenY > maxY) maxY = screenY
      }
      faceBottom = Math.min(view.height * 0.78, maxY + 12)
      void offY
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
