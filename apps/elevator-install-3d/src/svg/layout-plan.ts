import type { LayoutGeometry } from '../model/geometry'

const SCALE = 0.14

export function renderLayoutPlanSvg(g: LayoutGeometry, highlightId: string | null): string {
  const w = g.hoistwayW * SCALE
  const d = g.hoistwayD * SCALE
  const pw = g.platformW * SCALE
  const pd = g.platformD * SCALE
  const ox = 80
  const oy = 60
  const px = ox + (g.hoistwayW - g.platformW) / 2 * SCALE
  const py = oy + (g.hoistwayD - g.platformD) / 2 * SCALE
  const entranceX = ox + g.entranceCL * SCALE
  const railX = ox + g.railCL * SCALE

  const hl = (id: string) => (highlightId === id ? 'var(--highlight)' : 'var(--line)')

  return `<svg viewBox="0 0 ${w + 160} ${d + 120}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Type A plan">
  <defs>
    <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
      <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#12284a" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#grid)" opacity="0.35"/>
  <rect data-id="hoistway" x="${ox}" y="${oy}" width="${w}" height="${d}" fill="none" stroke="${hl('hoistway')}" stroke-width="2"/>
  <rect data-id="platform" x="${px}" y="${py}" width="${pw}" height="${pd}" fill="rgba(56,214,255,0.08)" stroke="${hl('platform')}" stroke-width="1.5"/>
  <line data-id="entrance" x1="${entranceX}" y1="${oy}" x2="${entranceX}" y2="${oy + d}" stroke="${hl('entrance')}" stroke-dasharray="6 4"/>
  <line data-id="rail" x1="${railX}" y1="${oy}" x2="${railX}" y2="${oy + d}" stroke="${hl('rail')}" stroke-width="1"/>
  <circle data-id="cylinder" cx="${ox + g.wallToCylinder * SCALE}" cy="${oy + d * 0.72}" r="8" fill="none" stroke="${hl('cylinder')}" />
  ${dimH(ox, oy - 24, w, `${g.hoistwayW} mm`)}
  ${dimV(ox - 24, oy, d, `${g.hoistwayD} mm`)}
  ${dimH(px, py + pd + 16, pw, `Platform ${g.platformW} mm`)}
  <text x="${ox}" y="${oy + d + 40}" fill="#8ba4c7" font-family="IBM Plex Mono" font-size="11">E ℄ ${g.entranceCL} mm · R ℄ ${g.railCL} mm</text>
</svg>`
}

function dimH(x: number, y: number, len: number, label: string): string {
  return `<g class="dim">
    <line x1="${x}" y1="${y}" x2="${x + len}" y2="${y}" stroke="#38d6ff" stroke-width="1"/>
    <text x="${x + len / 2}" y="${y - 4}" text-anchor="middle" fill="#e6f1ff" font-family="IBM Plex Mono" font-size="10">${label}</text>
  </g>`
}

function dimV(x: number, y: number, len: number, label: string): string {
  return `<g class="dim">
    <line x1="${x}" y1="${y}" x2="${x}" y2="${y + len}" stroke="#38d6ff" stroke-width="1"/>
    <text x="${x - 6}" y="${y + len / 2}" text-anchor="end" fill="#e6f1ff" font-family="IBM Plex Mono" font-size="10" transform="rotate(-90 ${x - 6} ${y + len / 2})">${label}</text>
  </g>`
}
