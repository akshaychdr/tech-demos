from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
HF_HOME = APP_ROOT / ".cache" / "huggingface"
DEFAULT_MODEL = "Qwen/Qwen2.5-0.5B-Instruct"
DEFAULT_MAX_NEW_TOKENS = 24
DEFAULT_MEMORY_CAP_MB = 3800
MIN_MEMORY_CAP_MB = 2800
MAX_MEMORY_CAP_MB = 5200
