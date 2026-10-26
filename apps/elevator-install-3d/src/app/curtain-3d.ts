import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import gsap from 'gsap'

export type CurtainStep = 0 | 1 | 2 | 3 | 4 | 5

const DIMS = { top: 225, mid: 953, bot: 248 }

export function mountCurtain3D(host: HTMLElement) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0f2240)
  scene.fog = new THREE.Fog(0x0f2240, 6, 18)

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50)
  camera.position.set(2.2, 1.8, 2.6)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  host.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.target.set(0, 0.6, 0)

  scene.add(new THREE.AmbientLight(0xffffff, 0.75))
  scene.add(new THREE.HemisphereLight(0xaeefff, 0x1a2840, 0.85))
  const key = new THREE.DirectionalLight(0xffffff, 1.35)
  key.position.set(3, 5, 2)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xff8a3d, 0.65)
  rim.position.set(-2, 2, -3)
  scene.add(rim)

  const root = new THREE.Group()
  scene.add(root)

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.06, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x1a3a5c, metalness: 0.2, roughness: 0.7 }),
  )
  platform.position.y = 0.03
  root.add(platform)

  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 1.1, 1.15),
    new THREE.MeshStandardMaterial({ color: 0x38d6ff, transparent: true, opacity: 0.15, metalness: 0.1, roughness: 0.5 }),
  )
  cab.position.set(0, 0.6, 0)
  root.add(cab)
  root.add(new THREE.LineSegments(new THREE.EdgesGeometry(cab.geometry), new THREE.LineBasicMaterial({ color: 0x38d6ff })))

  const wallControl = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 1.4, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x12284a, roughness: 0.9 }),
  )
  wallControl.position.set(-0.65, 0.75, 0)
  root.add(wallControl)

  const wallSide = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.4, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x12284a, roughness: 0.9 }),
  )
  wallSide.position.set(0, 0.75, -0.78)
  root.add(wallSide)

  function bracket(): THREE.Group {
    const g = new THREE.Group()
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.032, 0.025), new THREE.MeshStandardMaterial({ color: 0xff8a3d, metalness: 0.6, roughness: 0.35 }))
    const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.032, 0.051), new THREE.MeshStandardMaterial({ color: 0xff8a3d, metalness: 0.6, roughness: 0.35 }))
    leg2.position.set(0.05, 0, 0.025)
    g.add(leg1, leg2)
    return g
  }

  const brackets: THREE.Group[] = []
  const y0 = 0.25
  const scaleY = 0.0011
  const ys = [y0, y0 + DIMS.top * scaleY, y0 + (DIMS.top + DIMS.mid) * scaleY]
  ys.forEach((y, i) => {
    const b = bracket()
    b.position.set(-0.58, y, 0.2 - i * 0.05)
    b.userData.home = b.position.clone()
    b.userData.explode = new THREE.Vector3(-0.3 - i * 0.15, 0.4 + i * 0.1, 0.5)
    root.add(b)
    brackets.push(b)
  })

  const screws: THREE.Mesh[] = []
  brackets.forEach((b) => {
    const s = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.04, 8),
      new THREE.MeshStandardMaterial({ color: 0xc0d0e8, metalness: 0.9, roughness: 0.2 }),
    )
    s.rotation.x = Math.PI / 2
    s.position.copy(b.position).add(new THREE.Vector3(0.04, 0.02, 0))
    s.userData.home = s.position.clone()
    s.userData.explode = s.position.clone().add(new THREE.Vector3(0.2, 0.3, 0.4))
    root.add(s)
    screws.push(s)
  })

  const curtainControl = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 1.1, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x38d6ff, emissive: 0x114455, roughness: 0.4 }),
  )
  curtainControl.position.set(-0.6, 0.7, 0.35)
  curtainControl.userData.home = curtainControl.position.clone()
  curtainControl.userData.explode = new THREE.Vector3(-0.35, 0.9, 0.8)
  root.add(curtainControl)

  const curtainSide = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 1.1, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x38d6ff, emissive: 0x114455, roughness: 0.4 }),
  )
  curtainSide.position.set(0.1, 0.7, -0.74)
  curtainSide.userData.home = curtainSide.position.clone()
  curtainSide.userData.explode = new THREE.Vector3(0.5, 0.95, -0.2)
  root.add(curtainSide)

  const irBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.08, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x2a4a6a, metalness: 0.3, roughness: 0.5 }),
  )
  irBox.position.set(0, 1.18, 0)
  irBox.userData.home = irBox.position.clone()
  irBox.userData.explode = new THREE.Vector3(0.4, 1.5, 0.5)
  root.add(irBox)

  const beams: THREE.Line[] = []
  for (let i = 0; i < 5; i++) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.5, 0.5 + i * 0.08, 0.5), new THREE.Vector3(0.5, 0.5 + i * 0.08, 0.5)])
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x38d6ff, transparent: true, opacity: 0 }))
    root.add(line)
    beams.push(line)
  }

  function resize() {
    const { clientWidth, clientHeight } = host
    renderer.setSize(clientWidth, clientHeight)
    camera.aspect = clientWidth / clientHeight
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  let raf = 0
  const tick = () => {
    raf = requestAnimationFrame(tick)
    controls.update()
    renderer.render(scene, camera)
  }
  tick()

  function setExplode(amount: number) {
    const move = (obj: THREE.Object3D) => {
      const home = obj.userData.home as THREE.Vector3
      const explode = obj.userData.explode as THREE.Vector3
      if (!home || !explode) return
      obj.position.lerpVectors(explode, home, 1 - amount)
    }
    brackets.forEach(move)
    screws.forEach(move)
    move(curtainControl)
    move(curtainSide)
    move(irBox)
  }

  function applyStep(step: CurtainStep, explode = 0) {
    const vis = (m: THREE.Object3D, v: boolean) => {
      m.visible = v
    }
    brackets.forEach((b) => vis(b, step >= 0))
    screws.forEach((s) => vis(s, step >= 1))
    vis(curtainControl, step >= 2)
    vis(curtainSide, step >= 3)
    vis(irBox, step >= 4)
    beams.forEach((b) => {
      ;(b.material as THREE.LineBasicMaterial).opacity = step >= 5 ? 0.85 : 0
    })
    setExplode(explode)
    gsap.to(camera.position, {
      x: 2 + step * 0.05,
      y: 1.6 + step * 0.03,
      z: 2.4 - step * 0.04,
      duration: 0.8,
      ease: 'power3.out',
    })
  }

  return {
    applyStep,
    setExplode,
    dispose() {
      cancelAnimationFrame(raf)
      renderer.dispose()
    },
  }
}
