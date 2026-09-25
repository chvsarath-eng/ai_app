"""Offline geometry, layout, and preflight tests. No paid model requests."""
import copy
import tempfile
import unittest
from pathlib import Path

import fitz
from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import A4, A3, landscape

from quick_book import generate_quick_book, sheet_pairs, impose_booklet


def sample_story(root):
    root = Path(root)
    (root / 'generated').mkdir(parents=True, exist_ok=True)
    image = Image.new('RGB', (2400, 3392), '#d9e8dc')
    draw = ImageDraw.Draw(image)
    draw.ellipse((100, 300, 2100, 2300), fill='#efcb80')
    draw.polygon([(0, 3392), (0, 2250), (1200, 1400), (2400, 2500), (2400, 3392)], fill='#547d6b')
    draw.text((250, 260), 'LAYOUT PROOF - PLACEHOLDER ART', fill='#283c33', font_size=72)
    image.save(root / 'generated' / 'proof.png')
    paragraphs = [
        'Maya stopped beside the old wooden bridge and listened to the water below. '
        'A small boat had caught against a fallen branch. Inside it, a frightened fox '
        'held a bright yellow scarf between its paws. Maya took a slow breath. She '
        'wanted to help, but first she needed to find a safe way down the muddy bank.',
        'She walked along the path until she found three broad stone steps. The last '
        'step was wet, so she stayed on the dry one above it. "I can see you," she '
        'called gently. "Stay in your boat." The fox lifted its head. Its ears stopped '
        'shaking, and it watched her with wide, hopeful eyes across the narrow stream.',
        'Nearby, a long rope hung from a post. Maya checked that one end was tied '
        'firmly, then lowered the other end toward the boat. Her first try fell short. '
        'She pulled the rope back, moved her hands farther apart, and tried again. '
        'This time the loop landed beside the fox, who slipped it over the wooden seat.',
        'Maya pulled slowly, resting whenever her arms grew tired. At last the boat '
        'touched the steps. The fox climbed out and wrapped its scarf around her wrist. '
        '"For my brave friend," it said. Maya smiled. Across the bridge, a silver bell '
        'began to ring. Together they turned toward the sound, ready to discover who '
        'was waiting on the other side. The fox squeezed her hand, and they crossed '
        'the bridge together while the sun warmed their shoulders.'
    ]
    text = '\n\n'.join(paragraphs)
    assert 240 <= len(text.split()) <= 280, len(text.split())
    return {'book': {'title': 'Maya and the River of Wonders', 'output_image': 'generated/proof.png', 'back_cover_hook': 'A bridge, a brave friend, and an unexpected adventure await.', 'back_cover_blurb': 'Join Maya beside a winding river, where helping a stranded fox opens the way to a surprising adventure filled with courage, friendship, and discovery.'},
            'characters': [{'name': 'Maya', 'source': 'photo'}],
            'pages': [{'page_number': n, 'story': text, 'output_image': 'generated/proof.png'}
                      for n in range(1, 11)]}


class QuickBookTests(unittest.TestCase):
    def test_imposition_recovers_reading_order(self):
        pairs = sheet_pairs()
        self.assertEqual(pairs[0], (24, 1, 2, 23))
        self.assertEqual(pairs[-1], (14, 11, 12, 13))
        self.assertEqual(sorted(n for pair in pairs for n in pair), list(range(1, 25)))
        # Simulate a folded nested signature: outer rectos, centre, then reverse versos.
        reading = [n for a,b,c,d in pairs for n in (b,c)]
        reading += [n for a,b,c,d in reversed(pairs) for n in (d,a)]
        self.assertEqual(reading, list(range(1, 25)))

    def test_render_and_preflight(self):
        with tempfile.TemporaryDirectory() as directory:
            story = sample_story(directory)
            pdf, reader_html = generate_quick_book(story, directory)
            with fitz.open(pdf) as document:
                self.assertEqual(len(document), 12)
                for page in document:
                    self.assertAlmostEqual(page.rect.width, landscape(A3)[0], places=2)
                    self.assertAlmostEqual(page.rect.height, landscape(A3)[1], places=2)
            self.assertFalse(Path(pdf).with_name('quick-book-a4-reader.pdf').exists())
            with fitz.open(pdf) as document:
                all_text = ''.join(page.get_text() for page in document)
                self.assertIn('Maya stopped', all_text)
                self.assertIn('other side.', all_text)
                self.assertTrue(any('DejaVu' in f[3] for page in document for f in page.get_fonts(full=True)))
            content = Path(reader_html).read_text(encoding='utf-8')
            self.assertIn('class="sheet', content)
            self.assertIn('rotateY', content)
            self.assertIn('ambient-bg', content)

    def test_dimensions_are_per_book_and_legacy_stays_square(self):
        import json
        from lulu_digi_book_maker import FastLuluBookGenerator, INTERIOR_PAGE_WIDTH
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            story_path = root / 'story.json'
            story_path.write_text(json.dumps(sample_story(root)), encoding='utf-8')
            quick = FastLuluBookGenerator(story_path, root/'generated', root, output_type='QUICK_BOOK', upload_outputs=False)
            legacy = FastLuluBookGenerator(story_path, root/'generated', root, output_type='DIGI_BOOK', upload_outputs=False)
            self.assertAlmostEqual(quick.page_width, A4[0])
            self.assertEqual(legacy.page_width, INTERIOR_PAGE_WIDTH)
            self.assertEqual(legacy.page_width, legacy.page_height)
            self.assertNotEqual(quick.page_width, quick.page_height)

    def test_imposition_moves_real_page_content(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory)/'source.pdf', Path(directory)/'print.pdf'
            with fitz.open() as document:
                for number in range(1, 25):
                    page = document.new_page(width=A4[0], height=A4[1])
                    page.insert_text((60, 60), f'LOGICAL_{number:02d}')
                document.save(source)
            impose_booklet(source, target)
            with fitz.open(target) as document:
                expected = [pair for a,b,c,d in sheet_pairs() for pair in ((a,b),(c,d))]
                for page, (left,right) in zip(document, expected):
                    words = page.get_text('words')
                    self.assertEqual([w[4] for w in words], [f'LOGICAL_{left:02d}',f'LOGICAL_{right:02d}'])
                    self.assertAlmostEqual(words[0][0], 60, places=2)
                    self.assertLess(words[0][0], page.rect.width/2)
                    self.assertGreater(words[1][0], page.rect.width/2)


if __name__ == '__main__':
    unittest.main()
