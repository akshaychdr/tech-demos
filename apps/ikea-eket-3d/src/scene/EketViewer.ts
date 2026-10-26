import gsap from 'gsap'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { steps } from '../model/stepsData'
import { layoutAllFlatPack, type FlatPackSlot } from './flatPackLayout'
import { buildFlatPackLabels } from './flatPackLabels'
import { drawerMobileTier } from './drawerMotion'
import { hardwareLabel, isHardwareName } from './partKind'
import { addPanelEdgeLines, enhanceCatalogMaterials } from './materials'
import { normalizePartName } from './partNames'

type LabelTarget = { id: string; text: string; object: THREE.Object3D }

export class EketViewer {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private labelSvg: SVGSVGElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private assembly = new THREE.Group()
  private partRoots = new Map<string, THREE.Object3D>()
  private home = new Map<string, THREE.Vector3>()
  private homeRot = new Map<string, THREE.Euler>()
  private homeScale = new Map<string, number>()
  private flatPack = new Map<string, FlatPackSlot>()
  private baseMats = new Map<string, THREE.MeshStandardMaterial[]>()
  private stepIndex = 0
  private autoplay?: ReturnType<typeof setInterval>
  private onStep?: (i: number) => void
  private labelLayoutStep0 = false
  private labelTargets: LabelTarget[] = []

  constructor(container: HTMLElement) {
    this.container = container
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'viewport-canvas'
    container.appendChild(this.canvas)

    this.labelSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.labelSvg.classList.add('leader-lines')
    container.appendChild(this.labelSvg)

    this.camera = new THREE.PerspectiveCamera(28, 1, 0.005, 50)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.14
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.setBackdrop()
    this.scene.add(this.assembly)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI * 0.48

    this.setupEnvironment()
    this.addLights()
    this.addShadowCatcher()
    window.addEventListener('resize', () => this.resize())
    this.loop()
  }

  setOnStep(fn: (i: number) => void) {
    this.onStep = fn
  }

  private setBackdrop() {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 512
    const ctx = canvas.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, 0, 512)
    g.addColorStop(0, '#f3efe8')
    g.addColorStop(0.55, '#e8e2d8')
    g.addColorStop(1, '#ddd6cb')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 4, 512)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    this.scene.background = tex
  }

  private setupEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environment = env
    pmrem.dispose()
  }

  private addLights() {
    const hemi = new THREE.HemisphereLight(0xfff8f0, 0xd8d0c4, 0.55)
    this.scene.add(hemi)

    const key = new THREE.DirectionalLight(0xffffff, 1.45)
    key.position.set(1.2, 2.6, 1.4)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 0.1
    key.shadow.camera.far = 12
    const s = 1.4
    key.shadow.camera.left = -s
    key.shadow.camera.right = s
    key.shadow.camera.top = s
    key.shadow.camera.bottom = -s
    key.shadow.bias = -0.00012
    key.shadow.normalBias = 0.02
    this.scene.add(key)

    const fill = new THREE.DirectionalLight(0xe8eeff, 0.42)
    fill.position.set(-1.6, 1.4, -0.8)
    this.scene.add(fill)

    const rim = new THREE.DirectionalLight(0xfff4e8, 0.55)
    rim.position.set(-0.5, 1.8, 2.2)
    this.scene.add(rim)

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.22))
  }

  private addShadowCatcher() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.ShadowMaterial({ opacity: 0.14 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0
    floor.receiveShadow = true
    this.scene.add(floor)
  }

  async loadModel(baseUrl: string) {
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(`${baseUrl}dataset/EKET_00333947_70x35x35.glb`)
    const root = gltf.scene.children[0] ?? gltf.scene
    this.assembly.add(root)
    const names: string[] = []

    root.children.forEach((child) => {
      const name = normalizePartName(child.name)
      if (!name) return
      names.push(name)
      child.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh
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
    this.collectMaterials()

    this.flatPack = layoutAllFlatPack(names)
    this.centerFlatPack()
    await this.goToStep(0, false)
  }

  private collectMaterials() {
    this.baseMats.clear()
    for (const [name, root] of this.partRoots) {
      const mats: THREE.MeshStandardMaterial[] = []
      root.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          const mat = m.material as THREE.MeshStandardMaterial
          if (mat?.isMeshStandardMaterial) mats.push(mat)
        }
      })
      this.baseMats.set(name, mats)
    }
  }

  private centerFlatPack() {
    const box = new THREE.Box3()
    for (const slot of this.flatPack.values()) box.expandByPoint(slot.position)
    const center = new THREE.Vector3()
    box.getCenter(center)
    for (const slot of this.flatPack.values()) {
      slot.position.x -= center.x
      slot.position.z -= center.z
    }
  }

  private nodesThroughStep(stepIdx: number): Set<string> {
    const s = new Set<string>()
    for (let i = 1; i <= stepIdx; i++) {
      for (const n of steps[i].nodes) s.add(normalizePartName(n))
    }
    return s
  }

  private applyFlatPack(name: string) {
    const obj = this.partRoots.get(name)!
    const slot = this.flatPack.get(name)!
    obj.position.copy(slot.position)
    obj.rotation.set(slot.rotation.x, slot.rotation.y, slot.rotation.z, 'XYZ')
    obj.quaternion.setFromEuler(obj.rotation)
    obj.scale.setScalar(slot.scale)
  }

  private applyHome(name: string) {
    const obj = this.partRoots.get(name)!
    obj.position.copy(this.home.get(name)!)
    obj.rotation.copy(this.homeRot.get(name)!)
    obj.scale.setScalar(this.homeScale.get(name) ?? 1)
  }

  private setHighlight(name: string, on: boolean) {
    const mats = this.baseMats.get(name) ?? []
    for (const mat of mats) {
      if (on) {
        mat.emissive.setHex(0xc43c3c)
        mat.emissiveIntensity = 0.35
      } else {
        mat.emissive.setHex(0x000000)
        mat.emissiveIntensity = 0
      }
    }
  }

  get step() {
    return this.stepIndex
  }

  get maxStep() {
    return steps.length - 1
  }

  async goToStep(index: number, animate = true) {
    const i = Math.max(0, Math.min(index, this.maxStep))
    this.stepIndex = i
    this.onStep?.(i)
    const step = steps[i]
    const placed = i === 0 ? new Set(this.partRoots.keys()) : this.nodesThroughStep(i)
    const prevPlaced = i <= 0 ? new Set<string>() : this.nodesThroughStep(i - 1)
    const newcomers = new Set(
      i > 0 ? step.nodes.map(normalizePartName).filter((n) => !prevPlaced.has(n)) : [],
    )
    this.labelTargets = []

    if (i === 0) {
      this.labelLayoutStep0 = true
      for (const [name, obj] of this.partRoots) {
        obj.visible = true
        this.applyFlatPack(name)
        this.setHighlight(name, false)
      }
      this.labelTargets = buildFlatPackLabels(this.partRoots)
      this.fitFrame({
        focus: [...this.partRoots.values()],
        fill: 0.78,
        duration: animate ? 0.7 : 0,
        azimuth: 0.72,
        elevation: 0.55,
      })
      return
    }
    this.labelLayoutStep0 = false

    const promises: Promise<void>[] = []
    for (const [name, obj] of this.partRoots) {
      if (!placed.has(name)) {
        obj.visible = false
        this.setHighlight(name, false)
        continue
      }
      obj.visible = true
      if (prevPlaced.has(name)) {
        this.applyHome(name)
        this.setHighlight(name, false)
      } else {
        this.setHighlight(name, true)
        if (animate) {
          this.applyFlatPack(name)
          const target = this.home.get(name)!
          const targetRot = this.homeRot.get(name)!
          const targetScale = this.homeScale.get(name) ?? 1
          promises.push(
            new Promise((resolve) => {
              gsap.to(obj.position, {
                x: target.x,
                y: target.y,
                z: target.z,
                duration: 0.9,
                ease: 'power3.out',
              })
              gsap.to(obj.rotation, {
                x: targetRot.x,
                y: targetRot.y,
                z: targetRot.z,
                duration: 0.9,
                ease: 'power3.out',
              })
              gsap.to(obj.scale, {
                x: targetScale,
                y: targetScale,
                z: targetScale,
                duration: 0.9,
                ease: 'power3.out',
                onComplete: () => resolve(),
              })
            }),
          )
        } else {
          this.applyHome(name)
        }
        if (isHardwareName(name)) {
          this.labelTargets.push({
            id: name,
            text: `${hardwareLabel(name)}`,
            object: obj,
          })
        }
      }
      obj.updateMatrixWorld(true)
    }

    if (promises.length) await Promise.all(promises)
    for (const name of placed) this.applyHome(name)

    if (step.openDrawers) await this.openDrawers(animate)
    else this.resetDrawerPull()

    const focusObjs = this.focusForCamera(i, placed)

    const hwStep =
      newcomers.size > 0 && newcomers.size <= 12 && [...newcomers].every((n) => isHardwareName(n))
    const showcase = step.openDrawers || i >= 14
    this.fitFrame({
      focus: focusObjs,
      fill: showcase ? 0.9 : hwStep ? 0.68 : 0.76,
      duration: animate ? 0.75 : 0,
      zoomBias: hwStep ? 0.94 : 1,
      azimuth: showcase ? 0.5 : undefined,
      elevation: showcase ? 0.36 : undefined,
    })
  }

  /** Snap hero pose for captures (drawers open, centred frame). */
  finishShowcase() {
    const placed = this.nodesThroughStep(this.maxStep)
    this.drawerPull.lower = this.drawerPullDistance
    this.drawerPull.upper = this.drawerPullDistance
    this.applyDrawerPull()
    const focus = this.focusForCamera(this.maxStep, placed)
    this.fitFrame({
      focus,
      fill: 0.9,
      duration: 0,
      azimuth: 0.5,
      elevation: 0.36,
    })
  }

  private drawerPull = { lower: 0, upper: 0 }
  private readonly drawerPullDistance = 0.18

  private async openDrawers(animate: boolean) {
    if (!animate) {
      this.drawerPull.lower = this.drawerPullDistance
      this.drawerPull.upper = this.drawerPullDistance
      this.applyDrawerPull()
      return
    }
    await new Promise<void>((resolve) => {
      const tl = gsap.timeline({ onComplete: () => resolve() })
      tl.to(this.drawerPull, {
        lower: this.drawerPullDistance,
        duration: 1.05,
        ease: 'power2.out',
        onUpdate: () => this.applyDrawerPull(),
      }).to(
        this.drawerPull,
        {
          upper: this.drawerPullDistance,
          duration: 1.05,
          ease: 'power2.out',
          onUpdate: () => this.applyDrawerPull(),
        },
        0.12,
      )
    })
  }

  private resetDrawerPull() {
    gsap.killTweensOf(this.drawerPull)
    this.drawerPull.lower = 0
    this.drawerPull.upper = 0
    this.applyDrawerPull()
  }

  private applyDrawerPull() {
    for (const [name, obj] of this.partRoots) {
      const tier = drawerMobileTier(name)
      if (!tier) continue
      const h = this.home.get(name)
      if (!h) continue
      const pull = tier === 'lower' ? this.drawerPull.lower : this.drawerPull.upper
      obj.position.set(h.x, h.y, h.z + pull)
    }
  }

  private focusForCamera(stepIdx: number, placed: Set<string>): THREE.Object3D[] {
    const objs: THREE.Object3D[] = []
    const shellOnly = stepIdx >= 8 || steps[stepIdx]?.openDrawers
    for (const name of placed) {
      if (shellOnly && isHardwareName(name)) continue
      const o = this.partRoots.get(name)
      if (o?.visible) objs.push(o)
    }
    return objs.length ? objs : [...this.partRoots.values()].filter((o) => o.visible)
  }

  private fitFrame(opts: {
    focus: THREE.Object3D[]
    fill: number
    duration: number
    zoomBias?: number
    azimuth?: number
    elevation?: number
  }) {
    const box = new THREE.Box3()
    for (const obj of opts.focus) {
      if (!obj.visible) continue
      obj.updateMatrixWorld(true)
      box.expandByObject(obj)
    }
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-0.35, 0, -0.2), new THREE.Vector3(0.35, 0.35, 0.2))
    }
    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z, 0.06)
    const fov = (this.camera.fov * Math.PI) / 180
    const aspect = this.camera.aspect
    const fitHeight = maxDim / opts.fill
    const fitWidth = fitHeight / aspect
    const distV = fitHeight / (2 * Math.tan(fov / 2))
    const distH = fitWidth / (2 * Math.tan(fov / 2))
    let dist = Math.max(distV, distH) * (opts.zoomBias ?? 1)

    const step = steps[this.stepIndex]
    const azimuth = opts.azimuth ?? step.camera?.azimuth ?? 0.78
    const elevation = opts.elevation ?? step.camera?.elevation ?? 0.4

    const pos = new THREE.Vector3(
      center.x + Math.cos(azimuth) * Math.cos(elevation) * dist,
      center.y + Math.sin(elevation) * dist,
      center.z + Math.sin(azimuth) * Math.cos(elevation) * dist,
    )

    if (opts.duration <= 0) {
      this.camera.position.copy(pos)
      this.controls.target.copy(center)
      return
    }
    gsap.to(this.camera.position, {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      duration: opts.duration,
      ease: 'power2.inOut',
    })
    gsap.to(this.controls.target, {
      x: center.x,
      y: center.y,
      z: center.z,
      duration: opts.duration,
      ease: 'power2.inOut',
    })
  }

  private updateLabels() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.labelSvg.setAttribute('width', String(w))
    this.labelSvg.setAttribute('height', String(h))
    this.labelSvg.innerHTML = ''
    if (this.labelTargets.length === 0) return

    const placed: { x: number; y: number }[] = []
    const gap = this.labelLayoutStep0 ? 22 : 18

    for (const t of this.labelTargets) {
      if (!t.object.visible) continue
      const p = new THREE.Vector3()
      t.object.getWorldPosition(p)
      const end = p.clone().project(this.camera)
      if (end.z > 1) continue
      const x2 = (end.x * 0.5 + 0.5) * w
      const y2 = (-end.y * 0.5 + 0.5) * h
      const side = x2 < w / 2 ? -1 : 1
      let x1 = x2 + side * (this.labelLayoutStep0 ? 110 : 72)
      let y1 = y2 - 42
      for (let n = 0; n < 16; n++) {
        const clash = placed.some((q) => Math.hypot(q.x - x1, q.y - y1) < gap)
        if (!clash) break
        y1 -= gap
      }
      placed.push({ x: x1, y: y1 })

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', String(x1))
      line.setAttribute('y1', String(y1))
      line.setAttribute('x2', String(x2))
      line.setAttribute('y2', String(y2))
      line.setAttribute('class', 'leader')
      this.labelSvg.appendChild(line)

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
      text.setAttribute('x', String(x1))
      text.setAttribute('y', String(y1 - 4))
      text.setAttribute('class', 'leader-text')
      text.setAttribute('text-anchor', side < 0 ? 'end' : 'start')
      text.textContent = t.text
      this.labelSvg.appendChild(text)
    }
  }

  play(on: boolean) {
    if (this.autoplay) clearInterval(this.autoplay)
    this.autoplay = undefined
    if (!on) return
    this.autoplay = setInterval(() => {
      if (this.stepIndex >= this.maxStep) {
        this.play(false)
        return
      }
      void this.goToStep(this.stepIndex + 1)
    }, 3200)
  }

  async playAll() {
    this.play(false)
    await this.goToStep(0, false)
    for (let i = 1; i <= this.maxStep; i++) await this.goToStep(i)
  }

  resetView() {
    const assembled = this.nodesThroughStep(this.stepIndex - 1)
    const newcomers = new Set(
      (steps[this.stepIndex]?.nodes ?? []).map(normalizePartName),
    )
    const focus: THREE.Object3D[] = []
    for (const name of [...assembled, ...newcomers]) {
      const o = this.partRoots.get(name)
      if (o) focus.push(o)
    }
    if (this.stepIndex === 0) focus.push(...this.partRoots.values())
    this.fitFrame({ focus, fill: 0.6, duration: 0.55 })
  }

  resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private loop() {
    this.controls.update()
    this.updateLabels()
    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(() => this.loop())
  }
}
