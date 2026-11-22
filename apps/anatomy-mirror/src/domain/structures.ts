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
    color: '#d7ecff',
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
    color: '#c5dff5',
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
    color: '#b7d4ee',
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
    color: '#a9c6e0',
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
    color: '#f4f8ff',
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
    color: '#d7ecff',
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
    color: '#c9e7ff',
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
    color: '#e7f3ff',
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
    color: '#ff8d84',
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
    color: '#ff6b62',
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
    color: '#ff9a92',
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
    color: '#ff7d74',
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
    color: '#e85a52',
    layer: 'muscles',
    quiz: true,
    touchPrompt: 'Touch your chewing muscle.',
    showPrompt: 'Clench your teeth.',
  },
  {
    id: 'oris',
    everyday: 'Lip muscle',
    science: 'Orbicularis oris',
    fact: 'A ring of muscle circles the mouth. It closes the lips, and it draws them inward when you purse them around a straw.',
    color: '#ff8f88',
    layer: 'muscles',
    quiz: false,
    touchPrompt: 'Touch the muscle around your lips.',
    showPrompt: 'Purse your lips.',
  },
  {
    id: 'temporalis',
    everyday: 'Temple muscle',
    science: 'Temporalis',
    fact: 'The temporalis is a fan on the side of the head. It pulls the jaw closed, and you can feel it tighten at the temple when you clench.',
    color: '#d4534c',
    layer: 'muscles',
    quiz: false,
    touchPrompt: 'Touch your temple.',
    showPrompt: 'Clench and feel your temple.',
  },
  {
    id: 'brain',
    everyday: 'Brain',
    science: 'Brain',
    fact: 'Your brain sits inside the skull like a soft control center. A grown human brain weighs about 1.3 kilograms and uses about a fifth of the body\u2019s energy while you rest.',
    color: '#ff9ebe',
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
  { id: 'oris', prompt: 'Purse your lips' },
]
