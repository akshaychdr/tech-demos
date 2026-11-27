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
    at: [pt([-0.74, 6.57, 5.95], [0.11, 0.30, 0.95]), pt([1.46, 6.15, 5.55], [0.29, 0.19, 0.94])],
  },
  {
    id: 'parietal-bone',
    text: 'Parietal bone',
    layer: 'skull',
    jaw: false,
    at: [pt([-0.97, 10.23, 3.44], [0, 0.63, 0.77]), pt([2.33, 9.14, 3.41], [0.40, 0.59, 0.70])],
  },
  {
    id: 'temporal-bone',
    text: 'Temporal bone',
    layer: 'skull',
    jaw: false,
    at: [pt([-5.03, 0.56, 3.93], [-0.22, 0.08, 0.97]), pt([4.41, 0.04, 1.52], [0.09, 0.19, 0.98])],
  },
  {
    id: 'occipital-bone',
    text: 'Occipital bone',
    layer: 'skull',
    jaw: false,
    at: [pt([-1.73, 4.48, -13.87], [-0.11, -0.10, -0.99])],
  },
  {
    id: 'nasal-bone',
    text: 'Nasal bone',
    layer: 'skull',
    jaw: false,
    at: [pt([0.81, -0.41, 6.56], [0.19, -0.17, 0.97])],
  },
  {
    id: 'zygomatic-bone',
    text: 'Zygomatic bone (cheekbone)',
    layer: 'skull',
    jaw: false,
    at: [pt([-4.61, 2.69, 4.58], [-0.36, -0.43, 0.83]), pt([5.07, 2.15, 2.21], [0.36, -0.61, 0.71])],
  },
  {
    id: 'maxilla',
    text: 'Maxilla (upper jaw)',
    layer: 'skull',
    jaw: false,
    at: [pt([-1.23, -2.53, 5.00], [-0.04, -0.02, 1.00]), pt([0.26, -3.96, 5.47], [0.12, 0.08, 0.99])],
  },
  {
    id: 'teeth',
    text: 'Teeth',
    layer: 'skull',
    jaw: true,
    at: [pt([-2.62, -7.38, 3.66], [-0.23, -0.10, 0.97]), pt([-0.19, -6.71, 4.89], [0.11, 0.11, 0.99])],
  },
  {
    id: 'mandible',
    text: 'Mandible (lower jaw)',
    layer: 'skull',
    jaw: true,
    at: [pt([-0.64, -8.82, 4.36], [0.10, -0.26, 0.96])],
  },
  {
    id: 'eyeball',
    text: 'Eyeball',
    layer: 'eye',
    jaw: false,
    at: [pt([-2.63, 0.94, 5.16], [0.08, 0.19, 0.98]), pt([3.19, 0.60, 3.72], [0.06, 0.05, 1.00])],
  },
  {
    id: 'frontal-lobe',
    text: 'Frontal lobe',
    layer: 'brain',
    jaw: false,
    at: [pt([-1.87, 5.24, 4.75], [0.12, 0.10, 0.99]), pt([2.21, 6.55, 4.61], [0.28, 0, 0.96])],
  },
  {
    id: 'parietal-lobe',
    text: 'Parietal lobe',
    layer: 'brain',
    jaw: false,
    at: [pt([1.13, 11.73, -2.10], [0.23, 0.90, 0.38])],
  },
  {
    id: 'temporal-lobe',
    text: 'Temporal lobe',
    layer: 'brain',
    jaw: false,
    at: [pt([-8.13, 5.31, -1.59], [-0.92, -0.06, 0.39]), pt([4.95, 3.48, -2.86], [0.92, -0.31, 0.24])],
  },
  {
    id: 'occipital-lobe',
    text: 'Occipital lobe',
    layer: 'brain',
    jaw: false,
    at: [pt([1.50, 6.88, -10.32], [0.71, 0.13, -0.69])],
  },
  {
    id: 'cerebellum',
    text: 'Cerebellum',
    layer: 'brain',
    jaw: false,
    at: [pt([-1.89, 1.59, -5.57], [0.13, 0.07, 0.99])],
  },
  {
    id: 'pons',
    text: 'Pons (brainstem)',
    layer: 'brain',
    jaw: false,
    at: [pt([0.02, 0.67, -5.74], [0.11, 0.11, 0.99])],
  },
  {
    id: 'medulla',
    text: 'Medulla oblongata',
    layer: 'brain',
    jaw: false,
    at: [pt([-0.27, -0.36, -5.79], [0.12, 0.02, 0.99])],
  },
  {
    id: 'frontalis',
    text: 'Frontalis',
    layer: 'muscle',
    jaw: false,
    at: [pt([-2.31, 5.85, 5.98], [0.32, -0.05, -0.95]), pt([4.16, 5.76, 4.19], [-0.75, -0.07, -0.66])],
  },
  {
    id: 'temporalis',
    text: 'Temporalis',
    layer: 'muscle',
    jaw: false,
    at: [pt([-6.79, 3.16, 0.33], [0.82, 0.18, -0.55]), pt([5.31, 3.25, -2.78], [-0.96, 0.24, -0.12])],
  },
  {
    id: 'orbicularis',
    text: 'Orbicularis oculi',
    layer: 'muscle',
    jaw: false,
    at: [pt([-2.54, 1.39, 5.51], [-0.21, -0.88, -0.42]), pt([3.62, 1.16, 3.94], [-0.14, -0.78, -0.61])],
  },
  {
    id: 'nasalis',
    text: 'Nasalis',
    layer: 'muscle',
    jaw: false,
    at: [pt([-0.03, -0.20, 5.97], [0.66, -0.43, -0.62]), pt([1.68, -0.34, 5.40], [0.94, 0.33, 0.06])],
  },
  {
    id: 'zygomaticus',
    text: 'Zygomaticus major',
    layer: 'muscle',
    jaw: false,
    at: [pt([-4.09, -2.96, 4.05], [-0.31, -0.09, 0.94]), pt([3.75, -3.47, 2.17], [0.77, -0.25, 0.59])],
  },
  {
    id: 'masseter',
    text: 'Masseter',
    layer: 'muscle',
    jaw: true,
    at: [pt([-5.92, -3.35, 0.18], [-0.94, -0.32, 0.11]), pt([3.90, -3.68, -1.98], [0.89, -0.39, -0.25])],
  },
  {
    id: 'oris',
    text: 'Orbicularis oris',
    layer: 'muscle',
    jaw: true,
    at: [pt([0.53, -5.00, 5.58], [-0.54, -0.64, -0.55])],
  },
  {
    id: 'dao',
    text: 'Depressor anguli oris',
    layer: 'muscle',
    jaw: true,
    at: [pt([-2.46, -7.75, 3.74], [0.66, 0.44, -0.61]), pt([2.49, -7.72, 2.48], [0.79, -0.54, 0.30])],
  },
  {
    id: 'mentalis',
    text: 'Mentalis',
    layer: 'muscle',
    jaw: true,
    at: [pt([-0.66, -8.19, 4.52], [0.00, 0.00, 0.00]), pt([0.76, -8.26, 4.14], [-0.61, 0.12, -0.78])],
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
