"""A4 reader pages and pre-imposed A3 saddle-stitch output for Quick Book.

No model calls: this renderer consumes the approved V2 story and original images.
The HTML previews are rendered from the same A4 PDF used for imposition.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import fitz
from PIL import Image
from reportlab.lib.pagesizes import A4, A3, landscape
from reportlab.lib.units import mm

MODEL = 'gpt-image-2.5-sunburst-vip'
IMAGE_SIZE = '2400x3392'
PAGE_COUNT = 24
PRINT_INSTRUCTIONS = (
    'Print all 12 PDF pages on six A3 sheets: landscape, actual size (100%), '
    'double-sided, short-edge flip. Turn OFF booklet and multiple-pages-per-sheet '
    'settings. This PDF adds no white inset; non-borderless printers may leave an outer edge. '
    'Confirm orientation and sheet order with a test print on your printer. '
    'Nest the six sheets, fold in half, and staple twice along the centre fold.'
)


def sheet_pairs(count=PAGE_COUNT):
    if count < 4 or count % 4:
        raise ValueError('Booklet page count must be a positive multiple of four')
    return [(count - 2*i, 1 + 2*i, 2 + 2*i, count - 1 - 2*i)
            for i in range(count // 4)]


def _asset(root, relative):
    path = (root / str(relative)).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError(f'Missing or invalid book image: {relative}')
    with Image.open(path) as image:
        image.verify()
    return path


@lru_cache(maxsize=256)
def story_text_fits(text):
    # Use exactly the same border, font and wrapping logic as final output.
    from lulu_digi_book_maker import FastLuluBookGenerator
    generator = FastLuluBookGenerator.__new__(FastLuluBookGenerator)
    generator.is_quick_book = True
    generator.page_width, generator.page_height = A4
    generator.gutter_addition = 0
    generator._init_fonts()
    try:
        with fitz.open() as document:
            page = document.new_page(width=A4[0], height=A4[1])
            generator._draw_text_page(page, text, 3)
        return True
    except ValueError:
        return False


def cover_copy_valid(book):
    return (isinstance(book.get('back_cover_hook'), str)
            and bool(book['back_cover_hook'].strip())
            and isinstance(book.get('back_cover_blurb'), str)
            and bool(book['back_cover_blurb'].strip()))


def validate_story(story):
    """Cheap checks before spending money on images; repeated by PDF preflight."""
    scenes = story.get('pages') or []
    if len(scenes) != 10 or [p.get('page_number') for p in scenes] != list(range(1, 11)):
        raise ValueError('Quick Book needs ten ordered story scenes numbered 1 to 10')
    if any(not str(scene.get('story') or '').strip() for scene in scenes):
        raise ValueError('Quick Book scenes must contain story text')
    if not all(story_text_fits(p['story']) for p in scenes):
        raise ValueError('Story does not fit the original bordered A4 layout at 17pt')
    if not cover_copy_valid(story.get('book') or {}):
        raise ValueError('Quick Book requires a short story-specific back-cover hook and blurb')


def validate_portrait(path):
    with Image.open(path) as image:
        w, h = image.size
    if w < 2400 or h < 3392 or abs(w/h - 210/297) > 0.015:
        raise ValueError(f'Quick Book requires native high-resolution A4 portrait artwork; got {w}x{h}')


def impose_booklet(reader_path, output_path):
    with fitz.open(reader_path) as source, fitz.open() as output:
        if len(source) != PAGE_COUNT:
            raise ValueError('Quick Book requires exactly 24 reader pages')
        width, height = landscape(A3)
        for front_l, front_r, back_l, back_r in sheet_pairs():
            for left, right in [(front_l, front_r), (back_l, back_r)]:
                page = output.new_page(width=width, height=height)
                page.show_pdf_page(fitz.Rect(0, 0, width/2, height), source, left-1)
                page.show_pdf_page(fitz.Rect(width/2, 0, width, height), source, right-1)
        output.set_metadata({'title': 'Quick Book - A3 duplex print file',
                             'subject': PRINT_INSTRUCTIONS})
        output.save(output_path, garbage=4, deflate=True)


def generate_quick_book(story, job_dir, *, print_ready=None):
    """Use the original decorated PDF/flipbook renderer, then impose its A4 pages."""
    from lulu_digi_book_maker import generate_lulu_pdfs
    root = Path(job_dir).resolve()
    validate_story(story)
    for item in [story['book'], *story['pages']]:
        validate_portrait(_asset(root, item['output_image']))
    story_path = root / 'quick-render-story.json'
    story_path.write_text(json.dumps(story, ensure_ascii=False), encoding='utf-8')
    from lulu_digi_book_maker import FastLuluBookGenerator
    generator = FastLuluBookGenerator(str(story_path), str(root / 'generated'),
        str(root / 'book_outputs'), output_type='QUICK_BOOK', upload_outputs=False)
    printed = generator.output_dir / 'quick-book-a3-duplex.pdf'
    with generator.generate_digi_pdf(in_memory=True) as source, fitz.open() as output:
        width, height = landscape(A3)
        for a, b, c, d in sheet_pairs():
            for left, right in [(a, b), (c, d)]:
                page = output.new_page(width=width, height=height)
                page.show_pdf_page(fitz.Rect(0, 0, width/2, height), source, left-1)
                page.show_pdf_page(fitz.Rect(width/2, 0, width, height), source, right-1)
        output.set_metadata({'title': generator.book_title, 'subject': PRINT_INSTRUCTIONS})
        from pdf_lossless import optimize_rgb_images
        optimize_rgb_images(output, (root / 'generated').glob('*.png'))
        output.save(printed, garbage=4, deflate=True)
    # Publication is a required barrier: never claim print readiness before upload.
    if print_ready:
        print_ready(str(printed))
    reader_html = None
    try:
        reader_html = generate_quick_html(printed, generator.book_title)
    except Exception:
        if not print_ready:
            raise
        import logging
        logging.getLogger(__name__).exception('HTML failed; published A3 remains available')
    manifest = {'format': 'quick-a4-v2-original-design', 'reader_pages': 24,
                'print_sides': 12, 'sheets': 6, 'image_size': IMAGE_SIZE,
                'quality': 'high', 'imposition': sheet_pairs(), 'instructions': PRINT_INSTRUCTIONS}
    printed.with_name('print-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return str(printed), str(reader_html) if reader_html else None


def generate_quick_html(printed, title):
    """Rebuild reading order from A3, in memory; also supports HTML-only retries."""
    import base64
    from build_cssflip_flipbook import generate_html
    images = [None] * PAGE_COUNT
    with fitz.open(printed) as doc:
        for sheet, (a, b, c, d) in enumerate(sheet_pairs()):
            for side, pair in enumerate([(a, b), (c, d)]):
                page = doc[2 * sheet + side]
                for half, number in enumerate(pair):
                    clip = fitz.Rect(half * page.rect.width/2, 0,
                                     (half+1) * page.rect.width/2, page.rect.height)
                    pix = page.get_pixmap(matrix=fitz.Matrix(150/72, 150/72), clip=clip)
                    images[number-1] = 'data:image/jpeg;base64,' + base64.b64encode(
                        pix.tobytes('jpeg', jpg_quality=95)).decode('ascii')
    path = Path(printed).with_name('quick-book-a4-reader.html')
    path.write_text(generate_html(images, title=title, page_ratio=A4[0]/A4[1]), encoding='utf-8')
    return path
