"""Run Grounding DINO + SAM2 in the dedicated grounded_sam environment."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from services.config import SAM2_CHECKPOINT
from services.image_service_errors import ImageProcessingError
from services.python_paths import GROUNDED_SAM_PYTHON, PROJECT_ROOT
from services.runtime_service import require_removal_memory


AI_ROOT = Path(__file__).resolve().parents[1]

RUNNER_PATH = AI_ROOT / "services" / "grounded_sam_runner.py"

_TARGET_PROMPTS = {
    "REMOVE_PEOPLE": "person",
    "REMOVE_CLOTHES": "clothes . clothing . shirt . trousers . jacket . pile of clothes",
    "REMOVE_BOTTLES": "bottle . water bottle . plastic bottle . glass bottle . can",
    "REMOVE_TRASH": "trash . rubbish . garbage bag . plastic bag . cardboard box",
    "REMOVE_TABLE_CLUTTER": "cup . mug . glass . plate . bowl . bottle . can . book . paper . remote control . phone",
    "REMOVE_CLUTTER": (
        "clothes . pile of clothes . shirt . shoes . slippers . bottle . cup . mug . "
        "glass . plate . can . cosmetics . makeup bag . perfume . toothbrush . "
        "trash . garbage bag . plastic bag . cardboard box . paper . remote control . "
        "phone . cable . toys . food package"
    ),
    "REMOVE_CHAIRS": "chair . armchair . stool",
    "REMOVE_TABLES": "table . dining table . coffee table",
    "REMOVE_SOFAS": "sofa . couch",
    "REMOVE_BEDS": "bed . mattress",
    "REMOVE_FURNITURE": "chair . armchair . sofa . table",
    "REPAIR_WALLS": "crack in wall . hole in wall . peeling paint . damaged plaster . wall stain . scuff mark",
    "ADD_TABLECLOTH": "dining table . table",
    "REMOVE_CUSTOM_OBJECT": "object",
}

_MAX_MASK_AREA = {
    "REMOVE_PEOPLE": 0.35,
    "REMOVE_CLOTHES": 0.18,
    "REMOVE_BOTTLES": 0.12,
    "REMOVE_TRASH": 0.16,
    "REMOVE_TABLE_CLUTTER": 0.12,
    "REMOVE_CLUTTER": 0.12,
    "REMOVE_CHAIRS": 0.22,
    "REMOVE_TABLES": 0.28,
    "REMOVE_SOFAS": 0.32,
    "REMOVE_BEDS": 0.35,
    "REMOVE_FURNITURE": 0.20,
    "REPAIR_WALLS": 0.28,
    "ADD_TABLECLOTH": 0.35,
    "REMOVE_CUSTOM_OBJECT": 0.10,
}

_MAX_BOX_AREA = {
    "REMOVE_PEOPLE": 0.32,
    "REMOVE_CLOTHES": 0.14,
    "REMOVE_BOTTLES": 0.08,
    "REMOVE_TRASH": 0.10,
    "REMOVE_TABLE_CLUTTER": 0.07,
    "REMOVE_CLUTTER": 0.08,
    "REMOVE_CHAIRS": 0.22,
    "REMOVE_TABLES": 0.30,
    "REMOVE_SOFAS": 0.35,
    "REMOVE_BEDS": 0.40,
    "REMOVE_FURNITURE": 0.20,
    "REPAIR_WALLS": 0.28,
    "ADD_TABLECLOTH": 0.40,
    "REMOVE_CUSTOM_OBJECT": 0.10,
}

_MAX_OBJECTS_PER_PASS = 6


def model_status() -> dict[str, str | bool]:
    """Check whether the dedicated runner and required models exist."""
    if not GROUNDED_SAM_PYTHON.is_file():
        return {
            "available": False,
            "reason": f"Grounded SAM Python-ը չի գտնվել՝ {GROUNDED_SAM_PYTHON}",
        }

    if not RUNNER_PATH.is_file():
        return {
            "available": False,
            "reason": f"Runner ֆայլը չի գտնվել՝ {RUNNER_PATH}",
        }

    if not SAM2_CHECKPOINT.is_file():
        return {
            "available": False,
            "reason": f"SAM2 checkpoint-ը չի գտնվել՝ {SAM2_CHECKPOINT}",
        }

    hf_home = Path(
        os.getenv("HF_HOME", str(Path.home() / ".cache" / "huggingface"))
    )
    dino_cache = (
        hf_home / "hub" / "models--IDEA-Research--grounding-dino-tiny"
    )
    snapshots = dino_cache / "snapshots"

    if not snapshots.is_dir() or not any(snapshots.iterdir()):
        return {
            "available": False,
            "reason": "Grounding DINO-ի տեղային մոդելի քեշը չի գտնվել։",
        }

    return {"available": True, "reason": ""}


def _prepare_image(
    image: Image.Image,
    max_dimension: int,
) -> tuple[Image.Image, float]:
    """Resize an image for model inference and return its scale."""
    rgb_image = image.convert("RGB")
    scale = min(1.0, max_dimension / max(rgb_image.size))

    if scale < 1.0:
        size = (
            max(2, round(rgb_image.width * scale)),
            max(2, round(rgb_image.height * scale)),
        )
        rgb_image = rgb_image.resize(size, Image.Resampling.LANCZOS)

    return rgb_image, scale


def _run_runner(arguments: list[str], timeout: int = 900) -> str:
    """Execute the dedicated Python runner and return its standard output."""
    env = os.environ.copy()
    env.update({
        "OMP_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
        "OPENBLAS_NUM_THREADS": "1",
        "TORCH_NUM_THREADS": "1",
    })
    try:
        result = subprocess.run(
            [
                str(GROUNDED_SAM_PYTHON),
                str(RUNNER_PATH),
                *arguments,
            ],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
            env=env,
        )
    except subprocess.TimeoutExpired as error:
        raise ImageProcessingError(
            "Grounding DINO/SAM2-ի աշխատանքը չափազանց երկար տևեց։"
        ) from error

    if result.returncode != 0:
        details = (result.stderr or result.stdout).strip()
        if not details:
            details = "Runner-ը չկարողացավ կատարել գործողությունը։"
        raise ImageProcessingError(
            f"Grounding DINO/SAM2 սխալ՝ {details[-2500:]}"
        )

    return result.stdout.strip()


def detect_objects(
    image: Image.Image,
    target: str,
) -> dict:
    """Detect matching objects and return boxes in original-image coordinates."""
    if not target or not target.strip():
        raise ImageProcessingError("Նշիր հայտնաբերվելիք առարկան։")

    status = model_status()
    if not status["available"]:
        raise ImageProcessingError(str(status["reason"]))

    try:
        profile = require_removal_memory()
    except MemoryError as error:
        raise ImageProcessingError(str(error)) from error

    original_width, original_height = image.size
    work_image, scale = _prepare_image(
        image,
        int(profile["detection_max_dimension"]),
    )

    try:
        with tempfile.TemporaryDirectory(prefix="agent1_detect_") as temp_dir:
            input_path = Path(temp_dir) / "input.png"
            work_image.save(input_path, format="PNG")

            output = _run_runner([
                "detect",
                "--image", str(input_path),
                "--target", target.strip(),
            ])

        try:
            data = json.loads(output)
        except json.JSONDecodeError as error:
            raise ImageProcessingError(
                "Առարկաների հայտնաբերման պատասխանը ճիշտ JSON չէ։"
            ) from error

        detections = data.get("detections", [])

        # Convert boxes from resized-image coordinates to original coordinates.
        for detection in detections:
            detection["box"] = [
                round(float(coordinate) / scale, 2)
                for coordinate in detection["box"]
            ]

        return {
            "success": True,
            "target": target.strip(),
            "image_width": original_width,
            "image_height": original_height,
            "count": len(detections),
            "detections": detections,
        }

    except ImageProcessingError:
        raise
    except Exception as error:
        raise ImageProcessingError(
            f"Առարկաների հայտնաբերման սխալ՝ {error}"
        ) from error


def _box_area_fraction(box: list[float], width: int, height: int) -> float:
    x1, y1, x2, y2 = box
    image_area = max(1, width * height)
    return max(0.0, (x2 - x1) * (y2 - y1)) / image_area


def _iou(box_a: list[float], box_b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union else 0.0


def _nms(detections: list[dict], threshold: float = 0.55) -> list[dict]:
    ordered = sorted(detections, key=lambda item: float(item.get("score") or 0), reverse=True)
    kept: list[dict] = []
    for detection in ordered:
        if all(_iou(detection["box"], item["box"]) < threshold for item in kept):
            kept.append(detection)
    return kept


def _dilate_mask(mask: np.ndarray, radius: int = 7) -> np.ndarray:
    if radius <= 0:
        return mask
    size = radius * 2 + 1
    image = Image.fromarray((mask > 0).astype(np.uint8) * 255, mode="L")
    expanded = image.filter(ImageFilter.MaxFilter(size))
    return (np.asarray(expanded) > 0).astype(np.uint8)


def make_mask(
    image: Image.Image,
    command: str,
    target: str | None = None,
    box: list[float] | None = None,
) -> tuple[np.ndarray, float]:
    """Create a binary mask for all matching objects on this photo only."""
    if command not in _TARGET_PROMPTS:
        raise ImageProcessingError(
            f"Չաջակցվող հեռացման հրաման՝ {command}"
        )

    if command == "REMOVE_CUSTOM_OBJECT":
        if not target or not target.strip():
            raise ImageProcessingError(
                "Նշիր, թե որ առարկան ես ցանկանում հեռացնել։"
            )
        prompt = target.strip()
    else:
        prompt = _TARGET_PROMPTS[command]

    status = model_status()
    if not status["available"]:
        raise ImageProcessingError(str(status["reason"]))

    try:
        profile = require_removal_memory()
    except MemoryError as error:
        raise ImageProcessingError(str(error)) from error

    original_width, original_height = image.size
    selected_boxes: list[list[float]] = []

    if box is not None:
        if len(box) != 4:
            raise ImageProcessingError("Ընտրված շրջանակը պետք է ունենա 4 կոորդինատ։")
        selected_boxes = [[float(value) for value in box]]
    else:
        detections = _nms(detect_objects(image, prompt).get("detections") or [])
        max_box_area = _MAX_BOX_AREA[command]
        detections = [
            detection
            for detection in detections
            if _box_area_fraction(detection["box"], original_width, original_height)
            <= max_box_area
        ]
        if not detections:
            raise ImageProcessingError(
                "Այս նկարում համապատասխան փոքր իր չգտնվեց։ Կահույքը չենք հանում։"
            )
        selected_boxes = [
            [float(value) for value in detection["box"]]
            for detection in detections[:_MAX_OBJECTS_PER_PASS]
        ]

    for selected in selected_boxes:
        x1, y1, x2, y2 = selected
        if not (
            0 <= x1 < x2 <= original_width
            and 0 <= y1 < y2 <= original_height
        ):
            raise ImageProcessingError(
                "Ընտրված շրջանակի կոորդինատները չեն համապատասխանում նկարին։"
            )

    work_image, scale = _prepare_image(
        image,
        int(profile["detection_max_dimension"]),
    )

    try:
        with tempfile.TemporaryDirectory(prefix="agent1_sam_") as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / "input.png"
            output_path = temp_path / "mask.png"
            work_image.save(input_path, format="PNG")

            runner_args = ["mask", "--image", str(input_path), "--output", str(output_path)]
            work_width, work_height = work_image.size
            for selected in selected_boxes:
                x1 = max(0.0, min(work_width - 2.0, selected[0] * scale))
                y1 = max(0.0, min(work_height - 2.0, selected[1] * scale))
                x2 = max(x1 + 1.0, min(float(work_width), selected[2] * scale))
                y2 = max(y1 + 1.0, min(float(work_height), selected[3] * scale))
                runner_args.extend(["--box", str(x1), str(y1), str(x2), str(y2)])

            _run_runner(runner_args)

            if not output_path.is_file():
                raise ImageProcessingError(
                    "Runner-ը ավարտվել է, բայց դիմակի ֆայլ չի ստեղծվել։"
                )

            with Image.open(output_path) as mask_image:
                mask_image = mask_image.convert("L")
                if mask_image.size != image.size:
                    mask_image = mask_image.resize(
                        image.size,
                        Image.Resampling.NEAREST,
                    )
                mask_array = np.asarray(mask_image).copy()

        mask = _dilate_mask((mask_array >= 128).astype(np.uint8))
        mask_fraction = float(mask.mean())

        if not mask.any():
            raise ImageProcessingError("SAM2-ը դատարկ դիմակ է ստեղծել։")

        max_area = _MAX_MASK_AREA[command]
        if mask_fraction > max_area:
            raise ImageProcessingError(
                f"Ընտրված առարկայի դիմակը չափազանց մեծ է՝ "
                f"{mask_fraction:.1%}։ Սահմանը՝ {max_area:.1%}։ "
                "Նկարը չենք փոխի ինքնաբերաբար։"
            )

        return mask, mask_fraction

    except ImageProcessingError:
        raise
    except Exception as error:
        raise ImageProcessingError(
            f"Դիմակի ստեղծման սխալ՝ {error}"
        ) from error
