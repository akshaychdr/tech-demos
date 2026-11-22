export type Callout = {
  text: string
  color: string
  x: number
  y: number
}

/** Leader lines from a 3D anchor to a short label parked beside the face. */
export function paintCallouts(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  items: Callout[],
  centerX: number,
): void {
  ctx.clearRect(0, 0, width, height)
  if (items.length === 0) return
  const left: Callout[] = []
  const right: Callout[] = []
  for (const item of items) {
    if (item.x < centerX) left.push(item)
    else right.push(item)
  }
  ctx.font = '600 12px Outfit, "Avenir Next", "Segoe UI", sans-serif'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  const columns: [Callout[], 'left' | 'right'][] = [
    [left, 'left'],
    [right, 'right'],
  ]
  for (const [list, side] of columns) {
    list.sort((a, b) => a.y - b.y)
    let cursor = 18
    const rows: { item: Callout; y: number }[] = []
    for (const item of list) {
      const y = Math.max(item.y, cursor)
      rows.push({ item, y })
      cursor = y + 20
    }
    const overflow = cursor - (height - 18)
    const nudge = overflow > 0 ? overflow : 0
    for (const row of rows) {
      const y = row.y - nudge
      const textWidth = ctx.measureText(row.item.text).width
      const room = side === 'left' ? row.item.x - 26 : width - row.item.x - 26
      const textX =
        side === 'left'
          ? Math.max(10, Math.min(row.item.x - 30, centerX - 28) - textWidth)
          : Math.min(width - textWidth - 10, Math.max(row.item.x + 30, centerX + 28))
      const endX = side === 'left' ? textX + textWidth + 7 : textX - 7
      ctx.globalAlpha = 0.8
      ctx.strokeStyle = row.item.color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(row.item.x, row.item.y)
      ctx.lineTo(endX, y)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.fillStyle = row.item.color
      ctx.beginPath()
      ctx.arc(row.item.x, row.item.y, 3.1, 0, Math.PI * 2)
      ctx.fill()
      if (room < 36 && textWidth > room + 80) continue
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(5, 8, 14, 0.88)'
      ctx.strokeText(row.item.text, textX, y)
      ctx.fillStyle = row.item.color
      ctx.fillText(row.item.text, textX, y)
    }
  }
}
