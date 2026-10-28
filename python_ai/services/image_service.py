"""Image pipeline orchestration: detect, mask, then select the right editor."""

from __future__ import annotations

import base64
import io

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from services.comfyui_service import (
    get_comfyui_status,
    get_large_inpaint_status,
    inpaint as comfy_inpaint,
)
from services.detection_service import detect_objects, make_mask, model_status as detection_status
from services.image_service_errors import ImageProcessingError
from services.lama_service import inpaint as lama_inpaint, status as lama_status
from services.ollama_service import review_target
from services.realesrgan_service import status as realesrgan_status, upscale as realesrgan_upscale
from services.runtime_service import get_runtime_profile
from services.config import MAX_IMAGE_MEGAPIXELS


SUPPORTED_BASIC = {"BEAUTIFY_HOUSE", "IMPROVE_LIGHTING", "MAKE_PRETTY"}
REMOVE_COMMANDS = {
    "REMOVE_CLOTHES",
    "REMOVE_BOTTLES",
    "REMOVE_TRASH",
    "REMOVE_TABLE_CLUTTER",
    "REMOVE_CLUTTER",
    "REMOVE_PEOPLE",
    "REMOVE_CHAIRS",
    "REMOVE_TABLES",
    "REMOVE_SOFAS",
    "REMOVE_BEDS",
    "REMOVE_FURNITURE",
    "REMOVE_CUSTOM_OBJECT",
}
ADD_COMMANDS = {"ADD_TABLECLOTH"}
HIDDEN_COMMANDS = {"REMOVE_CUSTOM_OBJECT", "REMOVE_FURNITURE"}
LAMA_MAX_MASK_AREA = 0.12
_CLEAN_PASSES = {
    "REMOVE_CLUTTER": 3,
    "REMOVE_TABLE_CLUTTER": 3,
    "REMOVE_TRASH": 2,
    "REMOVE_BOTTLES": 2,
    "REMOVE_CLOTHES": 2,
    "REMOVE_PEOPLE": 2,
    "REMOVE_CHAIRS": 2,
    "REMOVE_TABLES": 1,
    "REMOVE_SOFAS": 1,
    "REMOVE_BEDS": 1,
    "REMOVE_FURNITURE": 1,
    "REMOVE_CUSTOM_OBJECT": 1,
    "REPAIR_WALLS": 1,
    "ADD_TABLECLOTH": 1,
}
MAX_IMAGE_PIXELS = MAX_IMAGE_MEGAPIXELS * 1_000_000


def get_capabilities() -> dict:
    detector = detection_status()
    lama = lama_status()
    comfy = get_comfyui_status()
    large_inpaint = get_large_inpaint_status()
    realesrgan = realesrgan_status()
    runtime = get_runtime_profile()

    supported = set(SUPPORTED_BASIC)
    unavailable: dict[str, str] = {
        "REPAIR_WALLS": str(large_inpaint["reason"] or comfy["reason"]),
        "UPSCALE_IMAGE": str(realesrgan["reason"]),
        "HOME_STAGING": "Home staging-ի workflow-ը կարգավորված չէ",
        "REMOVE_WATERMARK": "Այս գործողությունը չի աջակցվում",
        "ADD_TABLECLOTH": str(large_inpaint["reason"] or comfy["reason"]),
        "REMOVE_FURNITURE": "Ընտրեք կոնկրետ գույք՝ աթոռ, սեղան, բազմոց կամ մահճակալ",
    }
    removal_ready = (
        detector["available"]
        and lama["available"]
        and runtime["object_removal_ready"]
    )
    small_inpaint = dict(lama)
    if not runtime["object_removal_ready"]:
        small_inpaint["available"] = False
        small_inpaint["reason"] = (
            f"Ազատ RAM-ը {runtime['available_ram_gib']} GB է, պահանջվում է "
            f"առնվազն {runtime['min_free_for_removal_gib']} GB"
        )

    if removal_ready:
        supported.update(REMOVE_COMMANDS - HIDDEN_COMMANDS)
        supported.add("REPAIR_WALLS")
        supported.add("ADD_TABLECLOTH")
        unavailable.pop("REPAIR_WALLS", None)
        unavailable.pop("ADD_TABLECLOTH", None)
    else:
        reason = str(detector["reason"] or lama["reason"])
        if not runtime["object_removal_ready"]:
            reason = (
                f"Ազատ RAM-ը {runtime['available_ram_gib']} GB է, պահանջվում է "
                f"առնվազն {runtime['min_free_for_removal_gib']} GB"
            )
        unavailable.update({command: reason for command in REMOVE_COMMANDS})
        unavailable["REPAIR_WALLS"] = reason
        unavailable["ADD_TABLECLOTH"] = reason

    if comfy["available"]:
        if runtime["object_removal_ready"] and detector["available"]:
            supported.add("REPAIR_WALLS")
            supported.add("ADD_TABLECLOTH")
            unavailable.pop("REPAIR_WALLS", None)
            unavailable.pop("ADD_TABLECLOTH", None)
        else:
            unavailable["REPAIR_WALLS"] = "Mask-ի համար բավարար ազատ RAM չկա"
            unavailable["ADD_TABLECLOTH"] = "Mask-ի համար բավարար ազատ RAM չկա"

    if realesrgan["available"]:
        supported.add("UPSCALE_IMAGE")

    return {
        "supported_commands": sorted(supported),
        "unavailable_commands": unavailable,
        "engines": {
            "small_object_inpaint": small_inpaint,
            "large_area_inpaint": large_inpaint,
            "upscale": realesrgan,
        },
        "runtime": runtime,
    }


def _decode_image(data_url: str) -> Image.Image:
    if not data_url.startswith("data:image/") or ";base64," not in data_url:
        raise ImageProcessingError("Սպասվում է վավեր image data URL")
    try:
        raw = base64.b64decode(data_url.split(";base64,", 1)[1], validate=True)
        image = Image.open(io.BytesIO(raw))
        image.load()
    except Exception as error:
        raise ImageProcessingError("Նկարը հնարավոր չէ կարդալ") from error
    if image.width < 2 or image.height < 2 or image.width * image.height > MAX_IMAGE_PIXELS:
        raise ImageProcessingError(f"Նկարի չափսը վավեր չէ (առավելագույնը՝ {MAX_IMAGE_PIXELS // 1_000_000}MP)")
    return ImageOps.exif_transpose(image).convert("RGB")


def _encode_image(image: Image.Image, command: str, engine: str) -> dict[str, str]:
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=94, optimize=True)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return {
        "processed_image": f"data:image/jpeg;base64,{encoded}",
        "command": command,
        "engine": engine,
    }


def _inpaint_prompt(command: str, target: str | None) -> tuple[str, str]:
    if command == "REPAIR_WALLS":
        positive = (
            "Photorealistically repair only the masked wall damage. Match the surrounding wall's "
            "paint, texture, lighting and perspective. Keep every unmasked pixel and room object unchanged."
        )
        negative = "new furniture, changed layout, altered windows, altered doors, blur, artifacts, text"
    elif command == "ADD_TABLECLOTH":
        positive = (
            "Photorealistic clean tablecloth covering the masked dining table. Neutral white or beige "
            "linen, natural folds, matching room lighting and perspective. Keep chairs and the rest of the room unchanged."
        )
        negative = "removed table, floating cloth, extra furniture, blur, artifacts, text"
    else:
        name = target or command.removeprefix("REMOVE_").lower().replace("_", " ")
        positive = (
            f"Remove only the masked {name}. Reconstruct the background naturally using nearby "
            "textures, perspective and lighting. Preserve every unmasked object and pixel."
        )
        negative = "new furniture, changed layout, altered windows, altered doors, blur, artifacts, text"
    return positive, negative


def detect_objects_in_image(image_data: str, target: str) -> dict:
    image = _decode_image(image_data)
    return detect_objects(image, target)


def _apply_tablecloth(image: Image.Image, mask) -> Image.Image:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32)
    mask_u8 = np.asarray(mask)
    if mask_u8.ndim == 3:
        mask_u8 = mask_u8[..., 0]
    mask_u8 = (mask_u8 > 0).astype(np.uint8)

    rows = np.any(mask_u8, axis=1)
    cols = np.any(mask_u8, axis=0)
    if not rows.any() or not cols.any():
        raise ImageProcessingError("Սեղան չգտնվեց այս նկարում։")

    y0, y1 = int(np.where(rows)[0][0]), int(np.where(rows)[0][-1])
    x0, x1 = int(np.where(cols)[0][0]), int(np.where(cols)[0][-1])
    table_height = max(1, y1 - y0 + 1)
    top_limit = y0 + int(table_height * 0.58)

    surface = mask_u8.copy()
    surface[top_limit + 1 :, :] = 0
    if not surface.any():
        surface = mask_u8

    alpha = Image.fromarray(surface * 255, mode="L").filter(ImageFilter.GaussianBlur(radius=3))
    alpha_np = np.clip(np.asarray(alpha, dtype=np.float32) / 255.0 * 0.84, 0.0, 0.84)

    region = rgb[y0 : top_limit + 1, x0 : x1 + 1]
    brightness = float(region.mean()) if region.size else 140.0
    scale = float(np.clip(brightness / 140.0, 0.75, 1.25))
    linen = np.array([236.0, 228.0, 214.0], dtype=np.float32) * scale

    height, width = rgb.shape[:2]
    yy, xx = np.mgrid[0:height, 0:width]
    weave = (np.sin(xx / 3.2) * 4.0) + (np.sin(yy / 3.8) * 3.0)
    fold = np.sin((xx - x0) / max(12.0, (x1 - x0) / 6.0)) * 8.0
    cloth = np.stack(
        [
            np.full((height, width), linen[0]) + weave + fold,
            np.full((height, width), linen[1]) + weave * 0.85 + fold,
            np.full((height, width), linen[2]) + weave * 0.7 + fold,
        ],
        axis=-1,
    )
    lighting = 0.55 + 0.45 * (rgb.mean(axis=2, keepdims=True) / 255.0)
    cloth = np.clip(cloth * lighting, 0, 255)

    blended = rgb * (1.0 - alpha_np[..., None]) + cloth * alpha_np[..., None]
    return Image.fromarray(np.clip(blended, 0, 255).astype(np.uint8), mode="RGB")


def _inpaint_once(image: Image.Image, command: str, target: str | None, selected_box: list[float] | None) -> tuple[Image.Image, str]:
    mask, mask_fraction = make_mask(image, command, target, selected_box)
    positive, negative = _inpaint_prompt(command, target)
    comfy_ready = get_comfyui_status()["available"]

    if command == "ADD_TABLECLOTH":
        if comfy_ready:
            return comfy_inpaint(image, mask, positive, negative), "comfyui-inpaint"
        return _apply_tablecloth(image, mask), "local-tablecloth"

    if command == "REPAIR_WALLS":
        if comfy_ready and mask_fraction > LAMA_MAX_MASK_AREA:
            return comfy_inpaint(image, mask, positive, negative), "comfyui-inpaint"
        if not lama_status()["available"]:
            raise ImageProcessingError("IOPaint + LaMa-ն հասանելի չէ. նկարը չի փոփոխվել։")
        return lama_inpaint(image, mask), "iopaint-lama"

    if mask_fraction > LAMA_MAX_MASK_AREA:
        if comfy_ready:
            return comfy_inpaint(image, mask, positive, negative), "comfyui-inpaint"
        # CPU servers without ComfyUI: fall back to LaMa instead of hard-failing.
        if lama_status()["available"]:
            return lama_inpaint(image, mask), "iopaint-lama"
        raise ImageProcessingError(
            "Հատվածը մեծ է, և ոչ ComfyUI, ոչ LaMa inpaint հասանելի չէ։ Նկարը չի փոփոխվել։"
        )

    if not lama_status()["available"]:
        raise ImageProcessingError("IOPaint + LaMa-ն հասանելի չէ. նկարը չի փոփոխվել։")
    return lama_inpaint(image, mask), "iopaint-lama"


def process_image(image_data: str, command: str, target: str | None = None, selected_box: list[float] | None = None) -> dict[str, str]:
    command = command.strip().upper()
    image = _decode_image(image_data)

    if command == "IMPROVE_LIGHTING":
        result = ImageEnhance.Contrast(ImageOps.autocontrast(image, cutoff=0.8)).enhance(1.06)
        result = ImageEnhance.Brightness(result).enhance(1.08)
        result = ImageEnhance.Color(result).enhance(1.03)
        return _encode_image(result, command, "local-pillow")

    if command == "BEAUTIFY_HOUSE":
        result = ImageOps.autocontrast(image, cutoff=0.6)
        result = ImageEnhance.Color(result).enhance(1.08)
        result = ImageEnhance.Contrast(result).enhance(1.05)
        result = ImageEnhance.Sharpness(result).enhance(1.12)
        result = result.filter(ImageFilter.UnsharpMask(radius=1.4, percent=95, threshold=3))
        return _encode_image(result, command, "local-pillow")

    if command == "MAKE_PRETTY":
        result = ImageOps.autocontrast(image, cutoff=0.4)
        result = ImageEnhance.Brightness(result).enhance(1.07)
        result = ImageEnhance.Color(result).enhance(1.10)
        result = ImageEnhance.Contrast(result).enhance(1.06)
        result = result.filter(ImageFilter.SMOOTH)
        result = ImageEnhance.Sharpness(result).enhance(1.18)
        return _encode_image(result, command, "local-pillow")

    if command == "UPSCALE_IMAGE":
        capability = realesrgan_status()
        if not capability["available"]:
            raise ImageProcessingError(str(capability["reason"]))
        return _encode_image(realesrgan_upscale(image, scale=2), command, "realesrgan")

    if command == "REMOVE_FURNITURE":
        raise ImageProcessingError("Ընտրեք կոնկրետ գույք՝ աթոռ, սեղան, բազմոց կամ մահճակալ։")

    if command not in REMOVE_COMMANDS | {"REPAIR_WALLS"} | ADD_COMMANDS:
        if command == "HOME_STAGING":
            raise ImageProcessingError("Home staging-ի workflow-ը դեռ կարգավորված չէ")
        if command == "REMOVE_WATERMARK":
            raise ImageProcessingError("Ջրանիշների հեռացումը չի աջակցվում")
        raise ImageProcessingError("Անհայտ AI գործիք")

    if command == "REMOVE_CUSTOM_OBJECT" and not target:
        raise ImageProcessingError("Թիրախը բացակայում է. նկարը չի փոփոխվել։")

    if command == "REMOVE_CUSTOM_OBJECT":
        assessment = review_target(image_data, command, target)
        if assessment and not assessment["allow"]:
            raise ImageProcessingError(str(assessment["reason"]) or "Թիրախը հստակ չէ. նկարը չի փոխվել։")

    current = image
    engine = "iopaint-lama"
    passes = 1 if selected_box is not None else _CLEAN_PASSES.get(command, 1)
    cleaned = False

    for pass_index in range(passes):
        try:
            current, engine = _inpaint_once(
                current,
                command,
                target,
                selected_box if pass_index == 0 else None,
            )
            cleaned = True
        except ImageProcessingError:
            if cleaned:
                break
            raise

        if selected_box is not None:
            break

    return _encode_image(current, command, engine)
