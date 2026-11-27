// Headless Chromium harness. Serves nothing itself: the Vite dev server must
// already be on PORT (default 5177). It feeds real face photographs through
// the app's FaceLandmarker and writes one PNG plus the fit report per case.
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = process.env.PORT ?? '5177'
const BASE = `http://127.0.0.1:${PORT}/tech-demos/anatomy-mirror/`
const OUT = process.env.OUT ?? '/tmp/anatomy-harness'
const CDP = 9333

const allFaces = [
  ['near-1280x720.jpg', 1280, 720],
  ['far-1280x720.jpg', 1280, 720],
  ['obama-640x480.jpg', 640, 480],
  ['michelle-720x1280.jpg', 720, 1280],
  ['turned-1280x720.jpg', 1280, 720],
]
const faces = process.env.ONLY
  ? allFaces.filter(([name]) => process.env.ONLY.split(',').some((part) => name.includes(part)))
  : allFaces
const layers = process.env.LAYERS ? process.env.LAYERS.split(',') : ['skull', 'muscles', 'brain', 'outline', 'all']

mkdirSync(OUT, { recursive: true })

function launchChrome(extra = []) {
  return spawn(
    'google-chrome',
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      `--remote-debugging-port=${CDP}`,
      '--window-size=1280,720',
      ...extra,
    ],
    { stdio: 'ignore' },
  )
}

async function connect() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const version = await fetch(`http://127.0.0.1:${CDP}/json/version`).then((response) => response.json())
      return version.webSocketDebuggerUrl
    } catch {
      await sleep(250)
    }
  }
  throw new Error('Chrome did not open a debugging port')
}

function cdp(ws) {
  let seq = 0
  const waiters = new Map()
  const events = []
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && waiters.has(message.id)) {
      waiters.get(message.id)(message)
      waiters.delete(message.id)
      return
    }
    if (message.method === 'Runtime.consoleAPICalled' || message.method === 'Runtime.exceptionThrown') {
      events.push(message)
    }
  })
  return {
    events,
    send(method, params = {}) {
      const id = ++seq
      return new Promise((resolve, reject) => {
        waiters.set(id, (message) => {
          if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`))
          else resolve(message.result)
        })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
  }
}

async function openSession(browserWs) {
  const created = await new Promise((resolve, reject) => {
    const id = 1
    const onMessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== id) return
      browserWs.removeEventListener('message', onMessage)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    }
    browserWs.addEventListener('message', onMessage)
    browserWs.send(JSON.stringify({ id, method: 'Target.createTarget', params: { url: 'about:blank' } }))
  })
  const list = await fetch(`http://127.0.0.1:${CDP}/json/list`).then((response) => response.json())
  const tab = list.find((entry) => entry.id === created.targetId)
  const socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve)
    socket.addEventListener('error', reject)
  })
  const session = cdp(socket)
  await session.send('Page.enable')
  await session.send('Runtime.enable')
  await session.send('Network.enable')
  return { socket, session }
}

async function readFit(session) {
  const result = await session.send('Runtime.evaluate', {
    expression: `window.__anatomy ? JSON.stringify({
      fitS: window.__anatomy.fitS,
      fitX: window.__anatomy.fitX,
      fitY: window.__anatomy.fitY,
      meanPx: window.__anatomy.meanPx,
      maxPx: window.__anatomy.maxPx,
      markerCount: window.__anatomy.markerCount,
      marks: window.__anatomy.marks,
      aspectDelta: window.__anatomy.aspectDelta,
      silhouette: window.__anatomy.silhouette,
      fitKey: window.__anatomy.fitKey,
      view: window.__anatomy.view,
      video: window.__anatomy.video
    }) : ''`,
    returnByValue: true,
  })
  const text = result.result.value
  return text ? JSON.parse(text) : null
}

async function settle(session) {
  let previous = null
  for (let i = 0; i < 50; i += 1) {
    await sleep(400)
    const fit = await readFit(session)
    if (!fit || fit.markerCount < 13) {
      previous = fit
      continue
    }
    if (previous && Math.abs(previous.fitS - fit.fitS) < 0.004 && Math.abs(previous.meanPx - fit.meanPx) < 0.4) return fit
    previous = fit
  }
  return previous
}

async function shot(session, file) {
  const box = await session.send('Runtime.evaluate', {
    expression: `(() => { const node = document.querySelector('.stage-host'); const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: document.querySelector('#fit-overall-size')?.value ?? '' }; })()`,
    returnByValue: true,
  })
  const clip = box.result.value
  const image = await session.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: clip.x, y: clip.y, width: Math.max(2, clip.width), height: Math.max(2, clip.height), scale: 1 },
    captureBeyondViewport: true,
  })
  writeFileSync(file, Buffer.from(image.data, 'base64'))
  return clip.scale
}

async function runCase(session, face, width, height, layer) {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })
  const url = `${BASE}?live=1&panel=0&track=1&layer=${layer}&face=fixtures/faces/${face}`
  await session.send('Page.navigate', { url })
  const fit = await settle(session)
  const name = `${face.replace('.jpg', '')}-${layer}.png`
  const slider = fit ? await shot(session, `${OUT}/${name}`) : ''
  return { face, layer, slider, fit, file: fit ? `${OUT}/${name}` : null }
}

const chrome = launchChrome()
try {
  const browserUrl = await connect()
  const browser = new WebSocket(browserUrl)
  await new Promise((resolve, reject) => {
    browser.addEventListener('open', resolve)
    browser.addEventListener('error', reject)
  })
  const { session } = await openSession(browser)
  const report = []
  for (const [face, width, height] of faces) {
    for (const layer of face.startsWith('near') ? layers : ['all']) {
      const row = await runCase(session, face, width, height, layer)
      report.push(row)
      const fit = row.fit
      console.log(
        JSON.stringify({
          face,
          layer,
          slider: row.slider,
          fitS: fit?.fitS,
          meanPx: fit?.meanPx,
          maxPx: fit?.maxPx,
          ratio: fit?.silhouette?.ratio,
          marks: fit?.markerCount,
          file: row.file,
        }),
      )
    }
  }
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
  console.log('wrote', `${OUT}/report.json`)
} finally {
  chrome.kill('SIGKILL')
}
