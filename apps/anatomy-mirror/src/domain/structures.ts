import type { BoneId, MuscleId, StructureId } from './types.ts'

export type Structure = {
  id: StructureId
  everyday: string
  science: string
  fact: string
  color: string
  layer: 'bones' | 'muscles' | 'brain'
  quiz: boolean
  touchPrompt: string
  showPrompt: string
}

export const STRUCTURES: Structure[] = [
  {
    id: 'frontal',
    everyday: 'Forehead bone',
    science: 'Frontal bone',
    fact: 'Your forehead bone starts as two separate pieces. They grow together along a seam down the middle, usually while you are still small.',
    color: '#e6b15a',
    layer: 'bones',
    quiz: true,
    touchPrompt: 'Touch your forehead bone.',
    showPrompt: 'Show me your forehead bone.',
  },
  {
    id: 'parietal',
    everyday: 'Top of the skull',
    science: 'Parietal bone',
    fact: 'The two parietal bones meet along the top of your head. In babies that seam is still soft, which helps the skull flex during birth.',
    color: '#f0d59a',
    layer: 'bones',
    quiz: false,
    touchPrompt: 'Touch the top of your skull.',
    showPrompt: 'Show me the top of your skull.',
  },
  {
    id: 'temporal',
    everyday: 'Side of the head',
    science: 'Temporal bone',
    fact: 'The temporal bone holds your inner ear and three tiny ear bones. Its rock-like inner part is one of the hardest bits of bone in the body.',
    color: '#d4845a',
    layer: 'bones',
    quiz: true,
    touchPrompt: 'Touch the side of your head, just above and in front of your ear.',
    showPrompt: 'Show me the side of your head.',
  },
  {
    id: 'occipital',
    everyday: 'Back of the skull',
    science: 'Occipital bone',
    fact: 'The occipital bone has a large opening called the foramen magnum. Your spinal cord passes through it to reach your brain.',
    color: '#b76b73',
    layer: 'bones',
    quiz: false,
    touchPrompt: 'Touch the back of your skull.',
    showPrompt: 'Show me the back of your skull.',
  },
  {
    id: 'nasal',
    everyday: 'Nose bridge',
    science: 'Nasal bone',
    fact: 'The nasal bones are a small pair that form the bridge of the nose. Most of the nose you can wiggle is cartilage, not bone.',
    color: '#f3e6cf',
    layer: 'bones',
    quiz: true,
    touchPrompt: 'Touch your nose bridge.',
    showPrompt: 'Show me your nose bridge.',
  },
  {
    id: 'zygomatic',
    everyday: 'Cheekbone',
    science: 'Zygomatic bone',
    fact: 'Your cheekbone forms the outer side of your eye socket. It is the bone you feel when you press the bony point of your cheek.',
    color: '#e38b7a',
    layer: 'bones',
    quiz: true,
    touchPrompt: 'Touch your cheekbone.',
    showPrompt: 'Show me your cheekbone.',
  },
  {
    id: 'maxilla',
    everyday: 'Upper jaw',
    science: 'Maxilla',
    fact: 'The upper jaw holds the roots of your upper teeth. It also forms part of the floor of each eye socket and the side of the nose.',
    color: '#8fbfa8',
    layer: 'bones',
    quiz: true,
    touchPrompt: 'Touch your upper jaw, just beside your nose.',
    showPrompt: 'Show me your upper jaw.',
  },
  {
    id: 'mandible',
    everyday: 'Lower jaw',
    science: 'Mandible',
    fact: 'The lower jaw is the largest bone in your face. It swings from a hinge just in front of each ear when you talk and chew.',
    color: '#7ea0b8',
    layer: 'bones',
    quiz: true,
    touchPrompt: 'Touch your lower jaw.',
    showPrompt: 'Show me your lower jaw.',
  },
  {
    id: 'frontalis',
    everyday: 'Eyebrow lifter',
    science: 'Frontalis',
    fact: 'This muscle lifts your eyebrows and wrinkles your forehead when you are surprised. At the top it blends into the sheet of tissue over your scalp, which is why lifting just one eyebrow takes practice.',
    color: '#c7b0e8',
    layer: 'muscles',
    quiz: true,
    touchPrompt: 'Touch your eyebrow lifter.',
    showPrompt: 'Raise your eyebrows.',
  },
  {
    id: 'corrugator',
    everyday: 'Frowning muscle',
    science: 'Corrugator supercilii',
    fact: 'This small muscle pulls your eyebrows down and inward. It makes the little vertical lines between your eyebrows when you frown.',
    color: '#9b8fd4',
    layer: 'muscles',
    quiz: true,
    touchPrompt: 'Touch your frowning muscle.',
    showPrompt: 'Frown.',
  },
  {
    id: 'orbicularis',
    everyday: 'Eye closer',
    science: 'Orbicularis oculi',
    fact: 'A ring of muscle circles each eye. The outer part squeezes the eye shut tight, and the inner part handles a gentle blink.',
    color: '#8ec8e6',
    layer: 'muscles',
    quiz: true,
    touchPrompt: 'Touch your eye closer.',
    showPrompt: 'Close your eyes tight.',
  },
  {
    id: 'zygomaticus',
    everyday: 'Smiling muscle',
    science: 'Zygomaticus major',
    fact: 'This muscle runs from the cheekbone to the corner of your mouth. When it pulls, the corner lifts up and out into a smile.',
    color: '#f0a0c0',
    layer: 'muscles',
    quiz: true,
    touchPrompt: 'Touch your smiling muscle.',
    showPrompt: 'Smile big.',
  },
  {
    id: 'masseter',
    everyday: 'Chewing muscle',
    science: 'Masseter',
    fact: 'The masseter runs from the cheekbone down to the angle of your jaw. For its size it is one of the strongest muscles you have, and it closes the jaw when you chew.',
    color: '#e07a93',
    layer: 'muscles',
    quiz: true,
    touchPrompt: 'Touch your chewing muscle.',
    showPrompt: 'Clench your teeth.',
  },
  {
    id: 'brain',
    everyday: 'Brain',
    science: 'Brain',
    fact: 'Your brain sits inside the skull like a soft control center. A grown human brain weighs about 1.3 kilograms and uses about a fifth of the body\u2019s energy while you rest.',
    color: '#a9b4e8',
    layer: 'brain',
    quiz: false,
    touchPrompt: 'Look at your brain.',
    showPrompt: 'Look at your brain.',
  },
]

const byId = new Map(STRUCTURES.map((s) => [s.id, s]))

export function structure(id: StructureId): Structure {
  const found = byId.get(id)
  if (!found) throw new Error(`unknown structure ${id}`)
  return found
}

export const QUIZ_BONES = STRUCTURES.filter((s) => s.layer === 'bones' && s.quiz).map((s) => s.id) as BoneId[]
export const QUIZ_MUSCLES = STRUCTURES.filter((s) => s.layer === 'muscles' && s.quiz).map((s) => s.id) as MuscleId[]

export const FACE_PROMPTS: { id: MuscleId; prompt: string }[] = [
  { id: 'frontalis', prompt: 'Raise your eyebrows' },
  { id: 'corrugator', prompt: 'Frown' },
  { id: 'orbicularis', prompt: 'Close your eyes tight' },
  { id: 'zygomaticus', prompt: 'Smile big' },
  { id: 'masseter', prompt: 'Clench your teeth' },
]
