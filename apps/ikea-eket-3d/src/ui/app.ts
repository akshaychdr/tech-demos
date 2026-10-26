import { EketViewer } from '../scene/EketViewer'
import {
  cumulativeNodes,
  hardwareIntroducedThrough,
  product,
  steps,
} from '../model/stepsData'

const DATASET =
  'https://github.com/IKEA/IKEA3DAssemblyDataset'
const LICENSE = 'https://creativecommons.org/licenses/by-nc-sa/4.0/'

export async function mountApp(root: HTMLElement) {
  const base = import.meta.env.BASE_URL
  root.innerHTML = `
    <div class="shell">
      <header class="top">
        <div>
          <h1>EKET · 2 drawers</h1>
          <p class="sub">Article ${product.article} · ${product.sizeMm[0]}×${product.sizeMm[1]}×${product.sizeMm[2]} mm · Manual ${product.manual}</p>
        </div>
        <div class="counters">
          <span data-step-counter>Step 0/${steps.length - 1}</span>
          <span data-part-counter>Parts 0</span>
        </div>
      </header>
      <main class="main">
        <section class="viewport-wrap" data-viewport></section>
        <aside class="manual" data-manual>
          <img data-manual-img alt="Assembly manual page" />
          <p class="manual-cap">Manual page <span data-manual-page>7</span></p>
        </aside>
        <aside class="side">
          <div class="step-card">
            <h2 data-step-title></h2>
            <p data-step-summary></p>
            <ul class="hw-list" data-hw-list></ul>
          </div>
          <div class="controls">
            <button type="button" data-prev>←</button>
            <button type="button" data-play>▶</button>
            <button type="button" data-next>→</button>
          </div>
          <input class="timeline" type="range" min="0" max="${steps.length - 1}" value="0" data-timeline />
          <p class="dims" data-dims>Outer: ${product.sizeMm.join(' × ')} mm</p>
          <section class="license">
            <h3>Data &amp; license</h3>
            <p>3D models and assembly manual from the <a href="${DATASET}" target="_blank" rel="noopener">IKEA 3D Assembly Dataset</a> (Inter IKEA Systems B.V.), licensed under <a href="${LICENSE}" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>. PDF: <a href="${base}dataset/AA-1914748-7.pdf" target="_blank" rel="noopener">${product.manual}</a>.</p>
          </section>
          <section class="keys">
            <h3>Keys</h3>
            <p><kbd>[</kbd> <kbd>]</kbd> steps · <kbd>Space</kbd> play · <kbd>0</kbd>–<kbd>9</kbd> jump · <kbd>C</kbd> full build · <kbd>R</kbd> reset view</p>
          </section>
        </aside>
      </main>
    </div>
  `

  const viewport = root.querySelector<HTMLElement>('[data-viewport]')!
  const viewer = new EketViewer(viewport)
  if (new URLSearchParams(location.search).has('capture')) {
    ;(window as unknown as { __eketViewer?: EketViewer }).__eketViewer = viewer
  }
  const manualImg = root.querySelector<HTMLImageElement>('[data-manual-img]')!
  const manualPage = root.querySelector<HTMLSpanElement>('[data-manual-page]')!
  const titleEl = root.querySelector<HTMLHeadingElement>('[data-step-title]')!
  const hwList = root.querySelector<HTMLUListElement>('[data-hw-list]')!
  const stepCounter = root.querySelector<HTMLSpanElement>('[data-step-counter]')!
  const partCounter = root.querySelector<HTMLSpanElement>('[data-part-counter]')!
  const timeline = root.querySelector<HTMLInputElement>('[data-timeline]')!
  let playing = false

  function refresh(stepIndex: number) {
    const step = steps[stepIndex]
    titleEl.textContent = `Step ${step.id}: ${step.title}`
    root.querySelector<HTMLParagraphElement>('[data-step-summary]')!.textContent =
      step.id === 0
        ? 'Exploded preview of all GLB parts. Step through to assemble the cabinet and open the drawers.'
        : `Follow manual page ${step.manualPage}.`
    stepCounter.textContent = `Step ${step.id}/${steps.length - 1}`
    const placed = cumulativeNodes(stepIndex).size
    partCounter.textContent =
      stepIndex === 0 ? `Parts 0/83 (flat pack)` : `Assembled ${placed}/83`
    manualPage.textContent = String(step.manualPage)
    manualImg.src = `${base}dataset/manual-pages/page-${String(step.manualPage).padStart(2, '0')}.png`

    hwList.innerHTML = ''
    const hw = hardwareIntroducedThrough(stepIndex)
    for (const [id, count] of Object.entries(hw)) {
      const li = document.createElement('li')
      li.textContent = `${count}× ${id}`
      hwList.appendChild(li)
    }
    if (step.hardware.length) {
      for (const h of step.hardware) {
        const li = document.createElement('li')
        li.className = 'new-hw'
        li.textContent = `+${h.count}× ${h.label ?? h.id} (this step)`
        hwList.appendChild(li)
      }
    }
    timeline.value = String(stepIndex)
  }

  viewer.setOnStep(refresh)
  await viewer.loadModel(base)
  refresh(0)
  viewer.resize()

  const go = (i: number) => void viewer.goToStep(i)
  root.querySelector('[data-prev]')!.addEventListener('click', () => go(viewer.step - 1))
  root.querySelector('[data-next]')!.addEventListener('click', () => go(viewer.step + 1))
  root.querySelector('[data-play]')!.addEventListener('click', () => {
    playing = !playing
    viewer.play(playing)
    root.querySelector<HTMLButtonElement>('[data-play]')!.textContent = playing ? '⏸' : '▶'
  })
  timeline.addEventListener('input', () => go(Number(timeline.value)))

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return
    if (e.key === '[') go(viewer.step - 1)
    if (e.key === ']') go(viewer.step + 1)
    if (e.key === ' ') {
      e.preventDefault()
      playing = !playing
      viewer.play(playing)
    }
    if (e.key === 'r' || e.key === 'R') viewer.resetView()
    if (e.key === 'c' || e.key === 'C') void viewer.playAll()
    const d = Number(e.key)
    if (d >= 0 && d <= 9) {
      const idx = steps.findIndex((s) => s.id === d)
      if (idx >= 0) go(idx)
    }
  })
}
