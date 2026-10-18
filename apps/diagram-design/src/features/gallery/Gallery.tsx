import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { countByType, filterDiagrams, typesOf, type TypeFilter } from "./filter"
import { diagrams, extractSvg, type Diagram } from "./manifest"

interface GalleryProps {
  filter: TypeFilter
  onFilterChange: (next: TypeFilter) => void
  onOpen: (slug: string) => void
}

export function Gallery({ filter, onFilterChange, onOpen }: GalleryProps) {
  const counts = countByType(diagrams)
  const visible = filterDiagrams(diagrams, filter)

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filter}
          onValueChange={(v) => onFilterChange((v || "All") as TypeFilter)}
          aria-label="Filter by diagram type"
          data-testid="type-filter"
        >
          <ToggleGroupItem value="All">All ({diagrams.length})</ToggleGroupItem>
          {typesOf(diagrams).map((t) => (
            <ToggleGroupItem key={t} value={t}>
              {t} ({counts[t]})
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-sm text-muted-foreground">
          Showing {visible.length} of {diagrams.length}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="diagram-grid">
        {visible.map((d) => (
          <DiagramCard key={d.slug} diagram={d} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}

function DiagramCard({ diagram, onOpen }: { diagram: Diagram; onOpen: (slug: string) => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Open ${diagram.title}`}
      onClick={() => onOpen(diagram.slug)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen(diagram.slug)
        }
      }}
      className="h-full cursor-pointer outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <CardContent>
        <div
          className="pointer-events-none flex aspect-[4/3] items-center overflow-hidden rounded-md border bg-[#f5f5f5] p-2 [&_svg]:h-auto [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: extractSvg(diagram.html) }}
          aria-hidden="true"
        />
      </CardContent>
      <CardHeader>
        <Badge variant="secondary" className="w-fit">
          {diagram.type}
        </Badge>
        <CardTitle>{diagram.title}</CardTitle>
        <CardDescription>{diagram.blurb}</CardDescription>
      </CardHeader>
    </Card>
  )
}
