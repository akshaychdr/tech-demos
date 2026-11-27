export type LabelLayer = 'skull' | 'brain' | 'muscle' | 'eye'
export type LabelSide = 'left' | 'right'

export type LabelPoint = {
  p: [number, number, number]
  n: [number, number, number]
}

export type HeadLabel = {
  id: string
  text: string
  layer: LabelLayer
  jaw: boolean
  at: LabelPoint[]
}

export const LABEL_COLOR: Record<LabelLayer, string> = {
  skull: '#d9f0ff',
  brain: '#ffc2d6',
  muscle: '#ffb3aa',
  eye: '#fff3a8',
}

const pt = (p: [number, number, number], n: [number, number, number]): LabelPoint => ({ p, n })

/** 26 head labels. Each point is centimetres in the head frame, +Z toward the face. */
export const HEAD_LABELS: HeadLabel[] = [
  {
    id: 'frontal-bone',
    text: 'Frontal bone',
    layer: 'skull',
    jaw: false,
    at: [pt([-1.63, 5.05, 5.94], [-0.02, 0.21, 0.98]), pt([0.51, 5.0, 5.75], [0.17, 0.12, 0.98])],
  },
  {
    id: 'parietal-bone',
    text: 'Parietal bone',
    layer: 'skull',
    jaw: false,
    at: [pt([-2.16, 8.68, 3.9], [-0.17, 0.54, 0.83]), pt([1.07, 8.12, 4.11], [0.24, 0.56, 0.79])],
  },
  {
    id: 'temporal-bone',
    text: 'Temporal bone',
    layer: 'skull',
    jaw: false,
    at: [pt([-4.58, -0.89, 3.08], [-0.32, -0.06, 0.94]), pt([4.47, 0.14, 1.73], [-0.03, 0.09, 1])],
  },
  {
    id: 'occipital-bone',
    text: 'Occipital bone',
    layer: 'skull',
    jaw: false,
    at: [pt([-0.54, 5.04, -12.86], [0, 0, -1])],
  },
  {
    id: 'nasal-bone',
    text: 'Nasal bone',
    layer: 'skull',
    jaw: false,
    at: [pt([0.76, -1.28, 6.04], [0.12, -0.25, 0.96])],
  },
  {
    id: 'zygomatic-bone',
    text: 'Zygomatic bone (cheekbone)',
    layer: 'skull',
    jaw: false,
    at: [pt([-4.55, 1.08, 3.92], [-0.36, -0.56, 0.74]), pt([4.72, 2.12, 2.63], [0.38, -0.63, 0.68])],
  },
  {
    id: 'maxilla',
    text: 'Maxilla (upper jaw)',
    layer: 'skull',
    jaw: false,
    at: [pt([-0.7, -3.36, 4.19], [-0.13, -0.14, 0.98]), pt([0.85, -4.54, 4.65], [0.02, -0.01, 1])],
  },
  {
    id: 'teeth',
    text: 'Teeth',
    layer: 'skull',
    jaw: true,
    at: [pt([-1.18, -7.91, 2.36], [-0.3, -0.24, 0.92]), pt([0.88, -7.09, 3.81], [0, 0.01, 1])],
  },
  {
    id: 'mandible',
    text: 'Mandible (lower jaw)',
    layer: 'skull',
    jaw: true,
    at: [pt([0.81, -9.06, 3.08], [0.05, -0.35, 0.94])],
  },
  {
    id: 'eyeball',
    text: 'Eyeball',
    layer: 'eye',
    jaw: false,
    at: [pt([-2.51, -0.34, 4.51], [-0.04, 0.09, 0.99]), pt([3.07, 0.27, 3.72], [-0.04, -0.05, 1])],
  },
  {
    id: 'frontal-lobe',
    text: 'Frontal lobe',
    layer: 'brain',
    jaw: false,
    at: [pt([-2.39, 3.79, 4.59], [0.01, 0.01, 1]), pt([1.23, 5.57, 4.98], [0.19, -0.07, 0.98])],
  },
  {
    id: 'parietal-lobe',
    text: 'Parietal lobe',
    layer: 'brain',
    jaw: false,
    at: [pt([0.06, 10.93, -0.93], [0.05, 0.87, 0.49])],
  },
  {
    id: 'temporal-lobe',
    text: 'Temporal lobe',
    layer: 'brain',
    jaw: false,
    at: [pt([-7.67, 3.68, -1.96], [-0.93, -0.23, 0.28]), pt([4.86, 3.86, -1.99], [0.93, -0.2, 0.31])],
  },
  {
    id: 'occipital-lobe',
    text: 'Occipital lobe',
    layer: 'brain',
    jaw: false,
    at: [pt([1.81, 7.33, -9], [0.74, 0.31, -0.6])],
  },
  {
    id: 'cerebellum',
    text: 'Cerebellum',
    layer: 'brain',
    jaw: false,
    at: [pt([-0.99, 1.47, -5.38], [0.03, -0.02, 1])],
  },
  {
    id: 'pons',
    text: 'Pons (brainstem)',
    layer: 'brain',
    jaw: false,
    at: [pt([0.93, 0.89, -5.43], [0, 0.02, 1])],
  },
  {
    id: 'medulla',
    text: 'Medulla oblongata',
    layer: 'brain',
    jaw: false,
    at: [pt([0.81, -0.1, -5.6], [0.02, -0.07, 1])],
  },
  {
    id: 'frontalis',
    text: 'Frontalis',
    layer: 'muscle',
    jaw: false,
    at: [pt([-2.99, 4.17, 5.75], [0.41, 0.1, -0.91]), pt([3.19, 5.14, 4.72], [-0.67, -0.1, -0.74])],
  },
  {
    id: 'temporalis',
    text: 'Temporalis',
    layer: 'muscle',
    jaw: false,
    at: [pt([-6.28, 1.66, -0.22], [0.83, 0.35, -0.44]), pt([5.22, 3.69, -1.9], [-0.97, 0.11, -0.2])],
  },
  {
    id: 'orbicularis',
    text: 'Orbicularis oculi',
    layer: 'muscle',
    jaw: false,
    at: [pt([-2.52, 0.05, 4.88], [-0.03, -0.85, -0.52]), pt([3.37, 0.82, 4.02], [0.04, -0.72, -0.69])],
  },
  {
    id: 'nasalis',
    text: 'Nasalis',
    layer: 'muscle',
    jaw: false,
    at: [pt([0, -1.14, 5.42], [0.77, -0.26, -0.58]), pt([1.66, -0.98, 5.05], [0.87, 0.45, 0.19])],
  },
  {
    id: 'zygomaticus',
    text: 'Zygomaticus major',
    layer: 'muscle',
    jaw: false,
    at: [pt([-3.21, -4.05, 2.97], [-0.38, -0.24, 0.89]), pt([4.31, -3.27, 1.96], [0.74, -0.2, 0.64])],
  },
  {
    id: 'masseter',
    text: 'Masseter',
    layer: 'muscle',
    jaw: true,
    at: [pt([-4.52, -4.25, -0.86], [-0.89, -0.46, -0.02]), pt([4.83, -3.02, -1.92], [0.96, -0.23, -0.19])],
  },
  {
    id: 'oris',
    text: 'Orbicularis oris',
    layer: 'muscle',
    jaw: true,
    at: [pt([1.24, -5.48, 4.68], [-0.38, -0.64, -0.66])],
  },
  {
    id: 'dao',
    text: 'Depressor anguli oris',
    layer: 'muscle',
    jaw: true,
    at: [pt([-0.98, -8.24, 2.42], [0.64, 0.6, -0.49]), pt([3.72, -7.42, 1.74], [0.83, -0.45, 0.33])],
  },
  {
    id: 'mentalis',
    text: 'Mentalis',
    layer: 'muscle',
    jaw: true,
    at: [pt([0.69, -8.49, 3.29], [0, 0, 0]), pt([2.05, -8.33, 3.07], [-0.55, 0.12, -0.82])],
  },
]

/** Flip a stored normal so it points out of the head, not into the bone. */
export function outwardNormal(
  point: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const dot = point.x * normal.x + point.y * normal.y + point.z * normal.z
  const flip = dot < 0 ? -1 : 1
  const x = normal.x * flip
  const y = normal.y * flip
  const z = normal.z * flip
  if (Math.hypot(x, y, z) < 1e-4) return point.z >= 0 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 0, z: -1 }
  return { x, y, z }
}

/** How directly the anchor's outward normal faces the camera. 1 is straight on, negative is the far side. */
export function anchorFacingAmount(
  point: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
  toCamera: { x: number; y: number; z: number },
): number {
  const n = outwardNormal(point, normal)
  const nlen = Math.hypot(n.x, n.y, n.z)
  const clen = Math.hypot(toCamera.x, toCamera.y, toCamera.z)
  if (nlen < 1e-6 || clen < 1e-6) return 1
  return (n.x * toCamera.x + n.y * toCamera.y + n.z * toCamera.z) / (nlen * clen)
}

/** Far-side anchors stay hidden, so the occiput cannot land on the forehead. Solid mode also drops a grazing anchor below 0.12. */
export function labelVisible(facing: number, solid: boolean): boolean {
  if (facing < -0.35) return false
  if (solid && facing < 0.12) return false
  return true
}

export type ScreenLabel = {
  id: string
  text: string
  color: string
  x: number
  y: number
}

export type PlacedLabel = ScreenLabel & {
  tx: number
  ty: number
  side: LabelSide
}

type Sticky = { side: LabelSide; wy: number; unseen: number }

/**
 * Two columns beside the head. Sides stick until an anchor crosses the
 * median by a margin. Row order sticks too, and only swaps when the
 * smoothed heights differ by more than 7px, so the leaders do not jitter.
 */
export class LabelColumns {
  private sticky = new Map<string, Sticky>()
  private order: Record<LabelSide, string[]> = { left: [], right: [] }

  layout(items: ScreenLabel[], width: number, height: number, cx: number, halfWidth: number): PlacedLabel[] {
    const splitX = median(items.map((item) => item.x))
    const margin = 0.15 * halfWidth
    const seen = new Set<string>()
    for (const item of items) {
      seen.add(item.id)
      const prev = this.sticky.get(item.id)
      if (!prev || prev.unseen > 3) {
        this.sticky.set(item.id, { side: item.x < splitX ? 'left' : 'right', wy: item.y, unseen: 0 })
        continue
      }
      prev.wy += (item.y - prev.wy) * 0.5
      prev.unseen = 0
      if (prev.side === 'left' && item.x > splitX + margin) prev.side = 'right'
      else if (prev.side === 'right' && item.x < splitX - margin) prev.side = 'left'
    }
    for (const [id, state] of this.sticky) {
      if (seen.has(id)) continue
      state.unseen += 1
      if (state.unseen > 3) this.sticky.delete(id)
    }
    const placed: PlacedLabel[] = []
    for (const side of ['left', 'right'] as const) {
      const list = items.filter((item) => this.sticky.get(item.id)?.side === side)
      const rank = this.rank(side, list)
      let cursor = Number.NEGATIVE_INFINITY
      const rows = rank.map((item) => {
        const wy = this.sticky.get(item.id)!.wy
        const ty = Math.max(wy, cursor + 18)
        cursor = ty
        return { item, ty }
      })
      const last = rows[rows.length - 1]
      let shift = last && last.ty > height - 12 ? last.ty - (height - 12) : 0
      const top = rows[0]
      if (top && top.ty - shift < 12) shift -= 12 - (top.ty - shift)
      const tx = side === 'left' ? Math.max(8, cx - halfWidth - 22) : Math.min(width - 8, cx + halfWidth + 22)
      for (const row of rows) {
        placed.push({
          ...row.item,
          tx,
          ty: row.ty - shift,
          side,
        })
      }
    }
    return placed
  }

  private rank(side: LabelSide, list: ScreenLabel[]): ScreenLabel[] {
    const byId = new Map(list.map((item) => [item.id, item]))
    const order = this.order[side].filter((id) => byId.has(id))
    for (const item of list) if (!order.includes(item.id)) order.push(item.id)
    let guard = 0
    let swapped = true
    while (swapped && guard < 32) {
      swapped = false
      guard += 1
      for (let i = 0; i < order.length - 1; i += 1) {
        const above = this.sticky.get(order[i]!)!.wy
        const below = this.sticky.get(order[i + 1]!)!.wy
        if (above > below + 7) {
          const hold = order[i]!
          order[i] = order[i + 1]!
          order[i + 1] = hold
          swapped = true
        }
      }
    }
    this.order[side] = order
    return order.map((id) => byId.get(id)!)
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]!
  return (sorted[mid - 1]! + sorted[mid]!) / 2
}
