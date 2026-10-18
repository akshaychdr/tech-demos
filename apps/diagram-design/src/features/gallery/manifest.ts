export type DiagramType =
  | "Architecture"
  | "Flowchart"
  | "Sequence"
  | "Tree"
  | "Swimlane"
  | "Timeline"

export interface Diagram {
  slug: string
  title: string
  type: DiagramType
  blurb: string
  html: string
}

const files = import.meta.glob<string>("../../diagrams/*.html", {
  query: "?raw",
  import: "default",
  eager: true,
})

const sourceFor = (slug: string): string => {
  const entry = Object.entries(files).find(([path]) => path.endsWith(`/${slug}.html`))
  if (!entry) throw new Error(`Missing diagram file for ${slug}`)
  return entry[1]
}

const meta: Omit<Diagram, "html">[] = [
  {
    slug: "pipeline-architecture",
    title: "From X bookmark to merged demo",
    type: "Architecture",
    blurb: "Scout, owner approval, cloud agent and pull request, plus the repo files each step touches.",
  },
  {
    slug: "approval-flowchart",
    title: "Does this bookmark become a demo?",
    type: "Flowchart",
    blurb: "The decision logic from a proposed bookmark to a single pull request, with a proof retry loop.",
  },
  {
    slug: "agent-run-sequence",
    title: "One demo, one run",
    type: "Sequence",
    blurb: "Messages between scout, owner, cloud agent and GitHub for one demo.",
  },
  {
    slug: "repo-layout-tree",
    title: "Layout of the tech-demos monorepo",
    type: "Tree",
    blurb: "apps/, skills/, tracking/ and the two root files, with this demo highlighted.",
  },
  {
    slug: "demo-handoffs-swimlane",
    title: "Who does what for one demo",
    type: "Swimlane",
    blurb: "Handoffs between scout, owner, cloud agent and GitHub, with the human gate in focus.",
  },
  {
    slug: "daily-demo-timeline",
    title: "One demo, from approval to merge",
    type: "Timeline",
    blurb: "An illustrative minute-by-minute view of a single build.",
  },
]

export const diagrams: Diagram[] = meta.map((m) => ({ ...m, html: sourceFor(m.slug) }))

export const extractSvg = (html: string): string => {
  const match = html.match(/<svg[\s\S]*<\/svg>/)
  return match ? match[0] : ""
}
