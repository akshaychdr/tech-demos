import { spawn } from 'node:child_process'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(__dirname, '..')
const COMPOSITION_DIR = path.join(APP_ROOT, 'composition')
const RENDERS_DIR = path.join(APP_ROOT, 'renders')
const PORT = Number(process.env.RENDER_API_PORT ?? 8787)

type RenderBody = {
  floors?: number
  speedMps?: number
  loadKg?: number
}

async function runHyperframesRender(
  variables: Record<string, number>,
  outputPath: string,
): Promise<void> {
  const varsPath = path.join(RENDERS_DIR, `vars-${Date.now()}.json`)
  await writeFile(varsPath, JSON.stringify(variables))

  return new Promise((resolve, reject) => {
    const args = [
      'hyperframes@0.8.181',
      'render',
      COMPOSITION_DIR,
      '-o',
      outputPath,
      '--variables-file',
      varsPath,
      '--quality',
      'draft',
      '-f',
      '24',
    ]
    const child = spawn('npx', args, {
      cwd: APP_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, npm_config_yes: 'true' },
    })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('close', async (code) => {
      await unlink(varsPath).catch(() => {})
      if (code === 0) resolve()
      else reject(new Error(stderr || `hyperframes render exited ${code}`))
    })
  })
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      })
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true })
    }

    if (url.pathname.startsWith('/api/renders/') && req.method === 'GET') {
      const name = path.basename(url.pathname)
      if (!name.endsWith('.mp4') || name.includes('..')) {
        return new Response('Not found', { status: 404 })
      }
      const filePath = path.join(RENDERS_DIR, name)
      try {
        const data = await readFile(filePath)
        return new Response(data, {
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Disposition': `inline; filename="${name}"`,
            ...corsHeaders(),
          },
        })
      } catch {
        return new Response('Not found', { status: 404 })
      }
    }

    if (url.pathname === '/api/render' && req.method === 'POST') {
      try {
        const body = (await req.json()) as RenderBody
        const variables = {
          floors: Math.round(body.floors ?? 12),
          speedMps: Number(body.speedMps ?? 1.75),
          loadKg: Math.round(body.loadKg ?? 0),
        }
        await mkdir(RENDERS_DIR, { recursive: true })
        const fileName = `elevator-${Date.now()}.mp4`
        const outputPath = path.join(RENDERS_DIR, fileName)
        await runHyperframesRender(variables, outputPath)
        return json({
          fileName,
          url: `/api/renders/${fileName}`,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return json({ error: message }, 500)
      }
    }

    return new Response('Not found', { status: 404 })
  },
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  })
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

console.log(`Render API listening on http://127.0.0.1:${PORT}`)

export default server
