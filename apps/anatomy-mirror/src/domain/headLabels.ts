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
    at: [pt([0.05, 8.29, 4.82], [0.01, 0.25, 0.97]), pt([-0.11, 8.29, 4.82], [-0.01, 0.25, 0.97])],
  },
  {
    id: 'parietal-bone',
    text: 'Parietal bone',
    layer: 'skull',
    jaw: false,
    at: [pt([-5.34, 10.78, -10.51], [-0.59, 0.57, -0.57]), pt([5.28, 10.78, -10.51], [0.59, 0.57, -0.57])],
  },
  {
    id: 'temporal-bone',
    text: 'Temporal bone',
    layer: 'skull',
    jaw: false,
    at: [pt([-6.62, -0.16, -6.16], [-0.75, -0.66, -0.09]), pt([6.64, 0.07, -6.20], [0.77, -0.64, -0.10])],
  },
  {
    id: 'occipital-bone',
    text: 'Occipital bone',
    layer: 'skull',
    jaw: false,
    at: [pt([0.06, 3.50, -15.38], [0.01, -0.21, -0.98])],
  },
  {
    id: 'nasal-bone',
    text: 'Nasal bone',
    layer: 'skull',
    jaw: false,
    at: [pt([0.21, 2.83, 5.14], [0.02, -0.26, 0.97])],
  },
  {
    id: 'zygomatic-bone',
    text: 'Zygomatic bone (cheekbone)',
    layer: 'skull',
    jaw: false,
    at: [pt([-6.56, 0.92, 1.09], [-0.63, -0.45, 0.63]), pt([6.50, 0.92, 1.09], [0.63, -0.45, 0.63])],
  },
  {
    id: 'maxilla',
    text: 'Maxilla (upper jaw)',
    layer: 'skull',
    jaw: false,
    at: [pt([0.93, -5.33, 4.90], [0.06, -0.73, 0.68]), pt([2.06, -5.34, 4.96], [0.14, -0.72, 0.68])],
  },
  {
    id: 'teeth',
    text: 'Teeth',
    layer: 'skull',
    jaw: true,
    at: [pt([0.26, -4.87, 4.21], [0.09, -0.29, 0.95]), pt([-0.44, -4.87, 4.21], [-0.09, -0.29, 0.95])],
  },
  {
    id: 'mandible',
    text: 'Mandible (lower jaw)',
    layer: 'skull',
    jaw: true,
    at: [pt([-0.26, -7.18, 3.98], [-0.04, -0.71, 0.71])],
  },
  {
    id: 'eyeball',
    text: 'Eyeball',
    layer: 'eye',
    jaw: false,
    at: [pt([-2.79, 2.74, 5.07], [-0.91, -0.03, 0.41]), pt([2.79, 2.74, 5.07], [0.91, -0.03, 0.41])],
  },
  {
    id: 'frontal-lobe',
    text: 'Frontal lobe',
    layer: 'brain',
    jaw: false,
    at: [pt([0.08, 5.14, 2.87], [0.01, -0.20, 0.98]), pt([3.98, 6.66, 2.74], [0.44, -0.02, 0.90])],
  },
  {
    id: 'parietal-lobe',
    text: 'Parietal lobe',
    layer: 'brain',
    jaw: false,
    at: [pt([2.90, 12.79, -3.94], [0.43, 0.88, 0.21])],
  },
  {
    id: 'temporal-lobe',
    text: 'Temporal lobe',
    layer: 'brain',
    jaw: false,
    at: [pt([6.26, 5.24, -2.97], [0.91, -0.23, 0.35]), pt([6.71, 3.02, -4.69], [0.87, -0.49, 0.09])],
  },
  {
    id: 'occipital-lobe',
    text: 'Occipital lobe',
    layer: 'brain',
    jaw: false,
    at: [pt([3.27, 7.05, -12.14], [0.44, 0.03, -0.90])],
  },
  {
    id: 'cerebellum',
    text: 'Cerebellum',
    layer: 'brain',
    jaw: false,
    at: [pt([0.05, 0.74, -7.42], [0.04, 0.55, 0.83])],
  },
  {
    id: 'pons',
    text: 'Pons (brainstem)',
    layer: 'brain',
    jaw: false,
    at: [pt([1.78, -0.31, -7.57], [0.69, 0.12, 0.72])],
  },
  {
    id: 'medulla',
    text: 'Medulla oblongata',
    layer: 'brain',
    jaw: false,
    at: [pt([1.49, -1.53, -7.62], [0.59, -0.35, 0.72])],
  },
  {
    id: 'frontalis',
    text: 'Frontalis',
    layer: 'muscle',
    jaw: false,
    at: [pt([-2.56, 7.47, 5.17], [-0.45, 0.55, 0.70]), pt([2.56, 7.47, 5.17], [0.45, 0.55, 0.70])],
  },
  {
    id: 'temporalis',
    text: 'Temporalis',
    layer: 'muscle',
    jaw: false,
    at: [pt([-7.94, 6.10, -4.34], [-0.90, 0.30, -0.32]), pt([7.94, 6.10, -4.34], [0.90, 0.30, -0.32])],
  },
  {
    id: 'orbicularis',
    text: 'Orbicularis oculi',
    layer: 'muscle',
    jaw: false,
    at: [pt([-3.25, 3.80, 5.03], [-0.55, 0.05, 0.83]), pt([3.25, 3.80, 5.03], [0.55, 0.05, 0.83])],
  },
  {
    id: 'nasalis',
    text: 'Nasalis',
    layer: 'muscle',
    jaw: false,
    at: [pt([1.77, -1.02, 5.48], [0.05, -0.35, 0.94]), pt([3.52, -1.18, 4.89], [0.42, -0.39, 0.82])],
  },
  {
    id: 'zygomaticus',
    text: 'Zygomaticus major',
    layer: 'muscle',
    jaw: false,
    at: [pt([-6.83, 1.19, 1.19], [-0.72, 0.15, 0.68]), pt([6.83, 1.19, 1.19], [0.72, 0.15, 0.68])],
  },
  {
    id: 'masseter',
    text: 'Masseter',
    layer: 'muscle',
    jaw: true,
    at: [pt([-5.78, -0.66, 0.18], [-0.95, -0.20, 0.24]), pt([5.78, -0.66, 0.18], [0.95, -0.20, 0.24])],
  },
  {
    id: 'oris',
    text: 'Orbicularis oris',
    layer: 'muscle',
    jaw: true,
    at: [pt([0.08, -5.31, 5.01], [0.02, -0.35, 0.94])],
  },
  {
    id: 'dao',
    text: 'Depressor anguli oris',
    layer: 'muscle',
    jaw: true,
    at: [pt([-0.21, -7.20, 3.59], [-0.21, -0.93, 0.30]), pt([3.41, -7.11, 1.96], [0.23, -0.97, 0.11])],
  },
  {
    id: 'mentalis',
    text: 'Mentalis',
    layer: 'muscle',
    jaw: true,
    at: [pt([1.12, -7.34, 4.57], [-0.05, -0.91, 0.40]), pt([2.78, -7.40, 3.18], [0.15, -0.96, 0.25])],
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
