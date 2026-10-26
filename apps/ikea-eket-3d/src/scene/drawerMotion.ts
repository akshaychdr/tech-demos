import { normalizePartName, partNameForMatch } from './partNames'

export type DrawerTier = 'lower' | 'upper'

/** Drawer box + fronts that slide out (slides stay on carcass). */
export function drawerMobileTier(name: string): DrawerTier | null {
  const key = normalizePartName(name)
  const n = partNameForMatch(key)
  if (n.includes('drawer slide')) return null
  if (!n.includes('drawer')) return null
  if (key.endsWith('_01')) return 'lower'
  if (key.endsWith('_02')) return 'upper'
  return null
}
