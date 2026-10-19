"""Physical RAM cap: cgroup v2 in-worker, systemd-run wrapper, or parent RSS watchdog."""

from __future__ import annotations

import os
import signal
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path

import psutil

CapMethod = str  # "cgroup_v2" | "systemd_run" | "rss_watchdog"


@dataclass
class CapRunResult:
    returncode: int
    peak_rss_mb: float
    cap_method: CapMethod
    killed_by_cap: bool
    cap_mb: int


def detect_cap_method() -> CapMethod:
    if _systemd_run_available():
        return "systemd_run"
    if _cgroup_v2_usable():
        return "cgroup_v2"
    return "rss_watchdog"


def _systemd_run_available() -> bool:
    try:
        proc = subprocess.run(
            ["systemd-run", "--user", "--scope", "-p", "MemoryMax=64M", "-p", "MemorySwapMax=0", "/bin/true"],
            capture_output=True,
            timeout=5,
        )
        return proc.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def _self_cgroup_path() -> Path | None:
    try:
        line = Path("/proc/self/cgroup").read_text().strip().splitlines()[0]
        if line.startswith("0::"):
            rel = line[3:]
            return Path("/sys/fs/cgroup") / rel.lstrip("/")
    except (OSError, IndexError):
        return None
    return None


def _cgroup_v2_usable() -> bool:
    parent = _self_cgroup_path()
    if parent is None:
        return False
    test_dir = parent / f"airllm-cap-test-{uuid.uuid4().hex[:8]}"
    try:
        test_dir.mkdir()
        (test_dir / "memory.max").write_text("67108864")
        (test_dir / "memory.swap.max").write_text("0")
        test_dir.rmdir()
        return True
    except OSError:
        try:
            if test_dir.exists():
                test_dir.rmdir()
        except OSError:
            pass
        return False


def enter_cgroup_v2(cap_mb: int) -> bool:
    """Move current process into a fresh cgroup with memory.max and swap disabled."""
    cap_bytes = cap_mb * 1024 * 1024
    parent = _self_cgroup_path()
    if parent is None:
        return False
    child = parent / f"airllm-worker-{uuid.uuid4().hex}"
    try:
        try:
            subtree = parent / "cgroup.subtree_control"
            if subtree.exists():
                current = subtree.read_text().strip()
                if "memory" not in current.split():
                    subtree.write_text(f"{current} +memory".strip())
        except OSError:
            pass
        child.mkdir()
        (child / "memory.max").write_text(str(cap_bytes))
        (child / "memory.swap.max").write_text("0")
        (child / "cgroup.procs").write_text(str(os.getpid()))
        return True
    except OSError:
        try:
            if child.exists():
                child.rmdir()
        except OSError:
            pass
        return False


def build_systemd_run_command(cmd: list[str], cap_mb: int) -> list[str]:
    return [
        "systemd-run",
        "--user",
        "--scope",
        "-p",
        f"MemoryMax={cap_mb}M",
        "-p",
        "MemorySwapMax=0",
        *cmd,
    ]


def tree_rss_bytes(pid: int) -> int:
    try:
        root = psutil.Process(pid)
    except psutil.NoSuchProcess:
        return 0
    total = root.memory_info().rss
    try:
        for child in root.children(recursive=True):
            try:
                total += child.memory_info().rss
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass
    return total


def kill_process_tree(pid: int) -> None:
    try:
        os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
