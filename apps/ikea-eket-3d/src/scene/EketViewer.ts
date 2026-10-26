import gsap from 'gsap'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { steps, type StepRecord } from '../model/stepsData'

const MM = 1000

export class EketViewer {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private assembly = new THREE.Group()
  private partRoots = new Map<string, THREE.Object3D>()
  private home = new Map<string, THREE.Vector3>()
  private explodeDir = new Map<string, THREE.Vector3>()
  private stepIndex = 0
  private autoplay?: ReturnType<typeof setInterval>
  private drawerParts: THREE.Object3D[] = []
  private onStep?: (i: number) => void

  constructor(container: HTMLElement) {
    this.container = container
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'viewport-canvas'
    container.appendChild(this.canvas)

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100)
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene.background = new THREE.Color(0xe8e4dc)
    this.scene.add(this.assembly)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.target.set(0, 0.175, 0)

    this.addLights()
    this.addFloor()
    window.addEventListener('resize', () => this.resize())
    this.loop()
  }

  setOnStep(fn: (i: number) => void) {
    this.onStep = fn
  }

  private addLights() {
    const key = new THREE.DirectionalLight(0xfff5eb, 1.15)
    key.position.set(1.2, 2.2, 1.4)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.camera.near = 0.1
    key.shadow.camera.far = 8
    key.shadow.camera.left = -1.2
    key.shadow.camera.right = 1.2
    key.shadow.camera.top = 1.2
    key.shadow.camera.bottom = -1.2
    this.scene.add(key)

    const fill = new THREE.DirectionalLight(0xc8d4ff, 0.42)
    fill.position.set(-1.5, 1, -0.8)
    this.scene.add(fill)
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.38))
  }

  private addFloor() {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 4),
      new THREE.MeshStandardMaterial({ color: 0xd4cec4, roughness: 0.92 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.001
    floor.receiveShadow = true
    this.scene.add(floor)
  }

  async loadModel(baseUrl: string) {
    const loader = new GLTFLoader()
    const url = `${baseUrl}dataset/EKET_00333947_70x35x35.glb`
    const gltf = await loader.loadAsync(url)
    const root = gltf.scene.children[0] ?? gltf.scene
    const center = new THREE.Vector3()
    new THREE.Box3().setFromObject(root).getCenter(center)

    root.children.forEach((child) => {
      const name = child.name.replace(/\u200b/g, '').trim()
      if (!name) return
      child.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          const m = o as THREE.Mesh
          m.castShadow = true
          m.receiveShadow = true
        }
      })
      this.partRoots.set(name, child)
      const pos = child.position.clone()
      this.home.set(name, pos)
      const dir = pos.clone().sub(center)
      if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0)
      dir.normalize()
      this.explodeDir.set(name, dir)
      child.visible = false
      this.assembly.add(child)

      if (/drawer front|Drawer_slide_.*Drawer/i.test(name)) {
        this.drawerParts.push(child)
      }
      child.traverse((o) => {
        if (/drawer front|Drawer_slide_.*Drawer/i.test(o.name)) {
          this.drawerParts.push(o)
        }
      })
    })

    await this.goToStep(0, false)
  }

  private explodedPosition(name: string, factor = 0.38): THREE.Vector3 {
    const h = this.home.get(name)!
    const d = this.explodeDir.get(name)!
    return h.clone().add(d.clone().multiplyScalar(factor))
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
    const visible = new Set<string>()
    if (i === 0) {
      for (const n of this.partRoots.keys()) visible.add(n)
    } else {
      for (let s = 1; s <= i; s++) {
        for (const n of steps[s].nodes) visible.add(n)
      }
    }

    if (i === 0) {
      for (const [name, obj] of this.partRoots) {
        obj.visible = true
        obj.position.copy(this.explodedPosition(name))
      }
      this.fitToVisible(step, animate ? 0.6 : 0)
      return
    }

    const promises: Promise<void>[] = []
    for (const [name, obj] of this.partRoots) {
      const shouldShow = visible.has(name)
      if (!shouldShow) {
        obj.visible = false
        continue
      }
      const wasVisible = obj.visible
      obj.visible = true
      const target = this.home.get(name)!
      const needsHome =
        !wasVisible || obj.position.distanceToSquared(target) > 1e-8
      if (needsHome && animate) {
        const from = wasVisible ? obj.position.clone() : this.explodedPosition(name, 0.42)
        obj.position.copy(from)
        promises.push(
          new Promise((resolve) => {
            gsap.to(obj.position, {
              x: target.x,
              y: target.y,
              z: target.z,
              duration: 0.85,
              ease: 'power3.out',
              onComplete: () => resolve(),
            })
          }),
        )
      } else if (needsHome && !animate) {
        obj.position.copy(target)
      }
    }

    if (step.openDrawers) this.animateDrawersOpen()
    else this.resetDrawerOffset()

    this.fitToVisible(step, animate ? 0.75 : 0)
    if (promises.length) await Promise.all(promises)
    for (const name of visible) {
      this.partRoots.get(name)!.position.copy(this.home.get(name)!)
    }
    if (step.openDrawers) this.applyDrawerOffset()
  }

  private drawerOffset = 0

  private animateDrawersOpen() {
    gsap.to(this, {
      drawerOffset: 0.22,
      duration: 1.2,
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
      const h = this.home.get(obj.name.replace(/\u200b/g, '').trim())
      if (!h) continue
      const isLower = /_01|small 70x35_01|_1_01|_3_01/i.test(obj.name)
      const sign = isLower ? 1 : 1
      obj.position.z = h.z + this.drawerOffset * sign
    }
  }

  private fitToVisible(step: StepRecord, duration: number) {
    const box = new THREE.Box3()
    let empty = true
    for (const obj of this.partRoots.values()) {
      if (!obj.visible) continue
      box.expandByObject(obj)
      empty = false
    }
    if (empty) box.set(new THREE.Vector3(-0.35, 0, -0.2), new THREE.Vector3(0.35, 0.35, 0.2))

    const size = new THREE.Vector3()
    box.getSize(size)
    const center = new THREE.Vector3()
    box.getCenter(center)
    const radius = Math.max(size.x, size.y, size.z) * 0.85
    const cam = step.camera ?? { azimuth: 0.6, elevation: 0.35, distance: 2.2 }
    const dist = radius * cam.distance
    const pos = new THREE.Vector3(
      center.x + Math.cos(cam.azimuth) * Math.cos(cam.elevation) * dist,
      center.y + Math.sin(cam.elevation) * dist,
      center.z + Math.sin(cam.azimuth) * Math.cos(cam.elevation) * dist,
    )

    if (duration <= 0) {
      this.camera.position.copy(pos)
      this.controls.target.copy(center)
      return
    }
    gsap.to(this.camera.position, {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      duration,
      ease: 'power2.inOut',
    })
    gsap.to(this.controls.target, {
      x: center.x,
      y: center.y,
      z: center.z,
      duration,
      ease: 'power2.inOut',
    })
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
    this.fitToVisible(steps[this.stepIndex], 0.6)
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
    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(() => this.loop())
  }

  formatMm(meters: number) {
    return `${Math.round(meters * MM)} mm`
  }
}
