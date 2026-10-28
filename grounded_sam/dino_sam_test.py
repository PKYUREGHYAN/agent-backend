import cv2
import numpy as np
import torch

from PIL import Image, ImageDraw

from transformers import (
    AutoProcessor,
    AutoModelForZeroShotObjectDetection,
)

from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor


# ============================================================
# PATHS
# ============================================================

IMAGE_PATH = r"C:\Users\kyure\Desktop\agent_1\photo_2026-09-12_11-37-57.jpg"

GROUNDING_MODEL_ID = "IDEA-Research/grounding-dino-tiny"

SAM2_CHECKPOINT = (
    r"C:\Users\kyure\Desktop\agent_1\grounded_sam"
    r"\checkpoints\sam2.1_hiera_tiny.pt"
)

SAM2_CONFIG = "configs/sam2.1/sam2.1_hiera_t.yaml"

OUTPUT_DIR = r"C:\Users\kyure\Desktop\agent_1\grounded_sam"

DEVICE = "cpu"

TARGET_OBJECT = "chair"


# ============================================================
# 1. LOAD IMAGE
# ============================================================

print("========================================")
print("DINO + SAM2 TEST")
print("========================================")

print("\nLoading image...")

image = Image.open(IMAGE_PATH).convert("RGB")

print("Image size:", image.size)


# ============================================================
# 2. LOAD GROUNDING DINO
# ============================================================

print("\nLoading Grounding DINO...")

grounding_processor = AutoProcessor.from_pretrained(
    GROUNDING_MODEL_ID
)

grounding_model = AutoModelForZeroShotObjectDetection.from_pretrained(
    GROUNDING_MODEL_ID
).to(DEVICE)

grounding_model.eval()

print("Grounding DINO loaded.")


# ============================================================
# 3. DINO DETECTION
# ============================================================

print(f"\nSearching for: {TARGET_OBJECT}")

grounding_inputs = grounding_processor(
    images=image,
    text=TARGET_OBJECT,
    return_tensors="pt",
)

grounding_inputs = {
    key: value.to(DEVICE)
    for key, value in grounding_inputs.items()
}


print("\nRunning Grounding DINO...")

with torch.no_grad():
    grounding_outputs = grounding_model(
        **grounding_inputs
    )


grounding_results = (
    grounding_processor.post_process_grounded_object_detection(
        grounding_outputs,
        grounding_inputs["input_ids"],
        target_sizes=[
            image.size[::-1]
        ],
    )[0]
)


boxes = grounding_results["boxes"]
scores = grounding_results["scores"]
labels = grounding_results["labels"]


if len(boxes) == 0:
    raise RuntimeError(
        f"Grounding DINO could not detect: {TARGET_OBJECT}"
    )


# ============================================================
# 4. PRINT ALL DINO DETECTIONS
# ============================================================

print("\n========================================")
print("DINO DETECTIONS")
print("========================================")

for index in range(len(boxes)):

    box = boxes[index]

    print(f"\nDetection #{index + 1}")

    print("Label:", labels[index])

    print(
        "DINO score:",
        round(scores[index].item(), 4)
    )

    print(
        "Box:",
        [round(value, 2) for value in box.tolist()]
    )


# ============================================================
# 5. LOAD SAM2
# ============================================================

print("\n========================================")
print("Loading SAM2")
print("========================================")

sam2_model = build_sam2(
    SAM2_CONFIG,
    SAM2_CHECKPOINT,
    device=DEVICE,
)

predictor = SAM2ImagePredictor(
    sam2_model
)

print("SAM2 loaded successfully.")


# ============================================================
# 6. PREPARE IMAGE FOR SAM2
# ============================================================

image_np = np.array(image)

print("\nSetting image in SAM2...")

predictor.set_image(image_np)

print("Image set.")


# ============================================================
# 7. RUN SAM2 FOR EVERY DINO BOX
# ============================================================

print("\n========================================")
print("SAM2 MASK GENERATION")
print("========================================")

results = []

for index in range(len(boxes)):

    box = boxes[index].detach().cpu().numpy()

    dino_score = scores[index].item()

    label = labels[index]

    print(f"\nProcessing detection #{index + 1}")

    print(
        "Box:",
        [round(value, 2) for value in box.tolist()]
    )

    masks, sam_scores, logits = predictor.predict(
        box=box,
        multimask_output=False,
    )

    mask = masks[0]

    sam_score = float(sam_scores[0])

    mask_image = (
            mask.astype(np.uint8) * 255
    )

    mask_path = (
        f"{OUTPUT_DIR}"
        f"\\sam2_detection_{index + 1}_mask.png"
    )

    cv2.imwrite(
        mask_path,
        mask_image,
    )

    mask_area = int(mask.sum())

    results.append(
        {
            "index": index,
            "label": label,
            "dino_score": dino_score,
            "sam_score": sam_score,
            "box": box,
            "mask": mask,
            "mask_area": mask_area,
            "mask_path": mask_path,
        }
    )

    print(
        "DINO score:",
        round(dino_score, 4)
    )

    print(
        "SAM2 score:",
        round(sam_score, 4)
    )

    print(
        "Mask pixels:",
        mask_area
    )

    print(
        "Mask saved:",
        mask_path
    )


# ============================================================
# 8. CREATE DEBUG IMAGE
# ============================================================

print("\n========================================")
print("CREATING DEBUG IMAGE")
print("========================================")

debug_image = image.copy()

draw = ImageDraw.Draw(
    debug_image
)

for result in results:

    index = result["index"]

    box = result["box"]

    dino_score = result["dino_score"]

    sam_score = result["sam_score"]

    label = result["label"]

    x1, y1, x2, y2 = [
        int(value)
        for value in box
    ]

    draw.rectangle(
        [x1, y1, x2, y2],
        outline="red",
        width=4,
    )

    text = (
        f"#{index + 1} "
        f"{label} "
        f"DINO={dino_score:.3f} "
        f"SAM={sam_score:.3f}"
    )

    draw.text(
        (
            x1,
            max(0, y1 - 20),
        ),
        text,
        fill="red",
    )


DEBUG_PATH = (
    f"{OUTPUT_DIR}\\dino_sam_debug.png"
)

debug_image.save(
    DEBUG_PATH
)


print(
    "Debug image:",
    DEBUG_PATH
)


# ============================================================
# 9. FINAL RESULTS
# ============================================================

print("\n========================================")
print("FINAL RESULTS")
print("========================================")

for result in results:

    print(
        f"\nDetection #{result['index'] + 1}"
    )

    print(
        "Label:",
        result["label"]
    )

    print(
        "DINO:",
        round(result["dino_score"], 4)
    )

    print(
        "SAM2:",
        round(result["sam_score"], 4)
    )

    print(
        "Mask area:",
        result["mask_area"]
    )

    print(
        "Mask:",
        result["mask_path"]
    )


print("\n========================================")
print("TEST FINISHED")
print("========================================")