"""Grounding DINO detection and SAM2 mask generation."""

import argparse
import gc
import json
import os
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import (
    AutoModelForZeroShotObjectDetection,
    AutoProcessor,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CHECKPOINT = (
    PROJECT_ROOT / "grounded_sam" / "checkpoints" / "sam2.1_hiera_tiny.pt"
)
DINO_MODEL_ID = os.getenv(
    "DINO_MODEL_ID",
    "IDEA-Research/grounding-dino-tiny",
)


def detect_objects(image_path: Path, target: str) -> None:
    """Detect matching objects and return their boxes as JSON."""
    if not image_path.is_file():
        raise FileNotFoundError(f"Image not found: {image_path}")

    target = target.strip().lower()
    if not target:
        raise ValueError("Target must not be empty.")

    with Image.open(image_path) as source:
        image = source.convert("RGB")

    processor = AutoProcessor.from_pretrained(
        DINO_MODEL_ID,
        local_files_only=True,
    )
    detector = AutoModelForZeroShotObjectDetection.from_pretrained(
        DINO_MODEL_ID,
        local_files_only=True,
    )
    detector.eval()

    prompt = target.strip()
    if not prompt.endswith("."):
        prompt = f"{prompt} ."

    inputs = processor(
        images=image,
        text=prompt,
        return_tensors="pt",
    )

    with torch.inference_mode():
        outputs = detector(**inputs)

    detections = processor.post_process_grounded_object_detection(
        outputs,
        inputs.input_ids,
        threshold=0.28,
        text_threshold=0.22,
        target_sizes=[(image.height, image.width)],
    )[0]

    boxes = detections["boxes"].cpu().numpy()
    scores = detections["scores"].cpu().numpy()
    labels = detections.get("text_labels")

    results = []
    for index, (box, score) in enumerate(zip(boxes, scores)):
        label = (
            str(labels[index])
            if labels is not None and index < len(labels)
            else target
        )
        x1, y1, x2, y2 = [round(float(value), 2) for value in box]
        results.append({
            "id": index,
            "label": label,
            "score": round(float(score), 4),
            "box": [x1, y1, x2, y2],
        })

    print(json.dumps({
        "success": True,
        "target": target,
        "image_width": image.width,
        "image_height": image.height,
        "count": len(results),
        "detections": results,
    }, ensure_ascii=False))

    del processor, detector, inputs, outputs, detections
    gc.collect()


def create_mask(
    image_path: Path,
    boxes: list[list[float]],
    output_path: Path,
) -> None:
    """Create a union mask for one or more bounding boxes on the same photo."""
    if not image_path.is_file():
        raise FileNotFoundError(f"Image not found: {image_path}")

    if not CHECKPOINT.is_file():
        raise FileNotFoundError(f"SAM2 checkpoint not found: {CHECKPOINT}")

    if not boxes:
        raise ValueError("At least one box is required.")

    with Image.open(image_path) as source:
        image = source.convert("RGB")

    width, height = image.size
    for box in boxes:
        x1, y1, x2, y2 = box
        if not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
            raise ValueError(
                f"Invalid box {box} for image size {width}x{height}"
            )

    image_array = np.asarray(image).copy()

    from sam2.build_sam import build_sam2
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    import sam2

    # Hydra expects a package-relative config id, not an absolute filesystem path.
    config_name = "configs/sam2.1/sam2.1_hiera_t.yaml"
    config_file = (
        Path(sam2.__file__).resolve().parent
        / "configs"
        / "sam2.1"
        / "sam2.1_hiera_t.yaml"
    )
    if not config_file.is_file():
        raise FileNotFoundError(f"SAM2 config not found: {config_file}")

    model = build_sam2(
        config_name,
        str(CHECKPOINT),
        device="cpu",
    )
    predictor = SAM2ImagePredictor(model)
    predictor.set_image(image_array)

    combined = np.zeros((height, width), dtype=np.uint8)
    used_boxes = 0

    for box in boxes:
        masks, mask_scores, _ = predictor.predict(
            box=np.asarray(box, dtype=np.float32),
            multimask_output=False,
        )
        if masks.ndim == 3:
            mask = masks[int(np.argmax(mask_scores))]
        else:
            mask = masks
        combined = np.maximum(combined, (mask > 0).astype(np.uint8) * 255)
        used_boxes += 1

    if not np.any(combined):
        raise ValueError("SAM2 produced an empty mask.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(combined).save(output_path)

    print(json.dumps({
        "success": True,
        "mask_width": int(combined.shape[1]),
        "mask_height": int(combined.shape[0]),
        "mask_area": round(float(np.count_nonzero(combined)) / combined.size, 6),
        "box_count": used_boxes,
        "output": str(output_path),
    }, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="mode", required=True)

    detect_parser = subparsers.add_parser("detect")
    detect_parser.add_argument("--image", required=True, type=Path)
    detect_parser.add_argument("--target", required=True)

    mask_parser = subparsers.add_parser("mask")
    mask_parser.add_argument("--image", required=True, type=Path)
    mask_parser.add_argument(
        "--box",
        required=True,
        nargs=4,
        action="append",
        type=float,
        metavar=("X1", "Y1", "X2", "Y2"),
    )
    mask_parser.add_argument("--output", required=True, type=Path)

    args = parser.parse_args()

    try:
        if args.mode == "detect":
            detect_objects(args.image, args.target)
        else:
            create_mask(args.image, args.box, args.output)
        return 0
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
