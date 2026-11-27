import * as THREE from 'three'

export type ShadeRole = 'veil' | 'outline' | 'bone' | 'muscle' | 'brain' | 'hindbrain' | 'hand' | 'eye'

/** His x-ray palette. Cranium and jaw share the bone color. */
const XRAY: Record<ShadeRole, string> = {
  veil: '#04070d',
  outline: '#6fb6ff',
  bone: '#bfe3ff',
  muscle: '#ff6b5e',
  brain: '#ff9fc0',
  hindbrain: '#ffc37a',
  hand: '#d9f0ff',
  eye: '#fff3a8',
}

const SOLID: Record<ShadeRole, string> = {
  veil: '#04070d',
  outline: '#6fb6ff',
  bone: '#e9e2cf',
  muscle: '#b5453c',
  brain: '#e2a39d',
  hindbrain: '#d6ad84',
  hand: '#e9e2cf',
  eye: '#f4f4ee',
}

/**
 * Per-layer multiplier. Cranium, jaw, and the hands have no entry, so they use 1.
 * `heavy` is how many of skull, brain, and muscles are switched on.
 */
export const XRAY_GAIN: Partial<Record<ShadeRole, number>> = {
  outline: 0.34,
  muscle: 0.5,
  brain: 0.36,
  hindbrain: 0.6,
  eye: 0.32,
}

export const RENDER_ORDER: Record<ShadeRole, number> = {
  veil: -10,
  outline: 1,
  muscle: 2,
  bone: 3,
  hand: 3,
  eye: 4,
  brain: 5,
  hindbrain: 5,
}

export function xrayShare(heavy: number): number {
  return 1 / (0.4 + 0.6 * Math.max(1, heavy))
}

/** `bright * XRAY_GAIN[role] * (outline ? 1 : share)`. Missing roles use gain 1. */
export function xrayLayerGain(role: ShadeRole, heavy: number, bright = 1): number {
  const factor = XRAY_GAIN[role] ?? 1
  const share = role === 'outline' ? 1 : xrayShare(heavy)
  return bright * factor * share
}

/** The dark veil is `1 - real`. A higher real (the old 0.75) leaves the face bright. */
export function veilOpacity(real: number): number {
  return 1 - real
}

/** Solid style brightens filled layers. The outline stays on the x-ray gain. */
export function solidLayerGain(bright: number): number {
  return Math.min(1.25, 0.6 + 0.4 * bright)
}

const VERT = `
attribute vec3 aMove;
uniform float uAction;
uniform mat4 uHead;
uniform float uOrtho;
varying vec3 vNormalView;
varying vec3 vTowardEye;
varying vec3 vHeadPos;
varying vec2 vUv;
varying vec4 vClip;
void main() {
  vec3 posed = position + aMove * uAction;
  vec4 viewPos = modelViewMatrix * vec4(posed, 1.0);
  vHeadPos = (uHead * vec4(posed, 1.0)).xyz;
  vNormalView = normalize(normalMatrix * normal);
  vTowardEye = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-viewPos.xyz);
  vUv = uv;
  vClip = projectionMatrix * viewPos;
  gl_Position = vClip;
}
`

const FRAG = `
uniform vec3 uColor;
uniform float uGain;
uniform float uOpacity;
uniform float uMode;
uniform float uClip;
uniform vec4 uPlane;
uniform float uSoft;
uniform float uFeather;
uniform float uFade;
uniform vec2 uView;
uniform float uLensOn;
uniform vec3 uLens;
uniform float uLensSoft;
uniform float uPick;
uniform float uRimPow;
varying vec3 vNormalView;
varying vec3 vTowardEye;
varying vec3 vHeadPos;
varying vec4 vClip;

void main() {
  vec3 n = normalize(vNormalView);
  vec3 v = normalize(vTowardEye);
  float ndv = abs(dot(n, v));
  float soft = 1.0;
  if (uClip > 0.5) {
    float dcut = dot(uPlane.xyz, vHeadPos) - uPlane.w;
    if (dcut < 0.0) discard;
    if (uSoft > 0.001) soft *= smoothstep(0.0, uSoft, dcut);
  }
  if (uFeather > 0.001) soft *= smoothstep(0.0, uFeather, ndv);
  float fade = uFade > 0.5 ? smoothstep(-12.4, -9.2, vHeadPos.y) : 1.0;
  float keep = 1.0;
  vec2 ndc = vClip.xy / max(abs(vClip.w), 1e-4);
  vec2 pixel = vec2((ndc.x + 1.0) * 0.5 * uView.x, (1.0 - ndc.y) * 0.5 * uView.y);
  if (uLensOn > 0.5) {
    float lensDist = length(pixel - uLens.xy) - uLens.z;
    keep *= 1.0 - smoothstep(-uLensSoft, uLensSoft * 0.22, lensDist);
  }
  if (uMode > 1.5) {
    gl_FragColor = vec4(uColor, uOpacity * fade * soft * keep);
    return;
  }
  if (uMode > 0.5) {
    vec3 fn = gl_FrontFacing ? n : -n;
    float d = max(dot(fn, normalize(vec3(0.35, 0.55, 0.76))), 0.0);
    float rim = pow(1.0 - ndv, 2.5);
    vec3 color = uColor * (0.28 + 0.78 * d) * uGain + vec3(0.25) * rim;
    color = mix(color, vec3(1.0), 0.15 * uPick);
    gl_FragColor = vec4(color, uOpacity * soft * keep);
    return;
  }
  float rim = pow(1.0 - ndv, uRimPow);
  float a = clamp((0.035 + 0.95 * rim) * uGain * uOpacity * fade, 0.0, 1.0);
  gl_FragColor = vec4(uColor, a * soft * keep);
}
`

export type XrayMaterial = THREE.ShaderMaterial & { userData: { role: ShadeRole; lookReady?: boolean } }

export function createShadeMaterial(role: ShadeRole): XrayMaterial {
  const veil = role === 'veil'
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHead: { value: new THREE.Matrix4() },
      uOrtho: { value: role === 'hand' ? 1 : 0 },
      uAction: { value: 0 },
      uColor: { value: new THREE.Color(XRAY[role]) },
      uGain: { value: 1 },
      uOpacity: { value: veil ? 0.88 : 1 },
      uMode: { value: veil ? 2 : 0 },
      uClip: { value: 0 },
      uPlane: { value: new THREE.Vector4(1, 0, 0, 0) },
      uSoft: { value: 1.2 },
      uFeather: { value: 0.15 },
      uFade: { value: role === 'veil' || role === 'outline' ? 1 : 0 },
      uView: { value: new THREE.Vector2(1, 1) },
      uLensOn: { value: 0 },
      uLens: { value: new THREE.Vector3() },
      uLensSoft: { value: 28 },
      uPick: { value: 0 },
      uRimPow: { value: role === 'eye' ? 6.0 : role === 'outline' ? 5.5 : 2.1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: veil ? THREE.FrontSide : THREE.DoubleSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: veil ? THREE.NormalBlending : THREE.AdditiveBlending,
    toneMapped: false,
    premultipliedAlpha: false,
  }) as XrayMaterial
  material.userData.role = role
  return material
}

export function applyLook(material: XrayMaterial, solid: boolean): void {
  const role = material.userData.role
  // The veil and the outline keep their own look in both styles.
  if (role === 'veil' || role === 'outline') return
  const mode = solid ? 1 : 0
  const previous = material.uniforms.uMode!.value as number
  material.uniforms.uMode!.value = mode
  ;(material.uniforms.uColor!.value as THREE.Color).set(mode === 1 ? SOLID[role] : XRAY[role])
  if (previous === mode && material.userData.lookReady) return
  material.userData.lookReady = true
  material.premultipliedAlpha = false
  material.transparent = true
  material.toneMapped = false
  material.side = THREE.DoubleSide
  if (mode === 0) {
    material.blending = THREE.AdditiveBlending
    material.depthTest = false
    material.depthWrite = false
  } else {
    material.blending = THREE.NormalBlending
    material.depthTest = true
    material.depthWrite = true
  }
  material.needsUpdate = true
}
