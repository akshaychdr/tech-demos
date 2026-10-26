import type { SwitchState } from '../model/circuit'
import { energisedEdgeIds, auxContactClosed } from '../model/circuit'

export function renderSchematicSvg(state: SwitchState): string {
  const on = energisedEdgeIds(state)
  const auxOn = auxContactClosed(state)
  const pulse = (id: string) => (on.has(id) ? 'flow-pulse on' : 'flow-pulse')

  return `<svg viewBox="0 0 920 520" xmlns="http://www.w3.org/2000/svg">
  <text x="20" y="28" fill="#ff8a3d" font-family="Inter" font-size="13" font-weight="600">Illustrative demo, not for installation</text>
  <rect x="40" y="50" width="140" height="70" fill="none" stroke="#38d6ff" rx="4"/>
  <text x="50" y="72" fill="#e6f1ff" font-size="11" font-family="IBM Plex Mono">110 VAC aux</text>
  <text x="50" y="88" fill="#8ba4c7" font-size="10">FUSE 15A · 1/N</text>
  <rect x="220" y="40" width="160" height="90" fill="none" stroke="#38d6ff" rx="4"/>
  <text x="230" y="62" fill="#e6f1ff" font-size="11" font-family="IBM Plex Mono">Main disconnect</text>
  <text x="230" y="78" fill="#8ba4c7" font-size="10">L1 L2 L3 · 30A fuses</text>
  <text x="230" y="94" fill="#8ba4c7" font-size="10">AUX NO ${auxOn ? '(closed)' : '(open)'}</text>
  <rect x="420" y="55" width="90" height="50" fill="none" stroke="#38d6ff"/>
  <text x="430" y="85" fill="#e6f1ff" font-size="10">K1 1/3/5→2/4/6</text>
  <rect x="540" y="55" width="90" height="50" fill="none" stroke="#38d6ff"/>
  <text x="550" y="85" fill="#e6f1ff" font-size="10">K2 1/3/5→2/4/6</text>
  <rect x="660" y="55" width="80" height="50" fill="none" stroke="#38d6ff"/>
  <text x="670" y="85" fill="#e6f1ff" font-size="10">OL 2/4/6</text>
  <circle cx="800" cy="80" r="28" fill="none" stroke="#38d6ff"/>
  <text x="785" y="85" fill="#e6f1ff" font-size="10">MOTOR</text>
  <path class="${pulse('aux-h')}" d="M 180 85 L 220 85"/>
  <path class="${pulse('L1-c1')}" d="M 380 70 L 420 70 L 510 70 L 540 70 L 630 70 L 660 70 L 772 70"/>
  <path class="${pulse('L2-chain')}" d="M 380 85 L 772 85"/>
  <path class="${pulse('L3-chain')}" d="M 380 100 L 772 100"/>
  <path class="ground-wire ${on.has('gnd-run') ? 'on' : ''}" d="M 300 130 L 450 130" stroke="#3dff9a" stroke-width="2" fill="none"/>
  <text x="450" y="148" fill="#3dff9a" font-size="10" font-family="IBM Plex Mono">10 AWG ground to controller</text>
  <text x="40" y="200" fill="#8ba4c7" font-size="10">Wires from disconnect → contactors → overload → motor (Appendix 3, redrawn)</text>
</svg>`
}

export function renderMotorLinkSvg(mode: 'single' | 'delta' | 'wye'): string {
  const label =
    mode === 'single'
      ? 'Single-phase links (TBD terminals)'
      : mode === 'delta'
        ? 'Δ low voltage — 3 vertical links'
        : 'Y high voltage — bottom link'
  const links =
    mode === 'delta'
      ? '<line x1="70" y1="40" x2="70" y2="100" stroke="#ff8a3d"/><line x1="100" y1="40" x2="100" y2="100" stroke="#ff8a3d"/><line x1="130" y1="40" x2="130" y2="100" stroke="#ff8a3d"/>'
      : mode === 'wye'
        ? '<line x1="60" y1="100" x2="140" y2="100" stroke="#ff8a3d"/>'
        : '<line x1="80" y1="55" x2="120" y2="55" stroke="#ff8a3d"/><line x1="80" y1="95" x2="120" y2="95" stroke="#ff8a3d"/>'
  return `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg">
  <rect x="50" y="30" width="100" height="80" fill="none" stroke="#38d6ff"/>
  ${links}
  <text x="8" y="130" fill="#8ba4c7" font-size="9" font-family="IBM Plex Mono">${label}</text>
</svg>`
}
