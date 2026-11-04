import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const base = process.env.VITE_BASE_PATH ?? '/tech-demos/backchannel-cue/'

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  optimizeDeps: {
    exclude: ['onnxruntime-web', 'tokenizers-wasm', '@huggingface/transformers'],
  },
  worker: { format: 'es' },
  build: { target: 'esnext' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
