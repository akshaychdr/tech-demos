/** One Euro filter. Slow motion stays steady, and a quick turn still keeps up. */
export class OneEuroFilter {
  private value = 0
  private derivative = 0
  private stamp = 0
  private ready = false
  private readonly minCutoff: number
  private readonly beta: number
  private readonly derivativeCutoff: number

  constructor(minCutoff = 1.2, beta = 0.04, derivativeCutoff = 1) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.derivativeCutoff = derivativeCutoff
  }

  filter(next: number, timeMs: number): number {
    if (!this.ready || !Number.isFinite(next)) {
      this.ready = Number.isFinite(next)
      this.value = Number.isFinite(next) ? next : 0
      this.derivative = 0
      this.stamp = timeMs
      return this.value
    }
    const dt = Math.min(0.1, Math.max(1e-3, (timeMs - this.stamp) / 1000))
    this.stamp = timeMs
    const speed = (next - this.value) / dt
    this.derivative += alpha(dt, this.derivativeCutoff) * (speed - this.derivative)
    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative)
    this.value += alpha(dt, cutoff) * (next - this.value)
    return this.value
  }

  reset(): void {
    this.ready = false
    this.derivative = 0
  }
}

function alpha(dt: number, cutoff: number): number {
  const tau = 1 / (2 * Math.PI * Math.max(cutoff, 1e-3))
  return 1 / (1 + tau / dt)
}
