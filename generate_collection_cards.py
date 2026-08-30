import os
import sys
import json
import math
import random
import re
import argparse
import requests
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops, ImageEnhance

# ==============================================================================
# PATH CONFIGURATION
# ==============================================================================
SCRIPT_DIR = Path(__file__).parent.resolve()
COLLECTIONS_DIR = SCRIPT_DIR / "collections"
METADATA_PATH = COLLECTIONS_DIR / "metadata.json"

# Workspace root mapping
WORKSPACE_DIR = SCRIPT_DIR.parent
NUVIO_ART_DIR = WORKSPACE_DIR / "Nuvio Art"
NUVIO_ART_REPO = NUVIO_ART_DIR / "nuvio-art"
NUVIO_GENRE_DIR = NUVIO_ART_DIR / "Nuvio_Genre"
NUVIO_ASSETS_DIR = NUVIO_ART_DIR / "nuvio-assets"
OUTPUT_DIR = NUVIO_ART_DIR / "Collection_Cards"
FONTS_DIR = SCRIPT_DIR / "fonts"
CACHE_DIR = NUVIO_ART_DIR / ".asset_cache"

# Preferred Neon Ship Logo (Textless high-res neon logo)
LOGO_PATH = NUVIO_ART_DIR / "ship_neon_notext_transparent.png"
if not LOGO_PATH.exists():
    LOGO_PATH = NUVIO_ART_DIR / "kaptain_ship_neon_logo_transparent.png"

# Canvas specs (Exact GitHub Collection_Cards specs: 1640 x 720 px)
CANVAS_WIDTH = 1640
CANVAS_HEIGHT = 720

# Showcase card dimensions
CARD_ROUNDNESS = 12

# Categories requiring censorship of copyrighted logos
CENSOR_CATEGORIES = ["streaming_services", "networks", "studios"]

# Border colors rotation for the showcase cards at the bottom
CARD_BORDER_COLORS = [
    (239, 68, 68),   # Neon Coral/Red
    (6, 182, 212),   # Cyber Cyan
    (248, 250, 252), # Pure Silver White
    (234, 179, 8),   # Studio Gold
    (168, 85, 247)   # Neon Purple
]

# Set of collections that use 2:3 vertical poster geometry
# International Cinema and Anime are strictly LANDSCAPE
POSTER_COLLECTION_SLUGS = {
    "actors", "legendary_directors", "film_collections", "kids_and_family"
}

# ==============================================================================
# BESPOKE SALES PITCH SUBTEXTS (AUTO-SYNCED DAILY & TMDB DISCOVER FOCUS)
# ==============================================================================
SALES_PITCHES = {
    "nuvio_mega_collection": "The ultimate set-it-and-forget-it setup. Combines all 16 native catalogs into one seamless 1-click install, auto-synced daily with zero maintenance.",
    "discover": "Real-time TMDB trending algorithms with intelligent vote-floor filters that eliminate junk titles and unreleased vaporware before you browse.",
    "streaming_services": "Live platform tracking across all major streaming hubs, auto-synced daily to bring the unified streaming guide directly to your TV.",
    "networks": "Every major broadcast & premium cable powerhouse organized with native Nuvio routing, auto-synced daily for effortless bingeing.",
    "genres": "Precision-filtered genre deep-dives with dynamic nightly artwork rotations that automatically spotlight the highest-rated releases.",
    "moods_vibes": "Curated aesthetic themes designed for how you actually feel, powered by live TMDB smart-filtered feeds and rotating dynamic covers.",
    "film_collections": "Complete franchise box sets organized chronologically with zero clutter, auto-synced daily with new installments as they release.",
    "actors": "Dynamic actor hubs that automatically track full filmographies, sorting every star's catalog by popularity and critically acclaimed ratings.",
    "legendary_directors": "Dedicated auteur filmographies that update dynamically with every new release, celebrating the greatest visionary filmmakers in history.",
    "studios": "Effortlessly browse legacy & indie studio outputs with native Nuvio performance, auto-synced daily with zero manual maintenance.",
    "by_decade": "Curated time-machine catalogs with age-stepped vote floors, preserving the greatest cinematic classics across 8 decades in pure native quality.",
    "anime": "Auto-synced daily anime feeds tracking current seasonal airings, top-rated all-time epics, and sub/dub collections with studio-grade artwork.",
    "awards": "Every Oscar, Emmy, and prestigious festival winner automatically indexed with real-time award ceremony tracking and zero filler.",
    "international_cinema": "A global entertainment hub featuring Korean, French, Japanese, and international cinema with native language routing, auto-synced daily.",
    "documentaries": "Uncover deep-dive documentary feeds across nature, crime, history, and science, refreshed continuously from live curation pipelines.",
    "kids_and_family": "Curated age-appropriate animation and family classics with strict G/PG rating filters, giving parents peace of mind and kids endless fun.",
    "reality_tv": "Follow your favorite guilty pleasures, competition series, and docuseries with real-time episode tracking, auto-synced daily."
}

# ==============================================================================
# FONT DOWNLOADER & CACHING
# ==============================================================================
_FONT_SEARCH_DIRS = [
    FONTS_DIR,
    NUVIO_GENRE_DIR / "fonts",
    SCRIPT_DIR / "fonts",
    Path("C:/Windows/Fonts"),
]

_font_cache = {}

def get_font_path(name: str, fallback="arial.ttf") -> str:
    for d in _FONT_SEARCH_DIRS:
        fp = d / name
        if fp.exists():
            return str(fp)
    return fallback

def get_font(name: str, size: int) -> ImageFont.FreeTypeFont:
    key = (name, size)
    if key in _font_cache:
        return _font_cache[key]
    fp = get_font_path(name)
    try:
        f = ImageFont.truetype(fp, size)
        _font_cache[key] = f
        return f
    except Exception:
        f = ImageFont.load_default()
        _font_cache[key] = f
        return f

# ==============================================================================
# COLOR THEMES CONFIGURATION (MESH PRISM PALETTES FOR ALL 17 CATALOGS)
# ==============================================================================
COLOR_THEMES = {
    "nuvio_mega_collection": {
        "line_color": (34, 197, 94),  # Green #22c55e
        "border_glow": (34, 197, 94),
        "spheres": [
            {"x": 100, "y": 100, "r": 500, "color": (212, 175, 55)},  # Platinum Gold
            {"x": 1540, "y": 756, "r": 550, "color": (30, 64, 175)},  # Sapphire Blue
            {"x": 820, "y": 100, "r": 400, "color": (226, 232, 240)}  # Platinum/Silver
        ]
    },
    "discover": {
        "line_color": (6, 182, 212),  # Electric Cyan #06b6d4
        "border_glow": (6, 182, 212),
        "spheres": [
            {"x": 100, "y": 700, "r": 500, "color": (6, 182, 212)},   # Electric Cyan
            {"x": 1540, "y": 100, "r": 500, "color": (245, 158, 11)}, # Amber Glow
            {"x": 820, "y": 756, "r": 450, "color": (59, 130, 246)}   # Royal Blue
        ]
    },
    "streaming_services": {
        "line_color": (239, 68, 68),  # Red #ef4444
        "border_glow": (239, 68, 68),
        "spheres": [
            {"x": 100, "y": 100, "r": 550, "color": (229, 9, 20)},    # Netflix Red
            {"x": 1540, "y": 756, "r": 500, "color": (0, 168, 225)},  # Prime Blue
            {"x": 820, "y": 428, "r": 450, "color": (106, 27, 154)}   # HBO Purple
        ]
    },
    "networks": {
        "line_color": (6, 182, 212),  # Cyan #06b6d4
        "border_glow": (6, 182, 212),
        "spheres": [
            {"x": 100, "y": 756, "r": 500, "color": (6, 182, 212)},   # Neon Cyan
            {"x": 1540, "y": 100, "r": 550, "color": (249, 115, 22)},  # High-Tech Orange
            {"x": 820, "y": 100, "r": 400, "color": (79, 70, 229)}    # Indigo
        ]
    },
    "genres": {
        "line_color": (217, 70, 239),  # Purple #d946ef
        "border_glow": (217, 70, 239),
        "spheres": [
            {"x": 100, "y": 100, "r": 550, "color": (107, 33, 168)},  # Deep Purple
            {"x": 1540, "y": 756, "r": 500, "color": (236, 72, 153)},  # Hot Pink
            {"x": 820, "y": 756, "r": 450, "color": (6, 182, 212)}    # Aqua Cyan
        ]
    },
    "moods_vibes": {
        "line_color": (139, 92, 246),  # Violet #8b5cf6
        "border_glow": (139, 92, 246),
        "spheres": [
            {"x": 100, "y": 756, "r": 500, "color": (76, 29, 149)},   # Midnight Violet
            {"x": 1540, "y": 100, "r": 500, "color": (245, 158, 11)}, # Amber Glow
            {"x": 820, "y": 428, "r": 450, "color": (236, 72, 153)}  # Neon Pink
        ]
    },
    "film_collections": {
        "line_color": (139, 92, 246),  # Violet #8b5cf6
        "border_glow": (139, 92, 246),
        "spheres": [
            {"x": 100, "y": 756, "r": 500, "color": (185, 28, 28)},   # Marvel Red
            {"x": 1540, "y": 100, "r": 500, "color": (29, 78, 216)},  # Star Wars Blue
            {"x": 820, "y": 428, "r": 500, "color": (109, 40, 217)}   # Cosmic Indigo
        ]
    },
    "actors": {
        "line_color": (167, 139, 250),  # Soft Purple #a78bfa
        "border_glow": (167, 139, 250),
        "spheres": [
            {"x": 100, "y": 100, "r": 500, "color": (76, 29, 149)},   # Dark Violet
            {"x": 1540, "y": 756, "r": 500, "color": (244, 63, 94)},   # Soft Rose
            {"x": 820, "y": 100, "r": 450, "color": (148, 163, 184)}  # Metallic Grey
        ]
    },
    "legendary_directors": {
        "line_color": (245, 158, 11),  # Amber #f59e0b
        "border_glow": (245, 158, 11),
        "spheres": [
            {"x": 100, "y": 756, "r": 500, "color": (180, 83, 9)},    # Dark Amber
            {"x": 1540, "y": 100, "r": 500, "color": (20, 110, 120)},  # Cinematic Teal
            {"x": 820, "y": 756, "r": 450, "color": (217, 119, 6)}    # Golden Hour Orange
        ]
    },
    "studios": {
        "line_color": (234, 179, 8),  # Gold #eab308
        "border_glow": (234, 179, 8),
        "spheres": [
            {"x": 100, "y": 100, "r": 500, "color": (202, 138, 4)},   # Studio Gold
            {"x": 1540, "y": 756, "r": 500, "color": (15, 23, 42)},   # Dark Slate Blue
            {"x": 820, "y": 428, "r": 450, "color": (4, 120, 87)}     # Emerald Green
        ]
    },
    "by_decade": {
        "line_color": (244, 63, 94),  # Rose #f43f5e
        "border_glow": (244, 63, 94),
        "spheres": [
            {"x": 100, "y": 756, "r": 550, "color": (244, 63, 94)},   # Retro Neon Pink
            {"x": 1540, "y": 100, "r": 500, "color": (6, 182, 212)},   # Vaporwave Cyan
            {"x": 820, "y": 428, "r": 450, "color": (217, 119, 6)}    # Vintage Orange
        ]
    },
    "anime": {
        "line_color": (220, 38, 38),  # Crimson #dc2626
        "border_glow": (220, 38, 38),
        "spheres": [
            {"x": 100, "y": 100, "r": 500, "color": (220, 38, 38)},   # Fiery Crimson
            {"x": 1540, "y": 756, "r": 500, "color": (234, 179, 8)},   # Flame Yellow
            {"x": 820, "y": 100, "r": 450, "color": (249, 115, 22)}   # Fiery Orange
        ]
    },
    "awards": {
        "line_color": (251, 191, 36),  # Gold #fbbf24
        "border_glow": (251, 191, 36),
        "spheres": [
            {"x": 100, "y": 756, "r": 500, "color": (146, 64, 14)},   # Bronze
            {"x": 1540, "y": 100, "r": 500, "color": (217, 119, 6)},  # Rich Gold
            {"x": 820, "y": 428, "r": 450, "color": (88, 28, 135)}    # Imperial Velvet Purple
        ]
    },
    "international_cinema": {
        "line_color": (16, 185, 129),  # Emerald #10b981
        "border_glow": (16, 185, 129),
        "spheres": [
            {"x": 100, "y": 756, "r": 500, "color": (16, 185, 129)},  # Global Emerald
            {"x": 1540, "y": 100, "r": 500, "color": (37, 99, 235)},  # Azure Blue
            {"x": 820, "y": 428, "r": 450, "color": (234, 179, 8)}    # Gold Accent
        ]
    },
    "documentaries": {
        "line_color": (217, 119, 6),  # Earth Ochre #d97706
        "border_glow": (217, 119, 6),
        "spheres": [
            {"x": 100, "y": 100, "r": 500, "color": (180, 83, 9)},    # Earth Ochre
            {"x": 1540, "y": 756, "r": 500, "color": (15, 118, 110)}, # Deep Teal
            {"x": 820, "y": 428, "r": 450, "color": (120, 53, 15)}    # Deep Bronze
        ]
    },
    "kids_and_family": {
        "line_color": (56, 189, 248),  # Sky Blue #38bdf8
        "border_glow": (56, 189, 248),
        "spheres": [
            {"x": 100, "y": 100, "r": 500, "color": (56, 189, 248)},  # Sky Blue
            {"x": 1540, "y": 756, "r": 500, "color": (251, 113, 133)},# Sunny Coral
            {"x": 820, "y": 428, "r": 450, "color": (250, 204, 21)}   # Warm Yellow
        ]
    },
    "reality_tv": {
        "line_color": (236, 72, 153),  # Magenta #ec4899
        "border_glow": (236, 72, 153),
        "spheres": [
            {"x": 100, "y": 756, "r": 500, "color": (236, 72, 153)},  # Neon Magenta
            {"x": 1540, "y": 100, "r": 500, "color": (250, 204, 21)}, # Electric Yellow
            {"x": 820, "y": 100, "r": 450, "color": (168, 85, 247)}   # Purple Glow
        ]
    }
}

# ==============================================================================
# ASSET RESOLVER
# ==============================================================================
_card_file_cache = {}

def build_local_card_index():
    global _card_file_cache
    if _card_file_cache:
        return _card_file_cache

    index = {}
    search_dirs = [NUVIO_ART_REPO, NUVIO_GENRE_DIR, NUVIO_ASSETS_DIR, SCRIPT_DIR / "assets"]
    for sdir in search_dirs:
        if not sdir.exists():
            continue
        for p in sdir.rglob("*"):
            if p.is_file() and p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"):
                if ".git" in p.parts or "-hover" in p.name.lower():
                    continue
                fname_key = p.name.lower()
                stem_key = p.stem.lower()
                if fname_key not in index:
                    index[fname_key] = p
                if stem_key not in index:
                    index[stem_key] = p

    _card_file_cache = index
    return _card_file_cache

def resolve_card_image(url_path: str) -> str | None:
    if not url_path:
        return None

    p_direct = Path(url_path)
    if p_direct.is_file():
        return str(p_direct)

    clean_url = str(url_path).replace("\\", "/")
    p_ws = WORKSPACE_DIR / clean_url
    if p_ws.is_file():
        return str(p_ws)

    prefixes = [
        "https://raw.githubusercontent.com/ImKaptain/nuvio-art/main/",
        "https://raw.githubusercontent.com/ImKaptain/nuvio-assets/main/",
        "https://imkaptain.github.io/nuvio-assets/",
        "https://imkaptain.github.io/nuvio-art/",
        "https://github.com/luckynumb3rs/stremio-perfect-setup/blob/main/",
    ]
    rel_candidate = clean_url
    for pfx in prefixes:
        if rel_candidate.startswith(pfx):
            rel_candidate = rel_candidate[len(pfx):]
            break
    rel_candidate = rel_candidate.replace("?raw=true", "").lstrip("/")

    for parent_dir in [NUVIO_ART_REPO, NUVIO_ASSETS_DIR, NUVIO_GENRE_DIR]:
        cand = parent_dir / rel_candidate
        if cand.is_file():
            return str(cand)

    index = build_local_card_index()
    fname = Path(clean_url).name.lower()
    if fname in index:
        return str(index[fname])
    stem = Path(clean_url).stem.lower()
    if stem in index:
        return str(index[stem])

    return None

# ==============================================================================
# MESH PRISM & SHADERS (MATCHING ORIGINAL GITHUB ACTORS.PNG ENGINE)
# ==============================================================================
def draw_gradient_sphere(radius: int) -> Image.Image:
    size = radius * 2
    local_mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(local_mask)
    for r in range(radius, 0, -4):
        alpha = int(255 * (1 - r / radius) ** 2)
        draw.ellipse([radius - r, radius - r, radius + r, radius + r], fill=alpha)
    return local_mask

def apply_mesh_prism(canvas: Image.Image, theme_key: str) -> Image.Image:
    theme = COLOR_THEMES.get(theme_key, COLOR_THEMES["nuvio_mega_collection"])
    blend_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))

    for sphere in theme["spheres"]:
        cx = sphere["x"]
        cy = sphere["y"]
        r = sphere["r"]
        color = sphere["color"]

        local_mask = draw_gradient_sphere(r)
        sphere_mask = Image.new("L", (CANVAS_WIDTH, CANVAS_HEIGHT), 0)
        sphere_mask.paste(local_mask, (cx - r, cy - r))

        solid_color_img = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), color + (255,))
        blend_layer = Image.composite(solid_color_img, blend_layer, sphere_mask)

    blurred_prism = blend_layer.filter(ImageFilter.GaussianBlur(radius=80))
    return Image.alpha_composite(canvas, blurred_prism)

def generate_film_grain(width: int, height: int, opacity=0.025) -> Image.Image:
    grain_mask = Image.new("L", (width, height))
    pixels = grain_mask.load()
    for y in range(height):
        for x in range(width):
            pixels[x, y] = random.randint(0, 255)

    alpha_val = int(255 * opacity)
    solid_white = Image.new("RGBA", (width, height), (255, 255, 255, alpha_val))
    solid_black = Image.new("RGBA", (width, height), (0, 0, 0, alpha_val))
    return Image.composite(solid_white, solid_black, grain_mask)

def apply_vignette(canvas: Image.Image) -> Image.Image:
    vignette = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    vdraw = ImageDraw.Draw(vignette)
    cx, cy = CANVAS_WIDTH // 2, CANVAS_HEIGHT // 2
    steps = 50
    for i in range(steps, 0, -1):
        ratio = i / steps
        alpha = int(220 * (ratio ** 1.8))
        pad_x = min(int(cx * (1 - ratio) * 1.3), cx - 1)
        pad_y = min(int(cy * (1 - ratio) * 1.3), cy - 1)
        if CANVAS_WIDTH - pad_x > pad_x and CANVAS_HEIGHT - pad_y > pad_y:
            vdraw.ellipse([pad_x, pad_y, CANVAS_WIDTH - pad_x, CANVAS_HEIGHT - pad_y], fill=(0, 0, 0, alpha))
    vignette = vignette.filter(ImageFilter.GaussianBlur(radius=70))
    return Image.alpha_composite(canvas, vignette)

def draw_rounded_corners_mask(width: int, height: int, radius: int) -> Image.Image:
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, width, height], radius, fill=255)
    return mask

def draw_neon_border(draw: ImageDraw.ImageDraw, x0: int, y0: int, x1: int, y1: int, radius: int, color: tuple, width=4) -> tuple:
    glow_padding = 15
    glow_w = (x1 - x0) + (glow_padding * 2)
    glow_h = (y1 - y0) + (glow_padding * 2)

    glow_img = Image.new("RGBA", (glow_w, glow_h), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    glow_draw.rounded_rectangle(
        [glow_padding, glow_padding, glow_w - glow_padding, glow_h - glow_padding],
        radius, outline=color + (180,), width=width + 6
    )
    glow_blurred = glow_img.filter(ImageFilter.GaussianBlur(radius=6))
    return glow_blurred, (x0 - glow_padding, y0 - glow_padding)

def create_censored_card(card_path: str, title: str, card_w: int, card_h: int) -> Image.Image:
    """Applies heavy blur + dark tint over copyrighted cards, overlays clean title text."""
    if card_path and os.path.exists(card_path):
        try:
            base_img = Image.open(card_path).convert("RGBA")
        except Exception:
            base_img = Image.new("RGBA", (card_w, card_h), (15, 15, 18, 255))
    else:
        base_img = Image.new("RGBA", (card_w, card_h), (15, 15, 18, 255))

    base_img = base_img.resize((card_w, card_h), Image.Resampling.LANCZOS)
    blurred_img = base_img.filter(ImageFilter.GaussianBlur(radius=24))
    tint = Image.new("RGBA", (card_w, card_h), (8, 8, 10, 175))
    composite_card = Image.alpha_composite(blurred_img, tint)

    draw = ImageDraw.Draw(composite_card)
    font_bold = get_font("Inter-Bold.ttf", 34)
    text_content = str(title).upper()
    text_bbox = draw.textbbox((0, 0), text_content, font=font_bold)
    text_w = text_bbox[2] - text_bbox[0]

    if text_w > card_w - 30:
        font_bold = get_font("Inter-Bold.ttf", 24)
        text_bbox = draw.textbbox((0, 0), text_content, font=font_bold)
        text_w = text_bbox[2] - text_bbox[0]

    text_h = text_bbox[3] - text_bbox[1]
    tx = (card_w - text_w) / 2
    ty = (card_h - text_h) / 2 - 4
    draw.text((tx + 2, ty + 2), text_content, fill=(0, 0, 0, 230), font=font_bold)
    draw.text((tx, ty), text_content, fill=(255, 255, 255, 255), font=font_bold)
    return composite_card

def draw_gradient_text(canvas: Image.Image, text: str, font: ImageFont.FreeTypeFont, y: int, accent_color: tuple) -> Image.Image:
    tmp_draw = ImageDraw.Draw(canvas)
    bbox = tmp_draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (CANVAS_WIDTH - text_w) // 2
    r, g, b = accent_color

    text_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(text_layer)
    for ox, oy, alpha in [(5, 5, 120), (3, 3, 160), (1, 1, 80)]:
        tdraw.text((x + ox, y + oy), text, fill=(0, 0, 0, alpha), font=font)
    tdraw.text((x, y), text, fill=(255, 255, 255, 255), font=font)

    grad_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(grad_layer)
    half = text_w / 2
    for px in range(text_w):
        dist = abs(px - half)
        t = min(dist / (half + 1), 1.0)
        t_eased = max(0.0, (t - 0.6) / 0.4) if t > 0.6 else 0.0
        cr = int(255 * (1 - t_eased) + r * t_eased)
        cg = int(255 * (1 - t_eased) + g * t_eased)
        cb = int(255 * (1 - t_eased) + b * t_eased)
        gdraw.line([(x + px, y - 4), (x + px, y + text_h + 4)], fill=(cr, cg, cb, 255))

    text_alpha = text_layer.split()[3]
    colored = Image.composite(grad_layer, text_layer, text_alpha)
    out = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    out.paste(colored, (0, 0), text_alpha)

    shadow_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow_layer)
    for ox, oy, alpha in [(5, 5, 120), (3, 3, 160)]:
        sdraw.text((x + ox, y + oy), text, fill=(0, 0, 0, alpha), font=font)
    combined = Image.alpha_composite(shadow_layer, out)
    return Image.alpha_composite(canvas, combined)

def draw_cinematic_separator(canvas: Image.Image, y: int, line_col: tuple, width=980) -> Image.Image:
    sep_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    sep_draw = ImageDraw.Draw(sep_layer)
    cx = CANVAS_WIDTH // 2
    half_w = width // 2
    r, g, b = line_col

    for px in range(width):
        dist = abs(px - half_w)
        t = dist / (half_w + 1)
        alpha = int(255 * (1 - t ** 1.3))
        lx = cx - half_w + px
        sep_draw.line([(lx, y), (lx, y + 1)], fill=(r, g, b, alpha))

    bloom = sep_layer.filter(ImageFilter.GaussianBlur(radius=3))
    sep_layer = Image.alpha_composite(bloom, sep_layer)

    d = 6
    diamond_pts = [(cx, y - d), (cx + d, y + 1), (cx, y + 2 + d), (cx - d, y + 1)]
    glow_d = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    ImageDraw.Draw(glow_d).polygon(diamond_pts, fill=(r, g, b, 80))
    glow_d = glow_d.filter(ImageFilter.GaussianBlur(radius=7))
    sep_layer = Image.alpha_composite(sep_layer, glow_d)
    ImageDraw.Draw(sep_layer).polygon(diamond_pts, fill=(r, g, b, 255))
    ImageDraw.Draw(sep_layer).polygon(diamond_pts, outline=(255, 255, 255, 180), width=1)

    return Image.alpha_composite(canvas, sep_layer)

def draw_film_perforations(canvas: Image.Image, line_col: tuple) -> Image.Image:
    perf_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    perf_draw = ImageDraw.Draw(perf_layer)
    r, g, b = line_col
    perf_w, perf_h = 10, 18
    perf_gap = 12
    margin = 16
    y = perf_gap
    while y + perf_h < CANVAS_HEIGHT - perf_gap:
        perf_draw.rounded_rectangle(
            [margin, y, margin + perf_w, y + perf_h],
            3, fill=(r, g, b, 28), outline=(r, g, b, 55), width=1
        )
        perf_draw.rounded_rectangle(
            [CANVAS_WIDTH - margin - perf_w, y, CANVAS_WIDTH - margin, y + perf_h],
            3, fill=(r, g, b, 28), outline=(r, g, b, 55), width=1
        )
        y += perf_h + perf_gap
    return Image.alpha_composite(canvas, perf_layer)

def draw_card_shadow(canvas: Image.Image, x: int, y: int, w: int, h: int, radius=14) -> Image.Image:
    shadow_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    ImageDraw.Draw(shadow_layer).rounded_rectangle(
        [x + 8, y + 10, x + w + 8, y + h + 10], radius, fill=(0, 0, 0, 180)
    )
    return Image.alpha_composite(canvas, shadow_layer.filter(ImageFilter.GaussianBlur(radius=14)))

# ==============================================================================
# MAIN IMAGE SYNTHESIZER (MATCHING GITHUB ACTORS.PNG WITH SALES PITCH & LOGO)
# ==============================================================================
def generate_card(collection_slug: str, title: str, description: str, folders: list) -> Path:
    print(f"Generating Optimized Collection Card: {title} (Slug: {collection_slug})")

    is_poster = collection_slug in POSTER_COLLECTION_SLUGS
    tile_shape = "POSTER" if is_poster else "LANDSCAPE"

    theme = COLOR_THEMES.get(collection_slug, COLOR_THEMES["nuvio_mega_collection"])
    line_col = theme["line_color"]
    r, g, b = line_col

    # ── 1. Base Canvas ──────────────────────────────────────────────────────
    canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (8, 8, 10, 255))

    # ── 2. Dimmed Backdrop Collage ──────────────────────────────────────────
    collage_covers = []
    max_collage = 20 if tile_shape == "POSTER" else 15
    for f in folders[:max_collage]:
        cover_url = f.get("coverImageUrl", f.get("focusGifUrl"))
        local_path = resolve_card_image(cover_url)
        if local_path:
            collage_covers.append(local_path)

    if collage_covers:
        tile_w, tile_h, cols, rows = (164, 246, 10, 4) if tile_shape == "POSTER" else (280, 160, 6, 6)
        grid_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
        idx = 0
        for row in range(rows):
            for col in range(cols):
                cover_path = collage_covers[idx % len(collage_covers)]
                idx += 1
                try:
                    img = Image.open(cover_path).convert("RGBA").resize((tile_w, tile_h), Image.Resampling.LANCZOS)
                    grid_layer.paste(img, (col * tile_w, row * tile_h))
                except Exception:
                    pass
        grid_blurred = grid_layer.filter(ImageFilter.GaussianBlur(radius=18))
        dimmer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (8, 8, 10, 232))
        canvas = Image.alpha_composite(canvas, Image.alpha_composite(grid_blurred, dimmer))

    # ── 3. Mesh Prism Glow ──────────────────────────────────────────────────
    canvas = apply_mesh_prism(canvas, collection_slug)

    # ── 4. Deep Cinematic Vignette ──────────────────────────────────────────
    canvas = apply_vignette(canvas)

    # ── 5. Film Grain ───────────────────────────────────────────────────────
    canvas = Image.alpha_composite(canvas, generate_film_grain(CANVAS_WIDTH, CANVAS_HEIGHT, opacity=0.025))

    # ── 6. Film Strip Perforations ──────────────────────────────────────────
    canvas = draw_film_perforations(canvas, line_col)

    # ── 7. Top-Left Corner Branding: Large Clean Neon Ship Logo ────────────
    if LOGO_PATH.exists():
        logo_h = 100
        logo_x = 38
        logo_y = 12
        logo_img = Image.open(str(LOGO_PATH)).convert("RGBA")
        logo_w = int(logo_img.width * (logo_h / logo_img.height))
        logo_resized = logo_img.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
        canvas.alpha_composite(logo_resized, (logo_x, logo_y))

    # ── 8. Header Spotlight Glow ────────────────────────────────────────────
    spotlight = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    ImageDraw.Draw(spotlight).ellipse(
        [CANVAS_WIDTH//2 - 520, -90, CANVAS_WIDTH//2 + 520, 240],
        fill=(r, g, b, 25)
    )
    canvas = Image.alpha_composite(canvas, spotlight.filter(ImageFilter.GaussianBlur(radius=50)))

    # ── 9. Title with Metallic Gradient Shimmer ─────────────────────────────
    font_title = get_font("Montserrat-ExtraBold.ttf", 66)
    canvas = draw_gradient_text(canvas, f"Kaptain's {title}", font_title, y=52, accent_color=line_col)

    # ── 10. Metric Stat Pills (Folders, Sources, Native) ────────────────────
    folders_count = len(folders) if folders else 0
    sources_count = sum(len(f.get("sources", [])) for f in folders) if folders else 0

    if collection_slug == "nuvio_mega_collection":
        badges = [
            ("601 Curated Folders", (34, 197, 94)),
            ("3,058 Live Sources", (6, 182, 212)),
            ("16 Native Catalogs", (168, 85, 247))
        ]
    else:
        badges = [
            (f"{folders_count} Curated Folders", (34, 197, 94)),
            (f"{sources_count} Live Sources", (6, 182, 212)),
            ("100% Native Nuvio", (168, 85, 247))
        ]

    font_pill = get_font("Montserrat-Bold.ttf", 13)
    pill_h = 28
    pill_gap = 14
    pill_dims = []

    for b_text, b_col in badges:
        bb = font_pill.getbbox(b_text)
        bw, bh = bb[2] - bb[0], bb[3] - bb[1]
        pw = bw + 30
        pill_dims.append((b_text, b_col, pw, bw, bh))

    total_pills_w = sum(p[2] for p in pill_dims) + (len(pill_dims) - 1) * pill_gap
    pill_start_x = (CANVAS_WIDTH - total_pills_w) // 2
    pill_y = 138

    pills_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(pills_layer)

    curr_px = pill_start_x
    for b_text, b_col, pw, bw, bh in pill_dims:
        rect = [curr_px, pill_y, curr_px + pw, pill_y + pill_h]
        pdraw.rounded_rectangle(rect, radius=12, fill=(15, 20, 32, 220), outline=(b_col[0], b_col[1], b_col[2], 140), width=1)
        
        dot_sz = 6
        d_y = pill_y + (pill_h // 2) - (dot_sz // 2)
        pdraw.ellipse([curr_px + 10, d_y, curr_px + 10 + dot_sz, d_y + dot_sz], fill=b_col)
        
        t_y = pill_y + (pill_h // 2) - (bh // 2) - 2
        pdraw.text((curr_px + 22, t_y), b_text, font=font_pill, fill=(255, 255, 255, 240))
        curr_px += pw + pill_gap

    canvas = Image.alpha_composite(canvas, pills_layer)

    # ── 11. Cinematic Separator with Diamond ────────────────────────────────
    canvas = draw_cinematic_separator(canvas, y=184, line_col=line_col, width=960)
    draw = ImageDraw.Draw(canvas)

    # ── 12. Persuasive Sales Pitch Subtext ──────────────────────────────────
    sales_text = SALES_PITCHES.get(collection_slug, description)
    font_desc = get_font("Inter-Medium.ttf", 17)
    desc_words = str(sales_text).split(" ")
    desc_lines = []
    current_desc_line = []
    
    for word in desc_words:
        current_desc_line.append(word)
        test_str = " ".join(current_desc_line)
        test_bbox = draw.textbbox((0, 0), test_str, font=font_desc)
        test_w = test_bbox[2] - test_bbox[0]
        if test_w > 1200:
            if len(current_desc_line) > 1:
                current_desc_line.pop()
                desc_lines.append(" ".join(current_desc_line))
                current_desc_line = [word]
            else:
                desc_lines.append(test_str)
                current_desc_line = []
    if current_desc_line:
        desc_lines.append(" ".join(current_desc_line))
    desc_lines = desc_lines[:2]

    dy = 205
    for line in desc_lines:
        bbox = draw.textbbox((0, 0), line, font=font_desc)
        w = bbox[2] - bbox[0]
        dx = (CANVAS_WIDTH - w) / 2
        draw.text((dx + 1, dy + 1), line, fill=(0, 0, 0, 120), font=font_desc)
        draw.text((dx, dy), line, fill=(148, 163, 184, 255), font=font_desc)
        dy += 22

    # ── 13. Examples Include Quick Row ──────────────────────────────────────
    all_example_items = []
    if collection_slug == "nuvio_mega_collection":
        all_example_items = [
            "Streaming Services", "Genres", "Networks", "Studios", "Actors",
            "Directors", "Film Collections", "By Decade", "Anime", "Awards"
        ]
    else:
        all_example_items = [f.get("title", "") for f in folders if f.get("title")]

    rng = random.Random(collection_slug)
    shuffled_items = all_example_items[:]
    rng.shuffle(shuffled_items)

    max_total = 10 if tile_shape == "POSTER" else 8
    pool = shuffled_items[:max_total]
    mid = math.ceil(len(pool) / 2) if pool else 1
    row1_items = pool[:mid]
    row2_items = pool[mid:]

    font_examples = get_font("Montserrat-Bold.ttf", 20)
    font_label = get_font("Inter-Medium.ttf", 12)
    SEP = "   ·   "
    MAX_LINE_W = 1420

    while len(row1_items) > 1:
        test = SEP.join(row1_items)
        if draw.textbbox((0, 0), test, font=font_examples)[2] <= MAX_LINE_W:
            break
        row1_items = row1_items[:-1]

    while len(row2_items) > 1:
        test = SEP.join(row2_items)
        if draw.textbbox((0, 0), test, font=font_examples)[2] <= MAX_LINE_W:
            break
        row2_items = row2_items[:-1]

    row1_str = SEP.join(row1_items)
    row2_str = SEP.join(row2_items)

    label_text = "— EXAMPLES INCLUDE —"
    label_bbox = draw.textbbox((0, 0), label_text, font=font_label)
    label_w = label_bbox[2] - label_bbox[0]
    draw.text(((CANVAS_WIDTH - label_w) / 2, 256), label_text, fill=(r, g, b, 175), font=font_label)

    # Row 1
    r1_w = draw.textbbox((0, 0), row1_str, font=font_examples)[2]
    r1_x = (CANVAS_WIDTH - r1_w) / 2
    draw.text((r1_x + 1, 275), row1_str, fill=(0, 0, 0, 130), font=font_examples)
    draw.text((r1_x, 274), row1_str, fill=(226, 232, 240, 255), font=font_examples)

    # Row 2
    r2_w = draw.textbbox((0, 0), row2_str, font=font_examples)[2]
    r2_x = (CANVAS_WIDTH - r2_w) / 2
    draw.text((r2_x + 1, 301), row2_str, fill=(0, 0, 0, 130), font=font_examples)
    draw.text((r2_x, 300), row2_str, fill=(226, 232, 240, 255), font=font_examples)

    # ── 14. Showcase Cards Shelf ────────────────────────────────────────────
    max_showcase = 5 if tile_shape == "POSTER" else 3
    showcase_folders = []
    if collection_slug == "nuvio_mega_collection":
        showcase_folders = [
            {"title": "Action", "coverImageUrl": "art/genres/action/action-cover.png"},
            {"title": "Anime", "coverImageUrl": "art/anime/discover-anime/discover-anime-cover.png"},
            {"title": "Dark & Gritty", "coverImageUrl": "art/moods-and-vibes/dark-and-gritty/dark-and-gritty-cover.png"}
        ]
    else:
        shuffled_folders = folders[:]
        rng.shuffle(shuffled_folders)
        showcase_folders = shuffled_folders[:max_showcase]
        while len(showcase_folders) < max_showcase and showcase_folders:
            showcase_folders.append(showcase_folders[0])

    if tile_shape == "POSTER":
        current_w, current_h = 200, 300
        card_spacing = 65
    else:
        current_w, current_h = 415, 238
        card_spacing = 92

    start_y = 368
    total_cards_w = max_showcase * current_w + (max_showcase - 1) * card_spacing
    left_margin = (CANVAS_WIDTH - total_cards_w) // 2

    font_feat = get_font("Inter-Medium.ttf", 12)
    feat_text = "— FEATURED SELECTIONS —"
    feat_bbox = draw.textbbox((0, 0), feat_text, font=font_feat)
    feat_w = feat_bbox[2] - feat_bbox[0]
    draw.text(((CANVAS_WIDTH - feat_w) / 2, start_y - 26), feat_text, fill=(r, g, b, 150), font=font_feat)

    for i, sf in enumerate(showcase_folders[:max_showcase]):
        card_title = sf.get("title", "CARD")
        card_url = sf.get("coverImageUrl", sf.get("focusGifUrl"))
        card_x = left_margin + i * (current_w + card_spacing)
        card_path = resolve_card_image(card_url)

        if collection_slug in CENSOR_CATEGORIES:
            card_img = create_censored_card(card_path, card_title, current_w, current_h)
        else:
            if card_path and os.path.exists(card_path):
                try:
                    card_img = Image.open(card_path).convert("RGBA")
                except Exception:
                    card_img = Image.new("RGBA", (current_w, current_h), (20, 20, 25, 255))
            else:
                card_img = Image.new("RGBA", (current_w, current_h), (20, 20, 25, 255))

        card_img = card_img.resize((current_w, current_h), Image.Resampling.LANCZOS)
        rounded_mask = draw_rounded_corners_mask(current_w, current_h, CARD_ROUNDNESS)
        border_col = CARD_BORDER_COLORS[i % len(CARD_BORDER_COLORS)]

        # Drop shadow
        canvas = draw_card_shadow(canvas, card_x, start_y, current_w, current_h)
        draw = ImageDraw.Draw(canvas)

        # Neon glow border
        glow_layer, (glow_x, glow_y) = draw_neon_border(
            draw, card_x, start_y, card_x + current_w, start_y + current_h,
            CARD_ROUNDNESS, border_col, width=3
        )
        canvas.paste(glow_layer, (glow_x, glow_y), glow_layer)
        canvas.paste(card_img, (card_x, start_y), rounded_mask)
        draw = ImageDraw.Draw(canvas)

        # Sharp crisp border
        draw.rounded_rectangle(
            [card_x, start_y, card_x + current_w, start_y + current_h],
            CARD_ROUNDNESS, outline=border_col + (215,), width=2
        )

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / f"{collection_slug}.png"
    canvas.save(str(out_path), "PNG")
    print(f" -> SUCCESSFULLY SAVED: {out_path} ({CANVAS_WIDTH}x{CANVAS_HEIGHT})")
    return out_path

# ==============================================================================
# MAIN DISPATCH LOOP
# ==============================================================================
def generate_all(only_slug=None):
    print("=" * 70)
    print("  KAPTAIN'S NUVIO COLLECTION CARDS GENERATOR (TMDB & AUTO-SYNC FOCUS)")
    print("=" * 70)
    print(f"  Target Resolution: {CANVAS_WIDTH} x {CANVAS_HEIGHT}")
    print(f"  Output Directory:  {OUTPUT_DIR}")
    if only_slug:
        print(f"  Target Filter:     '{only_slug}' only")
    print("=" * 70)

    build_local_card_index()

    if not METADATA_PATH.exists():
        print(f"Error: metadata.json not found at {METADATA_PATH}")
        return

    with open(METADATA_PATH, "r", encoding="utf-8") as f:
        metadata = json.load(f)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 1. MEGA COLLECTION CARD
    if only_slug is None or only_slug in ["mega", "nuvio_mega_collection"]:
        mega_file = metadata.get("mega_collection", {}).get("filename", "nuvio_mega_collection.json")
        mega_path = COLLECTIONS_DIR / mega_file
        mega_folders = []
        if mega_path.exists():
            try:
                with open(mega_path, "r", encoding="utf-8") as fm:
                    mega_data = json.load(fm)
                for cat in mega_data:
                    c_folders = cat.get("folders", [])
                    if c_folders:
                        mega_folders.append(c_folders[0])
            except Exception as e:
                pass

        generate_card(
            "nuvio_mega_collection",
            "Mega Collection",
            SALES_PITCHES["nuvio_mega_collection"],
            mega_folders
        )

    # 2. INDIVIDUAL CATALOG CARDS
    for category in metadata.get("individual_collections", []):
        cat_title = category.get("title", "")
        cat_file = category.get("filename", "")
        cat_slug = cat_file.replace(".json", "")
        cat_desc = category.get("description", "")

        if only_slug and only_slug != cat_slug:
            continue

        cat_path = COLLECTIONS_DIR / cat_file
        folders = []
        if cat_path.exists():
            try:
                with open(cat_path, "r", encoding="utf-8") as fc:
                    cat_data = json.load(fc)
                if isinstance(cat_data, list) and len(cat_data) > 0:
                    folders = cat_data[0].get("folders", [])
                elif isinstance(cat_data, dict):
                    folders = cat_data.get("folders", [])
            except Exception as e:
                pass

        generate_card(
            cat_slug,
            cat_title,
            cat_desc,
            folders
        )

    print("\n" + "=" * 70)
    print(f"  All collection cards generated successfully in: {OUTPUT_DIR}")
    print("=" * 70)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Kaptain's Nuvio Collection Cards Generator")
    parser.add_argument("--only", type=str, default=None, help="Generate only for this slug (e.g. 'actors', 'kids_and_family')")
    parser.add_argument("--all", action="store_true", help="Generate all cards")
    args = parser.parse_args()

    generate_all(only_slug=args.only)
