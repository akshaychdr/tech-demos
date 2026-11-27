import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { QUIZ_BONES } from '../src/domain/structures.ts'
import { classifyTouch, matchesBone } from '../src/domain/regions.ts'
import { activeMuscle, matchesMuscle, scoreMuscles } from '../src/domain/expressions.ts'
import { emptyHold, stepHold } from '../src/domain/hold.ts'
import { drawQuiz, pointsFor, startQuiz, answerQuestion, advanceQuiz } from '../src/domain/quiz.ts'
import { applySimilarity, umeyama, umeyama2 } from '../src/domain/fit.ts'
import { parseBeat, formatScore, shareMessage } from '../src/domain/share.ts'
import {
  clampScreenScale,
  solveFaceFit,
  solveOrbitFit,
  solveScreenFit,
  stepCanonicalFit,
  solveWeightedScreenFit,
} from '../src/domain/screenFit.ts'
import { HEAD_LABELS, LabelColumns, anchorFacingAmount, labelVisible } from '../src/domain/headLabels.ts'
import { OneEuroFilter } from '../src/domain/oneEuro.ts'
import { RENDER_ORDER, createShadeMaterial, solidLayerGain, veilOpacity, xrayLayerGain } from '../src/scene/materials.ts'
import { DEFAULT_LAYERS, FIT_STORAGE_KEY } from '../src/scene/AnatomyScene.ts'
import * as THREE from 'three'
import type { BlendshapeMap, BoneId, MuscleId, Vec3 } from '../src/domain/types.ts'

function loadFace(): Vec3[] {
  const text = readFileSync(new URL('./fixtures/canonical_face_model.obj', import.meta.url), 'utf8')
  const verts: Vec3[] = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('v ')) continue
    const [, x, y, z] = line.split(/\s+/)
    verts.push([Number(x), Number(y), Number(z)])
  }
  return verts
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function gaussian(rng: () => number): number {
  const u = Math.max(1e-9, rng())
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const QUIZ: BoneId[] = ['frontal', 'temporal', 'nasal', 'zygomatic', 'maxilla', 'mandible']

describe('touch prototype', () => {
  const face = loadFace()
  const iod = Math.hypot(face[33]![0] - face[263]![0], face[33]![1] - face[263]![1], face[33]![2] - face[263]![2])

  test('region accuracy on the canonical face with tracking wobble', () => {
    const rng = mulberry32(21)
    const sigma = 0.1 * iod
    const trials = 250
    const confusion: Record<string, Record<string, number>> = {}
    let freeHits = 0
    let quizHits = 0
    let total = 0
    for (const bone of QUIZ) {
      confusion[bone] = {}
      const anchors = face.filter((_, index) => {
        const hit = classifyTouch(face, face[index]!)
        return hit?.bone === bone
      })
      expect(anchors.length).toBeGreaterThan(3)
      for (let n = 0; n < trials; n += 1) {
        const base = anchors[Math.floor(rng() * anchors.length)]!
        const point: Vec3 = [
          base[0] + gaussian(rng) * sigma,
          base[1] + gaussian(rng) * sigma,
          base[2] + gaussian(rng) * sigma,
        ]
        const hit = classifyTouch(face, point)
        const label = hit?.bone ?? 'none'
        confusion[bone]![label] = (confusion[bone]![label] ?? 0) + 1
        if (label === bone) freeHits += 1
        if (matchesBone(face, point, bone)) quizHits += 1
        total += 1
      }
    }
    const free = freeHits / total
    const quiz = quizHits / total
    console.log(
      `PROTOTYPE_TOUCH ${JSON.stringify({ sigmaIod: 0.1, trialsPerBone: trials, freeAccuracy: Number(free.toFixed(4)), quizMarginAccuracy: Number(quiz.toFixed(4)), confusion })}`,
    )
    expect(free).toBeGreaterThanOrEqual(0.8)
    expect(quiz).toBeGreaterThanOrEqual(0.8)
  })

  test('top and back of the skull are touchable and not in the quiz pool', () => {
    const up: Vec3 = [
      face[10]![0] - face[152]![0],
      face[10]![1] - face[152]![1],
      face[10]![2] - face[152]![2],
    ]
    const length = Math.hypot(...up) || 1
    const parietal: Vec3 = [
      face[10]![0] + (up[0] / length) * iod * 0.62,
      face[10]![1] + (up[1] / length) * iod * 0.62,
      face[10]![2] + (up[2] / length) * iod * 0.62,
    ]
    expect(classifyTouch(face, parietal)?.bone).toBe('parietal')
    expect(QUIZ_BONES).not.toContain('parietal')
    expect(QUIZ_BONES).not.toContain('occipital')
  })
})

describe('expression prototype', () => {
  function sample(rng: () => number, low: number, high: number): number {
    return low + rng() * (high - low)
  }

  function noisy(rng: () => number, value: number): number {
    return Math.min(1, Math.max(0, value + gaussian(rng) * 0.05))
  }

  function pose(kind: MuscleId | 'neutral', rng: () => number): BlendshapeMap {
    const base: BlendshapeMap = {}
    const set = (name: string, low: number, high: number) => {
      base[name] = noisy(rng, sample(rng, low, high))
    }
    if (kind === 'frontalis') {
      set('browInnerUp', 0.55, 0.95)
      set('browOuterUpLeft', 0.5, 0.95)
      set('browOuterUpRight', 0.5, 0.95)
      set('browDownLeft', 0, 0.12)
      set('browDownRight', 0, 0.12)
    } else if (kind === 'corrugator') {
      set('browDownLeft', 0.55, 0.95)
      set('browDownRight', 0.55, 0.95)
      set('browInnerUp', 0, 0.1)
      set('browOuterUpLeft', 0, 0.1)
      set('browOuterUpRight', 0, 0.1)
    } else if (kind === 'orbicularis') {
      set('eyeSquintLeft', 0.6, 1)
      set('eyeSquintRight', 0.6, 1)
      set('eyeBlinkLeft', 0.65, 1)
      set('eyeBlinkRight', 0.65, 1)
      set('mouthSmileLeft', 0, 0.15)
      set('mouthSmileRight', 0, 0.15)
    } else if (kind === 'zygomaticus') {
      set('mouthSmileLeft', 0.55, 0.95)
      set('mouthSmileRight', 0.55, 0.95)
      set('cheekSquintLeft', 0.2, 0.55)
      set('cheekSquintRight', 0.2, 0.55)
      set('eyeSquintLeft', 0, 0.3)
      set('eyeSquintRight', 0, 0.3)
      set('jawOpen', 0.05, 0.25)
    } else if (kind === 'masseter') {
      set('jawOpen', 0, 0.08)
      set('mouthClose', 0.4, 0.85)
      set('mouthPressLeft', 0.3, 0.75)
      set('mouthPressRight', 0.3, 0.75)
      set('cheekSquintLeft', 0.1, 0.4)
      set('cheekSquintRight', 0.1, 0.4)
      set('mouthSmileLeft', 0, 0.18)
      set('mouthSmileRight', 0, 0.18)
    } else {
      set('eyeBlinkLeft', 0, 0.2)
      set('eyeBlinkRight', 0, 0.2)
      set('jawOpen', 0, 0.08)
    }
    return base
  }

  test('expression accuracy for clear holds', () => {
    const muscles: MuscleId[] = ['frontalis', 'corrugator', 'orbicularis', 'zygomaticus', 'masseter']
    const rng = mulberry32(7)
    const trials = 200
    let hits = 0
    let matchHits = 0
    const per: Record<string, number> = {}
    let neutralFalse = 0
    for (const muscle of muscles) {
      let ok = 0
      for (let n = 0; n < trials; n += 1) {
        const scored = scoreMuscles(pose(muscle, rng))
        const found = activeMuscle(scored)
        if (found === muscle) {
          hits += 1
          ok += 1
        }
        if (matchesMuscle(scored, muscle)) matchHits += 1
      }
      per[muscle] = ok / trials
    }
    for (let n = 0; n < trials; n += 1) {
      if (activeMuscle(scoreMuscles(pose('neutral', rng)))) neutralFalse += 1
    }
    const accuracy = hits / (muscles.length * trials)
    const matchAccuracy = matchHits / (muscles.length * trials)
    console.log(
      `PROTOTYPE_EXPRESSION ${JSON.stringify({ trialsPerMuscle: trials, activeAccuracy: Number(accuracy.toFixed(4)), targetMatchAccuracy: Number(matchAccuracy.toFixed(4)), perMuscle: per, neutralFalseRate: Number((neutralFalse / trials).toFixed(4)) })}`,
    )
    expect(accuracy).toBeGreaterThanOrEqual(0.9)
    expect(matchAccuracy).toBeGreaterThanOrEqual(0.9)
    expect(neutralFalse / trials).toBeLessThan(0.05)
  })
})

describe('hold, quiz, and share', () => {
  test('a one-second hold fires once and a short gap does not reset it', () => {
    let state = emptyHold()
    const point: Vec3 = [0, 0, 0]
    let ready = false
    for (let t = 0; t <= 1200; t += 33) {
      const step = stepHold(state, t === 400 ? null : 'frontal', point, t, {
        holdMs: 1000,
        gapMs: 150,
        stillRadius: 0.2,
      })
      state = step.state
      ready = ready || step.ready
    }
    expect(ready).toBe(true)
    const again = stepHold(state, 'frontal', point, 1100, { holdMs: 1000, gapMs: 150, stillRadius: 0.2 })
    expect(again.ready).toBe(false)
  })

  test('quiz is 3 touch and 2 show-me, scored out of 10', () => {
    const quiz = startQuiz(0, mulberry32(3))
    expect(quiz.questions.filter((q) => q.kind === 'touch')).toHaveLength(3)
    expect(quiz.questions.filter((q) => q.kind === 'show')).toHaveLength(2)
    expect(pointsFor(true, 0)).toBe(2)
    expect(pointsFor(true, 15_000)).toBe(1)
    expect(pointsFor(false, 0)).toBe(0)
    let state = quiz
    state = answerQuestion(state, true, 3_000)
    expect(state.score).toBeCloseTo(1 + 12_000 / 15_000, 5)
    state = advanceQuiz(state, 5_000)
    expect(state.phase).toBe('ask')
    expect(drawQuiz(mulberry32(3)).map((q) => q.id)).toEqual(quiz.questions.map((q) => q.id))
  })

  test('challenge links keep only a score', () => {
    expect(parseBeat('?beat=8')).toBe(8)
    expect(parseBeat('?beat=8.46')).toBe(8.5)
    expect(parseBeat('?beat=11')).toBeNull()
    expect(parseBeat('?beat=nope')).toBeNull()
    expect(formatScore(8)).toBe('8')
    expect(shareMessage(8, 2, 2, 'https://example.test/')).toContain('8/10')
  })

  test('similarity fit recovers a known transform', () => {
    const src: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
    ]
    const dst = src.map((p) => [p[0] * 2 + 3, p[1] * 2 - 1, p[2] * 2 + 4] as Vec3)
    const fit = umeyama(src, dst)
    for (let i = 0; i < src.length; i += 1) {
      const got = applySimilarity(src[i]!, fit)
      expect(got[0]).toBeCloseTo(dst[i]![0], 4)
      expect(got[1]).toBeCloseTo(dst[i]![1], 4)
      expect(got[2]).toBeCloseTo(dst[i]![2], 4)
    }
  })

  test('image-plane fit follows roll, scale, and shift', () => {
    const src: Vec3[] = [
      [0, 0, 1],
      [2, 0, 1.2],
      [0, 3, 0.4],
      [-1, 1, 0.8],
      [1, 2, 1.1],
    ]
    const scale = 12
    const cos = Math.cos(0.4)
    const sin = Math.sin(0.4)
    const tx = 40
    const ty = -15
    const tz = 8
    const dst = src.map(
      (p) =>
        [scale * (cos * p[0] - sin * p[1]) + tx, scale * (sin * p[0] + cos * p[1]) + ty, scale * p[2] + tz] as Vec3,
    )
    const fit = umeyama2(src, dst)
    expect(fit.scale).toBeCloseTo(scale, 3)
    for (let i = 0; i < src.length; i += 1) {
      const x = fit.scale * (fit.cos * src[i]![0] - fit.sin * src[i]![1]) + fit.tx
      const y = fit.scale * (fit.sin * src[i]![0] + fit.cos * src[i]![1]) + fit.ty
      const z = fit.scale * src[i]![2] + fit.tz
      expect(x).toBeCloseTo(dst[i]![0], 3)
      expect(y).toBeCloseTo(dst[i]![1], 3)
      expect(z).toBeCloseTo(dst[i]![2], 3)
    }
  })
})

describe('screen fit', () => {
  test('recovers a uniform scale and shift', () => {
    const from = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
      { x: 2, y: 2 },
    ]
    const to = from.map((point) => ({ x: point.x * 1.25 + 0.1, y: point.y * 1.25 - 0.2 }))
    const fit = solveScreenFit(from, to)
    expect(fit).not.toBeNull()
    expect(fit!.scale).toBeCloseTo(1.25, 5)
    expect(fit!.x).toBeCloseTo(0.1, 5)
    expect(fit!.y).toBeCloseTo(-0.2, 5)
  })

  test('face fit pins the eyes and scales width and height apart', () => {
    const from = [
      { x: -1, y: 1 },
      { x: -0.4, y: 1 },
      { x: 0.4, y: 1 },
      { x: 1, y: 1 },
      { x: 0, y: 3 },
      { x: 0, y: -2 },
      { x: -2, y: 0 },
      { x: 2, y: 0 },
    ]
    const sx = 1.2
    const sy = 0.85
    const tx = 0.15
    const ty = -0.2
    const to = from.map((point) => ({ x: point.x * sx + tx, y: point.y * sy + ty }))
    const fit = solveFaceFit(from, to, 4)
    expect(fit).not.toBeNull()
    expect(fit!.sx).toBeCloseTo(sx, 4)
    expect(fit!.sy).toBeCloseTo(sy, 4)
    const eyes = from.slice(0, 4)
    const eyeX = eyes.reduce((sum, point) => sum + point.x, 0) / eyes.length
    const eyeY = eyes.reduce((sum, point) => sum + point.y, 0) / eyes.length
    expect(fit!.sx * eyeX + fit!.x).toBeCloseTo(eyeX * sx + tx, 4)
    expect(fit!.sy * eyeY + fit!.y).toBeCloseTo(eyeY * sy + ty, 4)
  })

  test('one euro holds a steady value and eases toward a step', () => {
    const filter = new OneEuroFilter(1.2, 0.04)
    expect(filter.filter(2, 0)).toBeCloseTo(2, 5)
    expect(filter.filter(2, 32)).toBeCloseTo(2, 4)
    const stepped = filter.filter(3, 48)
    expect(stepped).toBeGreaterThan(2)
    expect(stepped).toBeLessThan(3)
    let value = stepped
    for (let t = 64; t < 2000; t += 16) value = filter.filter(3, t)
    expect(value).toBeGreaterThan(2.9)
  })

  test('weighted fit keeps a uniform scale when the eyes count more', () => {
    const from = [
      { x: -2, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 4 },
      { x: 0, y: -3 },
    ]
    const to = from.map((point) => ({ x: point.x * 1.4 + 0.25, y: point.y * 1.4 - 0.1 }))
    const fit = solveWeightedScreenFit(from, to, [5, 5, 1, 1])
    expect(fit).not.toBeNull()
    expect(fit!.scale).toBeCloseTo(1.4, 4)
    expect(fit!.x).toBeCloseTo(0.25, 4)
    expect(fit!.y).toBeCloseTo(-0.1, 4)
  })

  test('orbit fit pins the eyes and the chin without widening to a tight eye spacing', () => {
    const fromRight = { x: -1, y: 1 }
    const fromLeft = { x: 1, y: 1 }
    const fromChin = { x: 0, y: -3 }
    const toRight = { x: -2, y: 2 }
    const toLeft = { x: 2, y: 2 }
    const toChin = { x: 0.1, y: -2 }
    const fit = solveOrbitFit(fromRight, fromLeft, fromChin, toRight, toLeft, toChin)
    expect(fit).not.toBeNull()
    expect(fit!.scale).toBeCloseTo(1, 4)
    const eyeY = fit!.scale * 1 + fit!.y
    const chinY = fit!.scale * fromChin.y + fit!.y
    expect(eyeY).toBeCloseTo(2, 4)
    expect(chinY).toBeCloseTo(-2, 4)
    expect(fit!.scale * 0 + fit!.x).toBeCloseTo(0, 4)
  })

  test('a back-of-head anchor faces away and the forehead faces the camera', () => {
    const toCamera = { x: 0, y: 0, z: 1 }
    const occipital = anchorFacingAmount({ x: -0.54, y: 5.04, z: -12.86 }, { x: 0, y: 0, z: -1 }, toCamera)
    const frontal = anchorFacingAmount({ x: -1.63, y: 5.05, z: 5.94 }, { x: -0.02, y: 0.21, z: 0.98 }, toCamera)
    expect(occipital).toBeLessThan(0)
    expect(labelVisible(occipital, false)).toBe(false)
    expect(frontal).toBeGreaterThan(0.12)
    expect(labelVisible(0.05, true)).toBe(false)
    expect(labelVisible(0.05, false)).toBe(true)
  })

  test('head labels are the 26 named structures and columns keep an 18px gap', () => {
    expect(HEAD_LABELS).toHaveLength(26)
    expect(new Set(HEAD_LABELS.map((label) => label.text)).size).toBe(26)
    const columns = new LabelColumns()
    const placed = columns.layout(
      [
        { id: 'a', text: 'A', color: '#fff', x: 20, y: 40 },
        { id: 'b', text: 'B', color: '#fff', x: 30, y: 48 },
        { id: 'c', text: 'C', color: '#fff', x: 200, y: 80 },
        { id: 'd', text: 'D', color: '#fff', x: 400, y: 90 },
      ],
      640,
      480,
      320,
      140,
    )
    const left = placed.filter((row) => row.side === 'left').sort((a, b) => a.ty - b.ty)
    expect(left).toHaveLength(2)
    expect(left[1]!.ty - left[0]!.ty).toBeGreaterThanOrEqual(18)
    expect(placed.find((row) => row.id === 'c')?.side).toBe('right')
    expect(placed.find((row) => row.id === 'a')?.tx).toBeLessThan(320)
  })

  test('canonical fit smooths scale, then shifts with that scale', () => {
    const from = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
      { x: 2, y: 2 },
    ]
    const to = from.map((point) => ({ x: point.x * 1.4 + 0.5, y: point.y * 1.4 - 0.25 }))
    const once = stepCanonicalFit({ fitS: 1, fitX: 0, fitY: 0 }, from, to)
    expect(once).not.toBeNull()
    // Centroids are (1, 1) and (1.9, 1.15). The shift uses the smoothed scale 1.2, not 1.4.
    expect(once!.fitS).toBeCloseTo(1.2, 5)
    expect(once!.fitX).toBeCloseTo((1.9 - 1.2 * 1) * 0.7, 5)
    expect(once!.fitY).toBeCloseTo((1.15 - 1.2 * 1) * 0.7, 5)
    let state = { fitS: 1, fitX: 0, fitY: 0 }
    for (let i = 0; i < 40; i += 1) state = stepCanonicalFit(state, from, to)!
    expect(state.fitS).toBeCloseTo(1.4, 3)
    expect(state.fitS * 1 + state.fitX).toBeCloseTo(1.9, 3)
    expect(state.fitS * 1 + state.fitY).toBeCloseTo(1.15, 3)
  })

  test('x-ray gain shares skull, brain, and muscles, and the veil is 1 - real', () => {
    expect(xrayLayerGain('bone', 1, 1)).toBeCloseTo(1, 5)
    expect(xrayLayerGain('bone', 3, 1)).toBeCloseTo(1 / 2.2, 5)
    expect(xrayLayerGain('outline', 3, 1)).toBeCloseTo(0.55, 5)
    expect(xrayLayerGain('eye', 3, 1)).toBeCloseTo(0.9 / 2.2, 5)
    expect(xrayLayerGain('brain', 3, 1)).toBeCloseTo(0.36 / 2.2, 5)
    expect(xrayLayerGain('hindbrain', 3, 1)).toBeCloseTo(0.6 / 2.2, 5)
    expect(xrayLayerGain('muscle', 1, 1)).toBeCloseTo(0.5, 5)
    expect(xrayLayerGain('hand', 3, 2)).toBeCloseTo(2 / 2.2, 5)
    expect(veilOpacity(0.12)).toBeCloseTo(0.88, 5)
    expect(veilOpacity(0.75)).toBeCloseTo(0.25, 5)
    expect(RENDER_ORDER).toEqual({
      veil: -10,
      outline: 1,
      muscle: 2,
      bone: 3,
      hand: 3,
      eye: 4,
      brain: 5,
      hindbrain: 5,
    })
  })

  test('screen scale stays inside 0.6 and 1.6', () => {
    expect(clampScreenScale(2)).toBe(1.6)
    expect(clampScreenScale(0.2)).toBe(0.6)
    expect(clampScreenScale(1.1)).toBeCloseTo(1.1, 5)
    expect(clampScreenScale(Number.NaN)).toBe(1)
  })

  test('refuses fewer than three points', () => {
    expect(
      solveScreenFit(
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      ),
    ).toBeNull()
  })
})

describe('hashem fidelity', () => {
  test('x-ray fresnel uses the normal matrix and stays see-through', () => {
    const bone = createShadeMaterial('bone')
    const veil = createShadeMaterial('veil')
    const outline = createShadeMaterial('outline')
    expect(bone.vertexShader).toContain('normalize(normalMatrix * normal)')
    expect(bone.vertexShader).not.toContain('mat3(modelViewMatrix)')
    expect(bone.fragmentShader).toContain('(0.035 + 0.95 * rim)')
    expect(bone.fragmentShader).toContain('pow(1.0 - ndv, 2.1)')
    expect(bone.depthTest).toBe(false)
    expect(bone.depthWrite).toBe(false)
    expect(bone.side).toBe(THREE.DoubleSide)
    expect(bone.blending).toBe(THREE.AdditiveBlending)
    expect(bone.uniforms.uMode!.value).toBe(0)
    expect(veil.blending).toBe(THREE.NormalBlending)
    expect(veil.side).toBe(THREE.FrontSide)
    expect(veil.uniforms.uMode!.value).toBe(2)
    expect(veil.uniforms.uFade!.value).toBe(1)
    expect(outline.uniforms.uFade!.value).toBe(1)
    expect(outline.blending).toBe(THREE.AdditiveBlending)
    expect(solidLayerGain(1)).toBeCloseTo(1, 5)
    expect(xrayLayerGain('muscle', 1, 1)).toBeCloseTo(0.5, 5)
    expect(xrayLayerGain('brain', 1, 1)).toBeCloseTo(0.36, 5)
    expect(xrayLayerGain('hindbrain', 1, 1)).toBeCloseTo(0.6, 5)
  })

  test('defaults match the x-ray mirror and ignore the old fit key', () => {
    expect(DEFAULT_LAYERS).toEqual({
      skull: true,
      muscles: false,
      brain: false,
      hand: false,
      outline: true,
      eyes: true,
    })
    expect(FIT_STORAGE_KEY).toBe('anatomy-mirror-fit-v3')
    const scene = readFileSync(new URL('../src/scene/AnatomyScene.ts', import.meta.url), 'utf8')
    expect(scene).not.toContain('DEPTH_RELIEF')
  })

  test('shipped meshes sit on the reference boxes', () => {
    const boxes = glbBoxes()
    expect(near(boxes.skin!.min, [-10.8, -12.59, -16.04])).toBe(true)
    expect(near(boxes.skin!.size, [21.02, 27.14, 23.99])).toBe(true)
    expect(near(boxes.hindbrain!.min, [-5.6, -3.6, -12.36])).toBe(true)
    expect(near(boxes.hindbrain!.size, [10.98, 8.57, 8.84])).toBe(true)
    expect(near(boxes.cranium!.min, [-7.89, -6.32, -15.59])).toBe(true)
    expect(near(boxes.cerebrum!.min, [-7.33, -0.86, -14.84])).toBe(true)
    expect(boxes.muscles!.min[2]!).toBeLessThan(-15.5)
    expect(boxes.cranium!.normals).toBe(true)
    expect(boxes.skin!.normals).toBe(true)
    expect(boxes.muscles!.normals).toBe(true)
    expect(boxes.hindbrain!.normals).toBe(true)
  })
})

function near(value: number[], target: number[], tol = 0.08): boolean {
  return value.every((item, index) => Math.abs(item - target[index]!) <= tol)
}

function glbBoxes(): Record<string, { min: number[]; size: number[]; normals: boolean }> {
  const data = readFileSync(new URL('../public/anatomy/bodyparts3d/anatomy.glb', import.meta.url))
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const jsonLength = view.getUint32(12, true)
  const doc = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + jsonLength))) as {
    nodes: { name?: string; mesh?: number }[]
    meshes: { primitives: { attributes: { POSITION: number; NORMAL?: number } }[] }[]
    accessors: { min?: number[]; max?: number[] }[]
  }
  const boxes: Record<string, { min: number[]; size: number[]; normals: boolean }> = {}
  for (const node of doc.nodes) {
    if (node.mesh == null || !node.name) continue
    const attributes = doc.meshes[node.mesh]!.primitives[0]!.attributes
    const accessor = doc.accessors[attributes.POSITION]!
    const min = accessor.min ?? [0, 0, 0]
    const max = accessor.max ?? [0, 0, 0]
    boxes[node.name] = {
      min,
      size: max.map((item, index) => item - min[index]!),
      normals: attributes.NORMAL != null,
    }
  }
  return boxes
}
