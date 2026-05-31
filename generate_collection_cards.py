import os
import json
import math
import random
import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

# ==============================================================================
# PATH CONFIGURATION
# ==============================================================================
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
COLLECTIONS_DIR = os.path.join(SCRIPT_DIR, "collections")
METADATA_PATH = os.path.join(COLLECTIONS_DIR, "metadata.json")

# Workspaces mapping
NUVIO_ART_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "../../Nuvio Art"))
NUVIO_ASSETS_DIR = os.path.join(NUVIO_ART_DIR, "nuvio-assets")
OUTPUT_DIR = os.path.join(NUVIO_ART_DIR, "Collection_Cards")
FONTS_DIR = os.path.join(SCRIPT_DIR, "fonts")

# Canvas specs (User specified size)
CANVAS_WIDTH = 1640
CANVAS_HEIGHT = 720

# Showcase card dimensions (landscape aspect ratio)
CARD_WIDTH = 420
CARD_HEIGHT = 240
CARD_ROUNDNESS = 12

# ==============================================================================
# FONT DOWNLOADER & CACHING
# ==============================================================================
FONT_URLS = {
    "Montserrat-ExtraBold.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-ExtraBold.ttf",
    "Montserrat-Bold.ttf": "https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-Bold.ttf",
    "Inter-Bold.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter[opsz,wght].ttf",
    "Inter-Medium.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter[opsz,wght].ttf"
}

def ensure_fonts():
    os.makedirs(FONTS_DIR, exist_ok=True)
    loaded_fonts = {}
    
    for font_name, url in FONT_URLS.items():
        local_path = os.path.join(FONTS_DIR, font_name)
        if not os.path.exists(local_path):
            print(f"Downloading premium font {font_name} from Google Fonts...")
            try:
                r = requests.get(url, timeout=15)
                r.raise_for_status()
                with open(local_path, "wb") as f:
                    f.write(r.content)
                print(f" - Saved to {local_path}")
            except Exception as e:
                print(f" - Error downloading font {font_name}: {e}. Will fall back to system fonts.")
        
        if os.path.exists(local_path):
            loaded_fonts[font_name] = local_path
            
    return loaded_fonts

# ==============================================================================
# COLOR THEMES CONFIGURATION (MESH PRISM PALETTES)
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
    "trending_new": {
        "line_color": (16, 185, 129),  # Emerald #10b981
        "border_glow": (16, 185, 129),
        "spheres": [
            {"x": 100, "y": 700, "r": 500, "color": (16, 185, 129)},  # Jade/Emerald
            {"x": 1540, "y": 100, "r": 500, "color": (29, 78, 216)},  # Cobalt Blue
            {"x": 820, "y": 756, "r": 450, "color": (132, 204, 22)}   # Lime Green
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
            {"x": 820, "y": 428, "r": 450, "color": (4, 120, 87)}     # Emerald/Ghibli Green
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
    }
}

# Subtitle default config
SUBTITLE_DEFAULT = "One Click Install (No AIO Metadata)"

# Categories requiring censorship of copyrighted logos
CENSOR_CATEGORIES = ["streaming_services", "networks", "studios"]

# Border colors rotation for the 3 showcase cards at the bottom
CARD_BORDER_COLORS = [
    (239, 68, 68),  # Neon Coral/Red
    (6, 182, 212),  # Cyber Cyan
    (248, 250, 252) # Pure Silver White
]

# ==============================================================================
# ASSET RESOLVER & DOWNLOADER
# ==============================================================================
def resolve_card_image(url_path):
    """
    Given a remote URL (raw.githubusercontent... or imkaptain.github.io...),
    maps it to the local 'nuvio-assets' directory.
    If the file is not found locally, attempts to download and cache it locally!
    """
    if not url_path:
        return None
        
    # Clean scheme backslashes from malformed URLs in JSON (e.g. https:\\i.imgur.com\HK9oP0V.png)
    url_path = url_path.replace("\\", "/")
        
    # Standardize URL mapping to sub-directories
    # e.g., https://raw.githubusercontent.com/ImKaptain/nuvio-assets/main/Genres/Action/Action_Base.png
    # or https://imkaptain.github.io/nuvio-assets/assets/images/692aa010.webp
    
    clean_path = url_path.replace("https://raw.githubusercontent.com/ImKaptain/nuvio-assets/main/", "")
    clean_path = clean_path.replace("https://imkaptain.github.io/nuvio-assets/", "")
    clean_path = clean_path.replace("https://github.com/luckynumb3rs/stremio-perfect-setup/blob/main/", "")
    clean_path = clean_path.replace("?raw=true", "")
    
    # Check if this is an external absolute HTTP/S URL (e.g. Imgur, Postimg)
    if clean_path.startswith("http://") or clean_path.startswith("https://"):
        # Make a safe local file name in an 'external_cache' directory
        safe_name = clean_path.replace("https://", "").replace("http://", "").replace("/", "_").replace(":", "_").replace("?", "_")
        local_file_path = os.path.abspath(os.path.join(NUVIO_ASSETS_DIR, "external_cache", safe_name))
    else:
        # Fix URL slashes for Windows OS paths
        relative_path = clean_path.replace("/", os.sep)
        local_file_path = os.path.abspath(os.path.join(NUVIO_ASSETS_DIR, relative_path))
    
    # Verify if it exists locally
    if os.path.exists(local_file_path):
        return local_file_path
        
    # Attempt to download and cache if not found locally
    if clean_path.startswith("http://") or clean_path.startswith("https://"):
        print(f"Asset not found locally (external): {safe_name}")
    else:
        print(f"Asset not found locally: {relative_path}")
        
    print(f" -> Downloading from: {url_path}...")
    try:
        os.makedirs(os.path.dirname(local_file_path), exist_ok=True)
        r = requests.get(url_path, timeout=10)
        r.raise_for_status()
        with open(local_file_path, "wb") as f:
            f.write(r.content)
        print(f" -> Success! Cached at {local_file_path}")
        return local_file_path
    except Exception as e:
        print(f" -> Failed to download asset: {e}")
        return None

# ==============================================================================
# HIGH-FIDELITY BACKPROP & GRADIANT GENERATORS
# ==============================================================================
def draw_gradient_sphere(mask_draw, x, y, radius):
    """Draws a smooth quadratic radial gradient sphere mask in PIL."""
    # Create local square mask for performance
    size = radius * 2
    local_mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(local_mask)
    
    for r in range(radius, 0, -4):
        # Quadratic smooth falloff calculation
        alpha = int(255 * (1 - r/radius)**2)
        draw.ellipse([radius - r, radius - r, radius + r, radius + r], fill=alpha)
        
    return local_mask

def apply_mesh_prism(canvas, theme_key):
    """Draws multiple vibrant, blurred radial glow spheres to create a mesh/prism gradient."""
    theme = COLOR_THEMES.get(theme_key, COLOR_THEMES["nuvio_mega_collection"])
    
    # Create transparency blend overlay
    blend_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    
    for sphere in theme["spheres"]:
        cx = sphere["x"]
        cy = sphere["y"]
        r = sphere["r"]
        color = sphere["color"]
        
        # Draw gradient sphere mask
        sphere_mask = Image.new("L", (CANVAS_WIDTH, CANVAS_HEIGHT), 0)
        mask_draw = ImageDraw.Draw(sphere_mask)
        
        # Calculate local gradient square bounds
        size = r * 2
        local_mask = draw_gradient_sphere(mask_draw, cx, cy, r)
        
        # Paste local mask onto canvas-sized mask
        sphere_mask.paste(local_mask, (cx - r, cy - r))
        
        # Overlay color on blend layer using gradient mask
        solid_color_img = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), color + (255,))
        blend_layer = Image.composite(solid_color_img, blend_layer, sphere_mask)
        
    # Apply a massive Gaussian Blur to make the transitions super smooth and liquid
    blurred_prism = blend_layer.filter(ImageFilter.GaussianBlur(radius=80))
    
    # Blend prism with canvas using custom soft/screen blend
    return Image.alpha_composite(canvas, blurred_prism)

def generate_film_grain(width, height, opacity=0.03):
    """Generates a low-opacity black and white digital film noise layer for cinematic texture."""
    grain_mask = Image.new("L", (width, height))
    pixels = grain_mask.load()
    
    for y in range(height):
        for x in range(width):
            pixels[x, y] = random.randint(0, 255)
            
    # Normalize to low opacity colored noise overlay
    grain_colored = Image.new("RGBA", (width, height), (255, 255, 255, 0))
    draw = ImageDraw.Draw(grain_colored)
    
    # Blend random pixels with small transparency
    alpha_val = int(255 * opacity)
    grain_alpha = Image.eval(grain_mask, lambda v: int(v * opacity))
    
    solid_white = Image.new("RGBA", (width, height), (255, 255, 255, alpha_val))
    solid_black = Image.new("RGBA", (width, height), (0, 0, 0, alpha_val))
    
    return Image.composite(solid_white, solid_black, grain_mask)

# ==============================================================================
# CARD BUILDER ENGINE
# ==============================================================================
def draw_rounded_corners_mask(width, height, radius):
    """Creates a rounded corners mask for card framing."""
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, width, height], radius, fill=255)
    return mask

def draw_neon_border(draw, x0, y0, x1, y1, radius, color, width=4):
    """Draws a high-fidelity sharp outline and soft glow layer for neon card borders."""
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

def create_censored_card(card_path, title, fonts):
    """Applies heavy blur + dark tint over copyrighted cards, overlays clean title text."""
    try:
        base_img = Image.open(card_path).convert("RGBA")
    except Exception:
        base_img = Image.new("RGBA", (CARD_WIDTH, CARD_HEIGHT), (15, 15, 18, 255))
    base_img = base_img.resize((CARD_WIDTH, CARD_HEIGHT), Image.Resampling.LANCZOS)
    blurred_img = base_img.filter(ImageFilter.GaussianBlur(radius=22))
    tint = Image.new("RGBA", (CARD_WIDTH, CARD_HEIGHT), (8, 8, 10, 170))
    composite_card = Image.alpha_composite(blurred_img, tint)
    draw = ImageDraw.Draw(composite_card)
    font_bold = ImageFont.truetype(fonts.get("Inter-Bold.ttf", "arial.ttf"), 38)
    text_content = title.upper()
    text_bbox = draw.textbbox((0, 0), text_content, font=font_bold)
    text_w = text_bbox[2] - text_bbox[0]
    text_h = text_bbox[3] - text_bbox[1]
    tx = (CARD_WIDTH - text_w) / 2
    ty = (CARD_HEIGHT - text_h) / 2 - 5
    draw.text((tx + 3, ty + 3), text_content, fill=(0, 0, 0, 230), font=font_bold)
    draw.text((tx, ty), text_content, fill=(255, 255, 255, 255), font=font_bold)
    return composite_card

def apply_vignette(canvas):
    """Adds a deep cinematic vignette — dark crushed edges fading toward center."""
    vignette = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    vdraw = ImageDraw.Draw(vignette)
    cx, cy = CANVAS_WIDTH // 2, CANVAS_HEIGHT // 2
    steps = 50
    for i in range(steps, 0, -1):
        ratio = i / steps
        alpha = int(220 * (ratio ** 1.8))
        # Clamp so pad never exceeds half the canvas (prevents PIL x1 >= x0 error)
        pad_x = min(int(cx * (1 - ratio) * 1.3), cx - 1)
        pad_y = min(int(cy * (1 - ratio) * 1.3), cy - 1)
        if CANVAS_WIDTH - pad_x > pad_x and CANVAS_HEIGHT - pad_y > pad_y:
            vdraw.ellipse(
                [pad_x, pad_y, CANVAS_WIDTH - pad_x, CANVAS_HEIGHT - pad_y],
                fill=(0, 0, 0, alpha)
            )
    vignette = vignette.filter(ImageFilter.GaussianBlur(radius=70))
    return Image.alpha_composite(canvas, vignette)

def draw_gradient_text(canvas, text, font, y, accent_color):
    """
    Renders title text with a premium metallic shimmer:
    bright white in the center, fading toward the theme accent color at the edges.
    """
    tmp_draw = ImageDraw.Draw(canvas)
    bbox = tmp_draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (CANVAS_WIDTH - text_w) // 2
    r, g, b = accent_color

    # Build text on isolated layer
    text_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    tdraw = ImageDraw.Draw(text_layer)
    # Multi-layer shadow for depth
    for ox, oy, alpha in [(5, 5, 120), (3, 3, 160), (1, 1, 80)]:
        tdraw.text((x + ox, y + oy), text, fill=(0, 0, 0, alpha), font=font)
    tdraw.text((x, y), text, fill=(255, 255, 255, 255), font=font)

    # Build horizontal gradient colour mask over text width
    grad_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(grad_layer)
    half = text_w / 2
    for px in range(text_w):
        dist = abs(px - half)
        t = min(dist / (half + 1), 1.0)
        # Smooth ease-in: stay white longer, only tint the outer 40%
        t_eased = max(0.0, (t - 0.6) / 0.4) if t > 0.6 else 0.0
        cr = int(255 * (1 - t_eased) + r * t_eased)
        cg = int(255 * (1 - t_eased) + g * t_eased)
        cb = int(255 * (1 - t_eased) + b * t_eased)
        gdraw.line([(x + px, y - 4), (x + px, y + text_h + 4)], fill=(cr, cg, cb, 255))

    # Apply gradient as a colour wash (only where text is visible)
    text_alpha = text_layer.split()[3]
    colored = Image.composite(grad_layer, text_layer, text_alpha)
    # Alpha-composite result → but we want the gradient colour where white text was
    # Use screen-like blend: keep text_layer white but tint with grad where alpha exists
    out = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    out.paste(colored, (0, 0), text_alpha)
    # Also keep shadow (already in text_layer below)
    shadow_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow_layer)
    for ox, oy, alpha in [(5, 5, 120), (3, 3, 160)]:
        sdraw.text((x + ox, y + oy), text, fill=(0, 0, 0, alpha), font=font)
    combined = Image.alpha_composite(shadow_layer, out)
    return Image.alpha_composite(canvas, combined)

def draw_cinematic_separator(canvas, y, line_col, width=980):
    """
    Premium separator: gradient line that peaks at the center with a glowing
    diamond ornament at the midpoint.
    """
    sep_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    sep_draw = ImageDraw.Draw(sep_layer)
    cx = CANVAS_WIDTH // 2
    half_w = width // 2
    r, g, b = line_col

    # Gradient line — bright center, fades at edges
    for px in range(width):
        dist = abs(px - half_w)
        t = dist / (half_w + 1)
        alpha = int(255 * (1 - t ** 1.3))
        lx = cx - half_w + px
        sep_draw.line([(lx, y), (lx, y + 1)], fill=(r, g, b, alpha))

    # Bloom glow on line
    bloom = sep_layer.filter(ImageFilter.GaussianBlur(radius=3))
    sep_layer = Image.alpha_composite(bloom, sep_layer)

    # Diamond ornament at center
    d = 6
    diamond_pts = [(cx, y - d), (cx + d, y + 1), (cx, y + 2 + d), (cx - d, y + 1)]
    glow_d = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    Image.Draw = ImageDraw.Draw(glow_d)
    ImageDraw.Draw(glow_d).polygon(diamond_pts, fill=(r, g, b, 80))
    glow_d = glow_d.filter(ImageFilter.GaussianBlur(radius=7))
    sep_layer = Image.alpha_composite(sep_layer, glow_d)
    ImageDraw.Draw(sep_layer).polygon(diamond_pts, fill=(r, g, b, 255))
    ImageDraw.Draw(sep_layer).polygon(diamond_pts, outline=(255, 255, 255, 180), width=1)

    return Image.alpha_composite(canvas, sep_layer)

def draw_film_perforations(canvas, line_col):
    """Subtle film-strip perforations along left and right edges."""
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

def draw_card_shadow(canvas, x, y, w, h, radius=14):
    """Soft drop shadow beneath a showcase card for depth."""
    shadow_layer = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    ImageDraw.Draw(shadow_layer).rounded_rectangle(
        [x + 8, y + 10, x + w + 8, y + h + 10], radius, fill=(0, 0, 0, 180)
    )
    return Image.alpha_composite(canvas, shadow_layer.filter(ImageFilter.GaussianBlur(radius=14)))

# ==============================================================================
# MAIN IMAGE SYNTHESIZER
# ==============================================================================
def generate_card(collection_slug, title, description, folders, fonts):
    print(f"\n==================================================")
    print(f"Generating Collection Card: {title}")
    print(f"==================================================")

    tile_shape = "LANDSCAPE"
    if folders:
        tile_shape = folders[0].get("tileShape", "LANDSCAPE").upper()
    print(f" -> Detected Tile Shape: {tile_shape}")

    theme = COLOR_THEMES.get(collection_slug, COLOR_THEMES["nuvio_mega_collection"])
    line_col = theme["line_color"]
    r, g, b = line_col

    # ── 1. BASE CANVAS ──────────────────────────────────────────────────────
    canvas = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (8, 8, 10, 255))

    # ── 2. DIMMED BACKDROP COLLAGE ──────────────────────────────────────────
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

    # ── 3. MESH PRISM GLOW ──────────────────────────────────────────────────
    canvas = apply_mesh_prism(canvas, collection_slug)

    # ── 4. DEEP CINEMATIC VIGNETTE ──────────────────────────────────────────
    canvas = apply_vignette(canvas)

    # ── 5. FILM GRAIN ───────────────────────────────────────────────────────
    canvas = Image.alpha_composite(canvas, generate_film_grain(CANVAS_WIDTH, CANVAS_HEIGHT, opacity=0.025))

    # ── 6. FILM STRIP PERFORATIONS ──────────────────────────────────────────
    canvas = draw_film_perforations(canvas, line_col)

    # ── 7. HEADER SPOTLIGHT GLOW ────────────────────────────────────────────
    spotlight = Image.new("RGBA", (CANVAS_WIDTH, CANVAS_HEIGHT), (0, 0, 0, 0))
    ImageDraw.Draw(spotlight).ellipse(
        [CANVAS_WIDTH//2 - 520, -80, CANVAS_WIDTH//2 + 520, 260],
        fill=(r, g, b, 22)
    )
    canvas = Image.alpha_composite(canvas, spotlight.filter(ImageFilter.GaussianBlur(radius=50)))

    # ── 8. TITLE with METALLIC GRADIENT SHIMMER ─────────────────────────────
    font_title = ImageFont.truetype(fonts.get("Montserrat-ExtraBold.ttf", "arial.ttf"), 70)
    canvas = draw_gradient_text(canvas, f"Kaptain's {title}", font_title, y=70, accent_color=line_col)

    # ── 9. SUBTITLE (cinematic tracked uppercase tagline) ────────────────────
    draw = ImageDraw.Draw(canvas)
    font_sub = ImageFont.truetype(fonts.get("Inter-Medium.ttf", "arial.ttf"), 18)
    sub_text = SUBTITLE_DEFAULT.upper()
    sub_bbox = draw.textbbox((0, 0), sub_text, font=font_sub)
    sub_w = sub_bbox[2] - sub_bbox[0]
    sx = (CANVAS_WIDTH - sub_w) / 2
    sy = 154
    draw.text((sx + 2, sy + 2), sub_text, fill=(0, 0, 0, 100), font=font_sub)
    draw.text((sx, sy), sub_text, fill=(100, 116, 139, 195), font=font_sub)

    # ── 10. CINEMATIC SEPARATOR ─────────────────────────────────────────────
    canvas = draw_cinematic_separator(canvas, y=196, line_col=line_col, width=960)
    draw = ImageDraw.Draw(canvas)

    # ── 11. DESCRIPTION (below separator) ───────────────────────────────────
    font_desc = ImageFont.truetype(fonts.get("Inter-Medium.ttf", "arial.ttf"), 18)
    
    # Wrap description to fit within 1150 px
    desc_words = description.split(" ")
    desc_lines = []
    current_desc_line = []
    
    for word in desc_words:
        current_desc_line.append(word)
        test_str = " ".join(current_desc_line)
        test_bbox = draw.textbbox((0, 0), test_str, font=font_desc)
        test_w = test_bbox[2] - test_bbox[0]
        if test_w > 1150:
            if len(current_desc_line) > 1:
                current_desc_line.pop()
                desc_lines.append(" ".join(current_desc_line))
                current_desc_line = [word]
            else:
                desc_lines.append(test_str)
                current_desc_line = []
    if current_desc_line:
        desc_lines.append(" ".join(current_desc_line))
        
    dy = 221
    desc_line_h = 18
    desc_gap = 6
    
    for line in desc_lines:
        bbox = draw.textbbox((0, 0), line, font=font_desc)
        w = bbox[2] - bbox[0]
        dx = (CANVAS_WIDTH - w) / 2
        draw.text((dx + 1, dy + 1), line, fill=(0, 0, 0, 110), font=font_desc)
        draw.text((dx, dy), line, fill=(71, 85, 105, 215), font=font_desc)
        dy += desc_line_h + desc_gap

    # Calculate vertical shift based on extra lines of description
    y_shift = (len(desc_lines) - 1) * (desc_line_h + desc_gap)

    # ── 12. EXAMPLES ────────────────────────────────────────────────────────
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

    # Split into two rows — take up to 10 items total, split evenly
    max_total = 10 if tile_shape == "POSTER" else 8
    pool = shuffled_items[:max_total]
    mid = math.ceil(len(pool) / 2)
    row1_items = pool[:mid]
    row2_items = pool[mid:]

    font_examples = ImageFont.truetype(fonts.get("Montserrat-Bold.ttf", "arial.ttf"), 22)
    font_label = ImageFont.truetype(fonts.get("Inter-Medium.ttf", "arial.ttf"), 13)
    SEP = "   ·   "
    MAX_LINE_W = 1420

    # Shrink row1 if it overflows
    while len(row1_items) > 1:
        test = SEP.join(row1_items)
        if draw.textbbox((0, 0), test, font=font_examples)[2] <= MAX_LINE_W:
            break
        row1_items = row1_items[:-1]

    # Shrink row2 if it overflows
    while len(row2_items) > 1:
        test = SEP.join(row2_items)
        if draw.textbbox((0, 0), test, font=font_examples)[2] <= MAX_LINE_W:
            break
        row2_items = row2_items[:-1]

    row1_str = SEP.join(row1_items)
    row2_str = SEP.join(row2_items)

    line_h = draw.textbbox((0, 0), row1_str, font=font_examples)[3] + 2
    row_gap = 4  # gap between the two example rows

    # "— EXAMPLES INCLUDE —" label
    label_text = "— EXAMPLES INCLUDE —"
    label_bbox = draw.textbbox((0, 0), label_text, font=font_label)
    label_w = label_bbox[2] - label_bbox[0]
    draw.text(((CANVAS_WIDTH - label_w) / 2, 256 + y_shift), label_text, fill=(r, g, b, 170), font=font_label)

    # Row 1
    r1_w = draw.textbbox((0, 0), row1_str, font=font_examples)[2]
    r1_x = (CANVAS_WIDTH - r1_w) / 2
    draw.text((r1_x + 2, 276 + y_shift), row1_str, fill=(0, 0, 0, 130), font=font_examples)
    draw.text((r1_x, 275 + y_shift), row1_str, fill=(226, 232, 240, 255), font=font_examples)

    # Row 2
    r2_w = draw.textbbox((0, 0), row2_str, font=font_examples)[2]
    r2_x = (CANVAS_WIDTH - r2_w) / 2
    row2_y = 275 + line_h + row_gap + y_shift
    draw.text((r2_x + 2, row2_y + 1), row2_str, fill=(0, 0, 0, 130), font=font_examples)
    draw.text((r2_x, row2_y), row2_str, fill=(226, 232, 240, 255), font=font_examples)

    # ── 13. SHOWCASE CARDS ───────────────────────────────────────────────────
    max_showcase = 5 if tile_shape == "POSTER" else 3
    showcase_folders = []
    if collection_slug == "nuvio_mega_collection":
        showcase_folders = [
            {"title": "Action", "coverImageUrl": "https://raw.githubusercontent.com/ImKaptain/nuvio-assets/main/Genres/Action/Action_Base.png"},
            {"title": "New Movies", "coverImageUrl": "https://i.ibb.co/RGWLbN1j/New-Movies-Base.png"},
            {"title": "Dubbed Only", "coverImageUrl": "https://raw.githubusercontent.com/ImKaptain/nuvio-assets/main/Genres/Dubbed Only/Dubbed_Only_Base.png"}
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

    # Dynamic start_y: always sits a fixed comfortable margin below the last text element
    CARD_TOP_MARGIN = 32
    text_content_bottom = row2_y + line_h  # bottom of the last example row
    start_y = int(text_content_bottom + CARD_TOP_MARGIN)
    
    # Safety clamp: ensure cards fit within canvas (leaving at least 8px bottom margin)
    max_start_y = CANVAS_HEIGHT - current_h - 8
    start_y = min(start_y, max_start_y)

    total_cards_w = max_showcase * current_w + (max_showcase - 1) * card_spacing
    left_margin = (CANVAS_WIDTH - total_cards_w) // 2

    # "— FEATURED SELECTIONS —" label
    font_feat = ImageFont.truetype(fonts.get("Inter-Medium.ttf", "arial.ttf"), 13)
    feat_text = "— FEATURED SELECTIONS —"
    feat_bbox = draw.textbbox((0, 0), feat_text, font=font_feat)
    feat_w = feat_bbox[2] - feat_bbox[0]
    draw.text(((CANVAS_WIDTH - feat_w) / 2, start_y - 30), feat_text, fill=(r, g, b, 150), font=font_feat)

    for i, sf in enumerate(showcase_folders[:max_showcase]):
        card_title = sf.get("title", "CARD")
        card_url = sf.get("coverImageUrl", sf.get("focusGifUrl"))
        card_x = left_margin + i * (current_w + card_spacing)
        card_path = resolve_card_image(card_url)

        if collection_slug in CENSOR_CATEGORIES:
            card_img = create_censored_card(card_path, card_title, fonts)
        else:
            if card_path:
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
        
    # Save the card
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    output_filename = f"{collection_slug}.png"
    output_path = os.path.join(OUTPUT_DIR, output_filename)
    canvas.save(output_path, "PNG")
    print(f" -> SUCCESSFULLY SAVED: {output_path} ({CANVAS_WIDTH}x{CANVAS_HEIGHT})")

# ==============================================================================
# MAIN DISPATCH LOOP
# ==============================================================================
def generate_all(only_slug=None):
    print("======================================================================")
    print("Kaptain's Collection Card Auto-Generator")
    print("======================================================================")
    print(f"Workspace path: {NUVIO_ART_DIR}")
    print(f"Assets repository: {NUVIO_ASSETS_DIR}")
    print(f"Output directory: {OUTPUT_DIR}")
    
    if only_slug:
        print(f"Filtering run to: '{only_slug}' only.")
    print("======================================================================")
    
    # Ensure dependencies and workspaces exist
    if not os.path.exists(NUVIO_ASSETS_DIR):
        print(f"Warning: assets folder '{NUVIO_ASSETS_DIR}' not found. Downloads will trigger.")
        
    # Caches and prepares premium Montserrat/Inter fonts
    fonts = ensure_fonts()
    
    # Read database folders
    if not os.path.exists(METADATA_PATH):
        print(f"Error: metadata.json database file not found at {METADATA_PATH}")
        return
        
    with open(METADATA_PATH, "r", encoding="utf-8") as f:
        metadata = json.load(f)
        
    # Prepare Mega Collection JSON path
    mega_json_path = os.path.join(COLLECTIONS_DIR, metadata["mega_collection"]["filename"])
    
    # 1. GENERATE MEGA COLLECTION CARD
    if only_slug is None or only_slug in ["mega", "nuvio_mega_collection"]:
        if os.path.exists(mega_json_path):
            try:
                with open(mega_json_path, "r", encoding="utf-8") as f_mega:
                    mega_data = json.load(f_mega)
                
                mega_folders = []
                for category in mega_data:
                    category_folders = category.get("folders", [])
                    if category_folders:
                        mega_folders.append(category_folders[0])
                        
                generate_card(
                    "nuvio_mega_collection",
                    "Mega Collection",
                    metadata["mega_collection"]["description"],
                    mega_folders,
                    fonts
                )
            except Exception as e:
                print(f"Error generating Mega Collection card: {e}")
        else:
            print(f"Mega Collection JSON not found. Skipping.")
            
    # 2. GENERATE SUB-COLLECTION CARDS
    for category in metadata.get("individual_collections", []):
        cat_title = category.get("title")
        cat_file = category.get("filename")
        cat_slug = cat_file.replace(".json", "")
        cat_desc = category.get("description")
        
        # Skip if only_slug is set and doesn't match this slug
        if only_slug and only_slug != cat_slug:
            continue
            
        cat_path = os.path.join(COLLECTIONS_DIR, cat_file)
        if not os.path.exists(cat_path):
            print(f"Category file not found at {cat_path}. Skipping.")
            continue
            
        try:
            with open(cat_path, "r", encoding="utf-8") as f_cat:
                cat_data = json.load(f_cat)
                
            if isinstance(cat_data, list) and len(cat_data) > 0:
                collection_obj = cat_data[0]
            else:
                collection_obj = cat_data
                
            folders = collection_obj.get("folders", [])
            
            generate_card(
                cat_slug,
                cat_title,
                cat_desc,
                folders,
                fonts
            )
        except Exception as e:
            print(f"Error generating card for {cat_title}: {e}")
            
    print("\n======================================================================")
    print(f"Card generation task finished! Saved to: {OUTPUT_DIR}")
    print("======================================================================")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Kaptain's Collection Card Auto-Generator")
    parser.add_argument("--only", type=str, default=None, help="Only generate card for this category slug (e.g. 'actors', 'genres')")
    args = parser.parse_args()
    
    generate_all(only_slug=args.only)
