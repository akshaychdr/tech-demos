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

echo "Setup complete. First run downloads ~1GB model weights into apps/airllm/.cache/huggingface"
