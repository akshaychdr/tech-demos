import type { Diagram, DiagramType } from "./manifest"

export type TypeFilter = DiagramType | "All"

export const typesOf = (items: Diagram[]): DiagramType[] =>
  Array.from(new Set(items.map((d) => d.type)))

export const filterDiagrams = (items: Diagram[], type: TypeFilter): Diagram[] =>
  type === "All" ? items : items.filter((d) => d.type === type)

export const countByType = (items: Diagram[]): Record<string, number> =>
  items.reduce<Record<string, number>>((acc, d) => {
    acc[d.type] = (acc[d.type] ?? 0) + 1
    return acc
  }, {})
