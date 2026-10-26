import gsap from 'gsap'
import { getCircuit, type SwitchState, energisedEdgeIds } from '../model/circuit'
import { renderMotorLinkSvg, renderSchematicSvg } from '../svg/schematic'

export type Scene3Api = {
  mount: (root: HTMLElement) => void
  setHp: (hp: number) => void
  setSupplyCol: (index: number) => void
  setMotorMode: (mode: 'single' | 'delta' | 'wye') => void
  runSequence: () => void
  dispose: () => void
}

export function createScene3(): Scene3Api {
  let root: HTMLElement
  let state: SwitchState = { aux110: false, main: false }
  let hp = 2
  let supplyCol = 0
  let motorMode: 'single' | 'delta' | 'wye' = 'delta'
  const circuit = getCircuit()
  let anim: gsap.core.Timeline | null = null

  function render() {
    root.querySelector('[data-schematic]')!.innerHTML = renderSchematicSvg(state)
    root.querySelector('[data-motor-views]')!.innerHTML = ['single', 'delta', 'wye']
      .map((m) => {
        const active = m === motorMode ? 'highlight' : ''
        return `<div class="${active}" data-motor="${m}">${renderMotorLinkSvg(m as 'single' | 'delta' | 'wye')}</div>`
      })
      .join('')

    const table = root.querySelector('[data-amp-table]')!
    table.innerHTML = `
      <table class="amp-table"><thead><tr><th>HP</th>${circuit.ampTable.cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${circuit.ampTable.rows
        .map(
          (r) =>
            `<tr class="${r.hp === hp ? 'active' : ''}"><td>${r.hp}</td>${r.A.map((a, i) => `<td class="${r.hp === hp && i === supplyCol ? 'highlight' : ''}">${a} A</td>`).join('')}</tr>`,
        )
        .join('')}</tbody></table>`

    const status = root.querySelector('[data-status]')!
    const on = energisedEdgeIds(state)
    status.textContent = `Aux ${state.aux110 ? 'ON' : 'OFF'} · Main ${state.main ? 'ON' : 'OFF'} · ${on.size} energised paths (illustrative)`
  }

  return {
    mount(host) {
      root = host
      root.innerHTML = `
        <p class="caption highlight">Illustrative – follow the manufacturer's diagram and local code.</p>
        <div class="scene-controls">
          <button type="button" data-run-seq class="primary">Animate power sequence</button>
          <label>HP <select data-hp>${circuit.ampTable.rows.map((r) => `<option value="${r.hp}">${r.hp}</option>`).join('')}</select></label>
          <label>Supply <select data-supply>${circuit.ampTable.cols.map((c, i) => `<option value="${i}">${c}</option>`).join('')}</select></label>
          <label>Motor view <select data-motor><option value="single">Single-phase</option><option value="delta">Δ</option><option value="wye">Y</option></select></label>
        </div>
        <div class="schematic-wrap" data-schematic data-testid="scene3-schematic"></div>
        <div class="motor-views" data-motor-views></div>
        <div data-amp-table></div>
        <p class="mono" data-status></p>
      `
      root.querySelector('[data-hp]')!.addEventListener('change', (e) => {
        hp = Number((e.target as HTMLSelectElement).value)
        render()
      })
      root.querySelector('[data-supply]')!.addEventListener('change', (e) => {
        supplyCol = Number((e.target as HTMLSelectElement).value)
        render()
      })
      root.querySelector('[data-motor]')!.addEventListener('change', (e) => {
        motorMode = (e.target as HTMLSelectElement).value as 'single' | 'delta' | 'wye'
        render()
      })
      root.querySelector('[data-run-seq]')!.addEventListener('click', () => this.runSequence())
      render()
    },
    setHp(h) {
      hp = h
      render()
    },
    setSupplyCol(i) {
      supplyCol = i
      render()
    },
    setMotorMode(m) {
      motorMode = m
      render()
    },
    runSequence() {
      anim?.kill()
      state = { aux110: false, main: false }
      render()
      anim = gsap.timeline()
      anim.to({}, { duration: 0.6, onComplete: () => { state.aux110 = true; render() } })
      anim.to({}, { duration: 0.8, onComplete: () => { state.main = true; render() } })
      anim.to({}, { duration: 1.5, onComplete: () => {} })
      anim.to({}, { duration: 0.5, onComplete: () => { state.main = false; render() } })
    },
    dispose() {
      anim?.kill()
    },
  }
}
