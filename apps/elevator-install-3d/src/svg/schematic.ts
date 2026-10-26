import type { SwitchState } from '../model/circuit'
import { auxContactClosed, energisedEdgeIds } from '../model/circuit'

export type FlowPhase = 'idle' | 'aux' | 'main' | 'motor'

const W = 1400
const H = 720

function wireClass(on: Set<string>, id: string, phase: string): string {
  const lit = on.has(id)
  return `wire wire-${phase.toLowerCase()}${lit ? ' energised' : ''}`
}

export function renderSchematicSvg(state: SwitchState, flowT = 0): string {
  const on = energisedEdgeIds(state)
  const auxOn = auxContactClosed(state)

  const pulseDots = (pathD: string, id: string, color: string) => {
    if (!on.has(id)) return ''
    const offset = (flowT * 120) % 100
    return `<path d="${pathD}" class="flow-overlay" stroke="${color}" stroke-width="4" stroke-dasharray="12 88" stroke-dashoffset="${-offset}" fill="none" opacity="0.9"/>`
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="wiring-schematic">
  <defs>
    <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="100%" height="100%" fill="#0a1628"/>
  <text x="20" y="36" fill="#ff8a3d" font-family="Inter" font-size="20" font-weight="600">Illustrative demo, not for installation</text>

  <!-- 110V aux disconnect -->
  <g transform="translate(40,70)">
    <rect width="130" height="88" rx="6" fill="rgba(56,214,255,0.06)" stroke="#38d6ff"/>
    <text x="12" y="24" fill="#e6f1ff" font-size="12" font-family="IBM Plex Mono">110 VAC AUX</text>
    <text x="12" y="42" fill="#8ba4c7" font-size="10">FUSE 15 A</text>
    <circle cx="28" cy="62" r="6" fill="none" stroke="#38d6ff"/><text x="22" y="66" font-size="8" fill="#8ba4c7">1</text>
    <circle cx="68" cy="62" r="6" fill="none" stroke="#38d6ff"/><text x="62" y="66" font-size="8" fill="#8ba4c7">N</text>
    <text x="90" y="66" font-size="9" fill="#e6f1ff">H / N → controller</text>
  </g>

  <!-- Main disconnect -->
  <g transform="translate(220,55)">
    <rect width="175" height="115" rx="6" fill="rgba(56,214,255,0.06)" stroke="#38d6ff"/>
    <text x="12" y="22" fill="#e6f1ff" font-size="12" font-family="IBM Plex Mono">MAIN DISCONNECT</text>
    <text x="12" y="40" fill="#8ba4c7" font-size="10">3-pole · 30 A fuses · L1 L2 L3</text>
    ${[0, 1, 2].map((i) => `<rect x="${12 + i * 48}" y="52" width="36" height="22" fill="none" stroke="#ff8a3d"/><text x="${22 + i * 48}" y="67" font-size="9" fill="#ff8a3d">30A</text>`).join('')}
    <rect x="12" y="82" width="60" height="22" rx="3" fill="none" stroke="${auxOn ? '#3dff9a' : '#ff8a3d'}" stroke-dasharray="${auxOn ? '0' : '4 3'}"/>
    <text x="16" y="97" font-size="9" fill="#8ba4c7">AUX NO 13-14</text>
    <path d="M 100 93 L 130 93" stroke="#8ba4c7" stroke-dasharray="3 2"/>
    <text x="135" y="97" font-size="8" fill="#8ba4c7">linked</text>
  </g>

  <!-- Contactors -->
  ${[
    { x: 440, label: 'K1', aux: '13/14' },
    { x: 560, label: 'K2', aux: '13/14' },
  ]
    .map(
      (k) => `
  <g transform="translate(${k.x},78)">
    <rect width="95" height="72" rx="4" fill="rgba(56,214,255,0.05)" stroke="#38d6ff"/>
    <text x="8" y="18" fill="#e6f1ff" font-size="11" font-family="IBM Plex Mono">${k.label}</text>
    <text x="8" y="34" fill="#8ba4c7" font-size="9">1/3/5 → 2/4/6</text>
    <text x="8" y="50" fill="#8ba4c7" font-size="9">AUX ${k.aux}</text>
    <text x="8" y="64" fill="#8ba4c7" font-size="8">coil</text>
  </g>`,
    )
    .join('')}

  <!-- Overload -->
  <g transform="translate(690,78)">
    <rect width="88" height="72" rx="4" fill="rgba(56,214,255,0.05)" stroke="#38d6ff"/>
    <text x="8" y="22" fill="#e6f1ff" font-size="11">OVERLOAD</text>
    <text x="8" y="40" fill="#8ba4c7" font-size="9">2/4/6 in</text>
    <text x="8" y="56" fill="#8ba4c7" font-size="9">T1/T2/T3 out</text>
  </g>

  <!-- Motor -->
  <g transform="translate(820,68)">
    <circle cx="50" cy="50" r="42" fill="rgba(255,138,61,0.08)" stroke="#38d6ff" stroke-width="2"/>
    <text x="32" y="54" fill="#e6f1ff" font-size="12" font-family="IBM Plex Mono">M</text>
    <text x="22" y="72" fill="#8ba4c7" font-size="9">pump motor</text>
  </g>

  <!-- Wire paths -->
  <path id="w-aux-h" class="${wireClass(on, 'aux-h', 'H')}" d="M 170 132 L 220 132" stroke-width="3" fill="none"/>
  <path class="${wireClass(on, 'aux-n', 'N')}" d="M 170 148 L 210 148 L 210 200 L 80 200 L 80 240" stroke-width="2" fill="none"/>

  <path class="${wireClass(on, 'L1-fuse', 'L1')}" d="M 395 95 L 440 95" stroke-width="3" fill="none"/>
  <path class="${wireClass(on, 'L1-c1', 'L1')}" d="M 440 95 L 535 95 L 560 95" stroke-width="3" fill="none"/>
  <path class="${wireClass(on, 'L1-c2out', 'L1')}" d="M 655 95 L 690 95 L 778 95 L 820 95" stroke-width="3" fill="none"/>

  <path class="${wireClass(on, 'L2-fuse', 'L2')}" d="M 395 115 L 440 115 L 535 115 L 560 115 L 655 115 L 690 115 L 778 115 L 820 115" stroke-width="3" fill="none"/>
  <path class="${wireClass(on, 'L3-fuse', 'L3')}" d="M 395 135 L 440 135 L 535 135 L 560 135 L 655 135 L 690 135 L 778 135 L 820 135" stroke-width="3" fill="none"/>

  <path class="${on.has('gnd-run') ? 'wire ground energised' : 'wire ground'}" d="M 300 170 L 480 170 L 480 240 L 120 240" stroke="#3dff9a" stroke-width="3" fill="none"/>
  <text x="300" y="188" fill="#3dff9a" font-size="10" font-family="IBM Plex Mono">10 AWG GND → controller</text>

  ${pulseDots('M 170 132 L 220 132', 'aux-h', '#ff8a3d')}
  ${pulseDots('M 440 95 L 820 95', 'L1-c2out', '#ff8a3d')}
  ${pulseDots('M 440 115 L 820 115', 'L2-chain', '#38d6ff')}
  ${pulseDots('M 440 135 L 820 135', 'L3-chain', '#a78bfa')}

  <text x="40" y="${H - 24}" fill="#8ba4c7" font-size="11">Appendix 3 redrawn · Wires from disconnect → K1 → K2 → overload → motor</text>
</svg>`
}

export function renderMotorLinkSvg(mode: 'single' | 'delta' | 'wye', active = false): string {
  const stroke = active ? '#ff8a3d' : '#38d6ff'
  const title =
    mode === 'single'
      ? 'Single-phase'
      : mode === 'delta'
        ? 'Δ (low voltage)'
        : 'Y (high voltage)'

  const terminals = `
    <rect x="40" y="30" width="200" height="120" rx="4" fill="rgba(10,22,40,0.9)" stroke="${stroke}"/>
    ${['T1', 'T2', 'T3'].map((t, i) => `<circle cx="${70 + i * 55}" cy="55" r="10" fill="none" stroke="${stroke}"/><text x="${66 + i * 55}" y="59" font-size="8" fill="#e6f1ff">${t}</text><text x="${60 + i * 55}" y="78" font-size="7" fill="#8ba4c7">TBD</text>`).join('')}
    ${['L1', 'L2', 'L3'].map((t, i) => `<circle cx="${70 + i * 55}" cy="110" r="8" fill="none" stroke="#8ba4c7"/><text x="${66 + i * 55}" y="114" font-size="7" fill="#8ba4c7">${t}</text>`).join('')}
  `

  const links =
    mode === 'delta'
      ? '<line x1="70" y1="55" x2="70" y2="110" stroke="#ff8a3d" stroke-width="3"/><line x1="125" y1="55" x2="125" y2="110" stroke="#ff8a3d" stroke-width="3"/><line x1="180" y1="55" x2="180" y2="110" stroke="#ff8a3d" stroke-width="3"/>'
      : mode === 'wye'
        ? '<line x1="70" y1="110" x2="180" y2="110" stroke="#ff8a3d" stroke-width="3"/><line x1="125" y1="55" x2="125" y2="110" stroke="#ff8a3d" stroke-width="2"/>'
        : '<line x1="70" y1="55" x2="125" y2="55" stroke="#ff8a3d" stroke-width="3"/><line x1="70" y1="110" x2="180" y2="110" stroke="#ff8a3d" stroke-width="3"/><text x="140" y="52" font-size="8" fill="#8ba4c7">link A</text><text x="140" y="125" font-size="8" fill="#8ba4c7">link B</text>'

  return `<svg viewBox="0 0 280 180" xmlns="http://www.w3.org/2000/svg" class="motor-link">
  <text x="8" y="18" fill="#e6f1ff" font-size="11" font-family="IBM Plex Mono">${title}</text>
  ${terminals}
  ${links}
  <text x="8" y="168" fill="#8ba4c7" font-size="8">Terminal IDs TBD per OEM plate</text>
</svg>`
}
