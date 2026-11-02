import * as ort from "onnxruntime-web/wasm"
import { Tokenizer } from "tokenizers-wasm"
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url"
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url"
import meta from "@/data/meta.json"
import {
  clean,
  historyFromClock,
  timingFeatures,
  type Clock,
  type Scores,
} from "@/lib/policy"

const MODEL_URL = "https://huggingface.co/KoljaB/backchannel-cue-32m/resolve/main/model.onnx"
const TOKENIZER_URL = "https://huggingface.co/KoljaB/backchannel-cue-32m/resolve/main/tokenizer.json"
const CACHE_NAME = "backchannel-cue-model-v1"
const EXPECTED_BYTES = 128_735_292

let configured = false

/** Vite URLs, so the runtime can import the wasm helper instead of a /public file. */
export const ortWasmPaths = { wasm: wasmUrl, mjs: mjsUrl }

export function configureOrt() {
  if (configured) return
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  ort.env.wasm.wasmPaths = ortWasmPaths
  configured = true
}

export type LoadPhase = "download" | "start"

async function loadTokenizerJson(): Promise<string> {
  const cache = await caches.open(CACHE_NAME)
  const hit = await cache.match(TOKENIZER_URL)
  if (hit) return hit.text()
  const response = await fetch(TOKENIZER_URL)
  if (!response.ok) throw new Error(`Could not download the tokenizer (${response.status})`)
  const text = await response.text()
  await cache.put(TOKENIZER_URL, new Response(text, { headers: { "Content-Type": "application/json" } }))
  return text
}

export async function fetchModelBytes(onProgress: (ratio: number) => void): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME)
  const hit = await cache.match(MODEL_URL)
  if (hit) {
    onProgress(1)
    return hit.arrayBuffer()
  }
  const response = await fetch(MODEL_URL)
  if (!response.ok || !response.body) {
    throw new Error(`Could not download the model (${response.status})`)
  }
  const total = Number(response.headers.get("content-length")) || EXPECTED_BYTES
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let got = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    chunks.push(value)
    got += value.byteLength
    onProgress(Math.min(0.99, got / total))
  }
  const buffer = new Uint8Array(got)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  await cache.put(
    MODEL_URL,
    new Response(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
      },
    }),
  )
  onProgress(1)
  return buffer.buffer
}

export class CueEngine {
  private readonly session: ort.InferenceSession
  private readonly tokenizer: Tokenizer

  private constructor(session: ort.InferenceSession, tokenizer: Tokenizer) {
    this.session = session
    this.tokenizer = tokenizer
  }

  static async create(onProgress: (ratio: number, phase: LoadPhase) => void): Promise<CueEngine> {
    configureOrt()
    const bytes = await fetchModelBytes((ratio) => onProgress(ratio, "download"))
    onProgress(1, "start")
    const [session, tokenizerJson] = await Promise.all([
      ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "basic",
      }),
      loadTokenizerJson(),
    ])
    const tokenizer = Tokenizer.from_json(tokenizerJson)
    return new CueEngine(session, tokenizer)
  }

  async score(text: string, clock: Clock, nowSec: number): Promise<Scores> {
    const history = historyFromClock(text, clock, nowSec)
    const cleaned = clean(text)
    let ids = Array.from(this.tokenizer.encode(cleaned))
    const max = meta.max_tokens
    if (ids.length > max) ids = [ids[0]!, ...ids.slice(-(max - 1))]
    const id64 = BigInt64Array.from(ids, (id) => BigInt(id))
    const mask = new BigInt64Array(id64.length).fill(1n)
    const timing = Float32Array.from(
      timingFeatures(text, history.secondsSinceCue, history.wordsSinceCue, history.cuesThisTurn),
    )
    const output = await this.session.run({
      input_ids: new ort.Tensor("int64", id64, [1, id64.length]),
      attention_mask: new ort.Tensor("int64", mask, [1, mask.length]),
      timing: new ort.Tensor("float32", timing, [1, 5]),
    })
    const reactions = floatRow(output.reactions)
    const mood = floatRow(output.mood)
    return {
      gate: floatRow(output.gate)[0] ?? 0,
      reactions: Object.fromEntries(meta.reactions.map((name, index) => [name, reactions[index] ?? 0])),
      mood: Object.fromEntries(meta.moods.map((name, index) => [name, mood[index] ?? 0])),
      forms: Array.from(floatRow(output.form)),
    }
  }
}

function floatRow(tensor: ort.Tensor | undefined): Float32Array {
  const data = tensor?.data
  if (data instanceof Float32Array) return data
  return new Float32Array()
}

let loading: Promise<CueEngine> | null = null

export function loadEngine(onProgress: (ratio: number, phase: LoadPhase) => void): Promise<CueEngine> {
  if (!loading) {
    loading = CueEngine.create(onProgress).catch((error: unknown) => {
      loading = null
      throw error
    })
  }
  return loading
}
