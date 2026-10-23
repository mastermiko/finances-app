"""Renders the PWA icons (PNG) from the same geometry as public/favicon.svg."""
from PIL import Image, ImageDraw

BLUE = (29, 79, 143, 255)
YELLOW = (237, 161, 0, 255)


def draw(size: int, maskable: bool = False) -> Image.Image:
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), BLUE if maskable else (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # maskable icons keep the motif inside the 80 % safe zone
    inset = s * 0.1 if maskable else 0
    box = s - 2 * inset
    u = box / 64
    if not maskable:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=14 * u, fill=BLUE)
    def bar(x, y, w, alpha):
        d.rounded_rectangle([inset + x * u, inset + y * u, inset + (x + w) * u, inset + (y + 5) * u], radius=2.5 * u, fill=(255, 255, 255, alpha))
    bar(14, 17, 36, 255)
    bar(14, 29.5, 25, 204)
    bar(14, 42, 15, 153)
    cx, cy, r = inset + 44 * u, inset + 44.5 * u, 6 * u
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=YELLOW)
    return img.resize((size, size), Image.LANCZOS)


for size, name, mask in [(192, "icon-192.png", False), (512, "icon-512.png", False), (512, "icon-maskable-512.png", True), (180, "apple-touch-icon.png", True)]:
    draw(size, mask).save(f"public/icons/{name}")
print("icons written")
