"""Small-mask inpainting through the dedicated IOPaint Python environment."""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

from services.python_paths import IOPAINT_PYTHON, PROJECT_ROOT
from services.runtime_service import get_runtime_profile


AI_ROOT = Path(__file__).resolve().parents[1]
RUNNER_PATH = AI_ROOT / "services" / "lama_runner.py"


def status() -> dict[str, str | bool]:
    if not IOPAINT_PYTHON.is_file():
        return {
            "available": False,
            "reason": f"IOPaint Python-ը չի գտնվել՝ {IOPAINT_PYTHON}",
        }

    if not RUNNER_PATH.is_file():
        return {
            "available": False,
            "reason": f"LaMa runner-ը չի գտնվել՝ {RUNNER_PATH}",
        }

    return {"available": True, "reason": ""}


def inpaint(image: Image.Image, mask) -> Image.Image:
    import gc

    capability = status()
    if not capability["available"]:
        raise RuntimeError(str(capability["reason"]))

    original_size = image.size
    image_rgb = image.convert("RGB")
    mask_u8 = (np.asarray(mask) > 0).astype(np.uint8) * 255

    if mask_u8.shape != (image.height, image.width):
        raise ValueError("Mask-ի չափսերը չեն համապատասխանում նկարին։")

    max_dimension = int(get_runtime_profile()["lama_max_dimension"])
    scale = min(1.0, max_dimension / max(image.size))

    if scale < 1.0:
        work_size = (
            max(8, round(image.width * scale / 8) * 8),
            max(8, round(image.height * scale / 8) * 8),
        )
        image_rgb = image_rgb.resize(work_size, Image.Resampling.LANCZOS)
        mask_image = Image.fromarray(mask_u8).resize(
            work_size,
            Image.Resampling.NEAREST,
        )
        mask_u8 = np.asarray(mask_image, dtype=np.uint8)

    try:
        with tempfile.TemporaryDirectory(prefix="agent1_lama_") as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / "input.png"
            mask_path = temp_path / "mask.png"
            output_path = temp_path / "output.png"

            image_rgb.save(input_path, format="PNG")
            Image.fromarray(mask_u8).save(mask_path, format="PNG")

            result = subprocess.run(
                [
                    str(IOPAINT_PYTHON),
                    str(RUNNER_PATH),
                    "--image", str(input_path),
                    "--mask", str(mask_path),
                    "--output", str(output_path),
                ],
                cwd=str(PROJECT_ROOT),
                capture_output=True,
                text=True,
                timeout=600,
                check=False,
            )

            if result.returncode != 0:
                details = (result.stderr or result.stdout).strip()
                if not details:
                    details = "LaMa runner-ը չկարողացավ մշակել նկարը։"
                raise RuntimeError(f"LaMa սխալ՝ {details[-2500:]}")

            if not output_path.is_file():
                raise RuntimeError("LaMa-ն արդյունքի նկարը չի ստեղծել։")

            with Image.open(output_path) as output:
                processed = output.convert("RGB")

            if processed.size != original_size:
                processed = processed.resize(
                    original_size,
                    Image.Resampling.LANCZOS,
                )

            return processed

    except subprocess.TimeoutExpired as error:
        raise RuntimeError("LaMa-ի աշխատանքը չափազանց երկար տևեց։") from error
    finally:
        gc.collect()
