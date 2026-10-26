import { defineConfig } from 'vite'

/** GitHub Pages subpath, e.g. /tech-demos/elevator-install-3d/ — unset for local dev at /. */
const base = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base,
  test: {
    globals: true,
    environment: 'node',
  },
  server: {
    port: 5174,
  },
})
