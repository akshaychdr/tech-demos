#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.bun/bin:${PATH}"
export HF_HOME="$ROOT/.cache/huggingface"

cleanup() {
  [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "${WEB_PID:-}" ]] && kill "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT

server/.venv/bin/python server/main.py &
API_PID=$!
sleep 1
bun run dev --host 127.0.0.1 --port 5173 &
WEB_PID=$!

echo "API: http://127.0.0.1:8765  UI: http://127.0.0.1:5173"
wait
