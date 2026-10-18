# diagram-design — plan

Produced by following `skills/project-planning/SKILL.md`.

## Goal

Show what the `diagram-design` agent skill (Cathryn Lavery, MIT) produces by shipping a small gallery of editorial, self-contained HTML/SVG diagrams that describe this `tech-demos` monorepo itself.

## Single-user MVP (ships in the first cut)

- Six diagrams authored by following the upstream skill (`SKILL.md`, `references/type-*.md`, `assets/template.html`, taste gate, `scripts/self_check.py`), each a standalone `.html` file with inline SVG.
- Gallery grid of diagram cards.
- Type filter (chips) to narrow the grid.
- Detail view that renders the diagram full size (inline in an iframe, so each file stays self-contained and identical to what the skill emits).
- "View source" toggle showing the raw HTML/SVG with a copy button.

## Explicitly out of scope

- Running the skill live / calling any LLM or paid API (no keys, no network at runtime).
- Dark and "full editorial" variants, animation, PNG/SVG export, draw.io/Mermaid import.
- Accounts, persistence, routing library, backend, deployment.
- All 44+ diagram types — six are enough to demo the range.

## Tasks (vertical slices)

1. **Author diagrams** — read upstream skill, pick six types that fit the repo story, draw them, run the upstream self-check. Output: `src/diagrams/*.html`.
2. **Gallery** — manifest of diagram metadata (slug, title, type, blurb) + card grid.
3. **Filter** — type chips derived from the manifest; filtering is pure logic (tested).
4. **Detail + source** — selected diagram rendered full size; toggle to raw source with copy-to-clipboard.
5. **Docs + validation** — README with run instructions and upstream credit; screenshots and a click-through video attached to the PR.

## Diagrams (all about this monorepo)

| Slug | Upstream type | Subject |
| ---- | ------------- | ------- |
| `pipeline-architecture` | Architecture | X bookmark scout → approval → planning → cloud agent → PR |
| `approval-flowchart` | Flowchart | Decision logic for a bookmark: propose, approve, skip, build |
| `agent-run-sequence` | Sequence | Messages between owner, scout, cloud agent, GitHub for one demo |
| `repo-layout-tree` | Tree | Layout of the monorepo: `apps/`, `skills/`, `tracking/`, `AGENTS.md` |
| `demo-handoffs-swimlane` | Swimlane | Who does what: owner, scout, planner, builder, reviewer |
| `daily-demo-timeline` | Timeline | One demo's day, from bookmark to merged PR |

## Stack

- **Bun** — runtime, package manager, script runner (repo rule).
- **Vite + React + TypeScript** via `bunx create-vite --template react-ts` — official scaffold, boring, one screen of UI, no framework-grade tooling needed (planning rule 6).
- **Tailwind v4 + shadcn/ui** (`bunx shadcn@latest init`, minimalist preset) — pull in only `button`, `badge`, `card`, `tabs`/`toggle` as needed.
- **Diagram files imported with Vite `?raw`** — same bytes rendered (iframe `srcdoc`) and shown as source; no parser, no sanitizing pipeline for our own trusted assets.
- **bunfig.toml** with `[install] minimumReleaseAge = 259200`, created before the first install.
- **Vitest** only for the filter/manifest logic (critical logic only).

## Layout

```
apps/diagram-design/
  bunfig.toml  PLAN.md  README.md  package.json  vite.config.ts
  src/
    App.tsx
    features/gallery/   manifest.ts, filter.ts, filter.test.ts, Gallery.tsx
    features/detail/    Detail.tsx, SourceView.tsx
    components/ui/      shadcn components (added on demand)
    diagrams/           *.html  (self-contained, authored per upstream skill)
```

## Testing and hooks

- Tests: filter logic and manifest integrity (every manifest entry has a diagram file, every diagram is self-contained).
- Git hooks: none (nothing at repo root; deferred).

## Deferred

- Dark / full-editorial variants — upstream ships them, but they double the asset count without changing the demo.
- URL routing for deep links — single-user, single-screen state is enough.
- Live skill execution — needs an agent runtime; the demo shows outputs only.
