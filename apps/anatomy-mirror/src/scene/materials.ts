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
  hand: '#bfe3ff',
  eye: '#fff3a8',
}

const SOLID: Record<ShadeRole, string> = {
  veil: '#04070d',
  outline: '#6fb6ff',
  bone: '#e9e2cf',
  muscle: '#b5453c',
  brain: '#e2a39d',
  hindbrain: '#d6ad84',
  hand: '#efe6d8',
  eye: '#f4f4ee',
}

/**
 * Per-layer multiplier. Cranium, jaw, and the hands have no entry, so they use 1.
 * `heavy` is how many of skull, brain, and muscles are switched on.
 */
export const XRAY_GAIN: Partial<Record<ShadeRole, number>> = {
  outline: 0.55,
  muscle: 0.5,
  brain: 0.36,
  hindbrain: 0.6,
  eye: 0.9,
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
  vNormalView = normalize(mat3(modelViewMatrix) * normal);
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
varying vec3 vNormalView;
varying vec3 vTowardEye;
varying vec3 vHeadPos;
varying vec4 vClip;

void main() {
  vec3 n = normalize(vNormalView);
  vec3 v = normalize(vTowardEye);
  float ndv = abs(dot(n, v));
  float soft = uFeather > 0.001 ? smoothstep(0.0, uFeather, ndv) : 1.0;
  float fade = uFade > 0.5 ? smoothstep(-12.4, -9.2, vHeadPos.y) : 1.0;
  float keep = 1.0;
  if (uClip > 0.5) {
    float side = dot(uPlane.xyz, vHeadPos) - uPlane.w;
    keep *= smoothstep(0.0, max(uSoft, 0.001), side);
  }
  vec2 ndc = vClip.xy / max(abs(vClip.w), 1e-4);
  vec2 pixel = vec2((ndc.x + 1.0) * 0.5 * uView.x, (1.0 - ndc.y) * 0.5 * uView.y);
  if (uLensOn > 0.5) {
    float lensDist = length(pixel - uLens.xy) - uLens.z;
    keep *= 1.0 - smoothstep(-uLensSoft, uLensSoft * 0.22, lensDist);
  }
  if (uMode > 1.5) {
    float veilA = clamp(uOpacity * fade * soft * keep, 0.0, 1.0);
    gl_FragColor = vec4(uColor, veilA);
    return;
  }
  if (uMode > 0.5) {
    float light = clamp(dot(n, normalize(vec3(0.22, 0.72, 0.66))) * 0.5 + 0.55, 0.0, 1.0);
    vec3 color = mix(uColor, vec3(1.0), 0.22 * uPick) * light;
    float solidA = clamp(uOpacity * fade * soft * keep, 0.0, 1.0);
    gl_FragColor = vec4(color, solidA);
    return;
  }
  float rim = pow(1.0 - ndv, 2.1);
  float a = clamp((0.035 + 0.95 * rim) * uGain * uOpacity * fade, 0.0, 1.0);
  a *= soft;
  a *= keep;
  gl_FragColor = vec4(uColor, a);
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
      uFade: { value: role === 'hand' ? 0 : 1 },
      uView: { value: new THREE.Vector2(1, 1) },
      uLensOn: { value: 0 },
      uLens: { value: new THREE.Vector3() },
      uLensSoft: { value: 28 },
      uPick: { value: 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
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
  const veil = role === 'veil'
  const mode = veil ? 2 : solid ? 1 : 0
  const previous = material.uniforms.uMode!.value as number
  material.uniforms.uMode!.value = mode
  ;(material.uniforms.uColor!.value as THREE.Color).set(mode === 1 ? SOLID[role] : XRAY[role])
  if (previous === mode && material.userData.lookReady) return
  material.userData.lookReady = true
  material.premultipliedAlpha = false
  material.transparent = true
  material.toneMapped = false
  material.side = THREE.DoubleSide
  material.depthWrite = false
  if (mode === 0) {
    material.blending = THREE.AdditiveBlending
    material.depthTest = false
  } else if (mode === 2) {
    material.blending = THREE.NormalBlending
    material.depthTest = false
  } else {
    const filled = role !== 'outline'
    material.blending = filled ? THREE.NormalBlending : THREE.AdditiveBlending
    material.depthTest = filled
    material.depthWrite = filled
  }
  material.needsUpdate = true
}
