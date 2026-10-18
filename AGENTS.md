# Rules for cloud agents working in this repo

This monorepo hosts small daily tech demos. Each agent is assigned exactly one demo, identified by a kebab-case slug. Follow these rules without exception.

## Scope: touch only your app

- Only add or modify files under `apps/<slug>/` for your assigned slug.
- The only files outside your app folder you may change:
  - Append **one row** to the demo index table in the root `README.md`.
  - Update `tracking/seen-bookmarks.json` when told to (see shape below).
- Never touch other apps in `apps/`.
- Never create a new GitHub repository. All work happens in this repo.

## Plan first, then build

1. Read `skills/project-planning/SKILL.md` and follow it.
2. Write your plan to `apps/<slug>/PLAN.md`.
3. Only then start building.

## Runtime and tooling

- **Bun** is the runtime, package manager, and script runner for every app.
- Each app is self-contained: its own `package.json`, its own dependencies. No root-level package management.
- **Before any install**, create `apps/<slug>/bunfig.toml` containing:

  ```toml
  [install]
  minimumReleaseAge = 259200
  ```

- Start from an official scaffold via `bunx create-*` (e.g. `bunx create-next-app`, `bunx create-vite`, `bunx create-t3-app`, `bunx create-tanstack`, `bunx create-expo`). Do not hand-roll the project skeleton.
- UI uses **shadcn/ui** with a minimalist preset (`bunx shadcn@latest init`); pull in components on demand.

## Every app must

- Run with `bun install && bun run dev` from its own folder.
- Include a short `README.md` (what it demos, how to run it).

## Pull requests

- Open **exactly one PR per demo**.
- The PR **MUST** include at least one **screenshot** AND at least one **video** of the running app as validation artifacts. This is not optional — a PR without both does not count as done.

## Testing and tooling discipline

- Keep tests minimal: critical logic only.
- No heavy tooling at the repo root (no root linters, root CI config for apps, monorepo build systems, etc.).

## Bookmark tracking

`tracking/seen-bookmarks.json` holds four arrays: `proposed`, `approved`, `skipped`, and `built`. Each entry has the shape:

```json
{ "id": "...", "title": "...", "url": "...", "date": "YYYY-MM-DD" }
```

Only modify this file when your task explicitly tells you to (typically moving your demo's entry into `built`).
