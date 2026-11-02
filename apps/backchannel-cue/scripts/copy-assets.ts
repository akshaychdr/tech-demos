import { cpSync, mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const vad = path.join(root, "node_modules/@ricky0123/vad-web/dist")
const vadOut = path.join(root, "public/vad")
mkdirSync(vadOut, { recursive: true })

for (const file of ["silero_vad_v5.onnx", "vad.worklet.bundle.min.js"]) {
  cpSync(path.join(vad, file), path.join(vadOut, file))
}
