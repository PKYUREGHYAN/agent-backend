"""RAM-aware profiles for sequential CPU image model execution."""

from __future__ import annotations

import os

import psutil


GIB = 1024**3


def _swap_free_gib() -> float:
    try:
        return max(0.0, psutil.swap_memory().free / GIB)
    except Exception:
        return 0.0


def get_runtime_profile() -> dict[str, int | float | str | bool]:
    memory = psutil.virtual_memory()
    total_gib = memory.total / GIB
    available_gib = memory.available / GIB
    swap_free_gib = _swap_free_gib()
    # On small droplets swap keeps removal runnable when RAM is tight.
    effective_free_gib = available_gib + (swap_free_gib * 0.5)

    if total_gib < 4:
        name = "low-memory"
        detection_max_dimension = 640
        lama_max_dimension = 448
        min_free_for_removal_gib = 0.25
    elif total_gib < 12:
        name = "low-memory"
        detection_max_dimension = 768
        lama_max_dimension = 512
        min_free_for_removal_gib = 0.35
    elif total_gib < 24:
        name = "balanced"
        detection_max_dimension = 1024
        lama_max_dimension = 768
        min_free_for_removal_gib = 2.75
    else:
        name = "high-memory"
        detection_max_dimension = 1280
        lama_max_dimension = 1024
        min_free_for_removal_gib = 3.25

    # Allow override for constrained hosts without code changes.
    env_min = os.getenv("AI_MIN_FREE_RAM_GIB", "").strip()
    if env_min:
        try:
            min_free_for_removal_gib = float(env_min)
        except ValueError:
            pass

    return {
        "name": name,
        "total_ram_gib": round(total_gib, 2),
        "available_ram_gib": round(available_gib, 2),
        "swap_free_gib": round(swap_free_gib, 2),
        "effective_free_gib": round(effective_free_gib, 2),
        "detection_max_dimension": detection_max_dimension,
        "lama_max_dimension": lama_max_dimension,
        "min_free_for_removal_gib": min_free_for_removal_gib,
        "object_removal_ready": effective_free_gib >= min_free_for_removal_gib,
    }


def require_removal_memory() -> dict[str, int | float | str | bool]:
    profile = get_runtime_profile()
    if not profile["object_removal_ready"]:
        required = profile["min_free_for_removal_gib"]
        available = profile["available_ram_gib"]
        raise MemoryError(
            f"Ազատ RAM-ը քիչ է՝ {available} GB։ Օբյեկտ հեռացնելու համար փակեք այլ ծրագրեր "
            f"մինչև ազատ RAM-ը լինի առնվազն {required} GB։"
        )
    return profile
