#!/usr/bin/env python3
"""Remove the list.am corner logo from a listing photo."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageFilter


def _cover_box(image: Image.Image, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    width = max(1, x1 - x0)
    height = max(1, y1 - y0)
    src_x0 = max(0, x0 - width - 8)
    src_x1 = max(src_x0 + 1, x0 - 4)
    patch = image.crop((src_x0, y0, src_x1, y1)).transpose(Image.FLIP_LEFT_RIGHT)
    patch = patch.resize((width, height), Image.Resampling.BILINEAR)
    patch = patch.filter(ImageFilter.GaussianBlur(radius=1.2))
    image.paste(patch, (x0, y0))


def strip_watermark(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()

    x0 = int(width * 0.74)
    y1 = int(height * 0.16)
    hits = 0
    for y in range(0, y1):
        for x in range(x0, width):
            red, green, blue = pixels[x, y]
            if red > 205 and green > 205 and blue > 205:
                hits += 1

    area = max(1, (width - x0) * y1)
    if hits / area > 0.012:
        _cover_box(rgb, (x0, 0, width, y1))
    else:
        _cover_box(rgb, (int(width * 0.82), int(height * 0.015), int(width * 0.995), int(height * 0.12)))

    return rgb


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: strip_listam_watermark.py input output", file=sys.stderr)
        return 2

    source = Path(sys.argv[1])
    target = Path(sys.argv[2])
    image = Image.open(source)
    cleaned = strip_watermark(image)
    target.parent.mkdir(parents=True, exist_ok=True)
    cleaned.save(target, format="JPEG", quality=92, optimize=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
