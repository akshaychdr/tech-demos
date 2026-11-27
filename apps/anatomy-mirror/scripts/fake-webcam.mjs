// Proves a stale anatomy-mirror-fit-v2 size of 1.4 does not scale the head.
// Chrome's fake webcam plays face.y4m. The page must already be served on PORT.
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = process.env.PORT ?? '5177'
const CDP = 9334
const Y4M = process.env.Y4M ?? '/tmp/faces/face.y4m'
const OUT = process.env.OUT ?? '/tmp/anatomy-harness/fake-webcam-stale-v2.png'

const chrome = spawn(
  'google-chrome',
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-video-capture=${Y4M}`,
    `--remote-debugging-port=${CDP}`,
    '--window-size=960,720',
  ],
  { stdio: 'ignore' },
)

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

try {
  const browserUrl = await connect()
  const browser = new WebSocket(browserUrl)
  await new Promise((resolve, reject) => {
    browser.addEventListener('open', resolve)
    browser.addEventListener('error', reject)
  })
  const created = await new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== 1) return
      browser.removeEventListener('message', onMessage)
      if (message.error) reject(new Error(JSON.stringify(message.error)))
      else resolve(message.result)
    }
    browser.addEventListener('message', onMessage)
    browser.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank' } }))
  })
  const list = await fetch(`http://127.0.0.1:${CDP}/json/list`).then((response) => response.json())
  const tab = list.find((entry) => entry.id === created.targetId)
  const socket = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve)
    socket.addEventListener('error', reject)
  })
  let seq = 1
  const waiters = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && waiters.has(message.id)) {
      waiters.get(message.id)(message)
      waiters.delete(message.id)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      waiters.set(id, (message) => {
        if (message.error) reject(new Error(`${method}: ${JSON.stringify(message.error)}`))
        else resolve(message.result)
      })
      socket.send(JSON.stringify({ id, method, params }))
    })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('anatomy-mirror-fit-v2', JSON.stringify({ size: 1.4, width: 1.2, height: 1.1, depth: 1, x: 1, y: -1, z: 0.5 }));`,
  })
  await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/tech-demos/anatomy-mirror/?live=1&panel=0&track=1` })
  let proof = null
  for (let i = 0; i < 40; i += 1) {
    await sleep(500)
    const result = await send('Runtime.evaluate', {
      expression: `(() => {
        const slider = document.querySelector('#fit-overall-size');
        return JSON.stringify({
          slider: slider ? slider.value : null,
          v2: localStorage.getItem('anatomy-mirror-fit-v2'),
          v3: localStorage.getItem('anatomy-mirror-fit-v3'),
          anatomy: window.__anatomy ? { fitS: window.__anatomy.fitS, meanPx: window.__anatomy.meanPx, markerCount: window.__anatomy.markerCount, ratio: window.__anatomy.silhouette && window.__anatomy.silhouette.ratio, fitKey: window.__anatomy.fitKey } : null
        });
      })()`,
      returnByValue: true,
    })
    const value = JSON.parse(result.result.value)
    if (value.anatomy && value.anatomy.markerCount >= 13 && value.slider) {
      proof = value
      break
    }
    proof = value
  }
  const box = await send('Runtime.evaluate', {
    expression: `(() => { const node = document.querySelector('.stage-host'); const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; })()`,
    returnByValue: true,
  })
  const clip = box.result.value
  const image = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: clip.x, y: clip.y, width: Math.max(2, clip.width), height: Math.max(2, clip.height), scale: 1 },
  })
  writeFileSync(OUT, Buffer.from(image.data, 'base64'))
  console.log(JSON.stringify({ proof, file: OUT }, null, 2))
} finally {
  chrome.kill('SIGKILL')
}
