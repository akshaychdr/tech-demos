import circuit from '../../data/circuit.json'

export type SwitchState = {
  aux110: boolean
  main: boolean
}

export type CircuitData = typeof circuit

export function getCircuit(): CircuitData {
  return circuit
}

const motorPhases = new Set(['L1', 'L2', 'L3'])

/** Edges considered energised for animation when switches are closed. */
export function energisedEdgeIds(state: SwitchState): Set<string> {
  const on = new Set<string>()
  if (state.aux110) {
    on.add('aux-h')
    on.add('aux-n')
  }
  if (state.main) {
    for (const id of circuit.edges.map((e) => e.id)) {
      if (id.startsWith('L') || id === 'gnd-run') on.add(id)
    }
  }
  return on
}

export function isMotorEnergised(state: SwitchState): boolean {
  return state.main && state.aux110
}

export function auxContactClosed(state: SwitchState): boolean {
  return state.main
}

export function ampForHp(hp: number, colIndex: number): number | null {
  const row = circuit.ampTable.rows.find((r) => r.hp === hp)
  return row ? row.A[colIndex] : null
}

export function validateAmpTable(): boolean {
  const expected = [
    { hp: 2, A: [30, 20, 7] },
    { hp: 3, A: [40, 30, 10] },
    { hp: 4, A: [50, 40, 15] },
    { hp: 5, A: [60, 40, 15] },
  ]
  return JSON.stringify(circuit.ampTable.rows) === JSON.stringify(expected)
}

export { motorPhases }
