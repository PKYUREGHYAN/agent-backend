"""Local Qwen command planning and image-safety checks via Ollama."""

from __future__ import annotations

import json
from urllib.error import URLError
from urllib.request import Request, urlopen

from services.config import OLLAMA_MODEL, OLLAMA_URL
from services.runtime_service import get_runtime_profile


def _request(path: str, payload: dict | None = None, timeout: float = 5.0) -> dict:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        f"{OLLAMA_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST" if body is not None else "GET",
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def get_ollama_status() -> dict[str, str | bool]:
    try:
        installed = {item.get("name") for item in _request("/api/tags").get("models", [])}
    except (URLError, TimeoutError, OSError, json.JSONDecodeError):
        return {"available": False, "model": OLLAMA_MODEL, "reason": "Ollama-ը գործարկված չէ"}
    if OLLAMA_MODEL not in installed:
        return {
            "available": False,
            "model": OLLAMA_MODEL,
            "reason": f"Տեղադրեք {OLLAMA_MODEL} մոդելը Ollama-ում",
        }
    return {"available": True, "model": OLLAMA_MODEL, "reason": ""}


def ask_json(system_prompt: str, user_prompt: str, image_b64: str | None = None,
             timeout: float = 60.0) -> dict | None:
    if not get_ollama_status()["available"]:
        return None
    if get_runtime_profile()["available_ram_gib"] < 3.5:
        return None
    user_message: dict = {"role": "user", "content": user_prompt}
    if image_b64:
        user_message["images"] = [image_b64]
    try:
        response = _request(
            "/api/chat",
            {
                "model": OLLAMA_MODEL,
                "stream": False,
                "keep_alive": 0,
                "format": "json",
                "options": {"temperature": 0},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    user_message,
                ],
            },
            timeout=timeout,
        )
        result = json.loads(response["message"]["content"])
        return result if isinstance(result, dict) else None
    except (KeyError, TypeError, ValueError, URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None


def plan_custom_removal(image_data: str, user_text: str) -> dict[str, str | bool]:
    status = get_ollama_status()
    if not status["available"]:
        return {"allow": False, "reason": str(status["reason"])}
    try:
        image_b64 = image_data.split(";base64,", 1)[1]
    except IndexError:
        return {"allow": False, "reason": "Նկարի ձևաչափը սխալ է"}

    result = ask_json(
        "You are a conservative real-estate photo edit planner. Return JSON only.",
        "Inspect the photo and the user's request. Approve only one clearly visible, "
        "small movable object explicitly named by the user. Never approve a wall, floor, "
        "ceiling, door, window, built-in fixture, whole room, or uncertain object. "
        "Return {\"allow\":boolean,\"target\":\"short English object noun\","
        "\"reason\":\"short reason\"}. User request: " + user_text,
        image_b64=image_b64,
        timeout=60.0,
    )
    if result is None:
        return {"allow": False, "reason": "Qwen-ը չկարողացավ ստուգել նկարը։ Նկարը չի փոխվել։"}
    target = str(result.get("target", "")).strip().lower()
    allow = bool(result.get("allow")) and 2 <= len(target) <= 60
    allow = allow and target.replace(" ", "").replace("-", "").isalpha()
    return {
        "allow": allow,
        "target": target if allow else "",
        "reason": str(result.get("reason", ""))[:240],
    }


def review_target(image_data: str, command: str, target: str | None = None) -> dict[str, str | bool] | None:
    status = get_ollama_status()
    if not status["available"]:
        return None
    try:
        image_b64 = image_data.split(";base64,", 1)[1]
    except IndexError:
        return {"allow": False, "reason": "Նկարի ձևաչափը սխալ է"}
    target_text = target or command.removeprefix("REMOVE_").lower().replace("_", " ")
    result = ask_json(
        "You validate proposed edits to real-estate photos. Return JSON only.",
        f"Is this one requested target clearly visible and safe to remove: {target_text}? "
        "Reject uncertain or room-sized targets. Return {\"allow\":boolean,\"reason\":\"short reason\"}.",
        image_b64=image_b64,
        timeout=60.0,
    )
    if result is None:
        return None
    return {"allow": bool(result.get("allow")), "reason": str(result.get("reason", ""))[:240]}
