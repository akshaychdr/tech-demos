# EKET cabinet with 2 drawers — 3D assembly

Interactive step-by-step assembly for **EKET** with 2 drawers (article **00333947**, 70×35×35 cm), using the official [IKEA 3D Assembly Dataset](https://github.com/IKEA/IKEA3DAssemblyDataset) (`Dataset/EKET_00333947_70x35x35/`) and manual **AA-1914748-7**.

## License & attribution

3D models (`public/dataset/EKET_00333947_70x35x35.glb`) and assembly PDF are © **Inter IKEA Systems B.V.**, shared under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). This demo credits IKEA and links the dataset and license in the UI.

## Run

```bash
cd apps/ikea-eket-3d
bun install
bun run dev
```

## Scripts

- `bun run test` — step/part coverage tests
- `bun run preview:pages` — GitHub Pages base path build
- `bun run capture:artifacts` — PR screenshots & video (dev server on port 5176)

Stack: Vite, TypeScript, three.js, GSAP.
