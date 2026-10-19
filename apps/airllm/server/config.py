from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
HF_HOME = APP_ROOT / ".cache" / "huggingface"

# ~3B params @ fp16/bf16 ≈ 6 GB weights in RAM when fully loaded.
DEFAULT_MODEL = "Qwen/Qwen2.5-3B-Instruct"
MODEL_WEIGHTS_GB = 6.0
DEFAULT_MAX_NEW_TOKENS = 10
DEFAULT_MEMORY_CAP_MB = 2500
MIN_MEMORY_CAP_MB = 2000
MAX_MEMORY_CAP_MB = 4000
