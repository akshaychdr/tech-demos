import { describe, expect, it } from "vitest"

import { countByType, filterDiagrams, typesOf } from "./filter"
import { diagrams, extractSvg } from "./manifest"

describe("filter", () => {
  it("returns everything for All", () => {
    expect(filterDiagrams(diagrams, "All")).toHaveLength(diagrams.length)
  })

  it("narrows to one type", () => {
    const result = filterDiagrams(diagrams, "Sequence")
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((d) => d.type === "Sequence")).toBe(true)
  })

  it("derives picker options and counts from the manifest", () => {
    const types = typesOf(diagrams)
    const counts = countByType(diagrams)
    expect(types.reduce((n, t) => n + counts[t], 0)).toBe(diagrams.length)
  })
})

describe("diagram assets", () => {
  it("has unique slugs", () => {
    expect(new Set(diagrams.map((d) => d.slug)).size).toBe(diagrams.length)
  })

  it.each(diagrams.map((d) => [d.slug, d] as const))("%s is a self-contained accessible SVG", (slug, d) => {
    const svg = extractSvg(d.html)
    expect(svg).toContain('role="img"')
    expect(svg).toContain(`id="${slug}-title"`)
    expect(svg).toContain(`id="${slug}-desc"`)
    expect(d.html).not.toMatch(/<script|<link|https?:\/\/(?!www\.w3\.org)/)
  })
})
