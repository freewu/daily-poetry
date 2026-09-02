#!/usr/bin/env python3
"""
make-assets.py — 生成品牌图标 / 启动图 / 底栏图标
依赖: Pillow；楷体字形来自 Windows 的 华文楷体 (STKAITI.TTF)；
底栏图形来自 @expo/vector-icons 内置 Ionicons.ttf。
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets", "images")
KAITI = "/mnt/c/Windows/Fonts/STKAITI.TTF"
IONIC_TTF = os.path.join(
    ROOT,
    "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf",
)
IONIC_MAP = os.path.join(
    ROOT,
    "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json",
)

# 朱砂 / 米纸 / 墨
ACCENT = (169, 50, 38, 255)
PAPER = (244, 237, 218, 255)
CREAM = (247, 240, 224, 255)
BLACK = (0, 0, 0, 255)


def kaiti(size):
    return ImageFont.truetype(KAITI, size)


def center_text(img, font, text, color, size, dy=0):
    d = ImageDraw.Draw(img)
    b = font.getbbox(text)
    w, h = b[2] - b[0], b[3] - b[1]
    x = (img.width - w) / 2 - b[0]
    y = (img.height - h) / 2 - b[1] + dy
    d.text((x, y), text, font=font, fill=color)
    return img


def seal(img, glyph, seal_size, glyph_size, accent=ACCENT, cream=CREAM, dy=0):
    """在 img 中央画一枚朱砂印章 + 楷体字"""
    d = ImageDraw.Draw(img)
    x0 = (img.width - seal_size) / 2
    y0 = (img.height - seal_size) / 2 + dy
    d.rounded_rectangle((x0, y0, x0 + seal_size, y0 + seal_size), radius=seal_size * 0.16, fill=accent)
    center_text(img, kaiti(glyph_size), glyph, cream, glyph_size)


def icon_seal(canvas, seal_ratio, glyph_ratio, bg=None):
    """纸底 + 印章（应用图标风格）"""
    img = Image.new("RGBA", (canvas, canvas), bg or PAPER)
    seal(img, "诗", int(canvas * seal_ratio), int(canvas * glyph_ratio))
    return img


def make_icon():
    img = icon_seal(1024, 0.60, 0.40)
    img.save(os.path.join(IMG, "icon.png"))
    print("icon.png")

    # adaptive foreground（透明底，印章居中安全区内 66%）
    fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    seal(fg, "诗", 600, 400)
    fg.save(os.path.join(IMG, "android-icon-foreground.png"))
    # monochrome：单色字形
    mono = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    center_text(mono, kaiti(520), "诗", (255, 255, 255, 255), 520)
    mono.save(os.path.join(IMG, "android-icon-monochrome.png"))
    print("android-icon-*.png")

    # favicon：红底白字，小尺寸清晰
    fav = Image.new("RGBA", (192, 192), ACCENT)
    center_text(fav, kaiti(130), "诗", CREAM, 130)
    fav.save(os.path.join(IMG, "favicon.png"))
    print("favicon.png")

    # splash：透明底印章
    sp = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    seal(sp, "诗", 640, 440)
    sp.save(os.path.join(IMG, "splash-icon.png"))
    print("splash-icon.png")


def make_tab_icons():
    """从 Ionicons 字形渲染底栏图标（128px，模板染色用）"""
    names = {
        "today": "calendar",
        "library": "book",
        "favorite": "heart",
        "settings": "settings",
    }
    glyphmap = json.load(open(IONIC_MAP, encoding="utf-8"))
    font = ImageFont.truetype(IONIC_TTF, 400)
    out_dir = os.path.join(IMG, "tab")
    os.makedirs(out_dir, exist_ok=True)
    S = 512
    for file, ion in names.items():
        cp = chr(glyphmap[ion])
        tmp = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(tmp)
        b = font.getbbox(cp)
        w, h = b[2] - b[0], b[3] - b[1]
        # 字形约占画布 86%
        scale = (S * 0.86) / max(w, h)
        f2 = ImageFont.truetype(IONIC_TTF, int(400 * scale))
        b2 = f2.getbbox(cp)
        d.text((S / 2 - (b2[2] - b2[0]) / 2 - b2[0], S / 2 - (b2[3] - b2[1]) / 2 - b2[1]), cp, font=f2, fill=BLACK)
        small = tmp.resize((128, 128), Image.LANCZOS)
        small.save(os.path.join(out_dir, f"{file}.png"))
        print(f"tab/{file}.png")


if __name__ == "__main__":
    make_icon()
    make_tab_icons()
    print("done")
