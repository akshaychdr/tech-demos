import stepsJson from '../../data/steps.json'
import partsJson from '../../data/parts.json'

export type StepRecord = (typeof stepsJson.steps)[number]
export type HardwareCallout = { id: string; count: number; label?: string }

export const product = stepsJson.product
export const steps = stepsJson.steps
export const hardwareTotals = partsJson.hardwareTotals

/** Parts placed in the assembly through this step (step 0 → none). */
export function cumulativeNodes(stepIndex: number): Set<string> {
  const s = new Set<string>()
  if (stepIndex <= 0) return s
  for (let i = 1; i <= stepIndex; i++) {
    for (const n of steps[i].nodes) s.add(n)
  }
  return s
}

export function hardwareIntroducedThrough(stepIndex: number): Record<string, number> {
  const m: Record<string, number> = {}
  for (let i = 0; i <= stepIndex; i++) {
    for (const h of steps[i].hardware) {
      m[h.id] = (m[h.id] ?? 0) + h.count
    }
  }
  return m
}

export function hardwareIntroducedOnSteps(): Record<string, number> {
  const m: Record<string, number> = {}
  for (const step of steps) {
    for (const h of step.hardware) {
      m[h.id] = (m[h.id] ?? 0) + h.count
    }
  }
  return m
}
