import '../styles/blueprint.css'
import dimensions from '../../data/dimensions.json'
import { getTypeARow, getTypeARows, formatConfigLabel } from '../model/typeA'
import { createScene1 } from './scene1-layout'
import { createScene2 } from './scene2-curtain'
import { createScene3 } from './scene3-wiring'

const DISCLAIMER = 'Illustrative demo, not for installation'

function buildShell() {
  const app = document.querySelector<HTMLDivElement>('#app')!
  app.innerHTML = `
    <div class="disclaimer" data-testid="disclaimer">${DISCLAIMER}</div>
    <header class="app-header">
      <h1>Federal Panorama/Renaissance · Install 3D</h1>
      <nav class="tab-bar" role="tablist">
        <button type="button" data-tab="1" class="active">Layout Type A</button>
        <button type="button" data-tab="2">IR curtain</button>
        <button type="button" data-tab="3">Wiring</button>
      </nav>
    </header>
    <section class="scene-panel active" data-scene="1">
      <div class="scene-controls">
        <label>Cab / gate
          <select data-config></select>
        </label>
        <label>Travel (mm, max ${dimensions.maxTravelMm})
          <input data-travel type="number" min="1000" max="${dimensions.maxTravelMm}" value="3505" />
        </label>
        <button type="button" data-morph class="primary">Extrude to 3D</button>
      </div>
      <div data-scene1-root></div>
    </section>
    <section class="scene-panel" data-scene="2"><div data-scene2-root></div></section>
    <section class="scene-panel" data-scene="3"><div data-scene3-root></div></section>
    <footer class="credits">
      Layout Type A: Federal Planning Guide (March 2023). IR curtain &amp; disconnect: Federal Hydraulic Residential Installation Manual, Appendices 5 &amp; 3. All graphics redrawn; not OEM copies.
    </footer>
  `

  const rows = getTypeARows()
  const select = app.querySelector<HTMLSelectElement>('[data-config]')!
  select.innerHTML = rows.map((r) => `<option value="${r.id}">${formatConfigLabel(r)}</option>`).join('')
  select.value = dimensions.defaultConfigId

  const scene1 = createScene1()
  const scene2 = createScene2()
  const scene3 = createScene3()
  scene1.mount(app.querySelector('[data-scene1-root]')!)
  scene2.mount(app.querySelector('[data-scene2-root]')!)
  scene3.mount(app.querySelector('[data-scene3-root]')!)

  function applyConfig() {
    const row = getTypeARow(select.value)
    const travel = Number(app.querySelector<HTMLInputElement>('[data-travel]')!.value)
    scene1.setConfig(row, travel)
  }
  applyConfig()
  select.addEventListener('change', applyConfig)
  app.querySelector('[data-travel]')!.addEventListener('change', applyConfig)
  app.querySelector('[data-morph]')!.addEventListener('click', () => scene1.morphTo3d())

  app.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab')!
      app.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === btn))
      app.querySelectorAll('.scene-panel').forEach((p) =>
        p.classList.toggle('active', p.getAttribute('data-scene') === tab),
      )
    })
  })

  window.addEventListener('keydown', (e) => {
    if (e.key === '1' || e.key === '2' || e.key === '3') {
      app.querySelector<HTMLButtonElement>(`[data-tab="${e.key}"]`)?.click()
    }
  })
}

buildShell()
