import gsap from 'gsap'
import stepsData from '../../data/steps.json'
import dimensions from '../../data/dimensions.json'

export type Scene2Api = {
  mount: (root: HTMLElement) => void
  goToStep: (index: number) => void
  next: () => void
  prev: () => void
  toggleExplode: () => void
  toggleAutoplay: () => void
  dispose: () => void
}

export function createScene2(): Scene2Api {
  let root: HTMLElement
  let stepIndex = 0
  let exploded = false
  let autoplayTimer: ReturnType<typeof setInterval> | null = null
  const steps = stepsData.steps

  const dim = (id: string) => dimensions.items.find((d) => d.id === id)

  function render() {
    const step = steps[stepIndex]
    const top = dim('curtain_top_spacing')!.mm ?? 225
    const mid = dim('curtain_mid_spacing')!.mm ?? 953
    const bot = dim('curtain_bot_spacing')!.mm ?? 248
    const bl = dim('bracket_l')!.mm ?? 51
    const bw = dim('bracket_w')!.mm ?? 25
    const bh = dim('bracket_h')!.mm ?? 32
    const ex = exploded ? step.explode : 0

    root.querySelector('[data-step-title]')!.textContent = step.title
    root.querySelector('[data-step-caption]')!.textContent = step.caption
    root.querySelector('[data-step-index]')!.textContent = `Step ${stepIndex + 1} / ${steps.length}`

    const svg = `
    <svg viewBox="0 0 640 420" xmlns="http://www.w3.org/2000/svg">
      <text x="12" y="22" fill="#ff8a3d" font-size="12" font-family="Inter">Illustrative demo, not for installation</text>
      <rect x="40" y="60" width="200" height="280" fill="none" stroke="#38d6ff" stroke-width="1.5"/>
      <text x="50" y="52" fill="#8ba4c7" font-size="10">Control wall</text>
      <g transform="translate(${80 + ex * 40}, ${90 + ex * 10})">
        <polygon points="0,0 24,0 24,18 0,32" fill="none" stroke="#ff8a3d"/>
        <text x="-4" y="-6" fill="#ff8a3d" font-size="11">A</text>
        <text x="30" y="12" fill="#e6f1ff" font-size="9" font-family="IBM Plex Mono">${bl}×${bw}×${bh}</text>
      </g>
      <g transform="translate(${80 + ex * 20}, ${90 + top * 0.35 + ex * 15})">
        <polygon points="0,0 24,0 24,18 0,32" fill="none" stroke="#ff8a3d"/>
      </g>
      <g transform="translate(${80 + ex * 25}, ${90 + (top + mid) * 0.35 + ex * 20})">
        <polygon points="0,0 24,0 24,18 0,32" fill="none" stroke="#ff8a3d"/>
      </g>
      <line x1="120" y1="90" x2="120" y2="${90 + top * 0.35}" stroke="#38d6ff" stroke-dasharray="4"/>
      <text x="125" y="${90 + (top * 0.35) / 2}" fill="#38d6ff" font-size="9">${top} mm</text>
      <line x1="120" y1="${90 + top * 0.35}" x2="120" y2="${90 + (top + mid) * 0.35}" stroke="#38d6ff" stroke-dasharray="4"/>
      <text x="125" y="${90 + top * 0.35 + (mid * 0.35) / 2}" fill="#38d6ff" font-size="9">${mid} mm</text>
      <line x1="120" y1="${90 + (top + mid) * 0.35}" x2="120" y2="${90 + (top + mid + bot) * 0.35}" stroke="#38d6ff" stroke-dasharray="4"/>
      <text x="125" y="${90 + (top + mid) * 0.35 + (bot * 0.35) / 2}" fill="#38d6ff" font-size="9">${bot} mm</text>
      <rect x="300" y="80" width="120" height="300" fill="rgba(56,214,255,0.06)" stroke="#38d6ff"/>
      <text x="310" y="72" fill="#8ba4c7" font-size="10">Side wall curtain</text>
      <circle cx="520" cy="120" r="28" fill="none" stroke="#38d6ff"/>
      <text x="500" y="125" fill="#e6f1ff" font-size="9">IR box</text>
      <text x="480" y="145" fill="#8ba4c7" font-size="8">(illustrative)</text>
      ${step.id === 's2-6' ? '<line x1="260" y1="200" x2="380" y2="200" stroke="#ff8a3d" stroke-width="2"/><text x="390" y="204" fill="#ff8a3d" font-size="11">DOOR REOPEN</text>' : ''}
      <text x="40" y="400" fill="#8ba4c7" font-size="9">Screws (B): TBD/illustrative · Appendix 5 redrawn</text>
    </svg>`
    root.querySelector('[data-curtain-svg]')!.innerHTML = svg
  }

  return {
    mount(host) {
      root = host
      root.innerHTML = `
        <div class="step-rail">
          <span class="step-label" data-step-index></span>
          <button type="button" data-prev>Prev</button>
          <button type="button" data-next>Next</button>
          <button type="button" data-explode>Exploded view</button>
          <button type="button" data-autoplay>Autoplay</button>
        </div>
        <h3 data-step-title></h3>
        <p class="caption" data-step-caption></p>
        <div class="svg-wrap" data-curtain-svg data-testid="scene2-curtain"></div>
      `
      root.querySelector('[data-prev]')!.addEventListener('click', () => {
        stepIndex = (stepIndex - 1 + steps.length) % steps.length
        render()
      })
      root.querySelector('[data-next]')!.addEventListener('click', () => {
        stepIndex = (stepIndex + 1) % steps.length
        render()
      })
      root.querySelector('[data-explode]')!.addEventListener('click', () => {
        exploded = !exploded
        gsap.fromTo(root.querySelector('[data-curtain-svg]'), { opacity: 0.6 }, { opacity: 1, duration: 0.4 })
        render()
      })
      root.querySelector('[data-autoplay]')!.addEventListener('click', () => {
        if (autoplayTimer) {
          clearInterval(autoplayTimer)
          autoplayTimer = null
          return
        }
        autoplayTimer = setInterval(() => {
          stepIndex = (stepIndex + 1) % steps.length
          render()
        }, 3500)
      })
      render()
    },
    goToStep(i) {
      stepIndex = i
      render()
    },
    next() {
      stepIndex = (stepIndex + 1) % steps.length
      render()
    },
    prev() {
      stepIndex = (stepIndex - 1 + steps.length) % steps.length
      render()
    },
    toggleExplode() {
      exploded = !exploded
      render()
    },
    toggleAutoplay() {
      if (autoplayTimer) clearInterval(autoplayTimer)
      else autoplayTimer = setInterval(() => this.next(), 3500)
    },
    dispose() {
      if (autoplayTimer) clearInterval(autoplayTimer)
    },
  }
}
