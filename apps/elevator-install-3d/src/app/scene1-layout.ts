import * as THREE from 'three'
import gsap from 'gsap'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildLayoutGeometry, type LayoutGeometry } from '../model/geometry'
import type { TypeARow } from '../model/typeA'
import { renderLayoutPlanSvg } from '../svg/layout-plan'
import { buildLayout3D, setHighlight, type Layout3DParts } from './layout-3d'

export type LayoutViewMode = '2d' | 'split' | '3d'

export type Scene1Api = {
  mount: (root: HTMLElement) => void
  setConfig: (row: TypeARow, travelMm: number) => void
  setViewMode: (mode: LayoutViewMode) => void
  morphTo3d: () => void
  dispose: () => void
}

export function createScene1(): Scene1Api {
  let root: HTMLElement
  let layoutShell: HTMLElement
  let svgHost: HTMLElement
  let canvasHost: HTMLElement
  let geometry: LayoutGeometry
  let highlightId: string | null = null
  let viewMode: LayoutViewMode = 'split'

  let renderer: THREE.WebGLRenderer
  let scene: THREE.Scene
  let camera: THREE.PerspectiveCamera
  let controls: OrbitControls
  let layout3d: Layout3DParts | null = null
  let raf = 0
  let raycaster = new THREE.Raycaster()
  let pointer = new THREE.Vector2()

  function applyViewMode() {
    layoutShell.classList.remove('layout-view--2d', 'layout-view--split', 'layout-view--3d')
    layoutShell.classList.add(`layout-view--${viewMode}`)
  }

  function rebuild3D(g: LayoutGeometry) {
    if (layout3d) {
      scene.remove(layout3d.group)
    }
    layout3d = buildLayout3D(g)
    scene.add(layout3d.group)
    layout3d.fitCamera(camera, controls)
  }

  function setHighlightId(id: string | null) {
    highlightId = id
    redrawSvg()
    if (layout3d) setHighlight(layout3d.meshesById, id)
  }

  function redrawSvg() {
    if (!svgHost || !geometry) return
    svgHost.innerHTML = renderLayoutPlanSvg(geometry, highlightId)
    svgHost.querySelectorAll('[data-part]').forEach((el) => {
      const part = el.getAttribute('data-part') ?? el.getAttribute('data-id')
      el.addEventListener('pointerenter', () => setHighlightId(part))
      el.addEventListener('pointerleave', () => setHighlightId(null))
    })
  }

  function onPointerMove(ev: PointerEvent) {
    if (!layout3d || viewMode === '2d') return
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(layout3d.group.children, true)
    const hit = hits.find((h) => h.object.userData.id)
    setHighlightId(hit?.object.userData.id ?? null)
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
        <div class="layout-toolbar">
          <span class="mono">View</span>
          <button type="button" data-view="2d">2D</button>
          <button type="button" data-view="split" class="active">Split</button>
          <button type="button" data-view="3d">3D</button>
        </div>
        <div class="layout-view layout-view--split" data-layout-shell>
          <div class="layout-panel layout-panel--plan svg-wrap" data-testid="scene1-plan"></div>
          <div class="layout-panel layout-panel--3d canvas-wrap" data-testid="scene1-canvas"></div>
        </div>
        <p class="caption">Hover a dimension or part in 2D or 3D to link highlights. Pit ${geometry?.pit ?? 203} mm · overhead ${geometry?.overhead ?? 2438} mm shown in extrude animation.</p>
      `
      layoutShell = root.querySelector('[data-layout-shell]')!
      svgHost = root.querySelector('.layout-panel--plan')!
      canvasHost = root.querySelector('.layout-panel--3d')!

      root.querySelectorAll('[data-view]').forEach((btn) => {
        btn.addEventListener('click', () => {
          viewMode = btn.getAttribute('data-view') as LayoutViewMode
          root.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b === btn))
          applyViewMode()
          if (layout3d) layout3d.fitCamera(camera, controls)
        })
      })

      scene = new THREE.Scene()
      scene.background = new THREE.Color(0x0a1628)
      camera = new THREE.PerspectiveCamera(42, 1, 0.05, 200)
      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      canvasHost.appendChild(renderer.domElement)
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true

      scene.add(new THREE.AmbientLight(0xffffff, 0.55))
      scene.add(new THREE.HemisphereLight(0x88ddff, 0x0a1628, 0.65))
      const key = new THREE.DirectionalLight(0xffffff, 1.1)
      key.position.set(4, 8, 5)
      scene.add(key)
      const fill = new THREE.DirectionalLight(0xff8a3d, 0.45)
      fill.position.set(-5, 3, -2)
      scene.add(fill)

      const resize = () => {
        const { clientWidth, clientHeight } = canvasHost
        if (clientWidth < 2) return
        renderer.setSize(clientWidth, clientHeight)
        camera.aspect = clientWidth / clientHeight
        camera.updateProjectionMatrix()
        if (layout3d) layout3d.fitCamera(camera, controls)
      }
      resizeObserver(canvasHost, resize)
      window.addEventListener('resize', resize)
      renderer.domElement.addEventListener('pointermove', onPointerMove)
      loop()
    },
    setConfig(row, travelMm) {
      geometry = buildLayoutGeometry(row, travelMm)
      rebuild3D(geometry)
      redrawSvg()
      const cap = root.querySelector('.caption')
      if (cap) {
        cap.textContent = `Hover to link 2D↔3D · Pit ${geometry.pit} mm · travel ${geometry.travel} mm · overhead ${geometry.overhead} mm`
      }
    },
    setViewMode(mode) {
      viewMode = mode
      applyViewMode()
      root.querySelectorAll('[data-view]').forEach((b) =>
        b.classList.toggle('active', b.getAttribute('data-view') === mode),
      )
      if (layout3d) layout3d.fitCamera(camera, controls)
    },
    morphTo3d() {
      if (!layout3d) return
      const g = layout3d.group
      const top = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
      layout3d.fitCamera(camera, controls)
      const iso = camera.position.clone()
      camera.position.set(top.x, top.y * 2.2, top.z)
      controls.target.y = geometry.pit * 0.001
      gsap.to(camera.position, { x: iso.x, y: iso.y, z: iso.z, duration: 2.2, ease: 'power3.inOut' })
      gsap.fromTo(
        g.scale,
        { x: 1, y: 0.02, z: 1 },
        { x: 1, y: 1, z: 1, duration: 2, ease: 'expo.out' },
      )
    },
    dispose() {
      cancelAnimationFrame(raf)
      renderer?.dispose()
    },
  }
}

function resizeObserver(el: HTMLElement, fn: () => void) {
  const ro = new ResizeObserver(() => fn())
  ro.observe(el)
}
