import type { LayoutGeometry } from '../model/geometry'
import { planRects } from '../model/layoutCoords'

const LABEL = 18
const STROKE = 2.5

export function renderLayoutPlanSvg(g: LayoutGeometry, highlightId: string | null): string {
  const { hoistway, platform, door, entranceX, railX, cylinderX, cylinderY, g: geo } = planRects(g)
  const pad = 120
  const vbW = hoistway.w + pad * 2
  const vbH = hoistway.h + pad * 2 + 80
  const ox = pad
  const oy = pad

  const hl = (id: string, stroke = '#38d6ff') =>
    highlightId === id ? '#ff8a3d' : stroke

  const hx = ox
  const hy = oy
  const hw = hoistway.w
  const hd = hoistway.h
  const px = ox + platform.x
  const py = oy + platform.y

  return `<svg viewBox="0 0 ${vbW} ${vbH}" xmlns="http://www.w3.org/2000/svg" class="layout-plan-svg" role="img" aria-label="Type A plan mm">
  <defs>
    <pattern id="plan-grid" width="50" height="50" patternUnits="userSpaceOnUse">
      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#12284a" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#plan-grid)" opacity="0.5"/>
  <text x="${ox}" y="36" fill="#ff8a3d" font-family="Inter" font-size="16" font-weight="600">Type A plan (mm) — illustrative</text>

  <rect data-id="hoistway" data-part="hoistway" x="${hx}" y="${hy}" width="${hw}" height="${hd}"
    fill="rgba(56,214,255,0.06)" stroke="${hl('hoistway')}" stroke-width="${STROKE}"/>

  <rect data-id="platform" data-part="platform" x="${px}" y="${py}" width="${platform.w}" height="${platform.h}"
    fill="rgba(255,138,61,0.12)" stroke="${hl('platform', '#ff8a3d')}" stroke-width="${STROKE}"/>

  <rect data-id="cab" data-part="cab" x="${ox + geo.wallToCab}" y="${oy + geo.wallToCab}"
    width="${hw - geo.wallToCab * 2}" height="${hd - geo.wallToCab * 2}"
    fill="none" stroke="${hl('cab')}" stroke-width="1.5" stroke-dasharray="8 6"/>

  <g data-id="gate" data-part="gate">
    <rect x="${ox + door.x}" y="${hy + hd - 8}" width="${door.w}" height="8" fill="${hl('gate', '#ff8a3d')}" opacity="0.5"/>
    <path d="M ${ox + door.x} ${hy + hd} L ${ox + door.x + door.w * 0.15} ${hy + hd - 55} L ${ox + door.x + door.w * 0.85} ${hy + hd - 55} L ${ox + door.x + door.w} ${hy + hd}"
      fill="none" stroke="${hl('gate', '#ff8a3d')}" stroke-width="${STROKE}"/>
    <text x="${ox + door.x + door.w / 2}" y="${hy + hd - 62}" text-anchor="middle" fill="#ff8a3d" font-size="${LABEL - 2}" font-family="IBM Plex Mono">Accordion gate</text>
  </g>

  <line data-id="entrance" data-part="entrance" x1="${ox + entranceX}" y1="${hy}" x2="${ox + entranceX}" y2="${hy + hd}"
    stroke="${hl('entrance')}" stroke-width="2" stroke-dasharray="10 8"/>
  <text x="${ox + entranceX + 8}" y="${hy + 28}" fill="${hl('entrance')}" font-size="${LABEL}" font-family="IBM Plex Mono">E ℄ ${geo.entranceCL}</text>

  <line data-id="rail" data-part="rail" x1="${ox + railX}" y1="${hy}" x2="${ox + railX}" y2="${hy + hd}"
    stroke="${hl('rail')}" stroke-width="${STROKE}"/>
  <text x="${ox + railX + 8}" y="${hy + 52}" fill="${hl('rail')}" font-size="${LABEL}" font-family="IBM Plex Mono">R ℄ ${geo.railCL}</text>

  <g data-id="cylinder" data-part="cylinder">
    <circle cx="${ox + cylinderX}" cy="${oy + cylinderY}" r="28" fill="rgba(255,138,61,0.15)" stroke="${hl('cylinder', '#ff8a3d')}" stroke-width="${STROKE}"/>
    <text x="${ox + cylinderX}" y="${oy + cylinderY + 5}" text-anchor="middle" fill="#e6f1ff" font-size="14" font-family="IBM Plex Mono">CYL</text>
  </g>

  ${dimH(hx, hy - 36, hw, `${geo.hoistwayW} mm`, LABEL)}
  ${dimV(hx - 36, hy, hd, `${geo.hoistwayD} mm`, LABEL)}
  ${dimH(px, py + platform.h + 28, platform.w, `Platform ${geo.platformW}`, LABEL)}
  ${dimH(hx + geo.wallToRail, hy + hd + 52, geo.wallToRail, `${geo.wallToRail}`, 14)}
  <text x="${hx}" y="${hy + hd + 72}" fill="#8ba4c7" font-size="14" font-family="IBM Plex Mono">Wall → rail ${geo.wallToRail} mm · cylinder ${geo.wallToCylinder} mm · cab ${geo.wallToCab} mm</text>
</svg>`
}

function dimH(x: number, y: number, len: number, label: string, fs: number): string {
  return `<g class="dim" data-part="dim">
    <line x1="${x}" y1="${y}" x2="${x + len}" y2="${y}" stroke="#38d6ff" stroke-width="1.5"/>
    <line x1="${x}" y1="${y - 6}" x2="${x}" y2="${y + 6}" stroke="#38d6ff"/>
    <line x1="${x + len}" y1="${y - 6}" x2="${x + len}" y2="${y + 6}" stroke="#38d6ff"/>
    <text x="${x + len / 2}" y="${y - 10}" text-anchor="middle" fill="#e6f1ff" font-family="IBM Plex Mono" font-size="${fs}">${label}</text>
  </g>`
}

function dimV(x: number, y: number, len: number, label: string, fs: number): string {
  return `<g class="dim" data-part="dim">
    <line x1="${x}" y1="${y}" x2="${x}" y2="${y + len}" stroke="#38d6ff" stroke-width="1.5"/>
    <text x="${x - 12}" y="${y + len / 2}" text-anchor="end" fill="#e6f1ff" font-family="IBM Plex Mono" font-size="${fs}" transform="rotate(-90 ${x - 12} ${y + len / 2})">${label}</text>
  </g>`
}
