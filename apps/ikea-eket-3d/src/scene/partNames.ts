/** Match Three.js GLTFLoader sanitization (spaces → underscores). */
export function normalizePartName(raw: string): string {
  return raw.replace(/\u200b/g, '').trim().replace(/ /g, '_')
}

export function partNameForMatch(name: string): string {
  return name.toLowerCase().replace(/_/g, ' ')
}
