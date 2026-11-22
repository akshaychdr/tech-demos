import * as THREE from 'three'

export type ShadeRole = 'veil' | 'outline' | 'bone' | 'muscle' | 'brain' | 'hindbrain' | 'hand' | 'eye'

const XRAY: Record<ShadeRole, string> = {
  veil: '#04070d',
  outline: '#6fb6ff',
  bone: '#bfe3ff',
  muscle: '#ff6b5e',
  brain: '#ff9fc0',
  hindbrain: '#ffc37a',
  hand: '#d9f3ff',
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
uniform float uFiber;
uniform float uStrap;
uniform float uEye;
uniform float uOrbitOn;
uniform vec4 uOrbit0;
uniform vec4 uOrbit1;
uniform vec2 uView;
uniform float uLensOn;
uniform vec3 uLens;
uniform float uLensSoft;
uniform vec2 uOval[36];
uniform float uOvalCount;
uniform float uOvalSoft;
uniform vec3 uCrown;
varying vec3 vNormalView;
varying vec3 vTowardEye;
varying vec3 vHeadPos;
varying vec2 vUv;
varying vec4 vClip;

float socketMask(vec3 p, vec4 orbit) {
  float radius = max(orbit.w, 0.2);
  float radial = length(p.xy - orbit.xy);
  float inside = 1.0 - smoothstep(radius * 0.18, radius * 0.96, radial);
  float depth = smoothstep(-0.2, 1.15, orbit.z - p.z);
  return 1.0 - 0.94 * inside * depth;
}

float faceFade(vec2 pixel) {
  int count = int(uOvalCount + 0.5);
  if (count < 3) return 1.0;
  float dist = 1e4;
  bool inside = false;
  for (int i = 0; i < 36; i++) {
    if (i >= count) break;
    int j = i + 1;
    if (j >= count) j = 0;
    vec2 a = uOval[i];
    vec2 b = uOval[j];
    vec2 edge = b - a;
    float along = clamp(dot(pixel - a, edge) / max(dot(edge, edge), 1e-4), 0.0, 1.0);
    dist = min(dist, length(pixel - a - edge * along));
    bool straddles = (a.y > pixel.y) != (b.y > pixel.y);
    if (straddles) {
      float x = a.x + edge.x * (pixel.y - a.y) / edge.y;
      if (pixel.x < x) inside = !inside;
    }
  }
  float signedDist = inside ? -dist : dist;
  float fade = 1.0 - smoothstep(-uOvalSoft, uOvalSoft * 0.2, signedDist);
  // Keep the cranium above the hairline. The oval only feathers the cheeks and jaw.
  if (pixel.y < uCrown.x && abs(pixel.x - uCrown.y) < uCrown.z) fade = 1.0;
  return fade;
}

void main() {
  vec3 normal = normalize(vNormalView);
  vec3 eye = normalize(vTowardEye);
  float facing = clamp(abs(dot(normal, eye)), 0.0, 1.0);
  float rim = pow(1.0 - facing, 2.1);

  float keep = 1.0;
  if (uClip > 0.5) {
    float side = dot(uPlane.xyz, vHeadPos) - uPlane.w;
    if (side < 0.0) discard;
    keep *= smoothstep(0.0, max(uSoft, 0.001), side);
  }
  if (uNeck > 0.5) keep *= smoothstep(uNeck0, uNeck1, vHeadPos.y);
  float edge = smoothstep(0.0, max(uSilhouette, 0.001), facing);
  keep *= edge;

  vec2 ndc = vClip.xy / max(abs(vClip.w), 1e-4);
  vec2 pixel = vec2((ndc.x + 1.0) * 0.5 * uView.x, (1.0 - ndc.y) * 0.5 * uView.y);
  keep *= faceFade(pixel);
  if (uLensOn > 0.5) {
    float lensDist = length(pixel - uLens.xy) - uLens.z;
    keep *= 1.0 - smoothstep(-uLensSoft, uLensSoft * 0.22, lensDist);
  }

  float socket = 1.0;
  if (uOrbitOn > 0.5 && uEye < 0.5 && uFiber < 0.5) {
    socket *= socketMask(vHeadPos, uOrbit0);
    socket *= socketMask(vHeadPos, uOrbit1);
  }

  float fiber = 1.0;
  if (uFiber > 0.5) {
    float stripe = 0.78 + 0.22 * sin(vUv.y * 54.0 + vUv.x * 2.0);
    float across = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
    float ends = uStrap > 0.5 ? smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x) : 1.0;
    fiber = mix(0.62, 1.0, stripe * across * ends);
  }

  vec3 tint = mix(uTint, vec3(1.0), 0.42 * uBoost);
  if (uEye > 0.5) {
    float pupil = smoothstep(0.58, 0.22, facing);
    tint = mix(tint, vec3(0.04, 0.07, 0.1), pupil);
  }
  if (uMode > 1.5) {
    float veilAlpha = uCover * keep;
    gl_FragColor = vec4(uTint * veilAlpha, veilAlpha);
    return;
  }
  if (uMode > 0.5) {
    float light = dot(normal, normalize(vec3(0.22, 0.62, 0.75)));
    float wrapped = clamp(light * 0.65 + 0.38, 0.0, 1.0);
    vec3 color = (uWarm * wrapped + tint * rim * 0.28) * socket * fiber;
    float solidAlpha = uCover * keep * (0.45 + 0.55 * uGain);
    gl_FragColor = vec4(color * solidAlpha, solidAlpha);
    return;
  }
  float glow = (0.035 + 0.95 * rim) * uGain * (1.0 + 1.35 * uBoost);
  float lightAmount = glow * keep * socket * fiber;
  gl_FragColor = vec4(tint * lightAmount, lightAmount);
}
`

export type XrayMaterial = THREE.ShaderMaterial & { userData: { role: ShadeRole; lookReady?: boolean } }

function ovalUniform(): THREE.IUniform<THREE.Vector2[]> {
  return { value: Array.from({ length: 36 }, () => new THREE.Vector2()) }
}

export function createShadeMaterial(role: ShadeRole): XrayMaterial {
  const veil = role === 'veil'
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHead: { value: new THREE.Matrix4() },
      uOrtho: { value: role === 'hand' ? 1 : 0 },
      uAction: { value: 0 },
      uTint: { value: new THREE.Color(XRAY[role]) },
      uWarm: { value: new THREE.Color(SOLID[role]) },
      uGain: { value: 1 },
      uFill: { value: role === 'muscle' ? 0.72 : role === 'brain' || role === 'hindbrain' ? 0.22 : role === 'eye' ? 0.2 : 0.05 },
      uCover: { value: veil ? 0.55 : 0.92 },
      uBoost: { value: 0 },
      uMode: { value: veil ? 2 : 0 },
      uClip: { value: 0 },
      uPlane: { value: new THREE.Vector4(1, 0, 0, 0) },
      uSoft: { value: 1.2 },
      uSilhouette: { value: role === 'outline' ? 0.55 : 0.18 },
      uNeck: { value: role === 'veil' || role === 'outline' ? 1 : 0 },
      uNeck0: { value: -8.4 },
      uNeck1: { value: -4.6 },
      uFiber: { value: 0 },
      uStrap: { value: 1 },
      uEye: { value: role === 'eye' ? 1 : 0 },
      uOrbitOn: { value: 0 },
      uOrbit0: { value: new THREE.Vector4() },
      uOrbit1: { value: new THREE.Vector4() },
      uView: { value: new THREE.Vector2(1, 1) },
      uLensOn: { value: 0 },
      uLens: { value: new THREE.Vector3() },
      uLensSoft: { value: 28 },
      uOvalCount: { value: 0 },
      uOvalSoft: { value: 18 },
      uCrown: { value: new THREE.Vector3(0, 0, 1e6) },
      uOval: ovalUniform(),
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
