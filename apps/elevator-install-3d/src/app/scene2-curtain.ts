import gsap from 'gsap'
import stepsData from '../../data/steps.json'
import dimensions from '../../data/dimensions.json'
import { mountCurtain3D } from './curtain-3d'

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
  let curtain3d: ReturnType<typeof mountCurtain3D> | null = null

  const dim = (id: string) => dimensions.items.find((d) => d.id === id)

  function renderCallouts() {
    const top = dim('curtain_top_spacing')!.mm ?? 225
    const mid = dim('curtain_mid_spacing')!.mm ?? 953
    const bot = dim('curtain_bot_spacing')!.mm ?? 248
    const bl = dim('bracket_l')!.mm ?? 51
    const bw = dim('bracket_w')!.mm ?? 25
    const bh = dim('bracket_h')!.mm ?? 32

    const svg = `
    <svg viewBox="0 0 320 360" xmlns="http://www.w3.org/2000/svg">
      <text x="8" y="18" fill="#ff8a3d" font-size="11" font-family="Inter">Illustrative demo, not for installation</text>
      <line x1="48" y1="40" x2="48" y2="${40 + top * 0.22}" stroke="#38d6ff" stroke-width="1.5"/>
      <text x="52" y="${40 + (top * 0.22) / 2}" fill="#38d6ff" font-size="10" font-family="IBM Plex Mono">${top} mm</text>
      <line x1="48" y1="${40 + top * 0.22}" x2="48" y2="${40 + (top + mid) * 0.22}" stroke="#38d6ff" stroke-width="1.5"/>
      <text x="52" y="${40 + top * 0.22 + (mid * 0.22) / 2}" fill="#38d6ff" font-size="10" font-family="IBM Plex Mono">${mid} mm</text>
      <line x1="48" y1="${40 + (top + mid) * 0.22}" x2="48" y2="${40 + (top + mid + bot) * 0.22}" stroke="#38d6ff" stroke-width="1.5"/>
      <text x="52" y="${40 + (top + mid) * 0.22 + (bot * 0.22) / 2}" fill="#38d6ff" font-size="10" font-family="IBM Plex Mono">${bot} mm</text>
      <text x="8" y="340" fill="#8ba4c7" font-size="9">Bracket A ${bl}×${bw}×${bh} mm · Screw B (illustrative)</text>
    </svg>`
    root.querySelector('[data-callouts]')!.innerHTML = svg
  }

  function render() {
    const step = steps[stepIndex]
    root.querySelector('[data-step-title]')!.textContent = step.title
    root.querySelector('[data-step-caption]')!.textContent = step.caption
    root.querySelector('[data-step-index]')!.textContent = `Step ${stepIndex + 1} / ${steps.length}`
    renderCallouts()
    curtain3d?.applyStep(stepIndex as 0 | 1 | 2 | 3 | 4 | 5, exploded ? step.explode : 0)
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
        <div class="curtain-split">
          <div class="canvas-wrap curtain-3d" data-testid="scene2-curtain-3d"></div>
          <div class="svg-wrap callouts" data-callouts></div>
        </div>
      `
      curtain3d = mountCurtain3D(root.querySelector('.curtain-3d')!)
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
        gsap.fromTo(root.querySelector('.curtain-3d'), { scale: 0.98 }, { scale: 1, duration: 0.35 })
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
      curtain3d?.dispose()
    },
  }
}
