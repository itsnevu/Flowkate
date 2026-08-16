"""Fit raw captures to Chrome Web Store screenshot specs.

The store wants exactly 1280x800, JPEG or 24-bit PNG, and rejects any file that
carries an alpha channel. Captures never come out that size: a Retina grab of a
window is 2x, and no window is exactly 16:10.

So rather than cropping (which eats the edges of the UI) each image is scaled to
fit and centred on a canvas in the site's own ground colour. Nothing is cut off,
nothing is stretched, and the padding reads as part of the brand.

Usage:
    python3 store-assets/fit-screenshots.py

Reads:  store-assets/raw/*.png|jpg|jpeg  (any size)
Writes: store-assets/screenshots/01-<name>.png ... (1280x800, RGB, no alpha)
"""

import os
import sys

from PIL import Image

W, H = 1280, 800
CANVAS = (238, 240, 244)  # --canvas from the landing page
RAW = os.path.join(os.path.dirname(__file__), "raw")
OUT = os.path.join(os.path.dirname(__file__), "screenshots")


def fit(path: str, index: int) -> str:
    src = Image.open(path)
    # Flatten first: a capture with rounded window corners carries alpha, and
    # compositing it later would leave the corners black.
    if src.mode in ("RGBA", "LA", "P"):
        src = src.convert("RGBA")
        flat = Image.new("RGB", src.size, CANVAS)
        flat.paste(src, (0, 0), src)
        src = flat
    else:
        src = src.convert("RGB")

    scale = min(W / src.width, H / src.height)
    # Never upscale past 1:1 — blowing a small capture up to 1280 wide just
    # ships a blurry screenshot.
    scale = min(scale, 1.0) if src.width < W and src.height < H else scale
    sized = src.resize((max(1, round(src.width * scale)), max(1, round(src.height * scale))), Image.LANCZOS)

    canvas = Image.new("RGB", (W, H), CANVAS)
    canvas.paste(sized, ((W - sized.width) // 2, (H - sized.height) // 2))

    name = os.path.splitext(os.path.basename(path))[0]
    dest = os.path.join(OUT, f"{index:02d}-{name}.png")
    canvas.save(dest)
    return dest


def main() -> int:
    if not os.path.isdir(RAW):
        os.makedirs(RAW, exist_ok=True)
        print(f"Created {RAW}. Drop your captures in there and run this again.")
        return 0

    files = sorted(
        f for f in os.listdir(RAW) if f.lower().endswith((".png", ".jpg", ".jpeg")) and not f.startswith(".")
    )
    if not files:
        print(f"No images in {RAW} yet. Drop your captures in and run this again.")
        return 0

    os.makedirs(OUT, exist_ok=True)
    if len(files) > 5:
        print(f"Note: the store accepts 5 screenshots; {len(files)} found, all written so you can pick.")

    for i, f in enumerate(files, 1):
        dest = fit(os.path.join(RAW, f), i)
        check = Image.open(dest)
        ok = check.size == (W, H) and check.mode == "RGB"
        print(f"{'ok ' if ok else 'BAD'} {os.path.basename(dest):40} {check.size} {check.mode}")

    print(f"\nStore-ready files in {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
