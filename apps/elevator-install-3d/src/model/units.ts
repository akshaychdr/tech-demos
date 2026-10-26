export const MM_PER_INCH = 25.4

/** Round inch→mm the way the demo uses for consistency checks. */
export function inToMm(inches: number): number {
  return Math.round(inches * MM_PER_INCH)
}

export function mmMatchesInch(inches: number, publishedMm: number): boolean {
  return inToMm(inches) === publishedMm
}

export type InchMmMismatch = {
  field: string
  inches: number
  expectedMm: number
  publishedMm: number
}

export function compareInchToPublishedMm(
  field: string,
  inches: number,
  publishedMm: number,
): InchMmMismatch | null {
  const expectedMm = inToMm(inches)
  if (expectedMm === publishedMm) return null
  return { field, inches, expectedMm, publishedMm }
}
