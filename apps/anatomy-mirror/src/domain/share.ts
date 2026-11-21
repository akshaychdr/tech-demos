export function formatScore(score: number): string {
  const rounded = Math.round(score * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function challengeUrl(origin: string, base: string, score: number): string {
  const root = `${origin}${base.startsWith('/') ? base : `/${base}`}`
  const url = new URL(root, origin)
  url.searchParams.set('beat', formatScore(score))
  return url.toString()
}

export function shareMessage(score: number, muscleCorrect: number, muscleAsked: number, url: string): string {
  return `I scored ${formatScore(score)}/10 on Anatomy Mirror and found ${muscleCorrect} of ${muscleAsked} face muscles. Can you beat me? ${url}`
}

/** Only a score in range is read from the link. Nothing else is trusted. */
export function parseBeat(search: string): number | null {
  const raw = new URLSearchParams(search).get('beat')
  if (raw == null || raw.trim() === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value > 10) return null
  return Math.round(value * 10) / 10
}
