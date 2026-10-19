# tech-demos

A sticky monorepo of small daily tech demos. Each weekday, one technology bookmarked on X gets approved, and a cloud agent builds a small single-user MVP demo of it as a self-contained app under `apps/<kebab-slug>/`.

## Running a demo

Each app in `apps/` is fully self-contained (own `package.json`, own dependencies). To run one:

```bash
cd apps/<slug>
bun install
bun run dev
```

## Demo index

| Slug | Tech | Date | PR |
| ---- | ---- | ---- | -- |
| diagram-design | diagram-design ([cathrynlavery](https://github.com/cathrynlavery/diagram-design)) | 2026-10-18 | [#1](https://github.com/akshaychdr/tech-demos/pull/1) |
| airllm | AirLLM ([lyogavin](https://github.com/lyogavin/airllm)) | 2026-10-19 | PR link |
