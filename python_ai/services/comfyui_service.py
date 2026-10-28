"""Optional ComfyUI API adapter for large masked repairs.

Requires an API-format workflow plus a local node map. Neither model weights nor
workflow files are downloaded implicitly. ComfyUI may run on another GPU host.
"""

from __future__ import annotations

import json
import time
import uuid
from io import BytesIO
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from PIL import Image

from services.config import (
    COMFYUI_NODE_MAP_PATH,
    COMFYUI_TIMEOUT_SECONDS,
    COMFYUI_URL,
    COMFYUI_WORKFLOW_PATH,
)
from services.image_service_errors import ImageProcessingError


def _get_json(path: str, timeout: float = 5.0) -> dict:
    with urlopen(f"{COMFYUI_URL}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def get_comfyui_status() -> dict[str, str | bool]:
    if not COMFYUI_WORKFLOW_PATH.is_file() or not COMFYUI_NODE_MAP_PATH.is_file():
        return {
            "available": False,
            "engine": "comfyui-sdxl-or-flux-fill",
            "reason": "Պետք է ComfyUI API workflow և node-map կարգավորում",
        }
    try:
        _get_json("/system_stats", timeout=2.0)
    except (URLError, TimeoutError, OSError, json.JSONDecodeError):
        return {
            "available": False,
            "engine": "comfyui-sdxl-or-flux-fill",
            "reason": "ComfyUI-ին միանալ հնարավոր չէ",
        }
    return {
        "available": True,
        "engine": "comfyui-sdxl-or-flux-fill",
        "reason": "",
    }


def get_large_inpaint_status() -> dict[str, str | bool]:
    """Prefer ComfyUI; otherwise expose local LaMa as a CPU fallback."""
    comfy = get_comfyui_status()
    if comfy["available"]:
        return comfy

    from services.lama_service import status as lama_status

    lama = lama_status()
    if lama["available"]:
        return {
            "available": True,
            "engine": "iopaint-lama",
            "reason": "",
            "fallback": True,
        }

    return {
        "available": False,
        "engine": str(comfy.get("engine") or "comfyui-sdxl-or-flux-fill"),
        "reason": str(comfy.get("reason") or lama.get("reason") or ""),
    }


def _upload_image(image: Image.Image, name: str, image_format: str) -> str:
    output = BytesIO()
    image.save(output, format=image_format)
    boundary = f"----agent1{uuid.uuid4().hex}"
    payload = output.getvalue()
    mime = "image/png" if image_format == "PNG" else "image/jpeg"
    body = (
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\n"
        f"Content-Type: {mime}\r\n\r\n".encode()
        + payload
        + f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"type\"\r\n\r\ninput\r\n"
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n"
        f"--{boundary}--\r\n".encode()
    )
    request = Request(
        f"{COMFYUI_URL}/upload/image",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urlopen(request, timeout=30) as response:
        result = json.loads(response.read().decode("utf-8"))
    subfolder = result.get("subfolder", "")
    return f"{subfolder}/{result['name']}" if subfolder else result["name"]


def inpaint(image: Image.Image, mask, prompt: str, negative_prompt: str = "") -> Image.Image:
    status = get_comfyui_status()
    if not status["available"]:
        raise ImageProcessingError(str(status["reason"]))

    try:
        workflow = json.loads(COMFYUI_WORKFLOW_PATH.read_text(encoding="utf-8"))
        node_map = json.loads(COMFYUI_NODE_MAP_PATH.read_text(encoding="utf-8"))
        image_name = _upload_image(image.convert("RGB"), "agent1-source.png", "PNG")
        mask_image = Image.fromarray((mask > 0).astype("uint8") * 255).convert("RGB")
        mask_name = _upload_image(mask_image, "agent1-mask.png", "PNG")

        def set_input(mapping_name: str, value):
            mapping = node_map.get(mapping_name)
            if not mapping:
                if mapping_name in {"image", "mask", "positive_prompt", "negative_prompt"}:
                    raise ImageProcessingError(f"ComfyUI node-map-ում {mapping_name}-ը բացակայում է")
                return
            workflow[str(mapping["node"])]["inputs"][str(mapping["input"])] = value

        set_input("image", image_name)
        set_input("mask", mask_name)
        set_input("positive_prompt", prompt)
        set_input("negative_prompt", negative_prompt)

        seed = node_map.get("seed")
        if seed:
            workflow[str(seed["node"])]["inputs"][str(seed["input"])] = int(time.time_ns() % (2**32))

        request = Request(
            f"{COMFYUI_URL}/prompt",
            data=json.dumps({"prompt": workflow}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=30) as response:
            prompt_id = json.loads(response.read().decode("utf-8"))["prompt_id"]

        deadline = time.monotonic() + COMFYUI_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            history = _get_json(f"/history/{prompt_id}", timeout=10)
            record = history.get(prompt_id, {})
            for node_id in node_map.get("output_nodes", []):
                images = record.get("outputs", {}).get(str(node_id), {}).get("images", [])
                if images:
                    image_info = images[0]
                    query = urlencode({
                        "filename": image_info["filename"],
                        "subfolder": image_info.get("subfolder", ""),
                        "type": image_info.get("type", "output"),
                    })
                    with urlopen(f"{COMFYUI_URL}/view?{query}", timeout=30) as response:
                        result = Image.open(BytesIO(response.read())).convert("RGB")
                    return result.resize(image.size, Image.Resampling.LANCZOS)
            time.sleep(0.5)
        raise ImageProcessingError("ComfyUI inpaint-ի ժամանակը լրացավ")
    except ImageProcessingError:
        raise
    except (KeyError, TypeError, ValueError, URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
        raise ImageProcessingError(f"ComfyUI inpaint-ը ձախողվեց՝ {error}") from error
