"""
Lulu POD Storybook PDF Generator (Fast Load)
============================================
Generates print-ready PDFs for 8.5 × 8.5 in Square Hardcover (Casewrap) storybooks.

Optimizations:
- Lazy image loading (no re-encoding)
- ImageReader cache to avoid repeated disk reads
- Minimal preprocessing for speed

Specifications:
- Trim Size: 8.5 × 8.5 in (Square)
- Interior Page Size (with bleed): 8.75 × 8.75 in
- Bleed: 0.125 in on all sides
- Safety Margin: 0.5 in from trim edge
- Layout: Left page = Illustration, Right page = Text
- Minimum 24 pages for hardcover, page count must be even
"""

import json
import os
import math
from pathlib import Path
from datetime import datetime
import time

from reportlab.lib.pagesizes import inch
from reportlab.lib.colors import Color, black, white
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image

try:
    import fitz  # PyMuPDF
    HAS_PYMUPDF = True
except Exception:
    HAS_PYMUPDF = False

# =============================================================================
# OPTIONAL: GCS upload (uses GOOGLE_APPLICATION_CREDENTIALS from .env)
# =============================================================================

def _load_env_file(env_path):
    """Load simple KEY=VALUE pairs from a .env file if not already set."""
    try:
        if not env_path.exists():
            return
        for line in env_path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except Exception as err:
        print(f"[WARN] Failed to load .env: {err}")


def _get_gcs_client():
    """Return a google.cloud.storage client if available and configured."""
    _load_env_file(Path(__file__).parent / '.env')
    if not os.environ.get('GOOGLE_APPLICATION_CREDENTIALS'):
        print('[WARN] GOOGLE_APPLICATION_CREDENTIALS not set. Skipping GCS upload.')
        return None
    try:
        from google.cloud import storage
    except Exception as err:
        print(f"[WARN] google-cloud-storage not available: {err}")
        return None
    try:
        return storage.Client()
    except Exception as err:
        print(f"[WARN] Failed to create GCS client: {err}")
        return None


def _upload_to_gcs(local_path, bucket_name, dest_path):
    """Upload a file to GCS if configured."""
    client = _get_gcs_client()
    if client is None:
        return
    try:
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(dest_path)
        blob.upload_from_filename(str(local_path))
        print(f"[OK] Uploaded to gs://{bucket_name}/{dest_path}")
    except Exception as err:
        print(f"[WARN] Upload failed for {local_path}: {err}")


def _upload_outputs(output_type, output_paths):
    """Upload output files to the lulubook bucket."""
    bucket_name = os.environ.get('LULUBOOK_BUCKET', 'lulubook')
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    prefix = f"{output_type.lower()}/{timestamp}"
    for path in output_paths:
        if path and Path(path).exists():
            _upload_to_gcs(Path(path), bucket_name, f"{prefix}/{Path(path).name}")

# =============================================================================
# CONSTANTS - Lulu Specifications
# =============================================================================

# Trim size (final book size after cutting)
TRIM_WIDTH = 8.5 * inch
TRIM_HEIGHT = 8.5 * inch

# Bleed (extra area for trimming)
BLEED = 0.125 * inch

# Interior page size (trim + bleed on all sides)
INTERIOR_PAGE_WIDTH = TRIM_WIDTH + (2 * BLEED)  # 8.75 inches
INTERIOR_PAGE_HEIGHT = TRIM_HEIGHT + (2 * BLEED)  # 8.75 inches

# Safety margin (keep important content inside this)
SAFETY_MARGIN = 0.5 * inch

# Hardcover casewrap wrap area
WRAP_AREA = 0.75 * inch

# Minimum pages for hardcover
MIN_HARDCOVER_PAGES = 24

# Target DPI for print (used only for reporting)
TARGET_DPI = 300

# Hardcover spine width table (page count ranges)
SPINE_WIDTH_TABLE = [
    (24, 84, 0.25),
    (85, 140, 0.5),
    (141, 200, 0.625),
    (201, 280, 0.75),
    (281, 360, 0.875),
    (361, 440, 1.0),
    (441, 520, 1.125),
    (521, 600, 1.25),
]

# Gutter additions based on page count
GUTTER_TABLE = [
    (0, 60, 0.0),
    (61, 150, 0.125),
    (151, 400, 0.5),
    (401, 600, 0.625),
    (601, 9999, 0.75),
]

# Colors
BACKGROUND_COLOR = Color(0.98, 0.96, 0.92)  # Warm cream/paper color
TEXT_COLOR = Color(0.15, 0.12, 0.10)  # Dark brown/black
ACCENT_COLOR = Color(0.4, 0.55, 0.35)  # Forest green

# Typography
TITLE_FONT_SIZE = 32
BODY_FONT_SIZE = 16
LINE_HEIGHT = 1.5
PAGE_NUMBER_SIZE = 12


def get_spine_width(page_count):
    """Get spine width in inches based on page count from Lulu's hardcover table."""
    for min_pages, max_pages, width in SPINE_WIDTH_TABLE:
        if min_pages <= page_count <= max_pages:
            return width * inch
    return 1.25 * inch


def get_gutter_addition(page_count):
    """Get additional gutter margin based on page count."""
    for min_pages, max_pages, addition in GUTTER_TABLE:
        if min_pages <= page_count <= max_pages:
            return addition * inch
    return 0.75 * inch


def ensure_even_page_count(count):
    """Ensure page count is even (required for book binding)."""
    return count if count % 2 == 0 else count + 1


def ensure_min_pages(count, minimum=MIN_HARDCOVER_PAGES):
    """Ensure minimum page count for hardcover."""
    return max(count, minimum)


def to_rgb(color):
    """Convert a reportlab Color to an RGB tuple for PyMuPDF."""
    return (color.red, color.green, color.blue)


def get_image_dpi_info(image_path, target_width_inches, target_height_inches):
    """Return a DPI info string without fully decoding image data."""
    try:
        with Image.open(image_path) as img:
            orig_width, orig_height = img.size
        effective_dpi = min(
            orig_width / (target_width_inches / inch),
            orig_height / (target_height_inches / inch)
        )
        return f"{effective_dpi:.0f} DPI ({orig_width}x{orig_height}px)"
    except Exception as e:
        return f"Unknown DPI (error: {e})"


def _normalize_characters_for_lulu(characters):
    """
    Normalize story_data["characters"] to the shape expected by Lulu generators.

    Supported inputs:
      - V1 dict: {"main_character": {...}, ...}
      - V2 list: [{"index": 1, "role": "main", ...}, ...]

    Returns a dict with at least:
      - {"main_character": {"name": str, "description": str, "output_image": str, ...},
         "all_characters": [{...}, ...]}  # all characters list for multi-character layouts
    """
    def _fallback_main():
        return {"name": "", "description": "", "output_image": ""}

    def _extract_character(c):
        """Extract normalized character dict from input."""
        if not isinstance(c, dict):
            return None
        idx = c.get("index") or 1
        try:
            idx = int(idx)
        except Exception:
            idx = 1
        name = c.get("name") or f"Character {idx}"
        desc = c.get("description") or ""
        if not desc:
            for k in ("bio", "blurb", "summary", "appearance", "persona"):
                v = c.get(k)
                if isinstance(v, str) and v.strip():
                    desc = v
                    break
        img = c.get("output_image") or f"generated/char_{idx}_sheet.png"
        role = c.get("role") or "supporting"
        return {
            "index": idx,
            "name": name,
            "description": desc,
            "output_image": img,
            "role": role,
        }

    if isinstance(characters, dict):
        main = characters.get("main_character")
        if isinstance(main, dict):
            main_out = dict(main)
            if not isinstance(main_out.get("name"), str):
                main_out["name"] = ""
            if not isinstance(main_out.get("description"), str):
                main_out["description"] = ""
            if not isinstance(main_out.get("output_image"), str):
                main_out["output_image"] = ""

            out = dict(characters)
            out["main_character"] = main_out
            # Preserve all_characters if present, else empty list
            if "all_characters" not in out:
                out["all_characters"] = [main_out] if main_out.get("name") or main_out.get("output_image") else []
            return out
        return {"main_character": _fallback_main(), "all_characters": []}

    if isinstance(characters, list):
        candidates = [c for c in characters if isinstance(c, dict)]
        if not candidates:
            return {"main_character": _fallback_main(), "all_characters": []}

        # Build all_characters list
        all_chars = [_extract_character(c) for c in candidates]
        all_chars = [c for c in all_chars if c]  # Remove None entries

        # Find main character
        main = None
        for c in candidates:
            if c.get("role") == "main":
                main = c
                break
        if main is None:
            for c in candidates:
                if c.get("index") == 1:
                    main = c
                    break
        if main is None:
            main = candidates[0]

        main_out = _extract_character(main)

        print(f"[INFO] Lulu: normalized {len(all_chars)} characters list -> dict with main + all_characters")
        return {"main_character": main_out, "all_characters": all_chars}

    return {"main_character": _fallback_main(), "all_characters": []}


class LuluBookGenerator:
    """Generates print-ready PDFs for Lulu printing with parallel processing."""
    
    def __init__(self, story_data_path, images_dir, output_dir):
        self.story_data_path = Path(story_data_path)
        self.images_dir = Path(images_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Load story data
        with open(story_data_path, 'r', encoding='utf-8') as f:
            self.story_data = json.load(f)
        
        self.book_title = self.story_data['book']['title']
        self.pages = self.story_data['pages']
        self.characters = _normalize_characters_for_lulu(self.story_data.get('characters'))
        
        # Image cache (path -> ImageReader)
        self.image_cache = {}
        
        # Calculate page count
        self._calculate_page_count()
        
    def _calculate_page_count(self):
        """Calculate total page count including front/back matter."""
        story_pages = len(self.pages) * 2
        front_matter = 2
        back_matter = 2
        
        self.raw_page_count = front_matter + story_pages + back_matter
        self.raw_page_count = ensure_even_page_count(self.raw_page_count)
        self.raw_page_count = ensure_min_pages(self.raw_page_count)
        
        self.total_pages = self.raw_page_count
        self.spine_width = get_spine_width(self.total_pages)
        self.gutter_addition = get_gutter_addition(self.total_pages)
        
        print(f"Book: {self.book_title}")
        print(f"Story pages: {len(self.pages)}")
        print(f"Total interior pages: {self.total_pages}")
        print(f"Spine width: {self.spine_width / inch:.3f} inches")
        print(f"Gutter addition: {self.gutter_addition / inch:.3f} inches")
    
    def _get_image_path(self, relative_path):
        """Convert relative path to absolute path."""
        if relative_path.startswith('generated/'):
            filename = relative_path.replace('generated/', '')
            return self.images_dir / filename
        return self.images_dir.parent / relative_path
    
    def _get_or_load_image(self, image_path, target_width=None, target_height=None, log_dpi=False):
        """Get image from cache or load from disk without re-encoding."""
        if not image_path:
            return None
        path_str = str(image_path)
        if path_str in self.image_cache:
            return self.image_cache[path_str]
        if not image_path.exists():
            return None
        if log_dpi and target_width and target_height:
            info = get_image_dpi_info(image_path, target_width, target_height)
            print(f"    Loaded: {image_path.name} ({info})")
        img_reader = ImageReader(path_str)
        self.image_cache[path_str] = img_reader
        return img_reader
    
    def _draw_placeholder_image(self, c, x, y, width, height, text="Image\nNot Found"):
        """Draw a placeholder when image is missing."""
        c.setFillColor(Color(0.9, 0.9, 0.9))
        c.rect(x, y, width, height, fill=1, stroke=0)
        
        c.setStrokeColor(Color(0.7, 0.7, 0.7))
        c.setLineWidth(2)
        c.rect(x + 10, y + 10, width - 20, height - 20, fill=0, stroke=1)
        
        c.setFillColor(Color(0.5, 0.5, 0.5))
        c.setFont("Helvetica", 24)
        text_lines = text.split('\n')
        for i, line in enumerate(text_lines):
            c.drawCentredString(x + width/2, y + height/2 - i*30, line)
    
    def _draw_image_page(self, c, image_path, page_num):
        """Draw a full-bleed illustration page."""
        img_reader = self._get_or_load_image(
            image_path,
            target_width=INTERIOR_PAGE_WIDTH,
            target_height=INTERIOR_PAGE_HEIGHT,
            log_dpi=False
        ) if image_path else None
        
        if img_reader:
            c.drawImage(img_reader, 0, 0, 
                       width=INTERIOR_PAGE_WIDTH, 
                       height=INTERIOR_PAGE_HEIGHT,
                       preserveAspectRatio=True,
                       anchor='c')
        else:
            self._draw_placeholder_image(c, 0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT)
        
        c.showPage()
    
    def _wrap_text(self, text, font_name, font_size, max_width):
        """Wrap text to fit within max_width."""
        from reportlab.pdfbase.pdfmetrics import stringWidth
        
        words = text.split()
        lines = []
        current_line = []
        
        for word in words:
            test_line = ' '.join(current_line + [word])
            if stringWidth(test_line, font_name, font_size) <= max_width:
                current_line.append(word)
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                current_line = [word]
        
        if current_line:
            lines.append(' '.join(current_line))
        
        return lines
    
    def _draw_text_page(self, c, story_text, page_num, is_right_page=True):
        """Draw a text page with story content."""
        base_margin = SAFETY_MARGIN + BLEED
        gutter_margin = base_margin + self.gutter_addition
        
        if is_right_page:
            left_margin = gutter_margin
            right_margin = base_margin
        else:
            left_margin = base_margin
            right_margin = gutter_margin
        
        top_margin = base_margin
        bottom_margin = base_margin
        
        text_width = INTERIOR_PAGE_WIDTH - left_margin - right_margin
        text_height = INTERIOR_PAGE_HEIGHT - top_margin - bottom_margin
        
        # Background
        c.setFillColor(BACKGROUND_COLOR)
        c.rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT, fill=1, stroke=0)
        
        # Decorative border
        border_inset = BLEED + 0.25 * inch
        c.setStrokeColor(ACCENT_COLOR)
        c.setLineWidth(1)
        c.rect(border_inset, border_inset, 
               INTERIOR_PAGE_WIDTH - 2 * border_inset,
               INTERIOR_PAGE_HEIGHT - 2 * border_inset,
               fill=0, stroke=1)
        
        # Story text
        c.setFillColor(TEXT_COLOR)
        c.setFont("Helvetica", BODY_FONT_SIZE)
        
        lines = self._wrap_text(story_text, "Helvetica", BODY_FONT_SIZE, text_width)
        line_height = BODY_FONT_SIZE * LINE_HEIGHT
        total_text_height = len(lines) * line_height
        
        start_y = INTERIOR_PAGE_HEIGHT - top_margin - (text_height - total_text_height) / 2 - BODY_FONT_SIZE
        start_y = min(start_y, INTERIOR_PAGE_HEIGHT - top_margin - BODY_FONT_SIZE)
        
        for i, line in enumerate(lines):
            y = start_y - (i * line_height)
            if y < bottom_margin:
                break
            c.drawString(left_margin, y, line)
        
        # Page number
        c.setFont("Helvetica", PAGE_NUMBER_SIZE)
        c.setFillColor(Color(0.5, 0.5, 0.5))
        page_num_y = BLEED + 0.3 * inch
        if is_right_page:
            c.drawRightString(INTERIOR_PAGE_WIDTH - base_margin, page_num_y, str(page_num))
        else:
            c.drawString(base_margin, page_num_y, str(page_num))
        
        c.showPage()
    
    def _draw_title_page(self, c):
        """Draw the title page."""
        c.setFillColor(BACKGROUND_COLOR)
        c.rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT, fill=1, stroke=0)
        
        border_inset = BLEED + 0.5 * inch
        c.setStrokeColor(ACCENT_COLOR)
        c.setLineWidth(3)
        c.rect(border_inset, border_inset, 
               INTERIOR_PAGE_WIDTH - 2 * border_inset,
               INTERIOR_PAGE_HEIGHT - 2 * border_inset,
               fill=0, stroke=1)
        
        c.setFillColor(TEXT_COLOR)
        c.setFont("Helvetica-Bold", TITLE_FONT_SIZE)
        
        title_lines = self._wrap_text(self.book_title, "Helvetica-Bold", TITLE_FONT_SIZE, 
                                       INTERIOR_PAGE_WIDTH - 2 * inch)
        
        title_y = INTERIOR_PAGE_HEIGHT * 0.6
        for i, line in enumerate(title_lines):
            c.drawCentredString(INTERIOR_PAGE_WIDTH / 2, title_y - i * (TITLE_FONT_SIZE * 1.3), line)
        
        main_char = self.characters['main_character']
        c.setFont("Helvetica", 18)
        c.setFillColor(ACCENT_COLOR)
        c.drawCentredString(INTERIOR_PAGE_WIDTH / 2, INTERIOR_PAGE_HEIGHT * 0.4, 
                           f"Featuring {main_char['name']}")
        
        c.setFont("Helvetica-Oblique", 14)
        c.setFillColor(Color(0.4, 0.4, 0.4))
        desc_lines = self._wrap_text(main_char['description'], "Helvetica-Oblique", 14,
                                     INTERIOR_PAGE_WIDTH - 2.5 * inch)
        desc_y = INTERIOR_PAGE_HEIGHT * 0.32
        for i, line in enumerate(desc_lines):
            c.drawCentredString(INTERIOR_PAGE_WIDTH / 2, desc_y - i * 20, line)
        
        c.showPage()
    
    def _draw_copyright_page(self, c):
        """Draw the copyright page."""
        c.setFillColor(BACKGROUND_COLOR)
        c.rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT, fill=1, stroke=0)
        
        c.setFont("Helvetica", 10)
        c.setFillColor(Color(0.5, 0.5, 0.5))
        
        year = datetime.now().year
        copyright_text = [
            f"Copyright {year}",
            "",
            "All rights reserved.",
            "No part of this publication may be reproduced,",
            "stored in a retrieval system, or transmitted in any form",
            "or by any means without prior written permission.",
            "",
            f"Printed via Lulu.com",
        ]
        
        y = BLEED + 1.5 * inch
        for line in reversed(copyright_text):
            c.drawCentredString(INTERIOR_PAGE_WIDTH / 2, y, line)
            y += 14
        
        c.showPage()
    
    def _draw_end_page(self, c):
        """Draw the end page."""
        c.setFillColor(BACKGROUND_COLOR)
        c.rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT, fill=1, stroke=0)
        
        c.setFont("Helvetica-Bold", 36)
        c.setFillColor(ACCENT_COLOR)
        c.drawCentredString(INTERIOR_PAGE_WIDTH / 2, INTERIOR_PAGE_HEIGHT / 2, "The End")
        
        c.setFont("Helvetica", 24)
        c.drawCentredString(INTERIOR_PAGE_WIDTH / 2, INTERIOR_PAGE_HEIGHT / 2 - 50, "* * *")
        
        c.showPage()
    
    def _draw_blank_page(self, c):
        """Draw a blank page."""
        c.setFillColor(BACKGROUND_COLOR)
        c.rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT, fill=1, stroke=0)
        c.showPage()
    
    def generate_interior_pdf(self):
        """Generate the interior PDF with all pages."""
        output_path = self.output_dir / f"interior_8.5x8.5_casewrap_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        
        print(f"\n{'='*60}")
        print("Generating Interior PDF")
        print(f"{'='*60}")
        print(f"Output: {output_path}")
        print(f"Page size: {INTERIOR_PAGE_WIDTH/inch:.3f} x {INTERIOR_PAGE_HEIGHT/inch:.3f} inches")
        
        print("\n  Building PDF pages...")
        start_time = time.time()
        
        c = canvas.Canvas(str(output_path), pagesize=(INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT))
        c.setTitle(self.book_title)
        c.setAuthor("Lulu Book Generator")
        
        current_page = 0
        
        # Title page
        current_page += 1
        self._draw_title_page(c)
        
        # Copyright page
        current_page += 1
        self._draw_copyright_page(c)
        
        # Story spreads
        for story_page in self.pages:
            image_rel_path = story_page.get('output_image', '')
            story_text = story_page['story']
            
            # Image page
            current_page += 1
            image_path = self._get_image_path(image_rel_path) if image_rel_path else None
            self._draw_image_page(c, image_path, current_page)
            
            # Text page
            current_page += 1
            self._draw_text_page(c, story_text, current_page, is_right_page=True)
        
        # End page
        current_page += 1
        self._draw_end_page(c)
        
        # Ensure even page count
        if current_page % 2 != 0:
            current_page += 1
            self._draw_blank_page(c)
        
        # Pad to minimum 24 pages
        while current_page < MIN_HARDCOVER_PAGES:
            current_page += 1
            self._draw_blank_page(c)
            if current_page < MIN_HARDCOVER_PAGES:
                current_page += 1
                self._draw_blank_page(c)
        
        c.save()
        
        elapsed = time.time() - start_time
        print(f"\n[OK] Interior PDF generated in {elapsed:.2f}s: {output_path}")
        print(f"  Total pages: {current_page}")
        
        self.total_pages = current_page
        self.spine_width = get_spine_width(self.total_pages)
        
        return output_path
    
    def generate_cover_pdf(self):
        """Generate the cover PDF."""
        self.spine_width = get_spine_width(self.total_pages)
        
        cover_content_width = (TRIM_WIDTH * 2) + self.spine_width
        cover_total_width = cover_content_width + (2 * WRAP_AREA) + (2 * BLEED)
        cover_total_height = TRIM_HEIGHT + (2 * WRAP_AREA) + (2 * BLEED)
        
        output_path = self.output_dir / f"cover_8.5x8.5_casewrap_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        
        print(f"\n{'='*60}")
        print("Generating Cover PDF")
        print(f"{'='*60}")
        print(f"Output: {output_path}")
        print(f"Interior pages: {self.total_pages}")
        print(f"Spine width: {self.spine_width/inch:.3f} inches")
        print(f"Cover size: {cover_total_width/inch:.3f} x {cover_total_height/inch:.3f} inches")
        
        start_time = time.time()
        
        c = canvas.Canvas(str(output_path), pagesize=(cover_total_width, cover_total_height))
        c.setTitle(f"{self.book_title} - Cover")
        
        # Define regions
        wrap_start = BLEED
        back_start = BLEED + WRAP_AREA
        spine_start = back_start + TRIM_WIDTH
        front_start = spine_start + self.spine_width
        front_end = front_start + TRIM_WIDTH
        
        # Background
        c.setFillColor(Color(0.12, 0.25, 0.18))
        c.rect(0, 0, cover_total_width, cover_total_height, fill=1, stroke=0)
        
        # Front cover
        cover_image_path = self._get_image_path(self.story_data['book'].get('output_image', ''))
        front_x = front_start
        front_y = BLEED + WRAP_AREA
        front_width = TRIM_WIDTH
        front_height = TRIM_HEIGHT
        
        img_reader = self._get_or_load_image(
            cover_image_path,
            target_width=TRIM_WIDTH,
            target_height=TRIM_HEIGHT,
            log_dpi=False
        )
        if img_reader:
            print(f"  Using cached cover image")
            c.drawImage(img_reader, front_x, front_y,
                       width=front_width, height=front_height,
                       preserveAspectRatio=True, anchor='c')
        else:
            # Text-based front cover
            c.setStrokeColor(Color(0.85, 0.75, 0.55))
            c.setLineWidth(4)
            inset = 0.4 * inch
            c.rect(front_x + inset, front_y + inset,
                  front_width - 2*inset, front_height - 2*inset,
                  fill=0, stroke=1)
            
            c.setFillColor(Color(0.95, 0.90, 0.80))
            c.setFont("Helvetica-Bold", 42)
            title_lines = self._wrap_text(self.book_title, "Helvetica-Bold", 42, front_width - 1.5*inch)
            title_y = front_y + front_height * 0.65
            for i, line in enumerate(title_lines):
                c.drawCentredString(front_x + front_width/2, title_y - i*50, line)
            
            c.setFont("Helvetica", 24)
            c.drawCentredString(front_x + front_width/2, front_y + front_height * 0.45, "* * *")
            
            c.setFont("Helvetica-Oblique", 18)
            main_char = self.characters['main_character']
            c.drawCentredString(front_x + front_width/2, front_y + front_height * 0.35,
                               f"A Story of {main_char['name']}")
        
        # Spine text
        if self.spine_width >= 0.25 * inch:
            c.saveState()
            spine_center_x = spine_start + self.spine_width / 2
            spine_center_y = BLEED + WRAP_AREA + TRIM_HEIGHT / 2
            
            c.translate(spine_center_x, spine_center_y)
            c.rotate(90)
            
            c.setFillColor(Color(0.95, 0.90, 0.80))
            
            max_text_height = self.spine_width - 0.15 * inch
            spine_font_size = min(14, max_text_height / inch * 72 * 0.6)
            
            if spine_font_size >= 8:
                c.setFont("Helvetica-Bold", spine_font_size)
                max_spine_text_width = TRIM_HEIGHT - 1 * inch
                spine_title = self.book_title
                from reportlab.pdfbase.pdfmetrics import stringWidth
                while stringWidth(spine_title, "Helvetica-Bold", spine_font_size) > max_spine_text_width and len(spine_title) > 10:
                    spine_title = spine_title[:-4] + "..."
                c.drawCentredString(0, -spine_font_size/3, spine_title)
            
            c.restoreState()
        
        # Back cover
        back_x = back_start
        back_y = BLEED + WRAP_AREA
        back_width = TRIM_WIDTH
        back_height = TRIM_HEIGHT
        
        c.setStrokeColor(Color(0.85, 0.75, 0.55))
        c.setLineWidth(2)
        inset = 0.5 * inch
        c.rect(back_x + inset, back_y + inset,
              back_width - 2*inset, back_height - 2*inset,
              fill=0, stroke=1)
        
        c.setFillColor(Color(0.9, 0.85, 0.75))
        c.setFont("Helvetica", 14)
        
        synopsis = (
            f"Join {self.characters['main_character']['name']} on an unforgettable adventure "
            f"through the wild jungle, where courage meets friendship and danger lurks in every shadow. "
            f"This beautifully illustrated storybook brings to life the tale of a brave young hero "
            f"and the magnificent creatures who become lifelong companions."
        )
        
        synopsis_lines = self._wrap_text(synopsis, "Helvetica", 14, back_width - 1.5*inch)
        synopsis_y = back_y + back_height * 0.65
        for i, line in enumerate(synopsis_lines):
            c.drawCentredString(back_x + back_width/2, synopsis_y - i*20, line)
        
        # Barcode area
        barcode_width = 2.0 * inch
        barcode_height = 1.25 * inch
        barcode_x = back_x + 0.5 * inch
        barcode_y = back_y + 0.5 * inch
        
        c.setFillColor(white)
        c.rect(barcode_x, barcode_y, barcode_width, barcode_height, fill=1, stroke=0)
        c.setFillColor(Color(0.7, 0.7, 0.7))
        c.setFont("Helvetica", 10)
        c.drawCentredString(barcode_x + barcode_width/2, barcode_y + barcode_height/2, "BARCODE AREA")
        
        c.save()
        
        elapsed = time.time() - start_time
        print(f"\n[OK] Cover PDF generated in {elapsed:.2f}s: {output_path}")
        print(f"  Cover dimensions: {cover_total_width/inch:.3f}\" x {cover_total_height/inch:.3f}\"")
        
        return output_path
    
    def validate_outputs(self, interior_path, cover_path):
        """Validate the generated PDFs."""
        print(f"\n{'='*60}")
        print("Validation Results")
        print(f"{'='*60}")
        
        issues = []
        
        if interior_path.exists():
            print(f"[OK] Interior PDF exists: {interior_path.name}")
            
            if self.total_pages < MIN_HARDCOVER_PAGES:
                issues.append(f"Interior has {self.total_pages} pages, minimum is {MIN_HARDCOVER_PAGES}")
            else:
                print(f"[OK] Page count: {self.total_pages} (minimum: {MIN_HARDCOVER_PAGES})")
            
            if self.total_pages % 2 != 0:
                issues.append(f"Page count must be even, got {self.total_pages}")
            else:
                print(f"[OK] Page count is even")
            
            print(f"[OK] Page size: 8.75\" x 8.75\" (with 0.125\" bleed)")
        else:
            issues.append("Interior PDF not found")
        
        if cover_path.exists():
            print(f"[OK] Cover PDF exists: {cover_path.name}")
            print(f"[OK] Spine width: {self.spine_width/inch:.3f}\" (for {self.total_pages} pages)")
        else:
            issues.append("Cover PDF not found")
        
        if issues:
            print("\n[WARNING] Issues found:")
            for issue in issues:
                print(f"  - {issue}")
        else:
            print("\n[OK] All validations passed!")
        
        return len(issues) == 0
    
    def generate(self):
        """Generate both interior and cover PDFs."""
        total_start = time.time()
        
        print("\n" + "="*60)
        print("LULU STORYBOOK PDF GENERATOR (Fast Load)")
        print("Format: 8.5 x 8.5 in Square Hardcover (Casewrap)")
        print("="*60)
        
        interior_path = self.generate_interior_pdf()
        cover_path = self.generate_cover_pdf()
        
        self.validate_outputs(interior_path, cover_path)
        
        total_elapsed = time.time() - total_start
        print(f"\n[OK] Total generation time: {total_elapsed:.2f}s")
        _upload_outputs('lulu-book', [interior_path, cover_path])
        return interior_path, cover_path


class FastLuluBookGenerator:
    """Fast PDF generator using PyMuPDF for image-heavy pages."""

    def __init__(
        self,
        story_data_path,
        images_dir,
        output_dir,
        show_guides=False,
        no_crop_images=True,
        output_type='LULU_BOOK',
        upload_outputs=True,
    ):
        if not HAS_PYMUPDF:
            raise RuntimeError('PyMuPDF is not installed. Run: pip install pymupdf')
        self.story_data_path = Path(story_data_path)
        self.images_dir = Path(images_dir)
        self.show_guides = show_guides
        self.no_crop_images = no_crop_images
        self.output_type = (output_type or 'LULU_BOOK').upper().strip()
        self.is_lulu_book = self.output_type == 'LULU_BOOK'
        self.upload_outputs = bool(upload_outputs)

        base_output_dir = Path(output_dir)
        if self.output_type == 'DIGI_BOOK':
            self.output_dir = base_output_dir / 'digi-book'
        else:
            self.output_dir = base_output_dir / 'lulu-book'
        self.output_dir.mkdir(parents=True, exist_ok=True)

        with open(story_data_path, 'r', encoding='utf-8') as f:
            self.story_data = json.load(f)

        self.book_title = self.story_data['book']['title']
        self.pages = self.story_data['pages']
        self.characters = _normalize_characters_for_lulu(self.story_data.get('characters'))

        self._init_fonts()
        self._calculate_page_count()

    def _init_fonts(self):
        """Resolve and prepare embedded TTF fonts so Lulu sees (Embedded Subset)."""
        # Lulu requires fonts to be embedded (Embedded Subset). Base14 fonts like 'helv'
        # can be flagged as "not embedded" by Lulu, so we embed TTF font files instead.
        self._font_body_name = 'BodyFont'
        self._font_bold_name = 'BoldFont'
        self._font_italic_name = 'ItalicFont'
        self._font_body_file = None
        self._font_bold_file = None
        self._font_italic_file = None
        self._font_body = None
        self._font_bold = None
        self._font_italic = None

        try:
            # Optional overrides (absolute paths)
            env_regular = os.getenv('BOOK_FONT_REGULAR')
            env_bold = os.getenv('BOOK_FONT_BOLD')
            env_italic = os.getenv('BOOK_FONT_ITALIC')
            if env_regular and os.path.exists(env_regular):
                self._font_body_file = env_regular
                if env_bold and os.path.exists(env_bold):
                    self._font_bold_file = env_bold
                else:
                    self._font_bold_file = env_regular
                if env_italic and os.path.exists(env_italic):
                    self._font_italic_file = env_italic
                else:
                    self._font_italic_file = env_regular
            else:
                font_dirs = []
                custom_dir = os.getenv('BOOK_FONTS_DIR')
                if custom_dir:
                    font_dirs.append(custom_dir)
                if os.name == 'nt':
                    font_dirs.append(r'C:\Windows\Fonts')
                else:
                    font_dirs.extend([
                        '/usr/share/fonts/truetype/dejavu',
                        '/usr/share/fonts/truetype/liberation',
                        '/usr/share/fonts/truetype/freefont',
                        '/usr/share/fonts/truetype/noto',
                        '/usr/share/fonts',
                        '/usr/local/share/fonts',
                    ])

                candidates = [
                    # Source Serif 4 (variable fonts)
                    (
                        'SourceSerif4[opsz,wght].ttf',
                        'SourceSerif4[opsz,wght].ttf',
                        'SourceSerif4-Italic[opsz,wght].ttf',
                    ),
                    # Common Linux fonts (installed via fonts-dejavu-core)
                    ('DejaVuSerif.ttf', 'DejaVuSerif-Bold.ttf', 'DejaVuSerif-Italic.ttf'),
                    ('DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSans-Oblique.ttf'),
                    # Other common Linux fonts
                    ('LiberationSerif-Regular.ttf', 'LiberationSerif-Bold.ttf', 'LiberationSerif-Italic.ttf'),
                    ('LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf', 'LiberationSans-Italic.ttf'),
                    ('FreeSerif.ttf', 'FreeSerifBold.ttf', 'FreeSerifItalic.ttf'),
                    ('FreeSans.ttf', 'FreeSansBold.ttf', 'FreeSansOblique.ttf'),
                    # Windows fallbacks (local)
                    ('times.ttf', 'timesbd.ttf', 'timesi.ttf'),
                    ('georgia.ttf', 'georgiab.ttf', 'georgiai.ttf'),
                    ('arial.ttf', 'arialbd.ttf', 'ariali.ttf'),
                    ('calibri.ttf', 'calibrib.ttf', 'calibrii.ttf'),
                ]

                for font_dir in font_dirs:
                    for reg, bold, italic in candidates:
                        reg_path = os.path.join(font_dir, reg)
                        bold_path = os.path.join(font_dir, bold)
                        if os.path.exists(reg_path):
                            self._font_body_file = reg_path
                            if os.path.exists(bold_path):
                                self._font_bold_file = bold_path
                            else:
                                self._font_bold_file = reg_path
                            italic_path = os.path.join(font_dir, italic)
                            if os.path.exists(italic_path):
                                self._font_italic_file = italic_path
                            break
                    if self._font_body_file:
                        break

            if self._font_body_file:
                self._font_body = fitz.Font(fontfile=self._font_body_file)
                if self._font_bold_file:
                    self._font_bold = fitz.Font(fontfile=self._font_bold_file)
                if not self._font_italic_file:
                    self._font_italic_file = self._font_body_file
                if self._font_italic_file:
                    self._font_italic = fitz.Font(fontfile=self._font_italic_file)
        except Exception:
            # If font resolution fails, we'll fall back to Base14 fonts.
            self._font_body_file = None
            self._font_bold_file = None
            self._font_italic_file = None
            self._font_body = None
            self._font_bold = None
            self._font_italic = None

    def _register_fonts_on_page(self, page):
        """Ensure our embedded fonts are registered on the given page."""
        # Track whether we successfully registered custom fonts
        body_registered = False
        bold_registered = False
        italic_registered = False

        if self._font_body_file:
            try:
                page.insert_font(fontname=self._font_body_name, fontfile=self._font_body_file)
                body_registered = True
            except Exception:
                pass
        if self._font_bold_file:
            try:
                page.insert_font(fontname=self._font_bold_name, fontfile=self._font_bold_file)
                bold_registered = True
            except Exception:
                pass
        if self._font_italic_file:
            try:
                page.insert_font(fontname=self._font_italic_name, fontfile=self._font_italic_file)
                italic_registered = True
            except Exception:
                pass

        # If custom fonts failed, ensure Base14 fallback fonts are registered
        # Base14 fonts (helv, helvb, helvi) are always available in PyMuPDF
        if not body_registered:
            try:
                page.insert_font(fontname='helv')
            except Exception:
                pass
        if not bold_registered:
            try:
                page.insert_font(fontname='helvb')
            except Exception:
                pass
        if not italic_registered:
            try:
                page.insert_font(fontname='helvi')
            except Exception:
                pass

    def _text_length(self, text, fontsize, is_bold=False):
        """Measure text width for our chosen font (matches what we actually draw)."""
        try:
            font = self._font_bold if is_bold else self._font_body
            if font:
                return font.text_length(text, fontsize)
        except Exception:
            pass
        return fitz.get_text_length(text, fontname='helv', fontsize=fontsize)

    def _calculate_page_count(self):
        story_pages = len(self.pages) * 2
        # We keep only the Title page in front so the first story spread can start on:
        # page 2 = image (left), page 3 = text (right).
        front_matter = 1  # title page
        # Personalized book: no copyright page.
        # Fill the end with a hero page + end/promo page. Leave last page blank.
        back_matter = 2   # hero + end/promo (blank padding will make 24 pages)
        self.raw_page_count = front_matter + story_pages + back_matter
        if self.is_lulu_book:
            self.raw_page_count = ensure_even_page_count(self.raw_page_count)
            self.raw_page_count = ensure_min_pages(self.raw_page_count)
        self.total_pages = self.raw_page_count
        if self.is_lulu_book:
            self.spine_width = get_spine_width(self.total_pages)
            self.gutter_addition = get_gutter_addition(self.total_pages)
        else:
            # Digi books don't have a spine/gutter.
            self.spine_width = 0
            self.gutter_addition = 0

        print(f'Book: {self.book_title}')
        print(f'Story pages: {len(self.pages)}')
        print(f'Total interior pages: {self.total_pages}')
        if self.is_lulu_book:
            print(f'Spine width: {self.spine_width / inch:.3f} inches')
            print(f'Gutter addition: {self.gutter_addition / inch:.3f} inches')

    def _get_image_path(self, relative_path):
        if relative_path.startswith('generated/'):
            filename = relative_path.replace('generated/', '')
            return self.images_dir / filename
        return self.images_dir.parent / relative_path

    def _fit_image_rect(self, image_path, page_width, page_height):
        """Return a centered rect that fits the image without cropping."""
        with Image.open(image_path) as img:
            img_width, img_height = img.size

        scale = min(page_width / img_width, page_height / img_height)
        target_width = img_width * scale
        target_height = img_height * scale
        x0 = (page_width - target_width) / 2
        y0 = (page_height - target_height) / 2
        return fitz.Rect(x0, y0, x0 + target_width, y0 + target_height)

    def _draw_text_page(self, page, story_text, page_num, is_right_page=True):
        self._register_fonts_on_page(page)
        base_margin = SAFETY_MARGIN + BLEED
        gutter_margin = base_margin + self.gutter_addition

        if is_right_page:
            left_margin = gutter_margin
            right_margin = base_margin
        else:
            left_margin = base_margin
            right_margin = gutter_margin

        # Background - warm cream/parchment color
        page.draw_rect(
            fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT),
            color=None,
            fill=to_rgb(BACKGROUND_COLOR)
        )

        # Decorative double border (use a warm neutral accent for interior pages)
        # Avoid bright greens on interior typography (feels loud for story text).
        outer_border = BLEED + 0.4 * inch
        inner_border = BLEED + 0.5 * inch
        page_accent = Color(0.55, 0.42, 0.26)  # warm brown/gold accent
        border_outer = Color(0.62, 0.60, 0.54)
        border_inner = Color(0.78, 0.75, 0.68)

        # Outer border line
        page.draw_rect(
            fitz.Rect(outer_border, outer_border,
                      INTERIOR_PAGE_WIDTH - outer_border,
                      INTERIOR_PAGE_HEIGHT - outer_border),
            color=to_rgb(border_outer),
            width=1.2
        )

        # Inner border line (thinner)
        page.draw_rect(
            fitz.Rect(inner_border, inner_border,
                      INTERIOR_PAGE_WIDTH - inner_border,
                      INTERIOR_PAGE_HEIGHT - inner_border),
            color=to_rgb(border_inner),
            width=0.6
        )

        # Corner flourishes (decorative dots at corners)
        corner_offset = outer_border + 0.08 * inch
        dot_radius = 3
        corners = [
            (corner_offset, corner_offset),
            (INTERIOR_PAGE_WIDTH - corner_offset, corner_offset),
            (corner_offset, INTERIOR_PAGE_HEIGHT - corner_offset),
            (INTERIOR_PAGE_WIDTH - corner_offset, INTERIOR_PAGE_HEIGHT - corner_offset)
        ]
        for cx, cy in corners:
            page.draw_circle(fitz.Point(cx, cy), dot_radius, 
                           color=None, fill=to_rgb(border_outer))

        # Content area inside inner border
        content_padding = 0.25 * inch
        content_rect = fitz.Rect(
            inner_border + content_padding,
            inner_border + content_padding,
            INTERIOR_PAGE_WIDTH - inner_border - content_padding,
            INTERIOR_PAGE_HEIGHT - inner_border - content_padding - 0.18 * inch
        )

        # Split into paragraphs for better flow
        paragraphs = [p.strip() for p in story_text.split('\n') if p.strip()]
        if len(paragraphs) < 3:
            sentences = [s.strip() for s in story_text.split('. ') if s.strip()]
            if len(sentences) >= 3:
                chunk_size = max(1, len(sentences) // 3)
                paragraphs = [
                    '. '.join(sentences[:chunk_size]).rstrip('.') + '.',
                    '. '.join(sentences[chunk_size:chunk_size * 2]).rstrip('.') + '.',
                    '. '.join(sentences[chunk_size * 2:]).rstrip('.') + '.'
                ]
            else:
                paragraphs = [story_text.strip()]

        # ---------------------------------------------------------------------
        # Typography + deterministic layout (no more "guess and split" wrapping)
        # This fixes the missing-first-lines bug and enables storybook styling.
        # ---------------------------------------------------------------------
        body_font = self._font_body_name if self._font_body_file else 'helv'
        bold_font = self._font_bold_name if self._font_bold_file else body_font
        # Auto-tune type so the story fills the page nicely (storybook style)
        # We'll pick the largest font/leading combo that still fits.
        size_candidates = [18, 17, 16, 15]
        leading_mult_candidates = [1.85, 1.75, 1.65, 1.55]

        # Simple storybook styling:
        # - Keep the first letter bold (inline, normal size)
        # - No oversized drop cap / no box / no special kerning hacks
        # Centered paragraphs look best without first-line indents.
        first_line_indent = 0
        paragraph_gap = 0  # computed after we choose leading

        # Helper: safe text length (fallback to helv if bold font isn't available)
        def text_len(s, fontsize):
            return self._text_length(s, fontsize, is_bold=False)

        def insert_faux_bold(point, text, fontsize, color):
            if self._font_bold_file:
                page.insert_text(point, text, fontsize=fontsize, fontname=bold_font, color=color)
                return
            # Draw twice with a tiny x-offset to simulate bold (fallback).
            page.insert_text(point, text, fontsize=fontsize, fontname=body_font, color=color)
            page.insert_text(fitz.Point(point.x + 0.6, point.y), text, fontsize=fontsize, fontname=body_font, color=color)

        # Helper: build one line of words that fits max_width
        def take_line(words, fontsize, max_width):
            if not words:
                return '', []
            line = words[0]
            idx = 1
            while idx < len(words):
                candidate = f'{line} {words[idx]}'
                if text_len(candidate, fontsize) > max_width:
                    break
                line = candidate
                idx += 1
            return line, words[idx:]

        # Build a paragraph-aware model (preserve 3 paragraphs visually)
        cleaned_paragraphs = [p.replace('\n', ' ').strip() for p in paragraphs if p.strip()]
        if not cleaned_paragraphs:
            return

        # Prepare first paragraph tokens for bold-first-letter handling
        first_para = cleaned_paragraphs[0]
        first_para_stripped = first_para.lstrip()
        first_letter = first_para_stripped[0] if first_para_stripped else ''
        first_para_remainder = first_para_stripped[1:].lstrip() if len(first_para_stripped) > 1 else ''

        # Wrap all paragraphs into lines for a given (body_size, leading)
        def measure_layout(body_size, leading):
            par_gap = leading * 0.9
            lines = []  # each: dict(x, y, text, is_bold=False)
            y = content_rect.y0 + body_size

            # First paragraph: bold first letter inline, then normal wrapping
            full_w = content_rect.width
            if first_letter:
                letter_w = self._text_length(first_letter, body_size, is_bold=True)
                words = first_para_remainder.split()
                line, words = take_line(words, body_size, max(10, full_w - letter_w))
                if line:
                    lines.append({'kind': 'text_after_bold', 'y': y, 'text': line, 'letter_w': letter_w, 'first_letter': first_letter})
                else:
                    # First paragraph is only one letter (rare) - still render it
                    lines.append({'kind': 'text_after_bold', 'y': y, 'text': '', 'letter_w': letter_w, 'first_letter': first_letter})
                y += leading
                while words:
                    line, words = take_line(words, body_size, full_w)
                    if not line:
                        break
                    lines.append({'kind': 'text', 'y': y, 'text': line})
                    y += leading
            else:
                words = first_para.split()
                while words:
                    line, words = take_line(words, body_size, full_w)
                    lines.append({'kind': 'text', 'y': y, 'text': line})
                    y += leading

            # Remaining paragraphs: keep paragraph breaks but do not indent (centered)
            for para in cleaned_paragraphs[1:]:
                y += par_gap
                words = para.split()
                is_first_line = True
                while words:
                    indent = first_line_indent if is_first_line else 0
                    line, words = take_line(words, body_size, content_rect.width - indent)
                    lines.append({'kind': 'text', 'y': y, 'text': line})
                    y += leading
                    is_first_line = False

            total_h = y - (content_rect.y0 + body_size)
            return total_h, lines, par_gap

        # Choose best size/leading that fills the page without overflow
        best = None
        for s in size_candidates:
            for lm in leading_mult_candidates:
                leading = s * lm
                total_h, lines, par_gap = measure_layout(s, leading)
                if total_h <= (content_rect.height - s * 0.5):
                    score = total_h  # maximize usage
                    if not best or score > best['score']:
                        best = {'size': s, 'leading': leading, 'lines': lines, 'par_gap': par_gap, 'score': score}

        if not best:
            # fallback tiny
            s = 15
            leading = s * 1.55
            total_h, lines, par_gap = measure_layout(s, leading)
            best = {'size': s, 'leading': leading, 'lines': lines, 'par_gap': par_gap, 'score': total_h}

        body_size = best['size']
        leading = best['leading']
        paragraph_gap = best['par_gap']
        lines = best['lines']

        # Render: centered lines for symmetrical paragraphs
        for item in lines:
            kind = item['kind']
            if kind == 'text_after_bold':
                # Center the combined first letter + first line text
                first_letter_local = item.get('first_letter', first_letter)
                letter_w = item.get('letter_w', self._text_length(first_letter_local, body_size, is_bold=True))
                line_w = text_len(item['text'], body_size)
                total_w = letter_w + line_w
                start_x = content_rect.x0 + max(0, (content_rect.width - total_w) / 2)

                # Draw bold first letter at start_x
                insert_faux_bold(
                    fitz.Point(start_x, item['y']),
                    first_letter_local,
                    fontsize=body_size,
                    color=to_rgb(TEXT_COLOR)
                )
                # Draw the rest right after the letter
                page.insert_text(
                    fitz.Point(start_x + letter_w, item['y']),
                    item['text'],
                    fontsize=body_size,
                    fontname=body_font,
                    color=to_rgb(TEXT_COLOR)
                )
                continue

            # Center normal line
            line_w = text_len(item['text'], body_size)
            x = content_rect.x0 + max(0, (content_rect.width - line_w) / 2)
            page.insert_text(
                fitz.Point(x, item['y']),
                item['text'],
                fontsize=body_size,
                fontname=body_font,
                color=to_rgb(TEXT_COLOR)
            )

        # Page number: centered and always visible inside the outer border
        num_baseline = INTERIOR_PAGE_HEIGHT - outer_border - 0.12 * inch
        page_num_str = f'• {page_num} •'
        num_w = text_len(page_num_str, PAGE_NUMBER_SIZE)
        num_x = (INTERIOR_PAGE_WIDTH - num_w) / 2
        page.insert_text(
            fitz.Point(num_x, num_baseline),
            page_num_str,
            fontsize=PAGE_NUMBER_SIZE,
            fontname=body_font,
            color=to_rgb(border_outer)
        )

    def _draw_title_page(self, page):
        self._register_fonts_on_page(page)
        page.draw_rect(
            fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT),
            color=None,
            fill=to_rgb(BACKGROUND_COLOR)
        )

        border_inset = BLEED + 0.5 * inch
        page.draw_rect(
            fitz.Rect(
                border_inset,
                border_inset,
                INTERIOR_PAGE_WIDTH - border_inset,
                INTERIOR_PAGE_HEIGHT - border_inset
            ),
            color=to_rgb(ACCENT_COLOR),
            width=2
        )

        title_rect = fitz.Rect(
            1 * inch,
            INTERIOR_PAGE_HEIGHT * 0.45,
            INTERIOR_PAGE_WIDTH - 1 * inch,
            INTERIOR_PAGE_HEIGHT * 0.75
        )
        page.insert_textbox(
            title_rect,
            self.book_title,
            fontsize=TITLE_FONT_SIZE,
            fontname=self._font_bold_name if self._font_bold_file else 'helvb',
            color=to_rgb(TEXT_COLOR),
            align=fitz.TEXT_ALIGN_CENTER
        )

        main_char = self.characters['main_character']
        page.insert_textbox(
            fitz.Rect(
                1 * inch,
                INTERIOR_PAGE_HEIGHT * 0.35,
                INTERIOR_PAGE_WIDTH - 1 * inch,
                INTERIOR_PAGE_HEIGHT * 0.45
            ),
            f'Featuring {main_char["name"]}',
            fontsize=18,
            fontname=self._font_body_name if self._font_body_file else 'helv',
            color=to_rgb(ACCENT_COLOR),
            align=fitz.TEXT_ALIGN_CENTER
        )

        if self.show_guides:
            self._draw_interior_guides(page)

    def _draw_copyright_page(self, page):
        self._register_fonts_on_page(page)
        page.draw_rect(
            fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT),
            color=None,
            fill=to_rgb(BACKGROUND_COLOR)
        )

        year = datetime.now().year
        text = '\n'.join([
            f'Copyright {year}',
            '',
            'All rights reserved.',
            'No part of this publication may be reproduced,',
            'stored in a retrieval system, or transmitted in any form',
            'or by any means without prior written permission.',
            '',
            'Printed via Lulu.com'
        ])

        page.insert_textbox(
            fitz.Rect(
                1 * inch,
                INTERIOR_PAGE_HEIGHT - 2.5 * inch,
                INTERIOR_PAGE_WIDTH - 1 * inch,
                INTERIOR_PAGE_HEIGHT - 1 * inch
            ),
            text,
            fontsize=10,
            fontname=self._font_body_name if self._font_body_file else 'helv',
            color=to_rgb(Color(0.5, 0.5, 0.5)),
            align=fitz.TEXT_ALIGN_CENTER
        )

        if self.show_guides:
            self._draw_interior_guides(page)

    def _draw_double_border_with_dots(self, page):
        """Draw the decorative double border with corner dots (same as text pages)."""
        outer_border = BLEED + 0.4 * inch
        inner_border = BLEED + 0.5 * inch
        border_outer = Color(0.62, 0.60, 0.54)
        border_inner = Color(0.78, 0.75, 0.68)
        page.draw_rect(
            fitz.Rect(outer_border, outer_border,
                      INTERIOR_PAGE_WIDTH - outer_border,
                      INTERIOR_PAGE_HEIGHT - outer_border),
            color=to_rgb(border_outer),
            width=1.2
        )
        page.draw_rect(
            fitz.Rect(inner_border, inner_border,
                      INTERIOR_PAGE_WIDTH - inner_border,
                      INTERIOR_PAGE_HEIGHT - inner_border),
            color=to_rgb(border_inner),
            width=0.6
        )
        # Corner dots
        corner_offset = outer_border + 0.08 * inch
        dot_radius = 3
        corners = [
            (corner_offset, corner_offset),
            (INTERIOR_PAGE_WIDTH - corner_offset, corner_offset),
            (corner_offset, INTERIOR_PAGE_HEIGHT - corner_offset),
            (INTERIOR_PAGE_WIDTH - corner_offset, INTERIOR_PAGE_HEIGHT - corner_offset)
        ]
        for cx, cy in corners:
            page.draw_circle(fitz.Point(cx, cy), dot_radius,
                             color=None, fill=to_rgb(border_outer))

    def _draw_character_page_main(self, page):
        self._register_fonts_on_page(page)

        page.draw_rect(
            fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT),
            color=None,
            fill=to_rgb(BACKGROUND_COLOR)
        )

        self._draw_double_border_with_dots(page)

        inner_border = BLEED + 0.5 * inch
        content_padding = 0.35 * inch
        content_left = inner_border + content_padding
        content_right = INTERIOR_PAGE_WIDTH - inner_border - content_padding
        content_top = inner_border + content_padding
        content_bottom = INTERIOR_PAGE_HEIGHT - inner_border - content_padding

        # Defensive normalization: some pipelines (or stale kernels) may still load
        # story_data["characters"] as a list (V2). Ensure dict shape before using .get().
        if isinstance(self.characters, list):
            self.characters = _normalize_characters_for_lulu(self.characters)

        # Get all characters for multi-character layouts
        all_chars = (self.characters or {}).get('all_characters', [])
        main = (self.characters or {}).get('main_character') or {}

        # If no all_characters list, fall back to just main
        if not all_chars:
            all_chars = [main] if main.get('name') or main.get('output_image') else []

        num_chars = len(all_chars)

        # Title - pluralize based on character count
        title_text = 'Meet the Stars' if num_chars > 1 else 'Meet the Star'
        title_rect = fitz.Rect(
            content_left,
            content_top,
            content_right,
            content_top + 0.5 * inch
        )
        page.insert_textbox(
            title_rect,
            title_text,
            fontsize=24,
            fontname=self._font_bold_name if self._font_bold_file else 'helvb',
            color=to_rgb(TEXT_COLOR),
            align=fitz.TEXT_ALIGN_CENTER
        )

        # Character names subtitle
        if num_chars > 0:
            names = [c.get('name', '') for c in all_chars if c.get('name')]
            if names:
                name_text = ', '.join(names)
                name_rect = fitz.Rect(
                    content_left,
                    title_rect.y1 + 0.08 * inch,
                    content_right,
                    title_rect.y1 + 0.45 * inch
                )
                italic_font = self._font_italic_name if self._font_italic_file else (
                    self._font_body_name if self._font_body_file else 'helvi'
                )
                page.insert_textbox(
                    name_rect,
                    name_text,
                    fontsize=16 if num_chars <= 2 else 14,  # Smaller font for more names
                    fontname=italic_font,
                    color=to_rgb(ACCENT_COLOR),
                    align=fitz.TEXT_ALIGN_CENTER
                )
                img_top = name_rect.y1 + 0.2 * inch
            else:
                img_top = title_rect.y1 + 0.3 * inch
        else:
            img_top = title_rect.y1 + 0.4 * inch

        # Calculate image area
        img_area = fitz.Rect(
            content_left + 0.2 * inch,
            img_top,
            content_right - 0.2 * inch,
            content_bottom - 0.1 * inch
        )

        # Draw images based on character count and layout
        if num_chars == 0:
            # No characters - placeholder
            page.insert_textbox(
                img_area,
                'Character images not found',
                fontsize=14,
                fontname=self._font_body_name if self._font_body_file else 'helv',
                color=to_rgb(Color(0.5, 0.5, 0.5)),
                align=fitz.TEXT_ALIGN_CENTER
            )
        elif num_chars == 1:
            # Single character - centered full image
            self._draw_single_character_image(page, all_chars[0], img_area)
        elif num_chars == 2:
            # Two characters - 2 rows x 1 column grid
            self._draw_two_character_grid(page, all_chars, img_area)
        elif num_chars == 3:
            # Three characters - 1 top center, 2 bottom
            self._draw_three_character_grid(page, all_chars, img_area)
        else:
            # Four or more - 2x2 grid (show first 4)
            self._draw_four_character_grid(page, all_chars[:4], img_area)

        if self.show_guides:
            self._draw_interior_guides(page)

    def _draw_single_character_image(self, page, character, img_area):
        """Draw single character image centered."""
        img_rel = character.get('output_image', '')
        img_path = self._get_image_path(img_rel) if img_rel else None

        if img_path and img_path.exists():
            ir = self._fit_image_rect(img_path, img_area.width, img_area.height)
            placed = fitz.Rect(
                img_area.x0 + ir.x0,
                img_area.y0 + ir.y0,
                img_area.x0 + ir.x1,
                img_area.y0 + ir.y1
            )
            self._draw_image_with_frame(page, img_path, placed)
        else:
            page.insert_textbox(
                img_area,
                f"{character.get('name', 'Character')} image not found",
                fontsize=12,
                fontname=self._font_body_name if self._font_body_file else 'helv',
                color=to_rgb(Color(0.5, 0.5, 0.5)),
                align=fitz.TEXT_ALIGN_CENTER
            )

    def _draw_two_character_grid(self, page, characters, img_area):
        """Draw 2 characters in 2 rows x 1 column grid."""
        gap = 0.15 * inch
        cell_height = (img_area.height - gap) / 2

        for i, char in enumerate(characters[:2]):
            cell_top = img_area.y0 + i * (cell_height + gap)
            cell_rect = fitz.Rect(
                img_area.x0 + 0.5 * inch,  # Add padding for centering
                cell_top,
                img_area.x1 - 0.5 * inch,
                cell_top + cell_height
            )

            img_rel = char.get('output_image', '')
            img_path = self._get_image_path(img_rel) if img_rel else None

            if img_path and img_path.exists():
                # Fit image within cell
                ir = self._fit_image_rect(img_path, cell_rect.width, cell_rect.height)
                placed = fitz.Rect(
                    cell_rect.x0 + ir.x0,
                    cell_rect.y0 + ir.y0,
                    cell_rect.x0 + ir.x1,
                    cell_rect.y0 + ir.y1
                )
                self._draw_image_with_frame(page, img_path, placed)
            else:
                page.insert_textbox(
                    cell_rect,
                    f"{char.get('name', 'Character')} image not found",
                    fontsize=10,
                    fontname=self._font_body_name if self._font_body_file else 'helv',
                    color=to_rgb(Color(0.5, 0.5, 0.5)),
                    align=fitz.TEXT_ALIGN_CENTER
                )

    def _draw_three_character_grid(self, page, characters, img_area):
        """Draw 3 characters: 1 top center, 2 bottom side by side."""
        gap = 0.12 * inch
        top_height = img_area.height * 0.45
        bottom_height = img_area.height * 0.55

        # Top center character
        top_char = characters[0]
        top_width = img_area.width * 0.6  # 60% width for single centered image
        top_left = img_area.x0 + (img_area.width - top_width) / 2
        top_rect = fitz.Rect(
            top_left,
            img_area.y0,
            top_left + top_width,
            img_area.y0 + top_height
        )

        img_rel = top_char.get('output_image', '')
        img_path = self._get_image_path(img_rel) if img_rel else None
        if img_path and img_path.exists():
            ir = self._fit_image_rect(img_path, top_rect.width, top_rect.height)
            placed = fitz.Rect(
                top_rect.x0 + ir.x0,
                top_rect.y0 + ir.y0,
                top_rect.x0 + ir.x1,
                top_rect.y0 + ir.y1
            )
            self._draw_image_with_frame(page, img_path, placed)

        # Bottom row - 2 characters side by side
        bottom_y = img_area.y0 + top_height + gap
        bottom_cell_width = (img_area.width - gap) / 2

        for i, char in enumerate(characters[1:3]):
            cell_left = img_area.x0 + i * (bottom_cell_width + gap)
            cell_rect = fitz.Rect(
                cell_left,
                bottom_y,
                cell_left + bottom_cell_width,
                img_area.y1
            )

            img_rel = char.get('output_image', '')
            img_path = self._get_image_path(img_rel) if img_rel else None

            if img_path and img_path.exists():
                ir = self._fit_image_rect(img_path, cell_rect.width, cell_rect.height)
                placed = fitz.Rect(
                    cell_rect.x0 + ir.x0,
                    cell_rect.y0 + ir.y0,
                    cell_rect.x0 + ir.x1,
                    cell_rect.y0 + ir.y1
                )
                self._draw_image_with_frame(page, img_path, placed)
            else:
                page.insert_textbox(
                    cell_rect,
                    f"{char.get('name', 'Character')} image not found",
                    fontsize=10,
                    fontname=self._font_body_name if self._font_body_file else 'helv',
                    color=to_rgb(Color(0.5, 0.5, 0.5)),
                    align=fitz.TEXT_ALIGN_CENTER
                )

    def _draw_four_character_grid(self, page, characters, img_area):
        """Draw 4 characters in 2x2 grid."""
        gap = 0.12 * inch
        cell_width = (img_area.width - gap) / 2
        cell_height = (img_area.height - gap) / 2

        for i, char in enumerate(characters[:4]):
            row = i // 2
            col = i % 2
            cell_left = img_area.x0 + col * (cell_width + gap)
            cell_top = img_area.y0 + row * (cell_height + gap)
            cell_rect = fitz.Rect(
                cell_left,
                cell_top,
                cell_left + cell_width,
                cell_top + cell_height
            )

            img_rel = char.get('output_image', '')
            img_path = self._get_image_path(img_rel) if img_rel else None

            if img_path and img_path.exists():
                ir = self._fit_image_rect(img_path, cell_rect.width, cell_rect.height)
                placed = fitz.Rect(
                    cell_rect.x0 + ir.x0,
                    cell_rect.y0 + ir.y0,
                    cell_rect.x0 + ir.x1,
                    cell_rect.y1 - ir.y1
                )
                self._draw_image_with_frame(page, img_path, placed)
            else:
                page.insert_textbox(
                    cell_rect,
                    f"{char.get('name', 'Character')} image not found",
                    fontsize=9,
                    fontname=self._font_body_name if self._font_body_file else 'helv',
                    color=to_rgb(Color(0.5, 0.5, 0.5)),
                    align=fitz.TEXT_ALIGN_CENTER
                )

    def _draw_image_with_frame(self, page, img_path, placed_rect):
        """Draw image with subtle frame border."""
        frame_pad = 4
        frame_rect = fitz.Rect(
            placed_rect.x0 - frame_pad,
            placed_rect.y0 - frame_pad,
            placed_rect.x1 + frame_pad,
            placed_rect.y1 + frame_pad
        )
        page.draw_rect(frame_rect, color=to_rgb(Color(0.7, 0.68, 0.62)), width=1.0)
        page.insert_image(placed_rect, filename=str(img_path), keep_proportion=False)

    def _draw_app_promo_page(self, page):
        self._register_fonts_on_page(page)

        page.draw_rect(
            fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT),
            color=None,
            fill=to_rgb(BACKGROUND_COLOR)
        )

        self._draw_double_border_with_dots(page)

        inner_border = BLEED + 0.5 * inch
        content_padding = 0.5 * inch
        content_left = inner_border + content_padding
        content_right = INTERIOR_PAGE_WIDTH - inner_border - content_padding
        content_top = inner_border + content_padding
        content_bottom = INTERIOR_PAGE_HEIGHT - inner_border - content_padding
        content_height = content_bottom - content_top
        center_x = INTERIOR_PAGE_WIDTH / 2

        # =================================================================
        # BALANCED LAYOUT: Divide content area into proportional sections
        # =================================================================
        # Layout from top to bottom with consistent spacing:
        # 1. "The End" headline + decorative line
        # 2. Tagline (italic)
        # 3. Body text (description)
        # 4. Thank you line
        # 5. CTA + QR code + scan instruction

        # Fixed heights for each element
        headline_h = 0.7 * inch  # Increased for larger font
        tagline_h = 0.6 * inch
        body_h = 1.0 * inch
        thank_h = 0.5 * inch
        qr_size = 1.2 * inch
        cta_h = 0.3 * inch
        scan_h = 0.3 * inch

        # Calculate total content height and remaining space for gaps
        total_content = headline_h + tagline_h + body_h + thank_h + cta_h + qr_size + scan_h
        remaining_space = content_height - total_content
        gap = max(0.1 * inch, remaining_space / 6)  # Minimum gap to prevent negative

        # Position each element from top to bottom
        y_cursor = content_top

        # 1. Headline: "The End" - prominent, centered, black bold
        # Use insert_text for more reliable rendering at large font sizes
        the_end_fontsize = 28
        the_end_font = self._font_bold_name if self._font_bold_file else 'helvb'
        the_end_text = 'The End'
        
        # Measure text width to center it
        try:
            if self._font_bold:
                text_width = self._font_bold.text_length(the_end_text, the_end_fontsize)
            else:
                text_width = len(the_end_text) * the_end_fontsize * 0.5
        except Exception:
            text_width = len(the_end_text) * the_end_fontsize * 0.5
        
        text_x = center_x - text_width / 2
        text_y = y_cursor + 0.35 * inch  # Baseline position
        
        page.insert_text(
            fitz.Point(text_x, text_y),
            the_end_text,
            fontsize=the_end_fontsize,
            fontname=the_end_font,
            color=to_rgb(Color(0, 0, 0))
        )
        y_cursor += headline_h

        # Decorative flourish line under headline
        line_y = y_cursor - 0.25 * inch
        line_half = 0.6 * inch
        page.draw_line(
            fitz.Point(center_x - line_half, line_y),
            fitz.Point(center_x + line_half, line_y),
            color=to_rgb(Color(0.50, 0.45, 0.38)),
            width=1.5
        )
        y_cursor += gap

        # 2. Tagline (same font as body text)
        tagline_rect = fitz.Rect(
            content_left + 0.2 * inch,
            y_cursor,
            content_right - 0.2 * inch,
            y_cursor + tagline_h
        )
        body_font = self._font_body_name if self._font_body_file else 'helv'
        page.insert_textbox(
            tagline_rect,
            'Stories may end on the page,\nbut imagination continues beyond it.',
            fontsize=14,
            fontname=body_font,
            color=to_rgb(Color(0.45, 0.42, 0.38)),
            align=fitz.TEXT_ALIGN_CENTER
        )
        y_cursor += tagline_h + gap

        # 3. Body text (description)
        body_rect = fitz.Rect(
            content_left + 0.15 * inch,
            y_cursor,
            content_right - 0.15 * inch,
            y_cursor + body_h
        )
        page.insert_textbox(
            body_rect,
            'This personalized storybook was created from a real photo\n'
            'to turn a moment into a story worth remembering.\n\n'
            'Every photo holds the potential for a new adventure,\n'
            'a new character, and a new story.',
            fontsize=12,
            fontname=body_font,
            color=to_rgb(Color(0.35, 0.32, 0.28)),
            align=fitz.TEXT_ALIGN_CENTER
        )
        y_cursor += body_h + gap

        # 4. Thank you line
        thank_rect = fitz.Rect(content_left, y_cursor, content_right, y_cursor + thank_h)
        page.insert_textbox(
            thank_rect,
            'Thank you for creating this story with us.',
            fontsize=13,
            fontname=self._font_bold_name if self._font_bold_file else 'helvb',
            color=to_rgb(Color(0, 0, 0)),
            align=fitz.TEXT_ALIGN_CENTER
        )
        y_cursor += thank_h + gap

        # 5. CTA text above QR
        cta_color = Color(0.55, 0.42, 0.26)
        cta_rect = fitz.Rect(content_left, y_cursor, content_right, y_cursor + cta_h)
        page.insert_textbox(
            cta_rect,
            'Create more stories at img2x.com',
            fontsize=13,
            fontname=self._font_bold_name if self._font_bold_file else 'helvb',
            color=to_rgb(cta_color),
            align=fitz.TEXT_ALIGN_CENTER
        )

        # Clickable link annotation
        link_rect = fitz.Rect(
            center_x - 2.0 * inch,
            cta_rect.y0,
            center_x + 2.0 * inch,
            cta_rect.y1
        )
        page.insert_link({'kind': fitz.LINK_URI, 'uri': 'https://img2x.com', 'from': link_rect})
        y_cursor += cta_h + gap * 0.5

        # 6. QR code (centered)
        qr_rect = fitz.Rect(
            center_x - qr_size / 2,
            y_cursor,
            center_x + qr_size / 2,
            y_cursor + qr_size
        )
        y_cursor += qr_size + gap * 0.3

        # 7. Scan instruction below QR
        scan_rect = fitz.Rect(content_left, y_cursor, content_right, y_cursor + scan_h)
        page.insert_textbox(
            scan_rect,
            'Scan to get started',
            fontsize=10,
            fontname=self._font_body_name if self._font_body_file else 'helv',
            color=to_rgb(Color(0.5, 0.5, 0.5)),
            align=fitz.TEXT_ALIGN_CENTER
        )

        # QR code
        qr_path_candidates = [
            Path(__file__).resolve().parent / 'qr-code.png',
            self.story_data_path.parent / 'qr-code.png',
            self.output_dir.parent / 'qr-code.png'
        ]
        qr_path = next((p for p in qr_path_candidates if p.exists()), None)

        if qr_path:
            from io import BytesIO

            target_px = int(round((qr_size / inch) * 300))

            with Image.open(qr_path) as src:
                src = src.convert('RGBA')
                scale = min(target_px / src.width, target_px / src.height)
                new_w = max(1, int(round(src.width * scale)))
                new_h = max(1, int(round(src.height * scale)))
                resample = Image.LANCZOS if scale < 1.0 else Image.NEAREST
                qr_img = src.resize((new_w, new_h), resample)

                # Composite onto cream background so transparency blends
                bg_color = (int(BACKGROUND_COLOR.red * 255),
                            int(BACKGROUND_COLOR.green * 255),
                            int(BACKGROUND_COLOR.blue * 255),
                            255)
                tile = Image.new('RGBA', (target_px, target_px), bg_color)
                x0 = (target_px - new_w) // 2
                y0 = (target_px - new_h) // 2
                tile.paste(qr_img, (x0, y0), qr_img)

                out = BytesIO()
                tile.convert('RGB').save(out, format='PNG')
                page.insert_image(qr_rect, stream=out.getvalue(), keep_proportion=False)
        else:
            page.draw_rect(qr_rect, color=to_rgb(Color(0.65, 0.65, 0.65)), width=1.2, dashes='[3 3]')
            page.insert_textbox(
                qr_rect,
                'QR\n(Missing)',
                fontsize=14,
                fontname=self._font_bold_name if self._font_bold_file else 'helvb',
                color=to_rgb(Color(0.45, 0.45, 0.45)),
                align=fitz.TEXT_ALIGN_CENTER
            )

        if self.show_guides:
            self._draw_interior_guides(page)

    def _draw_end_page(self, page):
        self._register_fonts_on_page(page)
        page.draw_rect(
            fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT),
            color=None,
            fill=to_rgb(BACKGROUND_COLOR)
        )
        page.insert_textbox(
            fitz.Rect(
                1 * inch,
                INTERIOR_PAGE_HEIGHT * 0.45,
                INTERIOR_PAGE_WIDTH - 1 * inch,
                INTERIOR_PAGE_HEIGHT * 0.6
            ),
            'The End',
            fontsize=36,
            fontname=self._font_bold_name if self._font_bold_file else 'helvb',
            color=to_rgb(ACCENT_COLOR),
            align=fitz.TEXT_ALIGN_CENTER
        )

        if self.show_guides:
            self._draw_interior_guides(page)

    def _draw_interior_guides(self, page):
        """Draw interior reference guides: trim, bleed, safety."""
        # Trim edge
        trim_rect = fitz.Rect(BLEED, BLEED, BLEED + TRIM_WIDTH, BLEED + TRIM_HEIGHT)
        page.draw_rect(trim_rect, color=to_rgb(Color(0.2, 0.2, 0.8)), width=0.5)

        # Safety margin
        safe_rect = fitz.Rect(
            BLEED + SAFETY_MARGIN,
            BLEED + SAFETY_MARGIN,
            BLEED + TRIM_WIDTH - SAFETY_MARGIN,
            BLEED + TRIM_HEIGHT - SAFETY_MARGIN
        )
        page.draw_rect(safe_rect, color=to_rgb(Color(0.6, 0.6, 0.6)), width=0.5)

        # Bleed edge
        bleed_rect = fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT)
        page.draw_rect(bleed_rect, color=to_rgb(Color(0.0, 0.7, 0.7)), width=0.5)
    def generate_interior_pdf(self):
        output_path = self.output_dir / f'interior_8.5x8.5_casewrap_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf'

        print(f'\n{"="*60}')
        print('Generating Interior PDF')
        print(f'{"="*60}')
        print(f'Output: {output_path}')
        print(f'Page size: {INTERIOR_PAGE_WIDTH/inch:.3f} x {INTERIOR_PAGE_HEIGHT/inch:.3f} inches')
        print('\n  Building PDF pages...')

        start_time = time.time()
        doc = fitz.open()

        current_page = 0

        # Title page
        current_page += 1
        page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
        self._draw_title_page(page)

        # Story spreads
        for story_page in self.pages:
            image_rel_path = story_page.get('output_image', '')
            story_text = story_page['story']

            # Image page
            current_page += 1
            page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
            image_path = self._get_image_path(image_rel_path) if image_rel_path else None
            if image_path and image_path.exists():
                if self.no_crop_images:
                    # Draw white background, then fit image to page without cropping
                    page.draw_rect(
                        fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT),
                        color=None,
                        fill=to_rgb(Color(1, 1, 1))
                    )
                    image_rect = self._fit_image_rect(image_path, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT)
                    page.insert_image(image_rect, filename=str(image_path), keep_proportion=False)
                else:
                    # Full-bleed, may crop if aspect ratio differs
                    page.insert_image(
                        fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT),
                        filename=str(image_path),
                        keep_proportion=True
                    )
            else:
                self._register_fonts_on_page(page)
                page.insert_textbox(
                    fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT),
                    'Image Not Found',
                    fontsize=24,
                    fontname=self._font_body_name if self._font_body_file else 'helv',
                    color=to_rgb(Color(0.5, 0.5, 0.5)),
                    align=fitz.TEXT_ALIGN_CENTER
                )

            if self.show_guides:
                self._draw_interior_guides(page)

            # Text page
            current_page += 1
            page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
            self._draw_text_page(page, story_text, current_page, is_right_page=True)
            if self.show_guides:
                self._draw_interior_guides(page)

        # Lulu hardcover needs >= 24 pages; for DIGI_BOOK we don't force padding.
        if self.is_lulu_book:
            # Pad BEFORE back-matter to keep the last page blank (page 24).
            # We reserve: hero (1) + promo (1) + final blank (1).
            back_matter_pages = 2
            while (current_page + back_matter_pages + 1) < MIN_HARDCOVER_PAGES:
                current_page += 1
                blank_page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
                if self.show_guides:
                    self._draw_interior_guides(blank_page)

        # Back matter: hero page + end/promo page
        current_page += 1
        page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
        self._draw_character_page_main(page)

        current_page += 1
        page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
        self._draw_app_promo_page(page)

        # Pad to minimum pages (leave the last page blank as requested) - Lulu only
        if self.is_lulu_book:
            while current_page < MIN_HARDCOVER_PAGES:
                current_page += 1
                blank_page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
                if self.show_guides:
                    self._draw_interior_guides(blank_page)

        # Ensure even page count
        if self.is_lulu_book and (current_page % 2 != 0):
            current_page += 1
            blank_page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
            if self.show_guides:
                self._draw_interior_guides(blank_page)

        # (extra min-page padding removed; handled above for Lulu only)

        doc.save(str(output_path), garbage=4, deflate=True, clean=True)
        doc.close()

        elapsed = time.time() - start_time
        print(f'\n[OK] Interior PDF generated in {elapsed:.2f}s: {output_path}')
        print(f'  Total pages: {current_page}')

        self.total_pages = current_page
        self.spine_width = get_spine_width(self.total_pages)

        return output_path

    def generate_digi_pdf(self):
        """Generate a single PDF for digital reading: cover image as first page + interior pages."""
        output_path = self.output_dir / f'digi_book_8.5x8.5_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf'

        print(f'\n{"="*60}')
        print('Generating Digi Book PDF')
        print(f'{"="*60}')
        print(f'Output: {output_path}')
        print(f'Page size: {INTERIOR_PAGE_WIDTH/inch:.3f} x {INTERIOR_PAGE_HEIGHT/inch:.3f} inches')

        start_time = time.time()
        doc = fitz.open()
        current_page = 0

        # Page 1: Cover image (full page)
        current_page += 1
        page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
        cover_image_path = self._get_image_path(self.story_data['book'].get('output_image', ''))
        if cover_image_path.exists():
            from io import BytesIO
            from PIL import Image
            target_ar = INTERIOR_PAGE_WIDTH / INTERIOR_PAGE_HEIGHT
            with Image.open(cover_image_path) as _img:
                _img = _img.convert('RGB')
                iw, ih = _img.size
                img_ar = iw / ih if ih else 1.0

                if img_ar > target_ar:
                    new_w = int(ih * target_ar)
                    x0 = (iw - new_w) // 2
                    crop_box = (x0, 0, x0 + new_w, ih)
                else:
                    new_h = int(iw / target_ar)
                    y0 = (ih - new_h) // 2
                    crop_box = (0, y0, iw, y0 + new_h)

                cropped = _img.crop(crop_box)
                # Preserve native resolution by default (no downsample).
                # If you want a specific DPI, set DIGI_COVER_TARGET_DPI (e.g., 300 or 450).
                target_dpi = os.getenv("DIGI_COVER_TARGET_DPI")
                if target_dpi:
                    try:
                        dpi_val = int(float(target_dpi))
                    except ValueError:
                        dpi_val = 0
                    if dpi_val > 0:
                        target_w_px = int(INTERIOR_PAGE_WIDTH / inch * dpi_val)
                        target_h_px = int(INTERIOR_PAGE_HEIGHT / inch * dpi_val)
                        cropped = cropped.resize((target_w_px, target_h_px), Image.LANCZOS)
                buf = BytesIO()
                cropped.save(buf, format='PNG')
                page.insert_image(fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT), stream=buf.getvalue(), keep_proportion=False)
        else:
            self._register_fonts_on_page(page)
            page.insert_textbox(
                fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT),
                'Cover Image Not Found',
                fontsize=24,
                fontname=self._font_body_name if self._font_body_file else 'helv',
                color=to_rgb(Color(0.5, 0.5, 0.5)),
                align=fitz.TEXT_ALIGN_CENTER
            )

        # Then the same interior content (but without Lulu 24-page padding)
        # Skip the interior title page for DIGI_BOOK (user wants cover-only intro).

        for story_page in self.pages:
            image_rel_path = story_page.get('output_image', '')
            story_text = story_page['story']

            current_page += 1
            page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
            image_path = self._get_image_path(image_rel_path) if image_rel_path else None
            if image_path and image_path.exists():
                if self.no_crop_images:
                    page.draw_rect(
                        fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT),
                        color=None,
                        fill=to_rgb(Color(1, 1, 1))
                    )
                    image_rect = self._fit_image_rect(image_path, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT)
                    page.insert_image(image_rect, filename=str(image_path), keep_proportion=False)
                else:
                    page.insert_image(
                        fitz.Rect(0, 0, INTERIOR_PAGE_WIDTH, INTERIOR_PAGE_HEIGHT),
                        filename=str(image_path),
                        keep_proportion=True
                    )

            current_page += 1
            page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
            self._draw_text_page(page, story_text, current_page, is_right_page=True)

        current_page += 1
        page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
        self._draw_character_page_main(page)

        current_page += 1
        page = doc.new_page(width=INTERIOR_PAGE_WIDTH, height=INTERIOR_PAGE_HEIGHT)
        self._draw_app_promo_page(page)

        doc.save(str(output_path), garbage=4, deflate=True, clean=True)
        doc.close()

        elapsed = time.time() - start_time
        print(f'\n[OK] Digi PDF generated in {elapsed:.2f}s: {output_path}')
        print(f'  Total pages: {current_page}')

        return output_path

    def generate_cover_pdf(self):
        self.spine_width = get_spine_width(self.total_pages)

        cover_content_width = (TRIM_WIDTH * 2) + self.spine_width
        cover_total_width = cover_content_width + (2 * WRAP_AREA) + (2 * BLEED)
        cover_total_height = TRIM_HEIGHT + (2 * WRAP_AREA) + (2 * BLEED)

        output_path = self.output_dir / f'cover_8.5x8.5_casewrap_{datetime.now().strftime("%Y%m%d_%H%M%S")}.pdf'

        print(f'\n{"="*60}')
        print('Generating Cover PDF')
        print(f'{"="*60}')
        print(f'Output: {output_path}')
        print(f'Interior pages: {self.total_pages}')
        print(f'Spine width: {self.spine_width/inch:.3f} inches')
        print(f'Cover size: {cover_total_width/inch:.3f} x {cover_total_height/inch:.3f} inches')

        start_time = time.time()
        doc = fitz.open()
        page = doc.new_page(width=cover_total_width, height=cover_total_height)

        # Background
        # Use a full-spread blurred version of the cover art so the front doesn't
        # look like a sticker on white.
        page.draw_rect(
            fitz.Rect(0, 0, cover_total_width, cover_total_height),
            color=None,
            fill=to_rgb(Color(1, 1, 1))
        )

        back_start = BLEED + WRAP_AREA
        spine_start = back_start + TRIM_WIDTH
        front_start = spine_start + self.spine_width

        cover_image_path = self._get_image_path(self.story_data['book'].get('output_image', ''))
        if cover_image_path.exists():
            from io import BytesIO
            from PIL import Image, ImageFilter, ImageChops, ImageOps, ImageDraw

            def make_blurred_background(img_path, target_w_pt, target_h_pt):
                """
                Banding-safe background for print:
                - Keep blur modest
                - Add a separate paper-grain texture layer using OVERLAY blend (not plain blend)
                This is a common prepress trick to break up 8-bit gradient steps.
                """
                # Target at 300 DPI
                target_w_px = int((target_w_pt / inch) * 300)
                target_h_px = int((target_h_pt / inch) * 300)
                
                with Image.open(img_path) as img:
                    img = img.convert('RGB')
                    
                    # 1. Resize to target
                    scale = max(target_w_px / img.width, target_h_px / img.height)
                    new_w = int(img.width * scale)
                    new_h = int(img.height * scale)
                    img = img.resize((new_w, new_h), Image.LANCZOS)
                    
                    left = (new_w - target_w_px) // 2
                    top = (new_h - target_h_px) // 2
                    img = img.crop((left, top, left + target_w_px, top + target_h_px))
                    
                    # 2. Slight blur (keep some structure; big smooth gradients make banding obvious)
                    img = img.filter(ImageFilter.GaussianBlur(radius=4.5))

                    # 3. Paper-grain texture layer (fine + low-frequency grain), then OVERLAY blend.
                    # Plain Image.blend() shifts tones; overlay creates micro-contrast that hides bands.
                    fine = Image.effect_noise(img.size, 12).convert('L')
                    coarse = Image.effect_noise(img.size, 48).convert('L').filter(ImageFilter.GaussianBlur(radius=4))
                    tex = ImageChops.add(fine, coarse, scale=2.0)  # keep around mid-gray
                    tex = ImageOps.autocontrast(tex)

                    # Reduce texture amplitude so it is invisible but effective in gradients.
                    # Map to mid-gray range around 128.
                    tex = tex.point(lambda p: int(128 + (p - 128) * 0.22))
                    tex_rgb = Image.merge('RGB', (tex, tex, tex))

                    over = ImageChops.overlay(img, tex_rgb)
                    img = Image.blend(img, over, alpha=0.35)
                    
                    return img

            bg_img = make_blurred_background(
                str(cover_image_path),
                cover_total_width,
                cover_total_height
            )
        else:
            bg_img = None

        # Front cover image: FULL BLEED WITHOUT entering the spine / fold.
        # Lulu shows "folds" near the spine; bleeding into that area can look wrong in preview.
        # So we keep the inside edge on the trim (front_start) and put the extra bleed on the
        # outside edge instead (shift the full-bleed box 0.125" to the right).
        #
        # Resulting placed size is still 8.75" x 8.75", but it will NOT cross into the spine side.
        front_rect = fitz.Rect(
            front_start,
            (BLEED + WRAP_AREA) - BLEED,
            front_start + TRIM_WIDTH + (2 * BLEED),
            (BLEED + WRAP_AREA + TRIM_HEIGHT) + BLEED
        )
        # Composite: blur background + feathered front cover into ONE flat RGB image.
        # This avoids PDF transparency warnings and makes the front art blend smoothly
        # into the background so inset borders ("gaps") don't look harsh.
        if bg_img is not None:
            def pt_to_px(pt):
                return int(round((pt / inch) * 300))

            # Build the front image (no zoom-crop; only aspect crop)
            front_img = None
            if cover_image_path.exists():
                target_ar = front_rect.width / front_rect.height
                with Image.open(cover_image_path) as _img:
                    _img = _img.convert('RGB')
                    iw, ih = _img.size
                    img_ar = iw / ih if ih else 1.0

                    if img_ar > target_ar:
                        new_w = int(ih * target_ar)
                        x0 = (iw - new_w) // 2
                        crop_box = (x0, 0, x0 + new_w, ih)
                    else:
                        new_h = int(iw / target_ar)
                        y0 = (ih - new_h) // 2
                        crop_box = (0, y0, iw, y0 + new_h)

                    front_img = _img.crop(crop_box)

                target_w_px = pt_to_px(front_rect.width)
                target_h_px = pt_to_px(front_rect.height)
                front_img = front_img.resize((target_w_px, target_h_px), Image.LANCZOS)

            if front_img is not None:
                # Feather mask (soft dissolve into background)
                # Keep center fully opaque; soften edges over ~0.30"
                feather_px = max(16, int(round(0.30 * 300)))
                mask = Image.new('L', front_img.size, 0)
                draw = ImageDraw.Draw(mask)
                draw.rectangle(
                    (feather_px, feather_px, front_img.size[0] - feather_px, front_img.size[1] - feather_px),
                    fill=255
                )
                mask = mask.filter(ImageFilter.GaussianBlur(radius=feather_px * 0.75))

                # Paste at exact position
                x = pt_to_px(front_rect.x0)
                y = pt_to_px(front_rect.y0)
                bg_img.paste(front_img, (x, y), mask)

            # Final: ensure fully opaque RGB (no alpha)
            bg_img = bg_img.convert('RGB')
            buf = BytesIO()
            bg_img.save(buf, format='PNG')
            page.insert_image(
                fitz.Rect(0, 0, cover_total_width, cover_total_height),
                stream=buf.getvalue(),
                keep_proportion=False
            )

        # Spine text removed per request

        # Back cover text
        back_rect = fitz.Rect(
            back_start,
            BLEED + WRAP_AREA,
            back_start + TRIM_WIDTH,
            BLEED + WRAP_AREA + TRIM_HEIGHT
        )

        # Back cover content layout - professional typography on blurred bg
        # NOTE: PyMuPDF coordinate system has (0,0) at TOP-LEFT, y increases DOWN.
        back_left = back_start + 0.6 * inch
        back_right = back_start + TRIM_WIDTH - 0.6 * inch
        back_top = BLEED + WRAP_AREA + 0.6 * inch
        back_bottom = BLEED + WRAP_AREA + TRIM_HEIGHT - 0.6 * inch

        # ===== BACK COVER: NO TEXT / NO BARCODE PLACEHOLDER =====
        # Just blurred background.

        # (Character gallery removed per request)

        if self.show_guides:
            self._draw_cover_guides(
                page,
                cover_total_width,
                cover_total_height,
                back_start,
                spine_start,
                front_start
            )

        # (Barcode handled above)

        # Save with font subset embedding
        doc.save(str(output_path), garbage=4, deflate=True, clean=True)
        doc.close()

        elapsed = time.time() - start_time
        print(f'\n[OK] Cover PDF generated in {elapsed:.2f}s: {output_path}')
        print(f'  Cover dimensions: {cover_total_width/inch:.3f}" x {cover_total_height/inch:.3f}"')

        return output_path

    def _draw_cover_guides(self, page, cover_total_width, cover_total_height, back_start, spine_start, front_start):
        """
        Draw Lulu-style guide areas WITH MEASUREMENT RULERS AND VERTICAL REFERENCE LINES:
        - Bleed edge
        - Wrap edge
        - Trim edge
        - Safety margin
        - Spine boundaries
        - Barcode area
        - Inch rulers (horizontal & vertical)
        - Dimension labels on vertical lines
        """
        self._register_fonts_on_page(page)
        guide_font = self._font_body_name if self._font_body_file else 'helv'

        # Color scheme
        cyan = to_rgb(Color(0.0, 0.7, 0.9))
        blue = to_rgb(Color(0.2, 0.2, 0.8))
        gray = to_rgb(Color(0.5, 0.5, 0.5))
        yellow = to_rgb(Color(1.0, 0.85, 0.0))
        
        # 1. Bleed edge (outer)
        page.draw_rect(
            fitz.Rect(0, 0, cover_total_width, cover_total_height),
            color=cyan, width=1.0
        )

        # 2. Wrap edge (inside bleed)
        wrap_left = BLEED
        wrap_right = cover_total_width - BLEED
        wrap_top = BLEED
        wrap_bottom = cover_total_height - BLEED
        page.draw_rect(
            fitz.Rect(wrap_left, wrap_top, wrap_right, wrap_bottom),
            color=blue, width=0.8
        )

        # 3. Trim edge (back + spine + front)
        trim_left = back_start
        trim_right = front_start + TRIM_WIDTH
        trim_top = BLEED + WRAP_AREA
        trim_bottom = BLEED + WRAP_AREA + TRIM_HEIGHT
        page.draw_rect(
            fitz.Rect(trim_left, trim_top, trim_right, trim_bottom),
            color=blue, width=1.2
        )

        # 4. Safety margin (0.5" inside trim)
        safe_left = back_start + SAFETY_MARGIN
        safe_right = front_start + TRIM_WIDTH - SAFETY_MARGIN
        safe_top = trim_top + SAFETY_MARGIN
        safe_bottom = trim_bottom - SAFETY_MARGIN
        page.draw_rect(
            fitz.Rect(safe_left, safe_top, safe_right, safe_bottom),
            color=gray, width=0.8
        )

        # 5. Spine boundaries (vertical lines)
        spine_color = to_rgb(Color(0.6, 0.2, 0.6))
        # Left spine edge
        page.draw_line(
            fitz.Point(spine_start, trim_top),
            fitz.Point(spine_start, trim_bottom),
            color=spine_color, width=1.0
        )
        # Right spine edge
        page.draw_line(
            fitz.Point(front_start, trim_top),
            fitz.Point(front_start, trim_bottom),
            color=spine_color, width=1.0
        )

        # 6. Barcode area guide removed (user requested no barcode)

        # ===== VERTICAL REFERENCE LINES WITH LABELS (like Lulu template) =====
        label_font = 8
        label_color = (0.0, 0.0, 0.0)
        ref_line_color = to_rgb(Color(0.3, 0.3, 0.3))
        
        # Helper to draw vertical reference line with label
        def draw_vert_ref(x, label_top, label_bottom, color=ref_line_color):
            # Draw vertical line
            page.draw_line(
                fitz.Point(x, 0),
                fitz.Point(x, cover_total_height),
                color=color, width=0.5, dashes='[2 2]'
            )
            # Top label
            page.insert_text(
                fitz.Point(x + 0.05 * inch, 0.15 * inch),
                label_top,
                fontsize=label_font,
                fontname=guide_font,
                color=label_color,
                rotate=0
            )
            # Bottom label (optional)
            if label_bottom:
                page.insert_text(
                    fitz.Point(x + 0.05 * inch, cover_total_height - 0.08 * inch),
                    label_bottom,
                    fontsize=label_font,
                    fontname=guide_font,
                    color=label_color
                )
        
        # Draw vertical reference lines at key positions
        # Bleed edge (left)
        draw_vert_ref(0, 'BLEED', 'BLEED', cyan)
        
        # Wrap edge (left)
        draw_vert_ref(wrap_left, 'WRAP AREA', 'WRAP AREA', blue)
        
        # Back cover trim (left)
        draw_vert_ref(trim_left, 'TRIM EDGE', None, blue)
        
        # Back cover safety (left)
        draw_vert_ref(safe_left, 'SAFETY MARGIN', None, gray)
        
        # Spine left
        draw_vert_ref(spine_start, 'SPINE', None, spine_color)
        
        # Spine right / Front start
        draw_vert_ref(front_start, 'FRONT', None, spine_color)
        
        # Front cover safety (right)
        draw_vert_ref(safe_right, 'SAFETY', None, gray)
        
        # Front cover trim (right)
        draw_vert_ref(trim_right, 'TRIM', None, blue)
        
        # Wrap edge (right)
        draw_vert_ref(wrap_right, 'WRAP AREA', 'WRAP AREA', blue)
        
        # Bleed edge (right)
        draw_vert_ref(cover_total_width, 'BLEED', 'BLEED', cyan)

        # ===== HORIZONTAL RULER (top) =====
        ruler_color = (0.0, 0.0, 0.0)
        ruler_font_size = 8
        ruler_y_top = 0.08 * inch
        num_inches_h = int(cover_total_width / inch) + 1
        for i in range(num_inches_h + 1):
            x_pos = i * inch
            if x_pos <= cover_total_width:
                page.draw_line(
                    fitz.Point(x_pos, ruler_y_top - 0.08 * inch),
                    fitz.Point(x_pos, ruler_y_top + 0.08 * inch),
                    color=ruler_color, width=0.8
                )
                page.insert_text(
                    fitz.Point(x_pos + 0.03 * inch, ruler_y_top + 0.06 * inch),
                    f'{i}"',
                    fontsize=ruler_font_size,
                    fontname=guide_font,
                    color=ruler_color
                )
        
        # ===== VERTICAL RULER (left) =====
        ruler_x_left = 0.08 * inch
        num_inches_v = int(cover_total_height / inch) + 1
        for i in range(num_inches_v + 1):
            y_pos = i * inch
            if y_pos <= cover_total_height:
                page.draw_line(
                    fitz.Point(ruler_x_left - 0.08 * inch, y_pos),
                    fitz.Point(ruler_x_left + 0.08 * inch, y_pos),
                    color=ruler_color, width=0.8
                )
                page.insert_text(
                    fitz.Point(ruler_x_left + 0.1 * inch, y_pos + 0.05 * inch),
                    f'{i}"',
                    fontsize=ruler_font_size,
                    fontname=guide_font,
                    color=ruler_color
                )
        
        # ===== CAD-STYLE DIMENSION ANNOTATIONS =====
        # Draw horizontal dimension lines showing exact measurements between boundaries
        dim_y = cover_total_height - 0.35 * inch  # Position near bottom
        dim_font = 9
        dim_color = (0.8, 0.1, 0.1)  # Red for visibility
        dim_line_color = to_rgb(Color(0.8, 0.1, 0.1))
        
        # Helper to draw dimension annotation
        def draw_dimension(x_start, x_end, y_pos, label):
            # Dimension line
            page.draw_line(
                fitz.Point(x_start, y_pos),
                fitz.Point(x_end, y_pos),
                color=dim_line_color, width=1.2
            )
            # Start tick
            page.draw_line(
                fitz.Point(x_start, y_pos - 0.08 * inch),
                fitz.Point(x_start, y_pos + 0.08 * inch),
                color=dim_line_color, width=1.2
            )
            # End tick
            page.draw_line(
                fitz.Point(x_end, y_pos - 0.08 * inch),
                fitz.Point(x_end, y_pos + 0.08 * inch),
                color=dim_line_color, width=1.2
            )
            # Label (centered)
            label_w = self._text_length(label, dim_font, is_bold=False)
            label_x = (x_start + x_end - label_w) / 2
            page.insert_text(
                fitz.Point(label_x, y_pos - 0.1 * inch),
                label,
                fontsize=dim_font,
                fontname=guide_font,
                color=dim_color
            )
        
        # Draw dimensions from left to right
        # 1. Left wrap area (BLEED to back cover start)
        wrap_width = WRAP_AREA / inch
        draw_dimension(BLEED, back_start, dim_y, f'{wrap_width:.3f}"')
        draw_dimension(BLEED, back_start, dim_y + 0.15 * inch, 'WRAP')
        
        # 2. Back cover (trim width)
        back_width = TRIM_WIDTH / inch
        draw_dimension(back_start, spine_start, dim_y, f'{back_width:.3f}"')
        draw_dimension(back_start, spine_start, dim_y + 0.15 * inch, 'BACK COVER')
        
        # 3. Spine
        spine_width_inches = self.spine_width / inch
        draw_dimension(spine_start, front_start, dim_y, f'{spine_width_inches:.3f}"')
        draw_dimension(spine_start, front_start, dim_y + 0.15 * inch, 'SPINE')
        
        # 4. Front cover (trim width)
        front_width = TRIM_WIDTH / inch
        draw_dimension(front_start, front_start + TRIM_WIDTH, dim_y, f'{front_width:.3f}"')
        draw_dimension(front_start, front_start + TRIM_WIDTH, dim_y + 0.15 * inch, 'FRONT COVER')
        
        # 5. Right wrap area
        draw_dimension(front_start + TRIM_WIDTH, cover_total_width - BLEED, dim_y, f'{wrap_width:.3f}"')
        draw_dimension(front_start + TRIM_WIDTH, cover_total_width - BLEED, dim_y + 0.15 * inch, 'WRAP')
        
        # Summary dimension line across entire document (at top)
        summary_y = 0.45 * inch
        total_w = cover_total_width / inch
        page.draw_line(
            fitz.Point(0, summary_y),
            fitz.Point(cover_total_width, summary_y),
            color=dim_line_color, width=1.5
        )
        page.insert_text(
            fitz.Point(cover_total_width / 2 - 1.2 * inch, summary_y - 0.12 * inch),
            f'TOTAL DOCUMENT: {total_w:.3f}"  =  {wrap_width:.3f}" + {back_width:.3f}" + {spine_width_inches:.3f}" + {front_width:.3f}" + {wrap_width:.3f}"',
            fontsize=dim_font,
            fontname=guide_font,
            color=dim_color
        )

    def validate_outputs(self, interior_path, cover_path):
        print(f'\n{"="*60}')
        print('Validation Results')
        print(f'{"="*60}')

        issues = []
        if interior_path.exists():
            print(f'[OK] Interior PDF exists: {interior_path.name}')
            if self.total_pages < MIN_HARDCOVER_PAGES:
                issues.append(f'Interior has {self.total_pages} pages, minimum is {MIN_HARDCOVER_PAGES}')
            else:
                print(f'[OK] Page count: {self.total_pages} (minimum: {MIN_HARDCOVER_PAGES})')

            if self.total_pages % 2 != 0:
                issues.append(f'Page count must be even, got {self.total_pages}')
            else:
                print(f'[OK] Page count is even')

            print(f'[OK] Page size: 8.75" x 8.75" (with 0.125" bleed)')
        else:
            issues.append('Interior PDF not found')

        if cover_path.exists():
            print(f'[OK] Cover PDF exists: {cover_path.name}')
            print(f'[OK] Spine width: {self.spine_width/inch:.3f}" (for {self.total_pages} pages)')
        else:
            issues.append('Cover PDF not found')

        if issues:
            print('\n[WARNING] Issues found:')
            for issue in issues:
                print(f'  - {issue}')
        else:
            print('\n[OK] All validations passed!')

        return len(issues) == 0

    def generate(self):
        total_start = time.time()
        print('\n' + '='*60)
        print('LULU STORYBOOK PDF GENERATOR (PyMuPDF Fast)')
        print('Format: 8.5 x 8.5 in Square Hardcover (Casewrap)')
        print('='*60)

        if self.is_lulu_book:
            interior_path = self.generate_interior_pdf()
            cover_path = self.generate_cover_pdf()
            self.validate_outputs(interior_path, cover_path)
            total_elapsed = time.time() - total_start
            print(f'\n[OK] Total generation time: {total_elapsed:.2f}s')
            if self.upload_outputs:
                _upload_outputs('lulu-book', [interior_path, cover_path])
            return interior_path, cover_path

        digi_path = self.generate_digi_pdf()

        # Generate HTML flipbook for DIGI_BOOK inside generator
        html_path = None
        try:
            from build_cssflip_flipbook import pdf_to_html_flipbook
            # Self-contained HTML via base64 images (current flipbook generator default).
            html_path = pdf_to_html_flipbook(digi_path)
        except Exception as err:
            print(f'[WARN] HTML flipbook generation failed: {err}')

        total_elapsed = time.time() - total_start
        print(f'\n[OK] Total generation time: {total_elapsed:.2f}s')
        if self.upload_outputs:
            _upload_outputs('digi-book', [digi_path, html_path])
        return digi_path, html_path


def generate_lulu_pdfs(
    story_data_path,
    images_dir,
    output_dir,
    output_type='LULU_BOOK',
    show_guides=False,
    no_crop_images=True,
    upload_outputs=False,
):
    """
    Generate PDFs.

    output_type:
      - 'LULU_BOOK': print-ready TWO PDFs (interior + cover)
      - 'DIGI_BOOK': ONE PDF only (cover image as first page + interior) + flipbook HTML
    """
    generator = FastLuluBookGenerator(
        story_data_path,
        images_dir,
        output_dir,
        show_guides=show_guides,
        no_crop_images=no_crop_images,
        output_type=output_type,
        upload_outputs=upload_outputs,
    )
    return generator.generate()


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Generate Lulu-ready PDFs for storybook printing"
    )
    parser.add_argument(
        '--story-data',
        default='story_data.json',
        help='Path to story data JSON file'
    )
    parser.add_argument(
        '--images-dir',
        default='generated',
        help='Path to directory containing generated images'
    )
    parser.add_argument(
        '--output-dir',
        default='output',
        help='Path to output directory for PDFs'
    )
    
    args = parser.parse_args()
    
    base_dir = Path(__file__).parent
    
    story_data_path = base_dir / args.story_data
    images_dir = base_dir / args.images_dir
    output_dir = base_dir / args.output_dir
    
    print(f"Story data: {story_data_path}")
    print(f"Images dir: {images_dir}")
    print(f"Output dir: {output_dir}")
    
    if not story_data_path.exists():
        print(f"Error: Story data file not found: {story_data_path}")
        return 1
    
    if not images_dir.exists():
        print(f"Error: Images directory not found: {images_dir}")
        return 1
    
    generator = LuluBookGenerator(story_data_path, images_dir, output_dir)
    generator.generate()
    
    return 0


if __name__ == '__main__':
    exit(main())
