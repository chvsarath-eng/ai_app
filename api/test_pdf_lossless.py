import tempfile
import unittest
from pathlib import Path

import fitz
from PIL import Image
from pdf_lossless import optimize_rgb_images


class LosslessPdfTests(unittest.TestCase):
    def test_original_png_stream_preserves_pixels_and_text(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'art.png'
            image = Image.new('RGB', (480, 640))
            image.putdata([(x % 256, y % 256, (x+y) % 256) for y in range(640) for x in range(480)])
            image.save(path)
            with fitz.open() as doc:
                page = doc.new_page()
                page.insert_image(fitz.Rect(0, 0, 200, 300), filename=str(path))
                page.insert_text((20, 330), 'Vector text stays selectable')
                image_xref = page.get_images()[0][0]
                before = fitz.Pixmap(doc, image_xref).samples
                self.assertGreater(optimize_rgb_images(doc, [path]), 0)
                self.assertEqual(fitz.Pixmap(doc, image_xref).samples, before)
                self.assertIn('Vector text stays selectable', page.get_text())
                output = Path(directory) / 'result.pdf'
                doc.save(output, deflate=True)
            with fitz.open(output) as saved:
                self.assertEqual(fitz.Pixmap(saved, saved[0].get_images()[0][0]).samples, before)


if __name__ == '__main__':
    unittest.main()
