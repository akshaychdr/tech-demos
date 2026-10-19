from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from config import (
    DEFAULT_MAX_NEW_TOKENS,
    DEFAULT_MEMORY_CAP_MB,
    DEFAULT_MODEL,
    HF_HOME,
    MAX_MEMORY_CAP_MB,
    MIN_MEMORY_CAP_MB,
)

APP_ROOT = Path(__file__).resolve().parent.parent
SERVER_ROOT = Path(__file__).resolve().parent
WORKER = SERVER_ROOT / "workers" / "run_worker.py"
PYTHON = SERVER_ROOT / ".venv" / "bin" / "python"

app = FastAPI(title="AirLLM demo API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class CompareRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=512)
    memory_cap_mb: int = Field(default=DEFAULT_MEMORY_CAP_MB, ge=MIN_MEMORY_CAP_MB, le=MAX_MEMORY_CAP_MB)
    max_new_tokens: int = Field(default=DEFAULT_MAX_NEW_TOKENS, ge=4, le=64)
    compression: str = Field(default="none")
    model: str = Field(default=DEFAULT_MODEL)


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "model": DEFAULT_MODEL,
        "device": "cpu",
        "compression_cpu": False,
    }


async def _stream_worker(
    mode: str,
    body: CompareRequest,
) -> AsyncGenerator[dict, None]:
    if body.compression not in ("none", "4bit", "8bit"):
        raise HTTPException(status_code=400, detail="compression must be none, 4bit, or 8bit")
    if body.compression != "none":
        yield {"event": "message", "data": json.dumps({"type": "skip_compression", "reason": "cpu"})}

    compression = "none" if body.compression != "none" else "none"
    # On CPU we always run without block-wise compression (bitsandbytes is GPU-oriented).
    if body.compression != "none":
        yield {
            "event": "message",
            "data": json.dumps(
                {
                    "type": "info",
                    "run": mode,
                    "message": "Compression ignored on CPU (bitsandbytes kernels are GPU-only in this demo).",
                }
            ),
        }

    env = os.environ.copy()
    env["HF_HOME"] = str(HF_HOME)
    HF_HOME.mkdir(parents=True, exist_ok=True)

    cmd = [
        str(PYTHON),
        str(WORKER),
        "--mode",
        mode,
        "--model",
        body.model,
        "--prompt",
        body.prompt,
        "--max-new-tokens",
        str(body.max_new_tokens),
        "--memory-cap-mb",
        str(body.memory_cap_mb),
        "--compression",
        compression,
    ]

    yield {"event": "message", "data": json.dumps({"type": "run_start", "run": mode})}

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
        cwd=str(SERVER_ROOT),
    )

    assert proc.stdout is not None
    while True:
        line = await proc.stdout.readline()
        if not line:
            break
        text = line.decode().strip()
        if not text:
            continue
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = {"type": "log", "message": text}
        payload["run"] = mode
        yield {"event": "message", "data": json.dumps(payload)}

    await proc.wait()
    stderr = (await proc.stderr.read()).decode() if proc.stderr else ""
    yield {
        "event": "message",
        "data": json.dumps(
            {
                "type": "run_end",
                "run": mode,
                "exit_code": proc.returncode,
                "stderr_tail": stderr[-2000:] if stderr else "",
            }
        ),
    }


@app.get("/api/compare/stream")
async def compare_stream(
    prompt: str,
    memory_cap_mb: int = DEFAULT_MEMORY_CAP_MB,
    max_new_tokens: int = DEFAULT_MAX_NEW_TOKENS,
    compression: str = "none",
    model: str = DEFAULT_MODEL,
) -> EventSourceResponse:
    body = CompareRequest(
        prompt=prompt,
        memory_cap_mb=memory_cap_mb,
        max_new_tokens=max_new_tokens,
        compression=compression,
        model=model,
    )

    async def event_generator() -> AsyncGenerator[dict, None]:
        for mode in ("baseline", "airllm"):
            async for event in _stream_worker(mode, body):
                yield event
        yield {"event": "message", "data": json.dumps({"type": "all_done"})}

    return EventSourceResponse(event_generator())


def main() -> None:
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8765, reload=False)


if __name__ == "__main__":
    main()
