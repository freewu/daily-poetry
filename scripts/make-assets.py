"""
make-assets.py — 生成品牌图标 / 启动图 / 底栏图标
依赖: 只要 Pillow。图标上的印章来自根目录 logo.png（抠掉纸底、保留印泥原色），
想换图就替换 logo.png 再 `just assets`；底栏图形来自 @expo/vector-icons 内置的 Ionicons.ttf。
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets", "images")
LOGO = os.path.join(ROOT, "logo.png")
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
BLACK = (0, 0, 0, 255)
# 深色启动图用的「反白印」：印泥在墨色底上几乎看不见，得换成纸色
CREAM_INK = (231, 212, 179)

def _ink_mask(im):
    """印泥像素：够深且偏红（纸纹、投影的零星暗点会被排除）"""
    rgb = im.load()
    out = []
    for y in range(0, im.height, 2):
        for x in range(0, im.width, 2):
            r, g, b = rgb[x, y]
            if (r * 299 + g * 587 + b * 114) // 1000 < 190 and r - b > 40:
                out.append((x, y))
    return out


def _percentile(hist, q, total=None):
    """亮度直方图的分位数（0–255）"""
    total = total or sum(hist)
    seen = 0
    for v, n in enumerate(hist):
        seen += n
        if seen / total >= q:
            return v
    return 255


def logo_seal(pad=0.05):
    """
    从 logo.png 里抠出印章：纸底 → 透明，印泥 → 不透明，中间 ~34 级软过渡，
    于是纸纹噪点不会留下灰点、笔画边缘也不会毛刺。
    阈值不写死：纸底亮度按 P60 现量（换一张亮一点的源图也不用改代码）。
    纸底 −26 以下算纸（留 26 级吃掉纸纹噪点，否则透明底上会飘一层红灰），
    再往下 36 级过渡，到「纸底 −62」就是纯印泥。
    返回裁到印章外框（略留白）的 RGBA，尺寸随原图。
    """
    if not os.path.exists(LOGO):
        raise SystemExit(f"缺少 {LOGO}：图标需要它来出印章")
    im = Image.open(LOGO).convert("RGB")
    lum = im.convert("L")
    hist = lum.histogram()
    # 纸底占大头（>60%），所以 P60 落在纸底上；刻刀边、投影、噪点都被挤在两类之间
    paper = _percentile(hist, 0.6)
    t_hi, t_lo = paper - 26, paper - 62
    alpha = lum.point(
        lambda v: 255 if v <= t_lo else (0 if v >= t_hi else round((t_hi - v) * 255 / (t_hi - t_lo)))
    )

    # 外框只看印泥的列 / 行分布：柱子/行里印泥像素太少的方向不算（投影、脏点）
    cols = [0] * im.width
    rows = [0] * im.height
    for x, y in _ink_mask(im):
        cols[x] += 1
        rows[y] += 1
    edge = lambda c: [i for i, v in enumerate(c) if v > 10]  # noqa: E731
    xs, ys = edge(cols), edge(rows)
    x0, x1, y0, y1 = xs[0], xs[-1] + 1, ys[0], ys[-1] + 1
    side = round(max(x1 - x0, y1 - y0) * (1 + pad * 2))

    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    box = (cx - side // 2, cy - side // 2, cx - side // 2 + side, cy - side // 2 + side)

    # 透明处也要填印泥色：缩放时边缘才不会朝纸色漂（透明底上会留一圈白光）
    dark = [im.getpixel((x, y)) for x, y in _ink_mask(im)]
    ink = tuple(round(sum(c[i] for c in dark) / len(dark)) for i in range(3))
    seal_rgb = im.convert("RGBA")
    flat = Image.new("RGBA", im.size, ink + (0,))
    flat.paste(seal_rgb, (0, 0), alpha)
    flat.putalpha(alpha)
    return flat.crop(box)


def save(img, name):
    """
    图标主体就是「印泥 + 透明」两色，但原图带纸纹，直接存 RGBA PNG 每张要 400–500KB。
    量化到 256 色（带 alpha）后体积掉到 1/5，肉眼看不出差别 —— 别改回真彩。
    """
    img.convert("RGBA").quantize(
        colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE
    ).save(os.path.join(IMG, name), optimize=True)
    print(name)


def logo_layer(canvas, ratio, bg=None, tint=None):
    """印章按 ratio（占画布长边的比例）居中贴到 canvas 上；tint=白色可做单色版"""
    mark = logo_seal()
    target = int(canvas * ratio)
    k = target / max(mark.size)
    mark = mark.resize((max(1, round(mark.width * k)), max(1, round(mark.height * k))), Image.LANCZOS)
    if tint:
        white = Image.new("RGBA", mark.size, tint + (0,))
        white.putalpha(mark.getchannel("A"))
        mark = white
    img = Image.new("RGBA", (canvas, canvas), bg or (0, 0, 0, 0))
    img.alpha_composite(mark, ((canvas - mark.width) // 2, (canvas - mark.height) // 2))
    return img


def make_icon():
    save(logo_layer(1024, 0.60, bg=PAPER), "icon.png")

    # adaptive foreground：透明底，印章落在 66% 安全区内
    save(logo_layer(1024, 0.59), "android-icon-foreground.png")
    # monochrome：Android 13 主题图标，系统只取 alpha
    save(logo_layer(1024, 0.59, tint=(255, 255, 255)), "android-icon-monochrome.png")

    # favicon：朱砂底白印章，小尺寸也好认
    save(logo_layer(192, 0.68, bg=ACCENT, tint=(255, 255, 255)), "favicon.png")

    # splash：透明底印章。深色底要用纸色的「反白印」—— 深红印泥贴在 #181510 上几乎看不见
    save(logo_layer(1024, 0.62), "splash-icon.png")
    save(logo_layer(1024, 0.62, tint=CREAM_INK), "splash-icon-dark.png")


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
