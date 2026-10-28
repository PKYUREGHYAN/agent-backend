import argparse
import gc
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from iopaint.model.lama import LaMa
from iopaint.schema import InpaintRequest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--mask", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with Image.open(args.image) as source:
        image = np.asarray(source.convert("RGB"))

    with Image.open(args.mask) as source:
        mask = (np.asarray(source.convert("L")) > 0).astype(np.uint8) * 255

    torch.set_num_threads(1)
    model = LaMa(device="cpu")

    try:
        with torch.inference_mode():
            result = model.forward(
                image,
                mask,
                InpaintRequest(model="lama"),
            )

        result = cv2.cvtColor(
            np.asarray(result, dtype=np.uint8),
            cv2.COLOR_BGR2RGB,
        )
        Image.fromarray(result).save(args.output, format="PNG")
        print("LAMA_RUNNER_SUCCESS")
    finally:
        del model
        gc.collect()


if __name__ == "__main__":
    main()
