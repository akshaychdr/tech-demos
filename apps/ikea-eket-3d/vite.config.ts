import { defineConfig } from 'vite'

const base = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base,
  test: {
    globals: true,
    environment: 'node',
  },
  server: {
    port: 5176,
  },
})
