import * as THREE from 'three'

export type ShadeRole = 'veil' | 'outline' | 'bone' | 'muscle' | 'brain' | 'hindbrain' | 'hand' | 'eye'

const XRAY: Record<ShadeRole, string> = {
  veil: '#04070d',
  outline: '#9ec8ff',
  bone: '#f7fbff',
  muscle: '#f3c0c8',
  brain: '#f6c9d6',
  hindbrain: '#f0c6be',
  hand: '#e7f4ff',
  eye: '#d7e6f4',
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
uniform float uPower;
uniform float uKind;
uniform float uCover;
uniform float uBoost;
uniform float uMode;
uniform float uClip;
uniform vec4 uPlane;
uniform float uSoft;
uniform float uSilhouette;
uniform float uFeather;
uniform float uFade;
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

void main() {
  vec3 normal = normalize(vNormalView);
  vec3 eye = normalize(vTowardEye);
  float facing = clamp(abs(dot(normal, eye)), 0.0, 1.0);
  float rim = pow(1.0 - facing, max(uPower, 0.5));

  float keep = 1.0;
  if (uClip > 0.5) {
    float side = dot(uPlane.xyz, vHeadPos) - uPlane.w;
    keep *= smoothstep(0.0, max(uSoft, 0.001), side);
  }
  float ndv = facing;
  float soft = 1.0;
  if (uFeather > 0.001) soft *= smoothstep(0.0, uFeather, ndv);
  float fade = uFade > 0.5 ? smoothstep(-12.4, -9.2, vHeadPos.y) : 1.0;
  keep *= soft * fade;

  vec2 ndc = vClip.xy / max(abs(vClip.w), 1e-4);
  vec2 pixel = vec2((ndc.x + 1.0) * 0.5 * uView.x, (1.0 - ndc.y) * 0.5 * uView.y);
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
    float pupil = smoothstep(0.4, 0.82, facing);
    tint = mix(tint, vec3(0.55, 0.62, 0.7), pupil * 0.35);
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
  float grazing = 1.0 - facing;
  float glow;
  if (uKind < 0.5) {
    // Crisp white bone line. The face stays clear.
    glow = pow(grazing, 5.4);
    tint = mix(tint, vec3(1.0), 0.55);
  } else if (uKind < 1.5) {
    // Soft fresnel. uSilhouette is the edge feather (about 0.17).
    // Blue only on the rim that sits down by the jaw and the neck.
    float width = clamp(uSilhouette, 0.04, 0.95);
    float power = mix(6.2, 1.7, width);
    glow = pow(grazing, power);
    float low = 1.0 - smoothstep(-9.2, -4.5, vHeadPos.y);
    tint = mix(vec3(0.94, 0.97, 1.0), vec3(0.62, 0.78, 1.0), low * 0.65);
    glow *= mix(0.35, 0.7, low);
  } else if (uKind < 2.5) {
    glow = 0.1 + 0.34 * pow(grazing, 1.15);
  } else if (uKind < 4.5) {
    glow = 0.08 + 0.3 * pow(grazing, 1.25);
  } else if (uKind < 5.5) {
    glow = 0.03 + 0.28 * pow(grazing, 2.6);
  } else {
    glow = uFill + (1.0 - uFill) * rim;
  }
  glow *= uGain * (1.0 + 1.35 * uBoost);
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
      uFill: {
        value:
          role === 'outline'
            ? 0
            : role === 'bone'
              ? 0.02
              : role === 'eye'
                ? 0.04
                : role === 'muscle'
                  ? 0.1
                  : role === 'brain' || role === 'hindbrain'
                    ? 0.1
                    : 0.04,
      },
      uPower: {
        value: role === 'outline' ? 3.8 : role === 'bone' ? 3.2 : role === 'eye' ? 2.6 : 2.15,
      },
      uKind: {
        value:
          role === 'bone'
            ? 0
            : role === 'outline'
              ? 1
              : role === 'muscle'
                ? 2
                : role === 'brain'
                  ? 3
                  : role === 'hindbrain'
                    ? 4
                    : role === 'eye'
                      ? 5
                      : role === 'hand'
                        ? 6
                        : 7,
      },
      uCover: { value: veil ? 0.55 : 0.92 },
      uBoost: { value: 0 },
      uMode: { value: veil ? 2 : 0 },
      uClip: { value: 0 },
      uPlane: { value: new THREE.Vector4(1, 0, 0, 0) },
      uSoft: { value: 1.2 },
      uSilhouette: { value: role === 'outline' ? 0.17 : 0.08 },
      uFeather: { value: 0.15 },
      uFade: { value: role === 'hand' ? 0 : 1 },
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
