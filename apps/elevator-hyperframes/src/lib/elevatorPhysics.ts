/** Typical floor-to-floor rise used for travel distance (simplification; often 3–3.7 m). */
export const FLOOR_HEIGHT_M = 3.0

/** Empty car mass for counterweight illustration (kg). */
export const EMPTY_CAR_MASS_KG = 1000

/** Rated load capacity used for counterweight sizing (kg). */
export const RATED_LOAD_KG = 1000

/** Counterweight mass ≈ car + this fraction of rated load (industry rule of thumb 40–50%). */
export const COUNTERWEIGHT_LOAD_FRACTION = 0.45

export type ElevatorParams = {
  floors: number
  speedMps: number
  loadKg: number
  travelM: number
  travelTimeS: number
  counterweightKg: number
  carWithLoadKg: number
}

export function computeElevatorParams(
  floors: number,
  speedMps: number,
  loadKg: number,
): ElevatorParams {
  const safeFloors = Math.max(2, Math.round(floors))
  const safeSpeed = Math.max(0.5, speedMps)
  const safeLoad = Math.max(0, loadKg)
  const travelM = (safeFloors - 1) * FLOOR_HEIGHT_M
  const travelTimeS = travelM / safeSpeed
  const counterweightKg =
    EMPTY_CAR_MASS_KG + COUNTERWEIGHT_LOAD_FRACTION * RATED_LOAD_KG
  const carWithLoadKg = EMPTY_CAR_MASS_KG + safeLoad

  return {
    floors: safeFloors,
    speedMps: safeSpeed,
    loadKg: safeLoad,
    travelM,
    travelTimeS,
    counterweightKg,
    carWithLoadKg,
  }
}

export function formatTravelTime(seconds: number): string {
  if (seconds < 10) return `${seconds.toFixed(1)} s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m} min ${s.toFixed(0)} s` : `${seconds.toFixed(0)} s`
}
