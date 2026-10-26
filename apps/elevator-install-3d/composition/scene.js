import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const DURATION = 90
const G = {
  hoistwayW: 1270,
  hoistwayD: 1360,
  platformW: 950,
  platformD: 1255,
  entrance: 730,
  rail: 660,
  pit: 203,
  overhead: 2438,
  travel: 3505,
  cabH: 2007,
}

function kineticCaption(text, el) {
  el.innerHTML = text.split(' ').map((w) => `<span class="word">${w}</span>`).join(' ')
  return gsap.to(el.querySelectorAll('.word'), {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    duration: 0.45,
    stagger: 0.04,
    ease: 'power3.out',
  })
}

function buildPlanSvg() {
  const s = 0.11
  const ox = 120
  const oy = 100
  const w = G.hoistwayW * s
  const d = G.hoistwayD * s
  const pw = G.platformW * s
  const pd = G.platformD * s
  const px = ox + ((G.hoistwayW - G.platformW) / 2) * s
  const py = oy + ((G.hoistwayD - G.platformD) / 2) * s
  const ex = ox + G.entrance * s
  const rx = ox + G.rail * s
  return `
    <rect class="plan-shape" x="${ox}" y="${oy}" width="${w}" height="${d}"/>
    <rect class="plan-shape" x="${px}" y="${py}" width="${pw}" height="${pd}" opacity="0.9"/>
    <line class="plan-shape" x1="${ex}" y1="${oy}" x2="${ex}" y2="${oy + d}"/>
    <line class="plan-shape" x1="${rx}" y1="${oy}" x2="${rx}" y2="${oy + d}"/>
    <line class="dim-line" x1="${ox}" y1="${oy - 30}" x2="${ox + w}" y2="${oy - 30}"/>
    <text x="${ox + w / 2}" y="${oy - 38}" text-anchor="middle" fill="#e6f1ff" font-family="IBM Plex Mono" font-size="16">${G.hoistwayW} mm</text>
    <line class="dim-line" x1="${ox - 30}" y1="${oy}" x2="${ox - 30}" y2="${oy + d}"/>
    <text x="${ox - 38}" y="${oy + d / 2}" text-anchor="middle" fill="#e6f1ff" font-family="IBM Plex Mono" font-size="16" transform="rotate(-90 ${ox - 38} ${oy + d / 2})">${G.hoistwayD} mm</text>
    <text x="${ox}" y="${oy + d + 48}" fill="#8ba4c7" font-family="IBM Plex Mono" font-size="14">Platform ${G.platformW}×${G.platformD} mm · E ℄ ${G.entrance} mm · R ℄ ${G.rail} mm</text>
  `
}

function initLayout3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setSize(1920, 1080)
  renderer.setPixelRatio(1)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a1628)
  scene.fog = new THREE.Fog(0x0a1628, 4, 14)
  const camera = new THREE.PerspectiveCamera(42, 1920 / 1080, 0.05, 50)
  camera.position.set(2.5, 2.2, 3.2)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.autoRotate = false
  controls.target.set(0, 1.2, 0)

  scene.add(new THREE.AmbientLight(0x38d6ff, 0.35))
  scene.add(new THREE.HemisphereLight(0x38d6ff, 0x0a1628, 0.5))
  const key = new THREE.DirectionalLight(0xffffff, 0.9)
  key.position.set(4, 6, 3)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xff8a3d, 0.35)
  rim.position.set(-3, 2, -2)
  scene.add(rim)

  const group = new THREE.Group()
  scene.add(group)
  const sc = 0.001
  const hw = G.hoistwayW * sc
  const hd = G.hoistwayD * sc
  const sh = (G.pit + G.travel + G.overhead) * sc
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x38d6ff, transparent: true, opacity: 0.14, roughness: 0.8, metalness: 0.15 })
  const edge = new THREE.LineBasicMaterial({ color: 0x38d6ff })
  const mk = (w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat)
    m.position.set(x, y, z)
    group.add(m, new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edge))
  }
  mk(hw, sh, 0.02, 0, sh / 2, -hd / 2)
  mk(hw, sh, 0.02, 0, sh / 2, hd / 2)
  mk(0.02, sh, hd, -hw / 2, sh / 2, 0)
  mk(0.02, sh, hd, hw / 2, sh / 2, 0)

  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(G.platformW * sc, 0.05, G.platformD * sc),
    new THREE.MeshStandardMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.45, roughness: 0.5 }),
  )
  plat.position.y = G.pit * sc
  group.add(plat)

  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, G.travel * sc, 0.07), wallMat)
  rail.position.set(-G.rail * sc + hw / 2, G.pit * sc + G.travel * sc / 2, 0)
  group.add(rail)

  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, G.travel * sc * 0.88, 20),
    new THREE.MeshStandardMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.35, roughness: 0.4 }),
  )
  cyl.position.set(hw / 2 - 0.14, G.pit * sc + G.travel * sc * 0.45, hd / 2 - 0.12)
  group.add(cyl)

  const cab = new THREE.Mesh(
    new THREE.BoxGeometry(G.platformW * sc * 0.92, G.cabH * sc, G.platformD * sc * 0.92),
    new THREE.MeshStandardMaterial({ color: 0x38d6ff, transparent: true, opacity: 0.18, roughness: 0.45 }),
  )
  cab.position.y = G.pit * sc + G.cabH * sc / 2
  group.add(cab, new THREE.LineSegments(new THREE.EdgesGeometry(cab.geometry), edge))

  group.scale.set(0.01, 0.01, 0.01)

  return { renderer, scene, camera, controls, group }
}

function initCurtain3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setSize(1920, 1080)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0a1628)
  scene.fog = new THREE.Fog(0x0a1628, 3, 9)
  const camera = new THREE.PerspectiveCamera(40, 1920 / 1080, 0.1, 40)
  camera.position.set(2.4, 1.9, 2.8)
  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, 0.7, 0)
  controls.enableDamping = true

  scene.add(new THREE.AmbientLight(0x38d6ff, 0.4))
  const key = new THREE.DirectionalLight(0xffffff, 0.85)
  key.position.set(3, 5, 2)
  scene.add(key)

  const root = new THREE.Group()
  scene.add(root)
  const parts = []

  const platform = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 1.55), new THREE.MeshStandardMaterial({ color: 0x1a3a5c }))
  platform.position.y = 0.035
  root.add(platform)

  const mkBracket = () => {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.028), new THREE.MeshStandardMaterial({ color: 0xff8a3d, metalness: 0.5 })))
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.035, 0.055), new THREE.MeshStandardMaterial({ color: 0xff8a3d, metalness: 0.5 }))
    leg.position.set(0.055, 0, 0.028)
    g.add(leg)
    return g
  }

  const ys = [0.28, 0.53, 1.58]
  ys.forEach((y, i) => {
    const b = mkBracket()
    b.position.set(-0.62, y, 0.15 - i * 0.08)
    b.userData.home = b.position.clone()
    b.userData.explode = new THREE.Vector3(-1.2 - i * 0.2, 0.5 + i * 0.15, 0.9)
    root.add(b)
    parts.push(b)
  })

  const curtainC = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x38d6ff, emissive: 0x0a3040 }))
  curtainC.position.set(-0.64, 0.85, 0.35)
  curtainC.userData.home = curtainC.position.clone()
  curtainC.userData.explode = new THREE.Vector3(-0.2, 1.2, 1.1)
  root.add(curtainC)
  parts.push(curtainC)

  const curtainS = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.2, 0.03), new THREE.MeshStandardMaterial({ color: 0x38d6ff, emissive: 0x0a3040 }))
  curtainS.position.set(0.05, 0.85, -0.82)
  curtainS.userData.home = curtainS.position.clone()
  curtainS.userData.explode = new THREE.Vector3(0.8, 1.1, -0.1)
  root.add(curtainS)
  parts.push(curtainS)

  const ir = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.09, 0.16), new THREE.MeshStandardMaterial({ color: 0x3a5a7a }))
  ir.position.set(0, 1.25, 0)
  ir.userData.home = ir.position.clone()
  ir.userData.explode = new THREE.Vector3(0.5, 1.6, 0.6)
  root.add(ir)
  parts.push(ir)

  return { renderer, scene, camera, controls, parts, root }
}

function wiringSvg(state, flow) {
  const on = state.main
  const aux = state.aux
  const pulse = (d) => (on ? `<path d="${d}" stroke="#ff8a3d" stroke-width="5" fill="none" stroke-dasharray="14 86" stroke-dashoffset="${-flow * 100}" opacity="0.85"/>` : '')
  return `<svg viewBox="0 0 1840 900" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#0a1628"/>
  <text x="24" y="36" fill="#ff8a3d" font-size="18" font-weight="600">Illustrative demo, not for installation</text>
  <g transform="translate(60,80)"><rect width="160" height="100" rx="8" fill="rgba(56,214,255,0.08)" stroke="#38d6ff"/><text x="14" y="30" fill="#e6f1ff" font-size="14" font-family="IBM Plex Mono">110V AUX · 15A</text><text x="14" y="52" fill="#8ba4c7" font-size="12">1 / N → controller</text></g>
  <g transform="translate(280,65)"><rect width="200" height="120" rx="8" fill="rgba(56,214,255,0.08)" stroke="#38d6ff"/><text x="14" y="28" fill="#e6f1ff" font-size="14">MAIN · L1 L2 L3</text><text x="14" y="50" fill="#8ba4c7" font-size="12">30A fuses each pole</text><rect x="14" y="68" width="72" height="26" rx="4" stroke="${aux && on ? '#3dff9a' : '#ff8a3d'}" fill="none"/><text x="18" y="86" font-size="11" fill="#8ba4c7">AUX NO 13-14</text></g>
  <g transform="translate(540,85)"><rect width="120" height="80" stroke="#38d6ff" fill="none"/><text x="10" y="28" fill="#e6f1ff" font-size="13">K1</text><text x="10" y="48" fill="#8ba4c7" font-size="11">1/3/5→2/4/6</text></g>
  <g transform="translate(700,85)"><rect width="120" height="80" stroke="#38d6ff" fill="none"/><text x="10" y="28" fill="#e6f1ff" font-size="13">K2</text></g>
  <g transform="translate(860,85)"><rect width="110" height="80" stroke="#38d6ff" fill="none"/><text x="10" y="28" fill="#e6f1ff" font-size="13">Overload</text></g>
  <circle cx="1100" cy="125" r="46" fill="rgba(255,138,61,0.1)" stroke="#38d6ff" stroke-width="2"/><text x="1088" y="132" fill="#e6f1ff" font-size="16">M</text>
  <path stroke="${aux ? '#ff8a3d' : '#2a5a7a'}" stroke-width="4" fill="none" d="M 220 130 L 280 130"/>
  <path stroke="${on ? '#ff8a3d' : '#2a5a7a'}" stroke-width="4" fill="none" d="M 480 110 L 540 110 L 700 110 L 860 110 L 1054 110"/>
  <path stroke="${on ? '#38d6ff' : '#2a5a7a'}" stroke-width="4" fill="none" d="M 480 130 L 1054 130"/>
  <path stroke="${on ? '#a78bfa' : '#2a5a7a'}" stroke-width="4" fill="none" d="M 480 150 L 1054 150"/>
  <path stroke="${on ? '#3dff9a' : '#2a5a7a'}" stroke-width="4" fill="none" d="M 380 200 L 620 200 L 620 280 L 140 280"/>
  <text x="380" y="222" fill="#3dff9a" font-size="13" font-family="IBM Plex Mono">10 AWG ground</text>
  ${pulse('M 480 110 L 1054 110')}
  ${pulse('M 480 130 L 1054 130')}
  <g transform="translate(60,320)">
    <text x="0" y="0" fill="#e6f1ff" font-size="16">Motor links (terminals TBD)</text>
    <rect x="0" y="20" width="240" height="140" stroke="#38d6ff" fill="none"/>
    <text x="12" y="48" fill="#8ba4c7" font-size="12">Δ — 3 vertical links</text>
    <line x1="40" y1="60" x2="40" y2="130" stroke="#ff8a3d" stroke-width="4"/>
    <line x1="100" y1="60" x2="100" y2="130" stroke="#ff8a3d" stroke-width="4"/>
    <line x1="160" y1="60" x2="160" y2="130" stroke="#ff8a3d" stroke-width="4"/>
  </g>
  <g transform="translate(340,320)">
    <rect x="0" y="20" width="240" height="140" stroke="#38d6ff" fill="none"/>
    <text x="12" y="48" fill="#8ba4c7" font-size="12">Y — bottom link</text>
    <line x1="30" y1="130" x2="200" y2="130" stroke="#ff8a3d" stroke-width="4"/>
  </g>
</svg>`
}

function init() {
  const planLayer = document.getElementById('layer-plan')
  const planSvg = document.getElementById('plan-svg')
  planSvg.innerHTML = buildPlanSvg()

  const layoutCanvas = document.getElementById('canvas-layout')
  const curtainCanvas = document.getElementById('canvas-curtain')
  layoutCanvas.style.opacity = '0'
  curtainCanvas.style.opacity = '0'

  const layout = initLayout3D(layoutCanvas)
  const curtain = initCurtain3D(curtainCanvas)
  const wiringLayer = document.getElementById('layer-wiring')
  const caption = document.getElementById('caption')
  let wireState = { aux: false, main: false }
  let flow = 0

  const renderLoop = () => {
    layout.controls.update()
    layout.renderer.render(layout.scene, layout.camera)
    curtain.controls.update()
    curtain.renderer.render(curtain.scene, curtain.camera)
    requestAnimationFrame(renderLoop)
  }
  renderLoop()

  const tl = gsap.timeline({ paused: true })

  // Title
  tl.set('#layer-title', { opacity: 1 }, 0)
  tl.add(kineticCaption('From Type A plan to install steps', caption), 0.2)
  tl.to('#layer-title', { opacity: 0, duration: 0.8, ease: 'power2.in' }, 3)

  // Plan draw-on
  tl.set(planLayer, { opacity: 1 }, 3.2)
  tl.to('.plan-shape', { strokeDashoffset: 0, duration: 2.2, stagger: 0.15, ease: 'power2.out' }, 3.3)
  tl.to('.dim-line', { strokeDashoffset: 0, duration: 1.4, stagger: 0.12, ease: 'power2.out' }, 4.2)
  tl.add(kineticCaption('1270 × 1360 mm hoistway — every dimension in millimetres', caption), 4.5)

  // Extrude 3D
  tl.to(planLayer, { opacity: 0, duration: 0.7 }, 8)
  tl.set(layoutCanvas, { opacity: 1 }, 8.2)
  tl.to(layout.group.scale, { x: 1, y: 1, z: 1, duration: 2, ease: 'expo.inOut' }, 8.3)
  tl.to(layout.camera.position, { x: 1.9, y: 2.4, z: 2.6, duration: 2.2, ease: 'power3.inOut' }, 8.5)
  tl.add(kineticCaption('Same numbers build the 3D shaft, rails, cylinder and cab', caption), 9)

  tl.to({}, {
    duration: 10,
    onUpdate() {
      const p = this.progress()
      layout.camera.position.x = 1.9 + Math.sin(p * Math.PI * 2) * 0.7
      layout.camera.position.z = 2.6 + Math.cos(p * Math.PI * 2) * 0.7
      layout.controls.target.y = 1.1 + p * 0.2
    },
  }, 10.5)

  // Curtain
  tl.to(layoutCanvas, { opacity: 0, duration: 0.6 }, 28)
  tl.set(curtainCanvas, { opacity: 1 }, 28.5)
  tl.add(kineticCaption('IR curtain — brackets A, screws B, dual curtains, controller on cab top', caption), 28.6)

  const explodeStep = (t, amount, cap) => {
    tl.to({}, {
      duration: 3.5,
      onStart: () => kineticCaption(cap, caption),
      onUpdate() {
        const p = this.progress()
        curtain.parts.forEach((part) => {
          if (!part.userData.home) return
          part.position.lerpVectors(part.userData.explode, part.userData.home, 1 - amount * (1 - p))
        })
      },
    }, t)
  }
  explodeStep(29, 0.9, '225 mm · 953 mm · 248 mm bracket spacing')
  explodeStep(33.5, 0.5, 'Control wall curtain mounts')
  explodeStep(38, 0.35, 'Side wall curtain and IR box')
  tl.to(curtain.camera.position, { y: 2.2, z: 2.2, duration: 4, ease: 'sine.inOut' }, 42)

  // Wiring
  tl.to(curtainCanvas, { opacity: 0, duration: 0.6 }, 52)
  tl.set(wiringLayer, { opacity: 1 }, 52.5)
  tl.add(kineticCaption('Close 110 V aux first — 15 A fused', caption), 52.6)
  tl.to({}, {
    duration: 4,
    onUpdate() {
      wireState.aux = this.progress() > 0.15
      flow = this.progress() * 3
      wiringLayer.innerHTML = wiringSvg(wireState, flow)
    },
  }, 53)
  tl.add(kineticCaption('Main on — L1 L2 L3 through K1, K2, overload to motor', caption), 57.2)
  tl.to({}, {
    duration: 8,
    onUpdate() {
      wireState = { aux: true, main: true }
      flow = this.progress() * 6 + 2
      wiringLayer.innerHTML = wiringSvg(wireState, flow)
    },
  }, 57.5)
  tl.to({}, {
    duration: 3,
    onUpdate() {
      wireState = { aux: true, main: false }
      flow = this.progress() * 2
      wiringLayer.innerHTML = wiringSvg(wireState, flow)
    },
  }, 66)
  tl.add(kineticCaption('Open main — auxiliary NO drops (illustrative)', caption), 66.2)

  // End
  tl.to(wiringLayer, { opacity: 0, duration: 0.8 }, 82)
  tl.set('#layer-title', { opacity: 1 }, 82.5)
  tl.call(() => {
    document.querySelector('#layer-title h1').textContent = 'Sources redrawn · not OEM copies'
  }, null, 82.5)
  tl.add(kineticCaption('Federal Planning Guide 2023 · Hydraulic Install Appendices 3 & 5', caption), 83)

  window.__timelines = window.__timelines || {}
  window.__timelines['elevator-install-3d'] = tl

  return tl
}

init()
