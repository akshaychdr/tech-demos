import json
import sys
import threading
import time
from typing import Any

import psutil

from workers.memory_cap import tree_rss_bytes


def emit(event: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(event, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def start_memory_sampler(
    stop: threading.Event, interval: float = 0.08
) -> tuple[threading.Thread, dict[str, float]]:
    proc = psutil.Process()
    state = {
        "peak_rss_mb": 0.0,
        "t0": time.perf_counter(),
        "samples": [],
    }

    def loop() -> None:
        while not stop.is_set():
            rss_bytes = tree_rss_bytes(proc.pid)
            rss_mb = rss_bytes / (1024 * 1024)
            state["peak_rss_mb"] = max(state["peak_rss_mb"], rss_mb)
            state["samples"].append(rss_mb)
            emit(
                {
                    "type": "memory",
                    "rss_mb": round(rss_mb, 1),
                    "t_s": round(time.perf_counter() - state["t0"], 3),
                }
            )
            time.sleep(interval)

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    return thread, state
