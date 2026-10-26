import gsap from 'gsap'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import partsJson from '../../data/parts.json'
import { assemblyFrames, type AssemblyFrame } from '../data/assemblyFrames'
import { steps } from '../model/stepsData'
import { drawerMobileTier } from './drawerMotion'
import { hardwareLabel, isHardwareName, partKind } from './partKind'
import {
  approachFromClearance,
  approachOffsets,
  facePoint,
  insertionAxis,
  nearestInPlaneEdge,
  orientOutward,
  sidePose,
  thinAxis,
  viewDistance,
  worldBox,
} from './frameCamera'
import { addPanelEdgeLines, enhanceCatalogMaterials } from './materials'
import { normalizePartName, partNameForMatch } from './partNames'
import { renderOverlays, type OverlayState } from './overlays'

export class ManualViewer {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private overlaySvg: SVGSVGElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30)
  private renderCamera: THREE.Camera
  private controls: OrbitControls
  private pivot = new THREE.Group()
  private assembly = new THREE.Group()
  private partRoots = new Map<string, THREE.Object3D>()
  private home = new Map<string, THREE.Vector3>()
  private homeRot = new Map<string, THREE.Euler>()
  private homeScale = new Map<string, number>()
  private introStep = new Map<string, number>()
  private frameIndex = 0
  private overlay: OverlayState = {}
  private pulseT = 0
  private poseGen = 0
  private holeMarker: THREE.Mesh | null = null
  private onFrame?: (f: AssemblyFrame, i: number) => void
  private drawerPull = { lower: 0, upper: 0 }

  constructor(container: HTMLElement) {
    this.container = container
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'viewport-canvas'
    container.appendChild(this.canvas)
    this.overlaySvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.overlaySvg.classList.add('viewport-overlay')
    container.appendChild(this.overlaySvg)

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.005, 50)
    this.renderCamera = this.camera
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.16
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.setBackdrop()
    this.scene.add(this.pivot)
    this.pivot.add(this.assembly)
    this.setupEnvironment()
    this.addLights()
    this.addFloor()

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.enableRotate = false
    this.controls.enableZoom = false
    this.controls.enablePan = false

    window.addEventListener('resize', () => this.resize())
    this.loop()
  }

  setOnFrame(fn: (f: AssemblyFrame, i: number) => void) {
    this.onFrame = fn
  }

  get frame() {
    return this.frameIndex
  }

  get maxFrame() {
    return assemblyFrames.length - 1
  }

  private setBackdrop() {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 512
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 0, 512)
    g.addColorStop(0, '#f6f3ed')
    g.addColorStop(1, '#e6dfd3')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 512)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    this.scene.background = tex
  }

  private setupEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
  }

  private addLights() {
    this.scene.add(new THREE.HemisphereLight(0xfff8f0, 0xd5cdc0, 0.5))
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(1.1, 2.5, 1.3)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    const s = 1.3
    key.shadow.camera.left = -s
    key.shadow.camera.right = s
    key.shadow.camera.top = s
    key.shadow.camera.bottom = -s
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xe6eeff, 0.45)
    fill.position.set(-1.5, 1.2, -0.7)
    this.scene.add(fill)
  }

  private addFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.ShadowMaterial({ opacity: 0.16 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    this.scene.add(floor)
  }

  async loadModel(baseUrl: string) {
    const gltf = await new GLTFLoader().loadAsync(`${baseUrl}dataset/EKET_00333947_70x35x35.glb`)
    const root = gltf.scene.children[0] ?? gltf.scene
    this.assembly.add(root)

    for (let si = 1; si < steps.length; si++) {
      for (const n of steps[si].nodes) {
        this.introStep.set(normalizePartName(n), si)
      }
    }

    root.children.forEach((child) => {
      const name = normalizePartName(child.name)
      if (!name) return
      child.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          m.castShadow = true
          m.receiveShadow = true
        }
      })
      this.partRoots.set(name, child)
      this.home.set(name, child.position.clone())
      this.homeRot.set(name, child.rotation.clone())
      this.homeScale.set(name, child.scale.x)
      child.visible = false
    })

    enhanceCatalogMaterials(this.partRoots)
    addPanelEdgeLines(this.partRoots)
    await this.goToFrame(0, false)
  }

  private cumulativeThrough(stepIdx: number): Set<string> {
    const s = new Set<string>()
    for (let i = 1; i <= stepIdx; i++) {
      for (const n of steps[i].nodes) s.add(normalizePartName(n))
    }
    return s
  }

  private applyHome(name: string) {
    const o = this.partRoots.get(name)!
    o.position.copy(this.home.get(name)!)
    o.rotation.copy(this.homeRot.get(name)!)
    o.scale.setScalar(this.homeScale.get(name) ?? 1)
  }

  private setOpacity(name: string, opacity: number, emissive = 0x000000) {
    const o = this.partRoots.get(name)
    if (!o) return
    o.traverse((node) => {
      const m = node as THREE.Mesh
      if (!m.isMesh) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial
        if (!std?.isMeshStandardMaterial) continue
        std.transparent = opacity < 1
        std.opacity = opacity
        std.emissive.setHex(emissive)
        std.emissiveIntensity = emissive ? 0.28 : 0
      }
    })
  }

  /** Orthographic top-down grid. One cell per part type, scaled to fit, padded inside the view. */
  private layoutTray(page: 0 | 1 | 2) {
    const names = [...this.partRoots.keys()]
    const picked: { name: string; label: string }[] = []
    if (page === 0) {
      for (const n of names) {
        if (partKind(n) !== 'panel') continue
        const m = partNameForMatch(n)
        if (/bottom panel|top panel|back panel|side panel/.test(m)) {
          picked.push({ name: n, label: m.replace(/ dr.*/, '') })
        }
      }
    } else if (page === 1) {
      for (const n of names) {
        if (partKind(n) !== 'drawer' && partKind(n) !== 'slide') continue
        const m = partNameForMatch(n)
        if (!m.includes('front') && !m.includes('slide')) continue
        const tier = / 02$/.test(m) ? 'upper' : 'lower'
        const label = m.includes('front')
          ? `Front, ${tier}`
          : `${/\bl\b/.test(m) ? 'Slide L' : 'Slide R'}, ${tier}`
        picked.push({ name: n, label })
      }
    } else {
      const seen = new Set<string>()
      const totals = partsJson.hardwareTotals as Record<string, number>
      for (const n of names.sort()) {
        if (!isHardwareName(n)) continue
        const id = n.split('_')[0]
        if (seen.has(id)) continue
        seen.add(id)
        picked.push({ name: n, label: `${hardwareLabel(n)} ×${totals[id] ?? 1}` })
      }
    }

    for (const obj of this.partRoots.values()) obj.visible = false
    const aspect = Math.max(this.camera.aspect || 1.4, 0.5)
    const cols = page === 0 ? Math.max(picked.length, 1) : Math.max(1, Math.ceil(Math.sqrt(picked.length * aspect)))
    const rows = Math.max(1, Math.ceil(picked.length / cols))
    const cell = 1
    const labels: OverlayState['labels'] = []

    picked.forEach((item, i) => {
      const obj = this.partRoots.get(item.name)!
      obj.visible = true
      obj.rotation.set(0, 0, 0)
      obj.quaternion.identity()
      obj.scale.set(1, 1, 1)
      obj.position.set(0, 0, 0)
      obj.updateMatrixWorld(true)
      const flat = worldBox(obj).size
      const thin = [flat.x, flat.y, flat.z].indexOf(Math.min(flat.x, flat.y, flat.z))
      if (thin === 0) obj.rotation.z = Math.PI / 2
      else if (thin === 2) obj.rotation.x = Math.PI / 2
      this.setOpacity(item.name, 1)
      const { size } = worldBox(obj)
      const maxDim = Math.max(size.x, size.y, size.z, 0.001)
      obj.scale.setScalar(0.48 / maxDim)
      obj.updateMatrixWorld(true)
      const fitted = worldBox(obj)
      const col = i % cols
      const row = Math.floor(i / cols)
      const gx = (col - (cols - 1) / 2) * cell
      const gz = (row - (rows - 1) / 2) * cell
      obj.position.set(gx - fitted.center.x, -fitted.box.min.y, gz - fitted.center.z - 0.1)
      labels.push({ world: new THREE.Vector3(gx, 0.04, gz + 0.36), text: item.label })
    })

    const halfW = (cols * cell) / 2
    const halfD = (rows * cell) / 2
    let left = -halfW
    let right = halfW
    let top = halfD
    let bottom = -halfD
    const gridAspect = (right - left) / Math.max(top - bottom, 0.001)
    if (aspect > gridAspect) {
      const hw = ((top - bottom) * aspect) / 2
      left = -hw
      right = hw
    } else {
      const hh = (right - left) / aspect / 2
      top = hh
      bottom = -hh
    }
    const pad = 1.36
    this.ortho.left = left * pad
    this.ortho.right = right * pad
    this.ortho.top = top * pad
    this.ortho.bottom = bottom * pad
    this.ortho.position.set(0, 8, 0)
    this.ortho.up.set(0, 0, -1)
    this.ortho.lookAt(0, 0, 0)
    this.ortho.updateProjectionMatrix()
    this.renderCamera = this.ortho
    this.overlay = { labels }
  }

  private cabinetCenter() {
    const box = new THREE.Box3()
    for (const name of ['bottom panel dr ut 70x35_02', 'top panel dr ut 70x35_02', 'back panel 35x25 dr_01']) {
      const o = this.partRoots.get(normalizePartName(name))
      if (!o) continue
      this.applyHome(normalizePartName(name))
      box.expandByObject(o)
    }
    return box.getCenter(new THREE.Vector3())
  }

  private partByMatch(re: RegExp) {
    for (const [name, obj] of this.partRoots) {
      if (re.test(partNameForMatch(name))) return { name, obj }
    }
    return null
  }

  private hideHoleMarker() {
    if (this.holeMarker) this.holeMarker.visible = false
  }

  private placeHoleMarker(face: THREE.Vector3, approach: THREE.Vector3) {
    if (!this.holeMarker) {
      this.holeMarker = new THREE.Mesh(
        new THREE.CircleGeometry(1, 28),
        new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.DoubleSide, depthTest: true }),
      )
      this.holeMarker.renderOrder = 4
      this.scene.add(this.holeMarker)
    }
    const n = approach.clone().normalize()
    this.holeMarker.visible = true
    this.holeMarker.position.copy(face).addScaledVector(n, 0.003)
    this.holeMarker.scale.setScalar(0.009)
    this.holeMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)
  }

  /** Parts that meet at the fastener, plus a nearby small part (rail, clip host). */
  private jointHosts(center: THREE.Vector3, exclude: string) {
    const ranked: { name: string; box: THREE.Box3; dist: number; longest: number }[] = []
    for (const [name, obj] of this.partRoots) {
      if (name === exclude || !obj.visible || isHardwareName(name)) continue
      this.applyHome(name)
      const { box, size } = worldBox(obj)
      ranked.push({
        name,
        box,
        dist: box.distanceToPoint(center),
        longest: Math.max(size.x, size.y, size.z),
      })
    }
    ranked.sort((a, b) => a.dist - b.dist)
    return ranked.slice(0, 2)
  }

  private showOnly(names: Set<string>) {
    for (const [name, obj] of this.partRoots) {
      if (!names.has(name)) {
        obj.visible = false
        continue
      }
      obj.visible = true
      this.applyHome(name)
      this.setOpacity(name, 1)
    }
  }

  private applyVisibility(frame: AssemblyFrame) {
    const placed = this.cumulativeThrough(frame.placedThroughStep)
    const active = new Set(frame.activeNodes.map(normalizePartName))
    const stepIdx = frame.stepId
    const showcase = frame.stepId >= 14
    let near = new Set<string>()
    if (frame.phase === 'closeup' && frame.hardware) {
      const jointName = normalizePartName(frame.hardware.nodes[0])
      this.applyHome(jointName)
      const joint = worldBox(this.partRoots.get(jointName)!).center
      for (const [name, obj] of this.partRoots) {
        if (isHardwareName(name)) continue
        this.applyHome(name)
        const box = worldBox(obj).box
        if (box.distanceToPoint(joint) < 0.06) near.add(name)
      }
      near.add(jointName)
    }

    for (const [name, obj] of this.partRoots) {
      const intro = this.introStep.get(name) ?? 99
      if (intro > stepIdx && !active.has(name) && !near.has(name)) {
        obj.visible = false
        continue
      }
      if (frame.phase === 'closeup' && isHardwareName(name) && !active.has(name)) {
        obj.visible = false
        continue
      }
      const structural = frame.phase === 'closeup' && placed.has(name) && !isHardwareName(name)
      const show =
        showcase ||
        structural ||
        near.has(name) ||
        active.has(name) ||
        (frame.phase !== 'closeup' && placed.has(name))
      if (!show) {
        obj.visible = false
        continue
      }
      obj.visible = true
      this.applyHome(name)
      if (frame.phase === 'closeup' || showcase || active.has(name) || !isHardwareName(name)) {
        this.setOpacity(name, 1)
      } else this.setOpacity(name, 0.25)
    }
  }

  private localDelta(obj: THREE.Object3D, worldDelta: THREE.Vector3) {
    const q = new THREE.Quaternion()
    obj.parent?.getWorldQuaternion(q)
    return worldDelta.clone().applyQuaternion(q.invert())
  }

  /**
   * Park the fastener just outside the hole, travelling in along `approach`.
   * The settled pose stays proud of the surface so the head, the hole, and both
   * mating edges stay readable after the animation.
   */
  private async stageFastener(
    frame: AssemblyFrame,
    hole: THREE.Vector3,
    approach: THREE.Vector3,
    animate: boolean,
  ) {
    const hw = frame.hardware
    if (!hw) return
    const name = normalizePartName(hw.nodes[0])
    const obj = this.partRoots.get(name)
    if (!obj) return
    this.applyHome(name)
    let before = worldBox(obj)
    let longest = Math.max(before.size.x, before.size.y, before.size.z)
    if (longest < 0.024) {
      const pivot = before.center.clone()
      obj.scale.multiplyScalar(0.03 / Math.max(longest, 0.002))
      obj.updateMatrixWorld(true)
      const after = worldBox(obj).center
      obj.position.add(this.localDelta(obj, pivot.sub(after)))
      before = worldBox(obj)
      longest = Math.max(before.size.x, before.size.y, before.size.z)
    }
    const center = before.center.clone()
    const gap = longest * 0.5 + 0.014
    const travel = 0.06
    const endWorld = hole.clone().addScaledVector(approach, gap)
    const startWorld = hole.clone().addScaledVector(approach, gap + travel)
    const placed = obj.position.clone()
    const end = placed.clone().add(this.localDelta(obj, endWorld.clone().sub(center)))
    const start = placed.clone().add(this.localDelta(obj, startWorld.clone().sub(center)))
    obj.position.copy(animate ? start : end)
    this.setOpacity(name, 1, 0x33302c)

    const outer = endWorld.clone().addScaledVector(approach, longest * 0.45)
    this.overlay = {
      hole: hole.clone(),
      axisTip: outer,
      label: `${hw.count}× ${hw.partId}  ${hw.label}`,
      showArrow: Boolean(hw.rotate),
      clockwise: hw.rotate?.clockwise !== false,
    }
    if (!animate) return
    await new Promise<void>((resolve) => {
      gsap.to(obj.position, {
        x: end.x,
        y: end.y,
        z: end.z,
        duration: 1.25,
        ease: 'power2.inOut',
        onComplete: () => resolve(),
      })
    })
  }

  private async animateMate(names: string[], animate: boolean) {
    const centre = this.cabinetCenter()
    const jobs: Promise<void>[] = []
    for (const raw of names) {
      const name = normalizePartName(raw)
      const obj = this.partRoots.get(name)
      if (!obj) continue
      this.applyHome(name)
      const { center, size } = worldBox(obj)
      const axis = orientOutward(thinAxis(size), center, centre)
      const home = this.home.get(name)!.clone()
      const start = home.clone().add(this.localDelta(obj, axis.clone().multiplyScalar(0.15)))
      if (!animate) {
        obj.position.copy(home)
        continue
      }
      obj.position.copy(start)
      jobs.push(
        new Promise((resolve) => {
          gsap.to(obj.position, {
            x: home.x,
            y: home.y,
            z: home.z,
            duration: 1.35,
            ease: 'power2.inOut',
            onComplete: () => resolve(),
          })
        }),
      )
    }
    if (jobs.length) await Promise.all(jobs)
  }

  private applyDrawerPull() {
    for (const [name, obj] of this.partRoots) {
      const tier = drawerMobileTier(name)
      if (!tier) continue
      const h = this.home.get(name)!
      const pull = tier === 'lower' ? this.drawerPull.lower : this.drawerPull.upper
      obj.position.set(h.x + pull, h.y, h.z)
    }
  }

  async goToFrame(index: number, animate = true) {
    const i = Math.max(0, Math.min(index, this.maxFrame))
    const gen = ++this.poseGen
    this.frameIndex = i
    const frame = assemblyFrames[i]
    this.onFrame?.(frame, i)
    this.renderCamera = this.camera
    this.overlay = {}
    this.hideHoleMarker()

    if (frame.phase === 'flatpack') {
      this.pivot.rotation.set(0, 0, 0)
      this.layoutTray(frame.flatpackPage ?? 0)
      return
    }

    this.applyVisibility(frame)
    this.pivot.rotation.set(0, 0, 0)

    if (frame.phase === 'finish') {
      this.drawerPull.lower = 0.18
      this.drawerPull.upper = 0.18
      this.applyDrawerPull()
    } else {
      this.drawerPull.lower = 0
      this.drawerPull.upper = 0
      this.applyDrawerPull()
    }

    if (frame.phase === 'context' && frame.pulseNodes?.length) {
      const rings: THREE.Vector3[] = []
      for (const raw of frame.pulseNodes) {
        const obj = this.partRoots.get(normalizePartName(raw))
        if (!obj?.visible) continue
        rings.push(worldBox(obj).center)
      }
      this.overlay = { rings }
    }

    if (frame.phase === 'closeup' && frame.hardware) {
      const joint = this.jointView(frame)
      if (joint) {
        this.showOnly(joint.keep)
        this.placeHoleMarker(joint.hole, joint.approach)
        await this.moveCamera(joint.position, joint.target, animate)
        if (gen !== this.poseGen) return
        await this.stageFastener(frame, joint.hole, joint.approach, animate)
        return
      }
    }

    await this.framePose(frame, animate)
    if (gen !== this.poseGen) return

    if (frame.subId === '2') {
      await this.animateMate(
        ['side panel left dr ut 70x35_01', 'side panel right dr ut 70x35_05'],
        animate,
      )
    }
    if (frame.subId === '4') await this.animateMate(['back panel 35x25 dr_01'], animate)
    if (frame.subId === '5') await this.animateMate(['top panel dr ut 70x35_02'], animate)
  }

  /** Close-up aimed 40° off the fastener axis, on the clear side of the joint. */
  private jointView(frame: AssemblyFrame) {
    const hw = frame.hardware
    if (!hw) return null
    const name = normalizePartName(hw.nodes[0])
    const obj = this.partRoots.get(name)
    if (!obj) return null
    this.applyHome(name)
    const fastener = worldBox(obj)
    const hosts = this.jointHosts(fastener.center, name)
    const keep = new Set<string>([name, ...hosts.map((h) => h.name)])
    const axis = insertionAxis(fastener.size)
    const approach = approachFromClearance(
      axis,
      fastener.center,
      hosts.map((h) => h.box),
    )
    const primary = hosts[0]
    const hole = primary
      ? facePoint(primary.box, approach, fastener.center)
      : fastener.center.clone()
    const reach = hosts.reduce(
      (m, host) => Math.max(m, nearestInPlaneEdge(host.box, hole, approach)),
      0.02,
    )
    const capped = Math.min(reach, 0.11)
    const region = Math.min(0.18, Math.max(0.09, 2 * (capped + 0.025) * 0.55))
    const dist = viewDistance(region, this.camera.fov, 0.55)
    const boxes = hosts.map((h) => h.box)
    let bestDir = approachOffsets(approach, 40)[0]
    let bestScore = -Infinity
    for (const dir of approachOffsets(approach, 40)) {
      const cam = hole.clone().addScaledVector(dir, dist)
      const mid = hole.clone().addScaledVector(dir, dist * 0.5)
      let score = dir.y * 2
      if (boxes.some((b) => b.containsPoint(cam))) score -= 6
      if (boxes.some((b) => b.containsPoint(mid))) score -= 4
      for (const host of hosts) {
        const c = host.box.getCenter(new THREE.Vector3())
        const toCam = hole.clone().sub(cam).normalize()
        const toHost = c.sub(cam).normalize()
        if (toHost.dot(toCam) > 0.65) score += 2
      }
      if (score > bestScore) {
        bestScore = score
        bestDir = dir
      }
    }
    return {
      keep,
      hole,
      approach,
      position: hole.clone().addScaledVector(bestDir, dist),
      target: hole.clone(),
    }
  }

  private viewKind(frame: AssemblyFrame): 'back' | 'front' | 'top' | 'side' {
    const t = frame.title.toLowerCase()
    if (/rear|back|wall/.test(t)) return 'back'
    if (/top|bottom|clamp/.test(t)) return 'top'
    if (/side|slide/.test(t)) return 'side'
    return 'front'
  }

  /** Front is the opposite of the back panel's outward normal. */
  private frontOutward(centre: THREE.Vector3) {
    const back = this.partByMatch(/back panel/)
    if (!back) return new THREE.Vector3(1, 0, 0)
    const box = worldBox(back.obj)
    return orientOutward(thinAxis(box.size), box.center, centre).negate()
  }

  private async framePose(frame: AssemblyFrame, animate: boolean) {
    const fov = this.camera.fov
    const centre = this.cabinetCenter()
    const shell = new THREE.Box3()
    for (const obj of this.partRoots.values()) {
      if (!obj.visible) continue
      shell.expandByObject(obj)
    }
    const shellSize = shell.getSize(new THREE.Vector3())
    const shellCenter = shell.isEmpty() ? centre : shell.getCenter(new THREE.Vector3())
    const span = Math.max(shellSize.x, shellSize.y, shellSize.z, 0.2)

    let pose: { position: THREE.Vector3; target: THREE.Vector3 }
    const kind = this.viewKind(frame)
    const frontOut = this.frontOutward(centre)
    if (kind === 'back') {
      const back = this.partByMatch(/back panel/)
      const box = back ? worldBox(back.obj) : { center: shellCenter, size: shellSize }
      const outward = orientOutward(thinAxis(box.size), box.center, centre)
      pose = sidePose(box.center, outward, Math.max(box.size.y, box.size.z, span * 0.85), fov, 0.58)
      const flank = new THREE.Vector3().crossVectors(outward, new THREE.Vector3(0, 1, 0)).normalize()
      pose.position.add(flank.multiplyScalar(span * 0.55))
      pose.position.y += span * 0.12
    } else if (kind === 'top') {
      const dir = frontOut.clone().multiplyScalar(0.42).add(new THREE.Vector3(0, 1, 0)).normalize()
      const dist = viewDistance(span, fov, 0.62)
      pose = { position: shellCenter.clone().addScaledVector(dir, dist), target: shellCenter }
    } else {
      const side = this.partByMatch(kind === 'side' ? /side panel left/ : /drawer front/)
      let flank = new THREE.Vector3().crossVectors(frontOut, new THREE.Vector3(0, 1, 0)).normalize()
      if (side) {
        const sb = worldBox(side.obj)
        const out = orientOutward(thinAxis(sb.size), sb.center, centre)
        if (Math.abs(out.dot(frontOut)) < 0.75) flank = out
      }
      const dir = frontOut
        .clone()
        .multiplyScalar(0.78)
        .add(flank.multiplyScalar(kind === 'side' ? 0.55 : 0.32))
        .add(new THREE.Vector3(0, 0.26, 0))
        .normalize()
      const dist = viewDistance(span * 1.05, fov, 0.6)
      pose = { position: shellCenter.clone().addScaledVector(dir, dist), target: shellCenter }
    }
    await this.moveCamera(pose.position, pose.target, animate)
  }

  private moveCamera(position: THREE.Vector3, target: THREE.Vector3, animate: boolean) {
    if (!animate) {
      this.camera.position.copy(position)
      this.controls.target.copy(target)
      this.camera.lookAt(target)
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      gsap.to(this.camera.position, {
        x: position.x,
        y: position.y,
        z: position.z,
        duration: 0.85,
        ease: 'power2.inOut',
      })
      gsap.to(this.controls.target, {
        x: target.x,
        y: target.y,
        z: target.z,
        duration: 0.85,
        ease: 'power2.inOut',
        onComplete: () => resolve(),
      })
    })
  }

  finishShowcase() {
    void this.goToFrame(this.maxFrame, false)
    this.drawerPull.lower = 0.16
    this.drawerPull.upper = 0.16
    this.applyDrawerPull()
  }

  play(on: boolean) {
    if (this.autoplay) clearInterval(this.autoplay)
    this.autoplay = undefined
    if (!on) return
    this.autoplay = setInterval(() => {
      if (this.frameIndex >= this.maxFrame) {
        this.play(false)
        return
      }
      void this.goToFrame(this.frameIndex + 1)
    }, 2800)
  }

  private autoplay?: ReturnType<typeof setInterval>

  resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private loop() {
    this.pulseT += 0.05
    if (this.renderCamera === this.camera) this.camera.lookAt(this.controls.target)
    this.renderCamera.updateMatrixWorld(true)
    renderOverlays(
      this.overlaySvg,
      this.container.clientWidth,
      this.container.clientHeight,
      this.renderCamera,
      this.overlay,
    )
    this.renderer.render(this.scene, this.renderCamera)
    requestAnimationFrame(() => this.loop())
  }
}
