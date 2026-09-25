"""Offline V2 routing, resume and failure checks; all provider calls are mocked."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

import story_api
import quick_book_jobs
from test_quick_book import sample_story


class QuickPipelineTests(unittest.TestCase):
    def test_native_high_images_and_resume_without_regeneration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            story = sample_story(root)
            source = root / 'face.jpg'
            Image.new('RGB', (64, 64), 'white').save(source)
            calls = []

            def generate(**kwargs):
                calls.append(kwargs)
                w, h = map(int, kwargs['image_size'].split('x'))
                Image.new('RGB', (w, h), '#d9e8dc').save(kwargs['output_filename'])
                return {'images': [kwargs['output_filename']], 'model': kwargs['image_model'],
                        'api_base': 'https://api2.laozhang.ai/v1', 'cost': {'usd': .03}}

            options = dict(job_dir=str(root), story_prompt='A river adventure',
                           face_image_paths=[str(source)], model_provider='openai',
                           output_type='QUICK_BOOK', image_params={'model': 'wrong-model', 'quality': 'low'})
            with patch('story_api.Story_content_generator_v2', return_value={'text': json.dumps(story), 'usage': {}}) as writer, \
                 patch('imggen.image_generator', side_effect=generate):
                first = story_api.generate_ebook_html_bundle_v2(**options)
                self.assertEqual(writer.call_args.kwargs['output_type'], 'QUICK_BOOK')
                self.assertGreaterEqual(len(calls), 12)
                for call in calls:
                    self.assertEqual(call['image_model'], 'gpt-image-2.5-sunburst-vip')
                    self.assertEqual(call['image_quality'], 'high')
                    self.assertEqual(call['image_provider'], 'openai_images')
                    self.assertEqual(call['image_size'], '1024x1024' if call['task_type'] == 'character' else '2400x3392')
                    self.assertIsNotNone(call['deadline'])
                count = len(calls)
                second = story_api.generate_ebook_html_bundle_v2(**options)
                self.assertEqual(len(calls), count)
                self.assertEqual(writer.call_count, 1)
                self.assertEqual(first['pdf_path'], second['pdf_path'])
                self.assertTrue(Path(second['html_path']).exists())
                (root / 'generated' / 'page_7.png').unlink()
                story_api.generate_ebook_html_bundle_v2(**options)
                self.assertEqual(len(calls), count+1)
                self.assertTrue(calls[-1]['output_filename'].endswith('page_7.png'))
                self.assertEqual(writer.call_count, 1)

    def test_wrong_word_count_is_repaired_before_images(self):
        with tempfile.TemporaryDirectory() as directory:
            valid = sample_story(directory)
            story = json.loads(json.dumps(valid))
            story['pages'][0]['story'] = ''
            class Response:
                content = json.dumps({'pages': [valid['pages'][0]]})
            class Model:
                def invoke(self, messages):
                    assert 'not an exact word count' in messages[0].content
                    return Response()
            with patch('strgen._build_llm', return_value=Model()):
                repaired = story_api._expand_short_page_stories(story, model_provider='openai', model='test', quick_book=True)
            self.assertEqual(repaired['pages'][0]['story'], valid['pages'][0]['story'])

    def test_invalid_scene_repair_has_a_bounded_failure(self):
        from types import SimpleNamespace
        story = {'pages': [{'page_number': 1, 'story': ''}]}
        with patch('strgen._build_llm') as builder:
            builder.return_value.invoke.return_value = SimpleNamespace(content=json.dumps(story))
            with self.assertRaisesRegex(ValueError, 'after repair: scene 1'):
                story_api._expand_short_page_stories(story, model_provider='openai', model='test', quick_book=True)
            self.assertEqual(builder.return_value.invoke.call_count, 2)

    def test_missing_back_cover_copy_is_repaired_automatically(self):
        valid = {'back_cover_hook': 'A bridge, a brave friend, and an unexpected adventure await.',
                 'back_cover_blurb': 'Join Maya beside a winding river, where helping a stranded fox opens the way to a surprising adventure filled with courage, friendship, and discovery.'}
        from types import SimpleNamespace
        from unittest.mock import Mock
        model = Mock()
        model.invoke.return_value = SimpleNamespace(content=json.dumps(valid))
        story = {'book': {'title': 'Maya'}, 'pages': [{'story': 'Maya rescues a fox.'}]}
        with patch('strgen._build_llm', return_value=model):
            story_api._ensure_quick_cover_copy(story, model_provider='openai', model='test')
            self.assertEqual(story['book']['back_cover_blurb'], valid['back_cover_blurb'])
            story_api._ensure_quick_cover_copy(story, model_provider='openai', model='test')
            self.assertEqual(model.invoke.call_count, 1)

    def test_partial_repair_retries_only_invalid_scene(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        with tempfile.TemporaryDirectory() as directory:
            story = sample_story(directory)
            valid = story['pages'][0]['story']
            story['pages'][0]['story'] = ''
            model = Mock()
            model.invoke.side_effect = [
                SimpleNamespace(content=json.dumps({'pages': [{'page_number': 1, 'story': ''}]})),
                SimpleNamespace(content=json.dumps({'pages': [{'page_number': 1, 'story': valid}]}))]
            with patch('strgen._build_llm', return_value=model):
                result = story_api._expand_short_page_stories(story, model_provider='openai', model='test', quick_book=True)
            self.assertEqual(result['pages'][0]['story'], valid)
            self.assertEqual(model.invoke.call_count, 2)
            self.assertEqual(len(json.loads(model.invoke.call_args.args[0][1].content)['pages']), 1)

    def test_duplicate_local_worker_is_rejected(self):
        with patch('quick_book_jobs._bucket', return_value=None):
            acquired, lease = quick_book_jobs.acquire('test-quick-lease')
            self.assertTrue(acquired)
            try:
                self.assertFalse(quick_book_jobs.acquire('test-quick-lease')[0])
            finally:
                quick_book_jobs.release('test-quick-lease', lease)
            acquired, lease = quick_book_jobs.acquire('test-quick-lease')
            self.assertTrue(acquired)
            quick_book_jobs.release('test-quick-lease', lease)

    def test_deadline_stops_before_provider_call(self):
        import time
        import imggen
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)/'face.png'
            Image.new('RGB', (64, 64)).save(source)
            with patch('imggen._image_endpoints', return_value=[('primary', 'https://api2.laozhang.ai/v1', 'fake')]), \
                 patch('imggen.requests.post') as request:
                with self.assertRaises(TimeoutError):
                    imggen.image_generator('portrait', [str(source)], image_provider='openai_images', deadline=time.monotonic()-1)
                request.assert_not_called()


if __name__ == '__main__':
    unittest.main()
