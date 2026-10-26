import gsap from 'gsap'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { steps } from '../model/stepsData'
import { layoutAllFlatPack, type FlatPackSlot } from './flatPackLayout'
import { hardwareLabel, isHardwareName, partKind } from './partKind'
import { normalizePartName, partNameForMatch } from './partNames'

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
  private drawerParts: THREE.Object3D[] = []
  private onStep?: (i: number) => void
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
    this.renderer.toneMappingExposure = 1.08
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.setBackdrop()
    this.scene.add(this.assembly)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI * 0.48

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

  private addLights() {
    const key = new THREE.DirectionalLight(0xfff7ee, 1.2)
    key.position.set(1.4, 2.4, 1.1)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 0.1
    key.shadow.camera.far = 12
    const s = 2.2
    key.shadow.camera.left = -s
    key.shadow.camera.right = s
    key.shadow.camera.top = s
    key.shadow.camera.bottom = -s
    key.shadow.bias = -0.00015
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xc5d4ff, 0.35)
    fill.position.set(-1.8, 1.2, -0.6)
    this.scene.add(fill)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.42))
  }

  private addShadowCatcher() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 6),
      new THREE.ShadowMaterial({ opacity: 0.07 }),
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
      const mats: THREE.MeshStandardMaterial[] = []
      child.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh
          m.castShadow = true
          m.receiveShadow = true
          const mat = m.material as THREE.MeshStandardMaterial
          if (mat?.isMeshStandardMaterial) mats.push(mat)
        }
      })
      this.baseMats.set(name, mats)
      this.partRoots.set(name, child)
      this.home.set(name, child.position.clone())
      this.homeRot.set(name, child.rotation.clone())
      this.homeScale.set(name, child.scale.x)
      child.visible = false
      if (/drawer front|Drawer_slide_.*Drawer/i.test(name)) this.drawerParts.push(child)
      child.traverse((o) => {
        if (/drawer front|Drawer_slide_.*Drawer/i.test(o.name)) this.drawerParts.push(o)
      })
    })

    this.flatPack = layoutAllFlatPack(names)
    this.centerFlatPack()
    await this.goToStep(0, false)
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
      const hwLabelled = new Set<string>()
      for (const [name, obj] of this.partRoots) {
        obj.visible = true
        this.applyFlatPack(name)
        this.setHighlight(name, false)
        const slot = this.flatPack.get(name)
        if (
          partKind(name) === 'panel' &&
          /bottom panel|top panel|back panel|side panel/i.test(partNameForMatch(name))
        ) {
          this.labelTargets.push({
            id: name,
            text: name.replace(/_\d+$/, '').replace(/ dr ut.*/, ''),
            object: obj,
          })
        } else if (isHardwareName(name)) {
          const hwId = name.split('_')[0]
          if (!hwLabelled.has(hwId)) {
            hwLabelled.add(hwId)
            this.labelTargets.push({
              id: hwId,
              text: slot?.label ?? hwId,
              object: obj,
            })
          }
        }
      }
      this.fitFrame({ focus: [...this.partRoots.values()], fill: 0.68, duration: animate ? 0.7 : 0 })
      return
    }

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

    if (step.openDrawers) this.animateDrawersOpen()
    else this.resetDrawerOffset()

    const focusObjs: THREE.Object3D[] = []
    for (const name of placed) {
      const o = this.partRoots.get(name)
      if (o?.visible) focusObjs.push(o)
    }

    const hwStep =
      newcomers.size > 0 && newcomers.size <= 12 && [...newcomers].every((n) => isHardwareName(n))
    this.fitFrame({
      focus: focusObjs,
      fill: hwStep ? 0.64 : 0.72,
      duration: animate ? 0.75 : 0,
      zoomBias: hwStep ? 0.92 : 1,
    })

    if (promises.length) await Promise.all(promises)
    for (const name of placed) this.applyHome(name)
    if (step.openDrawers) this.applyDrawerOffset()
  }

  private drawerOffset = 0

  private animateDrawersOpen() {
    gsap.to(this, {
      drawerOffset: 0.22,
      duration: 1.1,
      ease: 'power2.out',
      onUpdate: () => this.applyDrawerOffset(),
    })
  }

  private resetDrawerOffset() {
    gsap.killTweensOf(this)
    this.drawerOffset = 0
    this.applyDrawerOffset()
  }

  private applyDrawerOffset() {
    for (const obj of this.drawerParts) {
      const key = normalizePartName(obj.name)
      const h = this.home.get(key) ?? this.partRoots.get(key)?.position
      if (!h) continue
      obj.position.z = h.z + this.drawerOffset
    }
  }

  private fitFrame(opts: {
    focus: THREE.Object3D[]
    fill: number
    duration: number
    zoomBias?: number
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
    const azimuth = step.camera?.azimuth ?? 0.78
    const elevation = step.camera?.elevation ?? 0.4

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

    for (const t of this.labelTargets) {
      if (!t.object.visible) continue
      const p = new THREE.Vector3()
      t.object.getWorldPosition(p)
      const end = p.clone().project(this.camera)
      const x2 = (end.x * 0.5 + 0.5) * w
      const y2 = (-end.y * 0.5 + 0.5) * h
      const x1 = x2 + (x2 < w / 2 ? -70 : 70)
      const y1 = y2 - 36

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
