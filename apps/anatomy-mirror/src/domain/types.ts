export type Vec3 = [number, number, number]

export type BoneId =
  | 'frontal'
  | 'parietal'
  | 'temporal'
  | 'occipital'
  | 'nasal'
  | 'zygomatic'
  | 'maxilla'
  | 'mandible'

export type MuscleId = 'frontalis' | 'corrugator' | 'orbicularis' | 'zygomaticus' | 'masseter'

export type StructureId = BoneId | MuscleId | 'brain'

export type BlendshapeMap = Record<string, number>
