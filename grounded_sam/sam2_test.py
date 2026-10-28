import cv2
import numpy as np
import torch

from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor


# ==========================================
# 1. Paths
# ==========================================

IMAGE_PATH = r"C:\Users\kyure\Desktop\agent_1\photo_2026-09-12_11-37-57.jpg"

CHECKPOINT_PATH = r"C:\Users\kyure\Desktop\agent_1\grounded_sam\checkpoints\sam2.1_hiera_tiny.pt"

CONFIG_PATH = "configs/sam2.1/sam2.1_hiera_t.yaml"

OUTPUT_MASK = r"C:\Users\kyure\Desktop\agent_1\grounded_sam\sam2_mask.png"


# ==========================================
# 2. DINO-ի արդեն ստացած BBox-ը
# ==========================================

# Այս coordinates-ը DINO-ն է ավտոմատ գտել։
# Մենք դրանք ձեռքով չենք հաշվարկել։

x1 = 247.69
y1 = 633.29
x2 = 566.76
y2 = 1055.20

box = np.array([x1, y1, x2, y2], dtype=np.float32)


# ==========================================
# 3. Load SAM2
# ==========================================

print("Loading SAM2...")

sam2_model = build_sam2(
    CONFIG_PATH,
    CHECKPOINT_PATH,
    device="cpu"
)

predictor = SAM2ImagePredictor(sam2_model)

print("SAM2 loaded successfully")


# ==========================================
# 4. Load image
# ==========================================

image = cv2.imread(IMAGE_PATH)

if image is None:
    raise FileNotFoundError(f"Image not found: {IMAGE_PATH}")

# OpenCV BGR -> RGB
image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


# ==========================================
# 5. Give image to SAM2
# ==========================================

print("Setting image...")

predictor.set_image(image_rgb)


# ==========================================
# 6. SAM2 segmentation from DINO bbox
# ==========================================

print("Generating mask...")

masks, scores, logits = predictor.predict(
    box=box,
    multimask_output=False
)


# ==========================================
# 7. Take generated mask
# ==========================================

mask = masks[0]

# Boolean -> 0 / 255
mask_image = (mask.astype(np.uint8)) * 255


# ==========================================
# 8. Save mask
# ==========================================

cv2.imwrite(
    OUTPUT_MASK,
    mask_image
)

print()
print("==========================================")
print("SAM2 MASK CREATED")
print("==========================================")
print(f"Mask: {OUTPUT_MASK}")
print(f"Score: {scores[0]:.4f}")
print(f"Mask size: {mask_image.shape}")