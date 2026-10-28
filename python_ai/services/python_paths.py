"""Resolve Windows/Linux Python interpreters for local AI runners."""

from __future__ import annotations

import os
import sys
from pathlib import Path


AI_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = AI_ROOT.parent


def _is_python(path: Path) -> bool:
    return path.is_file() and os.access(path, os.X_OK)


def resolve_python(*relative_candidates: str, env_name: str | None = None) -> Path:
    """Pick the first existing interpreter from env, candidates, then this process."""
    if env_name:
        configured = os.getenv(env_name, "").strip()
        if configured:
            path = Path(configured)
            if _is_python(path):
                return path

    checked: list[Path] = []
    for relative in relative_candidates:
        path = PROJECT_ROOT / relative
        checked.append(path)
        if _is_python(path):
            return path

    current = Path(sys.executable)
    if _is_python(current):
        return current

    return checked[0] if checked else current


GROUNDED_SAM_PYTHON = resolve_python(
    "grounded_sam/Scripts/python.exe",
    "grounded_sam/.venv/Scripts/python.exe",
    "grounded_sam/.venv/bin/python",
    "iopaint/.venv/Scripts/python.exe",
    "iopaint/.venv/bin/python",
    "python_ai/.venv/Scripts/python.exe",
    "python_ai/.venv/bin/python",
    env_name="GROUNDED_SAM_PYTHON",
)

IOPAINT_PYTHON = resolve_python(
    "iopaint/.venv/Scripts/python.exe",
    "iopaint/.venv/bin/python",
    "python_ai/.venv/Scripts/python.exe",
    "python_ai/.venv/bin/python",
    env_name="IOPAINT_PYTHON",
)
