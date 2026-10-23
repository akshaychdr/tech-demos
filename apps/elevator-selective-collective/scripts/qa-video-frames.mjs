#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const mp4 = path.join(root, 'out/elevator-selective-collective.mp4')
const outDir = path.join(root, 'out/qa-frames')
mkdirSync(outDir, { recursive: true })

const DURATION = 84
const times = []
for (let t = 0; t <= DURATION; t += 4) times.push(t)
const stops = [
  1, 2, 3.5, 4, 9, 14, 18.2, 23.2, 30.1, 38.6, 44, 48, 52.6, 57.2, 66, 74,
  16, 19, 22, 29, 37, 46, 50, 55, 59, 62,
  17.5, 18, 18.25, 18.5,
]
for (const s of stops) if (!times.includes(s)) times.push(s)
times.sort((a, b) => a - b)

for (const t of times) {
  const label = t.toFixed(2).replace('.', '_')
  execSync(
    `ffmpeg -y -ss ${t} -i "${mp4}" -frames:v 1 -q:v 2 "${outDir}/t-${label}s.jpg"`,
    { stdio: 'pipe' },
  )
}
console.log(`Extracted ${times.length} QA frames to ${outDir}`)
