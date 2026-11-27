import { LabelColumns, type PlacedLabel, type ScreenLabel } from '../domain/headLabels.ts'

export type { PlacedLabel, ScreenLabel }
export { LabelColumns }

/** Columns of 12.5px labels with a 1px leader and a dot on the anchor. */
export function paintCallouts(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  items: ScreenLabel[],
  cx: number,
  halfWidth: number,
  columns: LabelColumns,
): void {
  ctx.clearRect(0, 0, width, height)
  const placed = columns.layout(items, width, height, cx, halfWidth)
  ctx.font = '600 12.5px system-ui, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  for (const row of placed) drawRow(ctx, row)
}

function drawRow(ctx: CanvasRenderingContext2D, row: PlacedLabel): void {
  const endX = row.side === 'left' ? row.tx + 5 : row.tx - 5
  ctx.globalAlpha = 0.75
  ctx.strokeStyle = row.color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(row.x, row.y)
  ctx.lineTo(endX, row.ty)
  ctx.stroke()
  ctx.fillStyle = row.color
  ctx.beginPath()
  ctx.arc(row.x, row.y, 2.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.textAlign = row.side === 'left' ? 'right' : 'left'
  ctx.lineWidth = 3.5
  ctx.strokeStyle = 'rgba(4, 7, 13, 0.9)'
  ctx.strokeText(row.text, row.tx, row.ty)
  ctx.fillStyle = row.color
  ctx.fillText(row.text, row.tx, row.ty)
}
