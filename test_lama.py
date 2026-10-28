from PIL import Image
import numpy as np

from iopaint.model.lama import LaMa


# ==========================================
# SETTINGS
# ==========================================

IMAGE_PATH = r"C:\Users\kyure\Desktop\agent_1\photo_2026-09-12_11-37-57.jpg"

MASK_PATH = r"C:\Users\kyure\Desktop\agent_1\chair_mask.png"

OUTPUT_PATH = r"C:\Users\kyure\Desktop\agent_1\chair_removed.png"


# ==========================================
# 1. Load original image
# ==========================================

print("Loading original image...")

image = Image.open(IMAGE_PATH).convert("RGB")

print("Image size:", image.size)


# ==========================================
# 2. Load mask
# ==========================================

print("\nLoading chair mask...")

mask = Image.open(MASK_PATH).convert("L")

print("Mask size:", mask.size)


# ==========================================
# 3. Convert to numpy
# ==========================================

image_np = np.array(image)

mask_np = np.array(mask)


# ==========================================
# 4. Make sure mask is binary
# ==========================================

mask_np = np.where(
    mask_np > 127,
    255,
    0
).astype(np.uint8)


# ==========================================
# 5. Load LaMa
# ==========================================

print("\nLoading LaMa...")

lama = LaMa(
    device="cpu"
)

print("LaMa loaded.")


# ==========================================
# 6. Remove chair
# ==========================================

print("\nRemoving chair...")

result = lama.forward(
    image_np,
    mask_np
)


# ==========================================
# 7. Save result
# ==========================================

result_image = Image.fromarray(result)

result_image.save(OUTPUT_PATH)


# ==========================================
# 8. Done
# ==========================================

print("\nSUCCESS!")

print("Chair removed.")

print("\nResult saved to:")

print(OUTPUT_PATH)