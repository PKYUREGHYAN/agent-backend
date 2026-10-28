"""Optional local Real-ESRGAN upscaler; it never removes or invents object masks."""

from pathlib import Path

from PIL import Image

from services.config import AI_ROOT

import os

WEIGHTS_PATH = Path(
    os.getenv("REALESRGAN_WEIGHTS", str(AI_ROOT / "models/RealESRGAN_x4plus.pth"))
)


def status() -> dict[str, str | bool]:
    if not WEIGHTS_PATH.is_file():
        return {"available": False, "reason": "Real-ESRGAN weights-ը դեռ տեղադրված չէ"}
    try:
        from basicsr.archs.rrdbnet_arch import RRDBNet  # noqa: F401
        from realesrgan import RealESRGANer  # noqa: F401
    except Exception:
        return {"available": False, "reason": "Տեղադրեք Real-ESRGAN և BasicSR փաթեթները"}
    return {"available": True, "reason": ""}


def upscale(image, scale: int = 2):
    import cv2
    import numpy as np
    from basicsr.archs.rrdbnet_arch import RRDBNet
    from realesrgan import RealESRGANer

    if not 2 <= scale <= 4:
        raise ValueError("Upscale-ի գործակիցը պետք է լինի 2-ից 4")
    model = RRDBNet(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_block=23,
        num_grow_ch=32,
        scale=4,
    )
    upsampler = RealESRGANer(
        scale=4,
        model_path=str(WEIGHTS_PATH),
        model=model,
        tile=256,
        tile_pad=10,
        pre_pad=0,
        half=False,
    )
    source_bgr = cv2.cvtColor(np.asarray(image.convert("RGB")), cv2.COLOR_RGB2BGR)
    result_bgr, _ = upsampler.enhance(source_bgr, outscale=scale)
    return Image.fromarray(cv2.cvtColor(result_bgr, cv2.COLOR_BGR2RGB))
