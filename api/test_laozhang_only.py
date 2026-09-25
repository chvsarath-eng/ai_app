import base64
import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from PIL import Image
import imggen

class LaoZhangOnlyTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            'LAOZHANG_API_KEY': 'test-laozhang', 'OPENAI_API_KEY': 'test-openai',
            'IMAGE_API_BASE': 'https://api.openai.com/v1', 'IMAGE_API_FALLBACK': '1',
            'IMAGE_API_FALLBACK_BASE': 'https://other.invalid/v1', 'IMAGE_API_FALLBACK_KEY': 'other',
            'IMAGE_MODEL': 'gpt-image-2.5-flare', 'IMAGE_PROVIDER': 'gemini'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_stale_overrides_cannot_change_host_model_or_provider(self):
        self.assertEqual(imggen._image_endpoints(), [('primary', 'https://api2.laozhang.ai/v1', 'test-laozhang')])
        for sku in ['QUICK_BOOK', 'DIGI_BOOK', 'LULU_BOOK']:
            self.assertEqual(imggen.resolve_image_model('page', 'old-model', sku), 'gpt-image-2.5-sunburst-vip')
        self.assertEqual(imggen._get_model_candidates('old-model'), ['gpt-image-2.5-sunburst-vip'])
        self.assertEqual(imggen._resolve_image_provider('gemini'), 'openai_images')

    def test_provider_failure_never_calls_another_route(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source.png'
            Image.new('RGB', (32, 32), 'white').save(source)
            for status in [401, 429, 500, 502, 503, 504]:
                with self.subTest(status=status), patch('imggen.requests.post', return_value=Mock(status_code=status, text='provider unavailable')) as post:
                    with self.assertRaises(RuntimeError):
                        imggen.image_generator('A forest', [str(source)], image_size='2400x3392', image_quality='high')
                    self.assertEqual(post.call_count, 1)
                    self.assertEqual(post.call_args.args[0], 'https://api2.laozhang.ai/v1/images/edits')
                    self.assertEqual(post.call_args.kwargs['data']['model'], 'gpt-image-2.5-sunburst-vip')

    def test_high_print_resolution_and_output_bytes_are_preserved(self):
        stream = io.BytesIO()
        Image.new('RGB', (2400, 3392), '#83a79b').save(stream, format='PNG')
        original = stream.getvalue()
        response = Mock(status_code=200)
        response.json.return_value = {'data': [{'b64_json': base64.b64encode(original).decode()}]}
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'source.png'
            Image.new('RGB', (32, 32), 'white').save(source)
            output = Path(directory) / 'page.png'
            with patch('imggen.requests.post', return_value=response) as post:
                imggen.image_generator('Original scene prompt', [str(source)], str(output), image_labels=['Original face'],
                    image_model='old-model', image_provider='gemini', image_size='2400x3392', image_quality='high', output_type='QUICK_BOOK')
            form = post.call_args.kwargs['data']
            self.assertEqual((form['size'], form['quality'], form['output_format']), ('2400x3392', 'high', 'png'))
            self.assertIn('Original scene prompt', form['prompt'])
            self.assertEqual(output.read_bytes(), original)
            with Image.open(output) as image:
                self.assertEqual(image.size, (2400, 3392))

if __name__ == '__main__':
    unittest.main()
