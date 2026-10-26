import typeARows from '../../data/typeARows.json'

export type TypeARow = (typeof typeARows)[number]

export function getTypeARows(): TypeARow[] {
  return typeARows
}

export function getTypeARow(id: string): TypeARow {
  const row = typeARows.find((r) => r.id === id)
  if (!row) throw new Error(`Unknown Type A config: ${id}`)
  return row
}

export function formatConfigLabel(row: TypeARow): string {
  const gate = row.gate.replace(/-/g, ' ')
  return `${row.cabWidthMmPublished}×${row.cabDepthMmPublished} mm cab · ${gate}`
}
