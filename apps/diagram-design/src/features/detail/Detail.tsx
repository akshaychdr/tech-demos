import { useState, type SyntheticEvent } from "react"
import { ArrowLeftIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

import { extractSvg, type Diagram } from "../gallery/manifest"
import { SourceView } from "./SourceView"

type View = "preview" | "source"
type Format = "html" | "svg"

export function Detail({ diagram, onBack }: { diagram: Diagram; onBack: () => void }) {
  const [view, setView] = useState<View>("preview")
  const [format, setFormat] = useState<Format>("html")

  const [frameHeight, setFrameHeight] = useState(640)

  const fitFrame = (e: SyntheticEvent<HTMLIFrameElement>) => {
    const doc = e.currentTarget.contentDocument
    const frame = doc?.querySelector(".frame")
    if (!doc || !frame) return
    const body = doc.defaultView!.getComputedStyle(doc.body)
    const padding = parseFloat(body.paddingTop) + parseFloat(body.paddingBottom)
    setFrameHeight(Math.ceil(frame.getBoundingClientRect().height + padding))
  }

  const code = format === "html" ? diagram.html : extractSvg(diagram.html)

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={onBack}>
            <ArrowLeftIcon data-icon="inline-start" />
            All diagrams
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight">{diagram.title}</h2>
            <Badge variant="secondary">{diagram.type}</Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">{diagram.blurb}</p>
        </div>

        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={view}
          onValueChange={(v) => v && setView(v as View)}
          aria-label="Preview or source"
          data-testid="view-toggle"
        >
          <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
          <ToggleGroupItem value="source">View source</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === "preview" ? (
        <iframe
          title={diagram.title}
          srcDoc={diagram.html}
          sandbox="allow-same-origin"
          onLoad={fitFrame}
          style={{ height: frameHeight }}
          className="w-full rounded-lg border bg-[#f5f5f5]"
          data-testid="diagram-frame"
        />
      ) : (
        <div className="flex flex-col gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={format}
            onValueChange={(v) => v && setFormat(v as Format)}
            aria-label="Source format"
          >
            <ToggleGroupItem value="html">Full HTML</ToggleGroupItem>
            <ToggleGroupItem value="svg">SVG only</ToggleGroupItem>
          </ToggleGroup>
          <SourceView code={code} label={format === "html" ? `${diagram.slug}.html` : `${diagram.slug}.svg`} />
        </div>
      )}
    </section>
  )
}
