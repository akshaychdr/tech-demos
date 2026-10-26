import gsap from 'gsap'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { assemblyFrames, type AssemblyFrame } from '../data/assemblyFrames'
import { steps } from '../model/stepsData'
import { drawerMobileTier } from './drawerMotion'
import { layoutFlatPackPage } from './flatPackPages'
import { addPanelEdgeLines, enhanceCatalogMaterials } from './materials'
import { normalizePartName } from './partNames'
import { renderOverlays, type OverlayState } from './overlays'

export class ManualViewer {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private overlaySvg: SVGSVGElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private pivot = new THREE.Group()
  private assembly = new THREE.Group()
  private partRoots = new Map<string, THREE.Object3D>()
  private home = new Map<string, THREE.Vector3>()
  private homeRot = new Map<string, THREE.Euler>()
  private homeScale = new Map<string, number>()
  private introStep = new Map<string, number>()
  private frameIndex = 0
  private overlay: OverlayState = { showInset: false }
  private pulseT = 0
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

  private layoutFlat(frame: AssemblyFrame) {
    const page = frame.flatpackPage ?? 0
    const slots = layoutFlatPackPage([...this.partRoots.keys()], page)
    for (const [name, obj] of this.partRoots) {
      const slot = slots.get(name)
      if (!slot) {
        obj.visible = false
        continue
      }
      obj.visible = true
      obj.position.copy(slot.position)
      obj.rotation.copy(slot.rotation)
      obj.scale.setScalar(slot.scale)
      this.setOpacity(name, 1)
    }
    this.pivot.rotation.set(0, 0, 0)
  }

  private applyVisibility(frame: AssemblyFrame) {
    const placed = this.cumulativeThrough(frame.placedThroughStep)
    const active = new Set(frame.activeNodes.map(normalizePartName))
    const stepIdx = frame.stepId
    const showcase = frame.stepId >= 14 && frame.placedThroughStep >= 14

    for (const [name, obj] of this.partRoots) {
      const intro = this.introStep.get(name) ?? 99
      if (frame.phase === 'flatpack') continue
      if (intro > stepIdx && !active.has(name)) {
        obj.visible = false
        continue
      }
      obj.visible = true
      this.applyHome(name)
      if (showcase) this.setOpacity(name, 1)
      else if (active.has(name)) this.setOpacity(name, 1, 0xb83a3a)
      else if (placed.has(name)) this.setOpacity(name, 0.22)
      else this.setOpacity(name, 0.45)
    }
  }

  private async animateHardware(frame: AssemblyFrame, animate: boolean) {
    const hw = frame.hardware
    if (!hw) return
    const name = normalizePartName(hw.nodes[0])
    const obj = this.partRoots.get(name)
    if (!obj) return
    const h = this.home.get(name)!
    const axis = hw.insertAxis
    const start = h.clone()
    if (axis === 'x') start.x -= hw.insertM
    if (axis === 'y') start.y -= hw.insertM
    if (axis === 'z') start.z -= hw.insertM

    obj.position.copy(start)
    this.setOpacity(name, 1, 0xc43c3c)

    const pulse: THREE.Vector3[] = []
    obj.getWorldPosition(new THREE.Vector3())
    pulse.push(new THREE.Vector3())
    obj.getWorldPosition(pulse[0])

    this.overlay = {
      hardware: hw,
      pulseWorld: pulse,
      showInset: true,
      insetLabel: `${hw.label}\n${hw.count}×`,
    }

    if (!animate) {
      this.applyHome(name)
      return
    }
    await new Promise<void>((resolve) => {
      gsap.to(obj.position, {
        x: h.x,
        y: h.y,
        z: h.z,
        duration: 0.85,
        ease: 'power2.inOut',
        onComplete: () => {
          if (hw.rotate) {
            const r = { t: 0 }
            gsap.to(r, {
              t: hw.rotate!.turns * Math.PI * 2,
              duration: 0.7,
              onUpdate: () => {
                obj.rotation.copy(this.homeRot.get(name)!)
                if (hw.rotate!.axis === 'y') obj.rotation.y += r.t
              },
              onComplete: () => resolve(),
            })
          } else resolve()
        },
      })
    })
    this.applyHome(name)
  }

  private applyDrawerPull() {
    for (const [name, obj] of this.partRoots) {
      const tier = drawerMobileTier(name)
      if (!tier) continue
      const h = this.home.get(name)!
      const pull = tier === 'lower' ? this.drawerPull.lower : this.drawerPull.upper
      obj.position.set(h.x, h.y, h.z + pull)
    }
  }

  async goToFrame(index: number, animate = true) {
    const i = Math.max(0, Math.min(index, this.maxFrame))
    this.frameIndex = i
    const frame = assemblyFrames[i]
    this.onFrame?.(frame, i)
    this.overlay = { showInset: frame.phase === 'closeup' }

    if (frame.phase === 'flatpack') {
      this.layoutFlat(frame)
      this.pivot.rotation.set(0, 0, 0)
      await this.fitToVisible(frame.fill ?? 0.62, animate, [1.1, 1.35, 1.05])
      this.onFrame?.(frame, i)
      return
    } else {
      this.applyVisibility(frame)
      const rot = frame.assemblyRotation ?? [0, 0, 0]
      this.pivot.rotation.set(rot[0], rot[1], rot[2])
    }

    if (frame.phase === 'finish') {
      this.drawerPull.lower = 0.18
      this.drawerPull.upper = 0.18
      this.applyDrawerPull()
    } else {
      this.drawerPull.lower = 0
      this.drawerPull.upper = 0
      this.applyDrawerPull()
    }

    if (frame.pulseNodes?.length && frame.phase === 'context') {
      const pulse: THREE.Vector3[] = []
      for (const n of frame.pulseNodes) {
        const o = this.partRoots.get(normalizePartName(n))
        if (!o?.visible) continue
        const p = new THREE.Vector3()
        o.getWorldPosition(p)
        pulse.push(p)
      }
      this.overlay.pulseWorld = pulse
    }

    await this.animateCamera(frame, animate)

    if (frame.phase === 'closeup') await this.animateHardware(frame, animate)
  }

  private fitToVisible(fill: number, animate: boolean, dir: [number, number, number]) {
    const box = new THREE.Box3()
    for (const obj of this.partRoots.values()) {
      if (!obj.visible) continue
      obj.updateMatrixWorld(true)
      box.expandByObject(obj)
    }
    if (box.isEmpty()) return Promise.resolve()
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z, 0.08)
    const dist = maxDim / fill
    const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize()
    const pos = center.clone().add(d.multiplyScalar(dist))
    if (!animate) {
      this.camera.position.copy(pos)
      this.controls.target.copy(center)
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      gsap.to(this.camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: 0.8, ease: 'power2.inOut' })
      gsap.to(this.controls.target, {
        x: center.x,
        y: center.y,
        z: center.z,
        duration: 0.8,
        ease: 'power2.inOut',
        onComplete: () => resolve(),
      })
    })
  }

  private animateCamera(frame: AssemblyFrame, animate: boolean) {
    const { position, target } = frame.camera
    const fill = frame.fill ?? 0.72
    const distScale = 1 / fill
    const pos = new THREE.Vector3(
      target[0] + (position[0] - target[0]) * distScale,
      target[1] + (position[1] - target[1]) * distScale,
      target[2] + (position[2] - target[2]) * distScale,
    )
    const tgt = new THREE.Vector3(target[0], target[1], target[2])
    if (!animate) {
      this.camera.position.copy(pos)
      this.controls.target.copy(tgt)
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      gsap.to(this.camera.position, {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        duration: 0.9,
        ease: 'power2.inOut',
      })
      gsap.to(this.controls.target, {
        x: tgt.x,
        y: tgt.y,
        z: tgt.z,
        duration: 0.9,
        ease: 'power2.inOut',
        onComplete: () => resolve(),
      })
    })
  }

  finishShowcase() {
    const f = assemblyFrames[this.maxFrame]
    void this.goToFrame(this.maxFrame, false)
    this.drawerPull.lower = 0.2
    this.drawerPull.upper = 0.2
    this.applyDrawerPull()
    void this.animateCamera(f, false)
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
    this.controls.update()
    renderOverlays(this.overlaySvg, this.container.clientWidth, this.container.clientHeight, this.camera, this.overlay)
    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(() => this.loop())
  }
}
