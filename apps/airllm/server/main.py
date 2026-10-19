from __future__ import annotations

import asyncio
import json
import os
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
    MODEL_WEIGHTS_GB,
)
from workers.memory_cap import (
    build_systemd_run_command,
    detect_cap_method,
    kill_process_tree,
    tree_rss_bytes,
)

APP_ROOT = Path(__file__).resolve().parent.parent
SERVER_ROOT = Path(__file__).resolve().parent
WORKER = SERVER_ROOT / "workers" / "run_worker.py"
PYTHON = SERVER_ROOT / ".venv" / "bin" / "python"

CAP_METHOD = detect_cap_method()

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
    max_new_tokens: int = Field(default=DEFAULT_MAX_NEW_TOKENS, ge=4, le=32)
    compression: str = Field(default="none")
    model: str = Field(default=DEFAULT_MODEL)


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "model": DEFAULT_MODEL,
        "model_weights_gb": MODEL_WEIGHTS_GB,
        "default_memory_cap_mb": DEFAULT_MEMORY_CAP_MB,
        "device": "cpu",
        "compression_cpu": False,
        "cap_method": CAP_METHOD,
        "cap_description": (
            "cgroup v2 memory.max + memory.swap.max=0"
            if CAP_METHOD in ("cgroup_v2", "systemd_run")
            else "parent RSS watchdog (SIGKILL when tree RSS exceeds cap)"
        ),
    }


async def _stream_worker(
    mode: str,
    body: CompareRequest,
) -> AsyncGenerator[dict, None]:
    if body.compression not in ("none", "4bit", "8bit"):
        raise HTTPException(status_code=400, detail="compression must be none, 4bit, or 8bit")

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
        "none",
        "--cap-method",
        CAP_METHOD,
    ]

    launch_cmd = (
        build_systemd_run_command(cmd, body.memory_cap_mb) if CAP_METHOD == "systemd_run" else cmd
    )

    yield {
        "event": "message",
        "data": json.dumps(
            {
                "type": "run_start",
                "run": mode,
                "cap_method": CAP_METHOD,
                "memory_cap_mb": body.memory_cap_mb,
            }
        ),
    }

    proc = await asyncio.create_subprocess_exec(
        *launch_cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=env,
        cwd=str(SERVER_ROOT),
        start_new_session=True,
    )

    cap_bytes = body.memory_cap_mb * 1024 * 1024
    peak_rss_mb = 0.0
    killed_by_cap = False
    stop_watch = asyncio.Event()
    saw_done = False

    async def rss_watchdog() -> None:
        nonlocal peak_rss_mb, killed_by_cap
        while not stop_watch.is_set():
            if proc.returncode is not None:
                return
            try:
                rss = tree_rss_bytes(proc.pid)
                peak_rss_mb = max(peak_rss_mb, rss / (1024 * 1024))
                if CAP_METHOD == "rss_watchdog" and rss > cap_bytes:
                    killed_by_cap = True
                    kill_process_tree(proc.pid)
                    return
            except Exception:
                return
            await asyncio.sleep(0.05)

    watchdog = asyncio.create_task(rss_watchdog())

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
        if payload.get("type") == "done":
            saw_done = True
        payload["run"] = mode
        yield {"event": "message", "data": json.dumps(payload)}

    await proc.wait()
    stop_watch.set()
    await watchdog

    if killed_by_cap or (proc.returncode in (-9, 137) and CAP_METHOD != "rss_watchdog"):
        killed_by_cap = True

    if killed_by_cap and not saw_done:
        msg = f"killed: exceeded {body.memory_cap_mb} MB RAM"
        yield {
            "event": "message",
            "data": json.dumps(
                {
                    "type": "result",
                    "run": mode,
                    "success": False,
                    "output_text": "",
                    "error": msg,
                    "killed_by_cap": True,
                }
            ),
        }
        yield {
            "event": "message",
            "data": json.dumps(
                {
                    "type": "done",
                    "run": mode,
                    "success": False,
                    "peak_rss_mb": round(peak_rss_mb, 1),
                    "error": msg,
                    "cap_method": CAP_METHOD,
                    "killed_by_cap": True,
                }
            ),
        }

    stderr = (await proc.stderr.read()).decode() if proc.stderr else ""
    yield {
        "event": "message",
        "data": json.dumps(
            {
                "type": "run_end",
                "run": mode,
                "exit_code": proc.returncode,
                "killed_by_cap": killed_by_cap,
                "peak_rss_mb_parent": round(peak_rss_mb, 1),
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
