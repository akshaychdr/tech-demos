import * as THREE from 'three'

export type ShadeRole = 'veil' | 'outline' | 'bone' | 'muscle' | 'brain' | 'hand'

const XRAY: Record<ShadeRole, string> = {
  veil: '#070b14',
  outline: '#8ec8ff',
  bone: '#c9e7ff',
  muscle: '#ff5c50',
  brain: '#ff9ebe',
  hand: '#d9f3ff',
}

const SOLID: Record<ShadeRole, string> = {
  veil: '#070b14',
  outline: '#8ec8ff',
  bone: '#e7e1d6',
  muscle: '#c4473c',
  brain: '#e5a8b6',
  hand: '#efe6d8',
}

const VERT = `
uniform mat4 uHead;
uniform float uOrtho;
varying vec3 vNormalView;
varying vec3 vTowardEye;
varying vec3 vHeadPos;
void main() {
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vHeadPos = (uHead * vec4(position, 1.0)).xyz;
  vNormalView = normalize(mat3(modelViewMatrix) * normal);
  vTowardEye = uOrtho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-viewPos.xyz);
  gl_Position = projectionMatrix * viewPos;
}
`

const FRAG = `
uniform vec3 uTint;
uniform vec3 uWarm;
uniform float uGain;
uniform float uFill;
uniform float uCover;
uniform float uBoost;
uniform float uMode;
uniform float uClip;
uniform vec4 uPlane;
uniform float uSoft;
uniform float uSilhouette;
uniform float uNeck;
uniform float uNeck0;
uniform float uNeck1;
varying vec3 vNormalView;
varying vec3 vTowardEye;
varying vec3 vHeadPos;

void main() {
  vec3 normal = normalize(vNormalView);
  vec3 eye = normalize(vTowardEye);
  float facing = clamp(abs(dot(normal, eye)), 0.0, 1.0);
  float rim = pow(1.0 - facing, 2.15);

  float keep = 1.0;
  if (uClip > 0.5) {
    float side = dot(uPlane.xyz, vHeadPos) - uPlane.w;
    if (side < 0.0) discard;
    keep *= smoothstep(0.0, max(uSoft, 0.001), side);
  }
  if (uNeck > 0.5) keep *= smoothstep(uNeck0, uNeck1, vHeadPos.y);
  float edge = smoothstep(0.0, max(uSilhouette, 0.001), facing);
  keep *= edge;

  vec3 tint = mix(uTint, vec3(1.0), 0.42 * uBoost);
  if (uMode > 1.5) {
    float veilAlpha = uCover * keep;
    gl_FragColor = vec4(uTint * veilAlpha, veilAlpha);
    return;
  }
  if (uMode > 0.5) {
    float light = dot(normal, normalize(vec3(0.22, 0.62, 0.75)));
    float wrapped = clamp(light * 0.65 + 0.38, 0.0, 1.0);
    vec3 color = uWarm * wrapped + tint * rim * 0.28;
    float solidAlpha = uCover * keep * (0.45 + 0.55 * uGain);
    gl_FragColor = vec4(color * solidAlpha, solidAlpha);
    return;
  }
  float glow = (uFill + (1.0 - uFill) * rim) * uGain * (1.0 + 1.7 * uBoost);
  float lightAmount = glow * keep;
  gl_FragColor = vec4(tint * lightAmount, lightAmount);
}
`

export type XrayMaterial = THREE.ShaderMaterial & { userData: { role: ShadeRole; lookReady?: boolean } }

export function createShadeMaterial(role: ShadeRole): XrayMaterial {
  const veil = role === 'veil'
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHead: { value: new THREE.Matrix4() },
      uOrtho: { value: role === 'hand' ? 1 : 0 },
      uTint: { value: new THREE.Color(XRAY[role]) },
      uWarm: { value: new THREE.Color(SOLID[role]) },
      uGain: { value: 1 },
      uFill: { value: role === 'muscle' ? 0.34 : role === 'brain' ? 0.22 : 0.08 },
      uCover: { value: veil ? 0.68 : 0.92 },
      uBoost: { value: 0 },
      uMode: { value: veil ? 2 : 0 },
      uClip: { value: 0 },
      uPlane: { value: new THREE.Vector4(1, 0, 0, 0) },
      uSoft: { value: 1.2 },
      uSilhouette: { value: role === 'outline' ? 0.55 : 0.18 },
      uNeck: { value: role === 'veil' || role === 'outline' ? 1 : 0 },
      uNeck0: { value: -8.4 },
      uNeck1: { value: -4.6 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: veil ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: veil ? THREE.OneMinusSrcAlphaFactor : THREE.OneFactor,
    toneMapped: false,
    premultipliedAlpha: true,
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
  if (previous === mode && material.userData.lookReady) return
  material.userData.lookReady = true
  const additive = mode === 0
  material.blending = THREE.CustomBlending
  material.blendSrc = THREE.OneFactor
  material.blendDst = additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor
  material.blendSrcAlpha = THREE.OneFactor
  material.blendDstAlpha = additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor
  const filled = solid && !veil && role !== 'outline'
  material.depthTest = filled
  material.depthWrite = filled
  material.needsUpdate = true
}
