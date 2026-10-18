import { useState } from "react"

import { Detail } from "@/features/detail/Detail"
import { Gallery } from "@/features/gallery/Gallery"
import type { TypeFilter } from "@/features/gallery/filter"
import { diagrams } from "@/features/gallery/manifest"

function App() {
  const [filter, setFilter] = useState<TypeFilter>("All")
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const open = diagrams.find((d) => d.slug === openSlug)
  const width = open ? "max-w-[1360px]" : "max-w-6xl"

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className={`mx-auto flex flex-col gap-1 px-6 py-6 ${width}`}>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            tech-demos · diagram-design
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Diagrams of the tech-demos pipeline</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Six editorial HTML/SVG diagrams authored with the{" "}
            <a
              className="underline underline-offset-4"
              href="https://github.com/cathrynlavery/diagram-design"
              target="_blank"
              rel="noreferrer"
            >
              diagram-design
            </a>{" "}
            agent skill by Cathryn Lavery. Every diagram is about this monorepo.
          </p>
        </div>
      </header>
      <main className={`mx-auto px-6 py-8 ${width}`}>
        {open ? (
          <Detail key={open.slug} diagram={open} onBack={() => setOpenSlug(null)} />
        ) : (
          <Gallery filter={filter} onFilterChange={setFilter} onOpen={setOpenSlug} />
        )}
      </main>
    </div>
  )
}

export default App
