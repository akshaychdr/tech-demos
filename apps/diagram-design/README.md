# diagram-design

A small gallery of editorial, self-contained HTML/SVG diagrams, all about this `tech-demos` monorepo itself (bookmark scout, owner approval, planning, cloud agent, PR, repo layout). The diagrams were authored by following the [`diagram-design`](https://github.com/cathrynlavery/diagram-design) agent skill by Cathryn Lavery.

## What it demos

- **Gallery**: grid of diagram cards with live SVG thumbnails.
- **Type filter**: pick Architecture, Flowchart, Sequence, Tree, Swimlane or Timeline (or All).
- **Detail view**: renders the full diagram page at full size (sandboxed iframe, identical to the standalone file).
- **View source**: toggle to the raw file (full HTML or SVG only) with a copy button.

| File | Upstream type | Subject |
| ---- | ------------- | ------- |
| `pipeline-architecture.html` | Architecture | X bookmark, approval, cloud agent, PR, and the repo files involved |
| `approval-flowchart.html` | Flowchart | Decision logic from proposed bookmark to a single PR |
| `agent-run-sequence.html` | Sequence | Scout, owner, cloud agent and GitHub for one demo run |
| `repo-layout-tree.html` | Tree | Layout of the monorepo |
| `demo-handoffs-swimlane.html` | Swimlane | Who does what, with the human gate in focus |
| `daily-demo-timeline.html` | Timeline | One build, minute by minute (illustrative) |

## Run it

```bash
cd apps/diagram-design
bun install
bun run dev      # http://localhost:5173
```

Other scripts: `bun run test` (filter and asset checks), `bun run build`.

No API keys, no paid services, no network calls at runtime. Diagrams use the skill's `system` font mode, so each file is fully self-contained and works offline.

## How the diagrams were made

Each file in `src/diagrams/` starts from the skill's `assets/template.html` and follows `SKILL.md` and the matching `references/type-*.md` (default skin, 4px grid, orthogonal connectors, one or two accent elements, accessible `<title>`/`<desc>`). Every file passes the skill's `scripts/self_check.py --offline` and `scripts/verify-geometry.py`. The style guide was left at the shipped default skin and the skill's `system` font source was used so no Google Fonts request is made.

## Stack

Bun, Vite, React, TypeScript, Tailwind v4 and shadcn/ui (radix-nova preset). Diagram files are imported as raw strings (`?raw`), so the same bytes are rendered and shown as source. See `PLAN.md` for scope and decisions.

## Credit

Diagram skill, templates and design system: [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design) (MIT, Copyright (c) 2025 Cathryn Lavery). This demo is not affiliated with the upstream project. Source bookmark: <https://x.com/i/status/2108983461230845978>.
