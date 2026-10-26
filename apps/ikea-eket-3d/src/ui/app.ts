import { assemblyFrames } from '../data/assemblyFrames'
import { ManualViewer } from '../scene/ManualViewer'
import { cumulativeNodes, hardwareIntroducedThrough, product, steps } from '../model/stepsData'

const DATASET = 'https://github.com/IKEA/IKEA3DAssemblyDataset'
export async function mountApp(root: HTMLElement) {
  const base = import.meta.env.BASE_URL
  const maxFrame = assemblyFrames.length - 1
  root.innerHTML = `
    <div class="shell">
      <header class="top">
        <div>
          <h1>EKET · 2 drawers</h1>
          <p class="sub">Article ${product.article} · Manual-first assembly · ${product.manual}</p>
        </div>
        <div class="counters">
          <span data-frame-counter>Frame 0/${maxFrame}</span>
          <span data-phase-tag>Flat pack</span>
        </div>
      </header>
      <main class="main">
        <section class="viewport-wrap" data-viewport></section>
        <aside class="manual" data-manual>
          <div class="manual-frame">
            <img data-manual-img alt="Assembly manual page" />
            <div class="manual-callout" data-manual-callout hidden></div>
          </div>
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
          <input class="timeline" type="range" min="0" max="${maxFrame}" value="0" data-timeline />
          <p class="dims" data-dims>Outer: ${product.sizeMm.join(' × ')} mm</p>
          <section class="license">
            <h3>Data &amp; license</h3>
            <p>3D models and manual from the <a href="${DATASET}" target="_blank" rel="noopener">IKEA 3D Assembly Dataset</a> (CC BY-NC-SA 4.0). PDF: <a href="${base}dataset/AA-1914748-7.pdf" target="_blank" rel="noopener">${product.manual}</a>.</p>
          </section>
          <section class="keys">
            <h3>Keys</h3>
            <p><kbd>[</kbd> <kbd>]</kbd> frames · <kbd>Space</kbd> play</p>
          </section>
        </aside>
      </main>
    </div>
  `

  const viewport = root.querySelector<HTMLElement>('[data-viewport]')!
  const viewer = new ManualViewer(viewport)
  if (new URLSearchParams(location.search).has('capture')) {
    ;(window as unknown as { __eketViewer?: ManualViewer }).__eketViewer = viewer
  }

  const manualImg = root.querySelector<HTMLImageElement>('[data-manual-img]')!
  const callout = root.querySelector<HTMLDivElement>('[data-manual-callout]')!
  const manualPage = root.querySelector<HTMLSpanElement>('[data-manual-page]')!
  const titleEl = root.querySelector<HTMLHeadingElement>('[data-step-title]')!
  const hwList = root.querySelector<HTMLUListElement>('[data-hw-list]')!
  const frameCounter = root.querySelector<HTMLSpanElement>('[data-frame-counter]')!
  const phaseTag = root.querySelector<HTMLSpanElement>('[data-phase-tag]')!
  const timeline = root.querySelector<HTMLInputElement>('[data-timeline]')!
  let playing = false

  function refreshFrame(frameIdx: number) {
    const frame = assemblyFrames[frameIdx]
    const step = steps[frame.stepId]
    titleEl.textContent = `${frame.subId} · ${frame.title}`
    root.querySelector<HTMLParagraphElement>('[data-step-summary]')!.textContent =
      frame.phase === 'closeup'
        ? `Close-up: align fastener, follow dashed line and rotation arrow. Manual p.${frame.manualPage}.`
        : `Context view — mirror manual page ${frame.manualPage} (step ${step.id}: ${step.title}).`
    frameCounter.textContent = `Frame ${frameIdx}/${maxFrame}`
    phaseTag.textContent =
      frame.phase === 'flatpack'
        ? 'Parts tray'
        : frame.phase === 'closeup'
          ? 'Close-up'
          : frame.phase === 'finish'
            ? 'Finish'
            : 'Context'
    manualPage.textContent = String(frame.manualPage)
    manualImg.src = `${base}dataset/manual-pages/page-${String(frame.manualPage).padStart(2, '0')}.png`

    if (frame.manualRegion) {
      callout.hidden = false
      const r = frame.manualRegion
      callout.style.left = `${r.x * 100}%`
      callout.style.top = `${r.y * 100}%`
      callout.style.width = `${r.w * 100}%`
      callout.style.height = `${r.h * 100}%`
    } else {
      callout.hidden = true
    }

    hwList.innerHTML = ''
    const hw = hardwareIntroducedThrough(frame.stepId)
    for (const [id, count] of Object.entries(hw)) {
      const li = document.createElement('li')
      li.textContent = `${count}× ${id}`
      hwList.appendChild(li)
    }
    if (frame.hardware) {
      const li = document.createElement('li')
      li.className = 'new-hw'
      li.textContent = `→ ${frame.hardware.count}× ${frame.hardware.partId} (${frame.hardware.label})`
      hwList.appendChild(li)
    }
    const placed = cumulativeNodes(frame.placedThroughStep).size
    if (frame.phase !== 'flatpack') {
      const li = document.createElement('li')
      li.textContent = `Assembled parts visible: ${placed}/83`
      hwList.appendChild(li)
    }
    timeline.value = String(frameIdx)
  }

  viewer.setOnFrame((_, i) => refreshFrame(i))
  await viewer.loadModel(base)
  refreshFrame(0)
  viewer.resize()

  const go = (i: number) => void viewer.goToFrame(i)
  root.querySelector('[data-prev]')!.addEventListener('click', () => go(viewer.frame - 1))
  root.querySelector('[data-next]')!.addEventListener('click', () => go(viewer.frame + 1))
  root.querySelector('[data-play]')!.addEventListener('click', () => {
    playing = !playing
    viewer.play(playing)
    root.querySelector<HTMLButtonElement>('[data-play]')!.textContent = playing ? '⏸' : '▶'
  })
  timeline.addEventListener('input', () => go(Number(timeline.value)))

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return
    if (e.key === '[') go(viewer.frame - 1)
    if (e.key === ']') go(viewer.frame + 1)
    if (e.key === ' ') {
      e.preventDefault()
      playing = !playing
      viewer.play(playing)
    }
  })
}
