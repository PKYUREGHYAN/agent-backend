import json
import os
from pathlib import Path

from dotenv import load_dotenv


AI_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = AI_ROOT.parent
load_dotenv(AI_ROOT / ".env")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_VISION_MODEL", "qwen3-vl:4b-instruct")
COMFYUI_URL = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")


def _configured_path(name: str, default: Path) -> Path:
    value = Path(os.getenv(name, str(default)))
    return value if value.is_absolute() else AI_ROOT / value


COMFYUI_WORKFLOW_PATH = _configured_path(
    "COMFYUI_WORKFLOW_PATH", AI_ROOT / "workflows/sdxl_inpaint_api.json"
)
COMFYUI_NODE_MAP_PATH = _configured_path(
    "COMFYUI_NODE_MAP_PATH", AI_ROOT / "workflows/sdxl_inpaint_nodes.json"
)
COMFYUI_TIMEOUT_SECONDS = int(os.getenv("COMFYUI_TIMEOUT_SECONDS", "300"))
DINO_MODEL_ID = os.getenv("DINO_MODEL_ID", "IDEA-Research/grounding-dino-tiny")
MAX_IMAGE_MEGAPIXELS = int(os.getenv("MAX_IMAGE_MEGAPIXELS", "24"))
SAM2_CHECKPOINT = Path(
    os.getenv(
        "SAM2_CHECKPOINT",
        str(PROJECT_ROOT / "grounded_sam/checkpoints/sam2.1_hiera_tiny.pt"),
    )
)


def read_json_file(path: Path) -> dict | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None