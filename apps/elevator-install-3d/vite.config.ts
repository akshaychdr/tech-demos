import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  server: {
    port: 5174,
  },
})
