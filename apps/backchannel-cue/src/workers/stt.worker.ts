import { env, pipeline } from "@huggingface/transformers"

import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url"
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url"

type Asr = (audio: Float32Array, options?: Record<string, unknown>) => Promise<{ text: string } | string>

const ortWasmPaths = { wasm: wasmUrl, mjs: mjsUrl }

let asr: Asr | null = null

self.onmessage = (event: MessageEvent) => {
  const data = event.data as
    | { type: "load"; wasmPaths?: { wasm: string; mjs: string } }
    | { type: "transcribe"; id: number; audio: Float32Array }
  if (data.type === "load") {
    void load()
    return
  }
  void transcribe(data.id, data.audio)
}

async function load() {
  try {
    env.allowLocalModels = false
    env.useBrowserCache = true
    const wasm = env.backends.onnx.wasm
    if (!wasm) throw new Error("ONNX wasm backend is missing")
    wasm.numThreads = 1
    wasm.proxy = false
    wasm.wasmPaths = ortWasmPaths
    const loaded = await pipeline("automatic-speech-recognition", "onnx-community/moonshine-tiny-ONNX", {
      device: "wasm",
      dtype: { encoder_model: "fp32", decoder_model_merged: "q8" },
      progress_callback: (info: { status?: string; file?: string; progress?: number }) => {
        self.postMessage({
          type: "progress",
          status: info.status ?? "",
          file: info.file ?? "",
          progress: info.progress ?? 0,
        })
      },
    })
    asr = loaded as Asr
    self.postMessage({ type: "ready" })
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : "Speech model failed" })
  }
}

async function transcribe(id: number, audio: Float32Array) {
  if (!asr) {
    self.postMessage({ type: "error", message: "Speech model is not ready" })
    return
  }
  try {
    const result = await asr(audio, { sampling_rate: 16000 })
    const text = typeof result === "string" ? result : result.text
    self.postMessage({ type: "text", id, text })
  } catch (error) {
    self.postMessage({ type: "error", id, message: error instanceof Error ? error.message : "Transcription failed" })
  }
}
