import * as THREE from 'three'
import gsap from 'gsap'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildLayoutGeometry, type LayoutGeometry } from '../model/geometry'
import type { TypeARow } from '../model/typeA'
import { renderLayoutPlanSvg } from '../svg/layout-plan'

export type Scene1Api = {
  mount: (root: HTMLElement) => void
  setConfig: (row: TypeARow, travelMm: number) => void
  morphTo3d: () => void
  dispose: () => void
}

export function createScene1(): Scene1Api {
  let root: HTMLElement
  let svgHost: HTMLElement
  let canvasHost: HTMLElement
  let geometry: LayoutGeometry
  let highlightId: string | null = null

  let renderer: THREE.WebGLRenderer
  let scene: THREE.Scene
  let camera: THREE.PerspectiveCamera
  let controls: OrbitControls
  let group: THREE.Group
  let raf = 0
  let extruded = false

  function build3D(g: LayoutGeometry) {
    group.clear()
    const s = 0.001
    const hw = g.hoistwayW * s
    const hd = g.hoistwayD * s
    const sh = g.shaftHeight * s

    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x38d6ff,
      transparent: true,
      opacity: 0.12,
      metalness: 0.1,
      roughness: 0.85,
    })
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x38d6ff })

    const walls = new THREE.Group()
    walls.userData.id = 'hoistway'
    const mkWall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat)
      mesh.position.set(x, y, z)
      walls.add(mesh)
      walls.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat))
    }
    mkWall(hw, sh, 0.02, 0, sh / 2, -hd / 2)
    mkWall(hw, sh, 0.02, 0, sh / 2, hd / 2)
    mkWall(0.02, sh, hd, -hw / 2, sh / 2, 0)
    mkWall(0.02, sh, hd, hw / 2, sh / 2, 0)
    group.add(walls)

    const plat = new THREE.Mesh(
      new THREE.BoxGeometry(g.platformW * s, 0.04, g.platformD * s),
      new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.35 }),
    )
    plat.position.set(0, g.pit * s + 0.02, 0)
    plat.userData.id = 'platform'
    group.add(plat)
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(plat.geometry), edgeMat))

    const railGeo = new THREE.BoxGeometry(0.03, g.travel * s, 0.06)
    const railL = new THREE.Mesh(railGeo, wallMat)
    railL.position.set(-g.railCL * s + hw / 2 - 0.1, g.pit * s + g.travel * s / 2, 0)
    railL.userData.id = 'rail'
    group.add(railL)

    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, g.travel * s * 0.85, 16),
      new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.25 }),
    )
    cyl.position.set(hw / 2 - g.wallToCylinder * s, g.pit * s + g.travel * s * 0.42, hd / 2 - 0.15)
    cyl.userData.id = 'cylinder'
    group.add(cyl)

    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(g.platformW * s * 0.92, g.cabH * s, g.platformD * s * 0.92),
      new THREE.MeshBasicMaterial({ color: 0x38d6ff, transparent: true, opacity: 0.12 }),
    )
    cab.position.set(0, g.pit * s + g.cabH * s / 2, 0)
    cab.userData.id = 'cab'
    group.add(cab)

    group.scale.set(extruded ? 1 : 0.01, extruded ? 1 : 0.01, extruded ? 1 : 1)
  }

  function redrawSvg() {
    if (!svgHost || !geometry) return
    svgHost.innerHTML = renderLayoutPlanSvg(geometry, highlightId)
    svgHost.querySelectorAll('[data-id]').forEach((el) => {
      el.addEventListener('pointerenter', () => {
        highlightId = el.getAttribute('data-id')
        redrawSvg()
        flashMesh(highlightId)
      })
    })
  }

  function flashMesh(id: string | null) {
    if (!group) return
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.id === id) {
        gsap.fromTo(obj.scale, { x: 1.05 }, { x: 1, duration: 0.5, ease: 'power3.out' })
      }
    })
  }

  function loop() {
    raf = requestAnimationFrame(loop)
    controls?.update()
    renderer?.render(scene, camera)
  }

  return {
    mount(host) {
      root = host
      root.innerHTML = `
        <div class="split-view">
          <div class="svg-wrap" data-testid="scene1-plan"></div>
          <div class="canvas-wrap" data-testid="scene1-canvas"><div class="tooltip"></div></div>
        </div>
        <p class="caption">Federal Planning Guide — Layout Type A. Click plan elements to highlight matching 3D parts. Schematic rails/cylinder geometry is illustrative where not dimensioned.</p>
      `
      svgHost = root.querySelector('.svg-wrap')!
      canvasHost = root.querySelector('.canvas-wrap')!

      scene = new THREE.Scene()
      scene.background = new THREE.Color(0x0a1628)
      camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100)
      camera.position.set(2.2, 1.6, 2.4)
      renderer = new THREE.WebGLRenderer({ antialias: true })
      canvasHost.appendChild(renderer.domElement)
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      group = new THREE.Group()
      scene.add(group)
      const light = new THREE.DirectionalLight(0xffffff, 0.6)
      light.position.set(2, 4, 3)
      scene.add(light)
      scene.fog = new THREE.Fog(0x0a1628, 3, 12)
      scene.add(new THREE.AmbientLight(0x38d6ff, 0.3))
      scene.add(new THREE.HemisphereLight(0x38d6ff, 0x0a1628, 0.45))
      const fill = new THREE.DirectionalLight(0xff8a3d, 0.25)
      fill.position.set(-2, 1, -1)
      scene.add(fill)

      const resize = () => {
        const { clientWidth, clientHeight } = canvasHost
        renderer.setSize(clientWidth, clientHeight)
        camera.aspect = clientWidth / clientHeight
        camera.updateProjectionMatrix()
      }
      resize()
      window.addEventListener('resize', resize)
      loop()
    },
    setConfig(row, travelMm) {
      geometry = buildLayoutGeometry(row, travelMm)
      redrawSvg()
      build3D(geometry)
    },
    morphTo3d() {
      extruded = true
      gsap.to(group.scale, { x: 1, y: 1, z: 1, duration: 1.4, ease: 'expo.inOut' })
      gsap.to(camera.position, { x: 1.8, y: 2.2, z: 2.8, duration: 1.2, ease: 'power3.inOut' })
    },
    dispose() {
      cancelAnimationFrame(raf)
      renderer?.dispose()
    },
  }
}
