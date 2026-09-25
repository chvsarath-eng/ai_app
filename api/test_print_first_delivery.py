"""Delivery ordering/failure tests: real worker orchestration, fake external services."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

import story_fastapi as api


class PrintFirstDeliveryTests(unittest.TestCase):
    def run_delivery(self, fail_html=False, fail_pdf=False, fail_after_pdf=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pdf, html = root / 'print.pdf', root / 'reader.html'
            pdf.write_bytes(b'%PDF-test')
            html.write_text('reader')
            job_id = 'print-first-test'
            api._JOBS[job_id] = {'job_dir': str(root), 'status': 'queued'}
            uploads = []

            def upload(**kw):
                uploads.append(kw['name'])
                if (fail_html and kw['name'] == 'storybook.html') or (fail_pdf and kw['name'] == 'storybook.pdf'):
                    raise RuntimeError('simulated storage failure')
                return 'gs://test/' + kw['name']

            def pipeline(**kw):
                kw['progress_cb']('print_pdf_ready', {'pdf_path': str(pdf)})
                live = json.loads(api.get_job(job_id).body)
                self.assertEqual(live['status'], 'running')
                self.assertEqual(live['signed_urls']['pdf'], 'https://example.test/print.pdf')
                self.assertNotIn('storybook.html', uploads)
                if fail_after_pdf:
                    raise RuntimeError('secondary pipeline failure')
                return {'pdf_path': str(pdf), 'html_path': str(html), 'timing': {}}

            with patch('firestore_state.ProjectStateWriter', return_value=MagicMock()), \
                 patch.object(api.story_api, 'generate_ebook_html_bundle_v2', side_effect=pipeline), \
                 patch.object(api, '_jobs_bucket_name', return_value='test'), \
                 patch.object(api, '_gcs_upload_file', side_effect=upload), \
                 patch.object(api, '_gcs_generate_signed_url', return_value='https://example.test/print.pdf'), \
                 patch.object(api, '_gcs_write_json'):
                api._run_ebook_job(job_id=job_id, job_dir=root, story_prompt='test',
                    face_image_path='face.jpg', face_image_paths=['face.jpg'], pricing=None,
                    keep_job_dir=True, email=None, output_type='QUICK_BOOK', use_v2=True)
            result = api._JOBS.pop(job_id)
            return result, uploads

    def test_pdf_published_before_html_and_uploaded_once(self):
        job, uploads = self.run_delivery()
        self.assertEqual(job['status'], 'succeeded')
        self.assertEqual(uploads, ['storybook.pdf', 'storybook.html'])
        self.assertEqual(job['result']['digital_status'], 'ready')

    def test_html_upload_failure_keeps_pdf_success(self):
        job, _ = self.run_delivery(fail_html=True)
        self.assertEqual(job['status'], 'succeeded')
        self.assertEqual(job['result']['digital_status'], 'failed')
        self.assertIn('pdf', job['result']['signed_urls'])

    def test_secondary_pipeline_failure_preserves_print(self):
        job, _ = self.run_delivery(fail_after_pdf=True)
        self.assertEqual(job['status'], 'succeeded')
        self.assertEqual(job['result']['digital_status'], 'failed')
        self.assertIn('pdf', job['result']['signed_urls'])

    def test_pdf_upload_failure_never_claims_print_ready(self):
        job, _ = self.run_delivery(fail_pdf=True)
        self.assertEqual(job['status'], 'failed')
        self.assertNotIn('print_ready_at', job)


if __name__ == '__main__':
    unittest.main()
