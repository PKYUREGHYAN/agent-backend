from PIL import Image, ImageDraw
import torch

from transformers import (
    AutoProcessor,
    AutoModelForZeroShotObjectDetection,
)


# ==========================================
# SETTINGS
# ==========================================

IMAGE_PATH = r"C:\Users\kyure\Desktop\agent_1\photo_2026-09-12_11-37-57.jpg"

GROUNDING_MODEL_ID = "IDEA-Research/grounding-dino-tiny"

DEVICE = "cpu"

DEBUG_IMAGE_PATH = (
    r"C:\Users\kyure\Desktop\agent_1\dino_detection.png"
)


# ==========================================
# 1. Load image
# ==========================================

print("========================================")
print("GROUNDING DINO TEST")
print("========================================")

print("\nLoading image...")

image = Image.open(
    IMAGE_PATH
).convert("RGB")

print("Image size:", image.size)


# ==========================================
# 2. Load Grounding DINO
# ==========================================

print("\nLoading Grounding DINO...")

grounding_processor = AutoProcessor.from_pretrained(
    GROUNDING_MODEL_ID
)

grounding_model = AutoModelForZeroShotObjectDetection.from_pretrained(
    GROUNDING_MODEL_ID
).to(DEVICE)

grounding_model.eval()

print("Grounding DINO loaded.")


# ==========================================
# 3. Ask AI to find chair
# ==========================================

print("\nSearching for chair...")

# IMPORTANT:
#
# We provide ONLY the object name.
#
# NO coordinates are provided.
#
# Grounding DINO finds the coordinates itself.

text = "chair"


grounding_inputs = grounding_processor(
    images=image,
    text=text,
    return_tensors="pt",
)


grounding_inputs = {
    key: value.to(DEVICE)
    for key, value in grounding_inputs.items()
}


# ==========================================
# 4. Run Grounding DINO
# ==========================================

print("\nRunning detection...")

with torch.no_grad():

    grounding_outputs = grounding_model(
        **grounding_inputs
    )


# ==========================================
# 5. Post-process
# ==========================================

grounding_results = (
    grounding_processor.post_process_grounded_object_detection(
        grounding_outputs,
        grounding_inputs["input_ids"],
        target_sizes=[
            image.size[::-1]
        ],
    )[0]
)


# ==========================================
# 6. Read results
# ==========================================

boxes = grounding_results["boxes"]

scores = grounding_results["scores"]

labels = grounding_results["labels"]


# ==========================================
# 7. Check detection
# ==========================================

if len(boxes) == 0:

    raise RuntimeError(
        "Grounding DINO could not detect a chair."
    )


# ==========================================
# 8. Print ALL detections
# ==========================================

print("\n========================================")
print("ALL DETECTIONS")
print("========================================")


for index in range(len(boxes)):

    print(
        f"\nDetection #{index + 1}"
    )

    print(
        "Label:",
        labels[index]
    )

    print(
        "Score:",
        round(
            scores[index].item(),
            4
        )
    )

    print(
        "Coordinates:",
        [
            round(value, 2)
            for value in boxes[index].tolist()
        ]
    )


# ==========================================
# 9. Automatic selection
# ==========================================
#
# IMPORTANT:
#
# We do NOT write coordinates.
#
# We only select the detection that
# Grounding DINO itself gave the highest score.
# ==========================================

best_index = torch.argmax(
    scores
).item()


best_box = boxes[best_index]

best_score = scores[
    best_index
].item()

best_label = labels[
    best_index
]


# ==========================================
# 10. Print selected detection
# ==========================================

print("\n========================================")
print("SELECTED AUTOMATIC DETECTION")
print("========================================")

print(
    "Detection:",
    best_index + 1
)

print(
    "Object:",
    best_label
)

print(
    "Score:",
    round(
        best_score,
        4
    )
)

print(
    "Coordinates:",
    [
        round(value, 2)
        for value in best_box.tolist()
    ]
)


# ==========================================
# 11. Create debug image
# ==========================================
#
# This is ONLY for checking what DINO found.
#
# No coordinates are manually entered.
# ==========================================

debug_image = image.copy()

draw = ImageDraw.Draw(
    debug_image
)


for index in range(len(boxes)):

    box = boxes[index]

    x1, y1, x2, y2 = [
        int(value)
        for value in box.tolist()
    ]

    score = scores[index].item()

    label = labels[index]

    # Different outline:
    # selected detection -> thicker
    # other detections -> thinner

    if index == best_index:

        width = 5

    else:

        width = 2


    draw.rectangle(
        [
            x1,
            y1,
            x2,
            y2,
        ],
        outline="red",
        width=width,
    )


    draw.text(
        (
            x1,
            max(0, y1 - 20),
        ),
        f"{label} {score:.3f}",
        fill="red",
    )


# ==========================================
# 12. Save debug image
# ==========================================

debug_image.save(
    DEBUG_IMAGE_PATH
)


# ==========================================
# 13. Final
# ==========================================

print("\n========================================")
print("SUCCESS")
print("========================================")

print(
    "\nGrounding DINO automatically found:"
)

print(
    "Object:",
    best_label
)

print(
    "Score:",
    round(
        best_score,
        4
    )
)

print(
    "\nDebug image saved to:"
)

print(
    DEBUG_IMAGE_PATH
)

print(
    "\nNo coordinates were entered manually."
)

print(
    "Coordinates were generated by Grounding DINO."
)

print("========================================")
