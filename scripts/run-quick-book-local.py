"""Isolated local web/API acceptance environment; real providers, no customer emails."""
import os
import subprocess
import sys
from pathlib import Path
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp' / 'quick-e2e'
OUT.mkdir(exist_ok=True)
api = {**os.environ, **{k: v for k, v in dotenv_values(ROOT / 'api/.env').items() if v is not None}}
api.update(PYTHONIOENCODING='utf-8', PYTHONUNBUFFERED='1', FIRESTORE_ENABLED='false', STORY_JOBS_DIR=str(OUT / 'jobs'),
           IMAGE_API_BASE='https://api2.laozhang.ai/v1', SMTP_HOST='', SMTP_USER='', SMTP_PASSWORD='', SMTP_PASS='')
web = {**os.environ, **{k: v for f in ['web/.env', 'web/.env.local'] for k, v in dotenv_values(ROOT / f).items() if v is not None}}
auth_mode = 'firebase' if '--firebase-auth' in sys.argv else 'local'
web.update(AUTH_MODE=auth_mode, NEXT_PUBLIC_AUTH_MODE=auth_mode, DATA_BACKEND='local',
           LOCAL_RAZORPAY_INR='true',
           NEXT_LOCAL_DIST_DIR='.next-quick-local',
           LOCAL_DATA_DIR=str(OUT / 'data'), STORY_SERVICE_URL='http://127.0.0.1:8011',
           UPLOADS_BUCKET=api['JOBS_BUCKET'], SESSION_SECRET='quick-book-isolated-local-acceptance',
           SMTP_HOST='', SMTP_USER='', SMTP_PASS='')
assert web['RAZORPAY_KEY_ID'].startswith('rzp_test_')
children = []
try:
    for name, command, cwd, env in [
        ('api', [sys.executable, '-m', 'uvicorn', 'story_fastapi:app', '--host', '127.0.0.1', '--port', '8011'], ROOT / 'api', api),
        ('web', ['node', 'node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3011'], ROOT / 'web', web),
    ]:
        if '--web-only' in sys.argv and name == 'api':
            continue
        if '--api-only' in sys.argv and name == 'web':
            continue
        log = open(OUT / f'{name}.log', 'w', encoding='utf-8')
        children.append(subprocess.Popen(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT))
        print(name, 'PID', children[-1].pid, flush=True)
    for child in children:
        child.wait()
finally:
    for child in children:
        child.terminate()
