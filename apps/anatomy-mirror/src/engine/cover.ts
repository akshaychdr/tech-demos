import type { Vec3 } from '../domain/types.ts'

/** Map a MediaPipe landmark into y-up pixel space that matches object-fit: cover. */
export function coverPoint(
  nx: number,
  ny: number,
  nz: number,
  videoW: number,
  videoH: number,
  viewW: number,
  viewH: number,
): Vec3 {
  const fit = Math.max(viewW / videoW, viewH / videoH)
  const dispW = videoW * fit
  const dispH = videoH * fit
  const offX = (viewW - dispW) / 2
  const offY = (viewH - dispH) / 2
  const screenX = offX + nx * dispW
  const screenY = offY + ny * dispH
  return [screenX, viewH - screenY, -nz * dispW]
}

export function coverSize(videoW: number, videoH: number, viewW: number, viewH: number): number {
  return Math.max(viewW / videoW, viewH / videoH) * videoW
}
