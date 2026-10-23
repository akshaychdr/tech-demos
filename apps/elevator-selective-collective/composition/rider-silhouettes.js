/** Stylized neon person silhouettes (distinct per rider). viewBox 0 0 48 96 */

const base = (extra = '') => `
  <ellipse cx="24" cy="11" rx="9" ry="10" fill="rgba(12,36,52,0.92)" stroke="#e0f2fe" stroke-width="2.2"/>
  <path d="M14 24 Q24 20 34 24 L36 52 Q24 48 12 52 Z" fill="rgba(8,28,44,0.9)" stroke="#67e8f9" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M16 52 L13 88 M32 52 L35 88" fill="none" stroke="#67e8f9" stroke-width="2.6" stroke-linecap="round"/>
  ${extra}
`

export const RIDER_SVG_HTML = {
  a: base(`<path d="M34 30 L42 38" fill="none" stroke="#a5f3fc" stroke-width="2"/>`),
  b: base(`<rect x="8" y="42" width="10" height="14" rx="2" fill="none" stroke="#f472b6" stroke-width="2"/>`),
  c: base(
    `<rect x="6" y="40" width="12" height="16" rx="2" fill="rgba(20,12,32,0.5)" stroke="#c084fc" stroke-width="2"/>
     <line x1="6" y1="56" x2="18" y2="62" stroke="#c084fc" stroke-width="2"/>`,
  ),
  d: base(`<circle cx="38" cy="58" r="5" fill="none" stroke="#fbbf24" stroke-width="2"/>`),
}

export function injectRiderSvg(container, riderId) {
  const inner = RIDER_SVG_HTML[riderId]
  if (!container || !inner) return
  container.innerHTML = `<svg viewBox="0 0 48 96" xmlns="http://www.w3.org/2000/svg" class="neon-person-svg" aria-hidden="true">${inner}</svg>`
}
