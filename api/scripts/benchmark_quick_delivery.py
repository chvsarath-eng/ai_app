"""Explicit real-provider local acceptance benchmark; no checkout/payment mutation."""
import argparse
import json
import time
from pathlib import Path

import requests


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--photo', required=True)
    parser.add_argument('--report', required=True)
    parser.add_argument('--base', default='http://127.0.0.1:8011')
    args = parser.parse_args()
    report = Path(args.report)
    started = time.time()
    with open(args.photo, 'rb') as photo:
        response = requests.post(args.base + '/generate-ebook-async',
            files={'images': ('face.jpeg', photo, 'image/jpeg')},
            data={'story_prompt': 'Rahul follows a mountain river to repair a village water gate. A realistic photographic adventure with safe exploration, practical teamwork with no other named characters, and a warm ending.',
                  'character_metadata': json.dumps([{'name': 'Rahul', 'age': 31, 'gender': 'male', 'relationship': 'main'}]),
                  'output_type': 'QUICK_BOOK', 'keep_job_dir': 'true',
                  'model_provider': 'openai', 'model': 'gpt-6-luna'}, timeout=90)
    response.raise_for_status()
    job = response.json()['job_id']
    data = {'job_id': job, 'request_started_at': started, 'events': []}
    report.write_text(json.dumps(data, indent=2))
    print('JOB', job, flush=True)
    last_stage, checked = None, False
    while time.time() - started < 1200:
        response = requests.get(args.base + '/jobs/' + job, timeout=45)
        response.raise_for_status()
        status = response.json()
        stage = status.get('stage') or status['status']
        if stage != last_stage:
            data['events'].append({'stage': stage, 'observed_at': time.time(), 'elapsed_s': time.time()-started})
            print(stage, round(time.time()-started, 2), flush=True)
            last_stage = stage
        url = (status.get('signed_urls') or {}).get('pdf')
        if url and not checked:
            with requests.get(url, headers={'Range': 'bytes=0-1023'}, stream=True, timeout=60) as download:
                download.raise_for_status()
                assert next(download.iter_content(1024)).startswith(b'%PDF-')
            data['download_verified_s'] = time.time()-started
            data['status_when_pdf_available'] = status['status']
            checked = True
            print('PDF_DOWNLOAD_VERIFIED', round(data['download_verified_s'], 2), status['status'], flush=True)
        report.write_text(json.dumps(data, indent=2))
        if status['status'] in ('succeeded', 'failed'):
            data.update({k: status.get(k) for k in ('status', 'timing', 'print_ready_s', 'print_upload_s', 'digital_status', 'error')})
            data['total_observed_s'] = time.time()-started
            report.write_text(json.dumps(data, indent=2))
            print(json.dumps(data, indent=2), flush=True)
            if status['status'] != 'succeeded' or not checked:
                raise RuntimeError('Quick Book acceptance failed')
            return
        time.sleep(3)
    raise TimeoutError('Quick Book benchmark exceeded 20 minutes')


if __name__ == '__main__':
    main()
