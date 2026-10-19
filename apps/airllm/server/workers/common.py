import json
import resource
import sys
import threading
import time
from typing import Any

import psutil


def emit(event: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(event, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def apply_memory_cap(cap_mb: int) -> None:
    cap_bytes = int(cap_mb) * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (cap_bytes, cap_bytes))


def start_memory_sampler(stop: threading.Event, interval: float = 0.08) -> tuple[threading.Thread, dict[str, float]]:
    proc = psutil.Process()
    state = {"peak_rss_mb": 0.0, "t0": time.perf_counter()}

    def loop() -> None:
        while not stop.is_set():
            rss_mb = proc.memory_info().rss / (1024 * 1024)
            state["peak_rss_mb"] = max(state["peak_rss_mb"], rss_mb)
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
