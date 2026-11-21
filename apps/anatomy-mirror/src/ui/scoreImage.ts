import { formatScore } from '../domain/share.ts'

function skull(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(s, s)
  ctx.lineWidth = 3
  ctx.strokeStyle = '#e7c9a1'
  ctx.fillStyle = 'rgba(231, 201, 161, 0.08)'
  ctx.beginPath()
  ctx.ellipse(0, -12, 46, 52, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(-16, -8, 10, 13, 0, 0, Math.PI * 2)
  ctx.ellipse(16, -8, 10, 13, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#14120f'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0, 4)
  ctx.lineTo(-7, 22)
  ctx.lineTo(7, 22)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(-28, 38)
  ctx.quadraticCurveTo(0, 58, 28, 38)
  ctx.lineTo(22, 48)
  ctx.quadraticCurveTo(0, 62, -22, 48)
  ctx.closePath()
  ctx.stroke()
  for (const x of [-12, -4, 4, 12]) {
    ctx.beginPath()
    ctx.moveTo(x, 40)
    ctx.lineTo(x, 50)
    ctx.stroke()
  }
  ctx.restore()
}

export function drawScoreCard(score: number, found: number, asked: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1080
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('canvas'))
  const sky = ctx.createLinearGradient(0, 0, 0, 1080)
  sky.addColorStop(0, '#1a140f')
  sky.addColorStop(1, '#07080c')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, 1080, 1080)
  ctx.strokeStyle = 'rgba(231, 201, 161, 0.25)'
  ctx.lineWidth = 2
  ctx.strokeRect(48, 48, 984, 984)
  skull(ctx, 540, 390, 4.2)
  ctx.fillStyle = '#f4efe6'
  ctx.textAlign = 'center'
  ctx.font = '600 42px Outfit, sans-serif'
  ctx.fillText('ANATOMY MIRROR', 540, 700)
  ctx.font = '560 120px Fraunces, serif'
  ctx.fillStyle = '#e7c9a1'
  ctx.fillText(`${formatScore(score)}/10`, 540, 840)
  ctx.font = '400 36px Outfit, sans-serif'
  ctx.fillStyle = '#d9d0c3'
  ctx.fillText(`Found ${found} of ${asked} face muscles`, 540, 910)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png')
  })
}
