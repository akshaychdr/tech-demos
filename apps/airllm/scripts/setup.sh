#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.bun/bin:${HOME}/.local/bin:${PATH}"

if [[ ! -f bunfig.toml ]]; then
  echo "missing bunfig.toml" >&2
  exit 1
fi

bun install

if [[ ! -d server/.venv ]]; then
  uv venv server/.venv
fi

uv pip install -p server/.venv/bin/python -r server/requirements.txt
uv pip install -p server/.venv/bin/python torch --index-url https://download.pytorch.org/whl/cpu

export HF_HOME="$ROOT/.cache/huggingface"
mkdir -p "$HF_HOME"
echo "Downloading model weights and building AirLLM layer shards (one-time, ~6 GB)…"
server/.venv/bin/python -c "
import sys
sys.path.insert(0, 'server')
from airllm import AutoModel
from config import DEFAULT_MODEL
AutoModel.from_pretrained(DEFAULT_MODEL, device='cpu', prefetching=False)
"

echo "Setup complete. Weights and shards live under apps/airllm/.cache/huggingface"
