"""Private GCS checkpoints and per-job execution leases for Quick Book retries."""
from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from contextlib import contextmanager

_lock = threading.Lock()
_active = set()
_image_slots = threading.BoundedSemaphore(16)
_client = None


def _bucket():
    global _client
    name = os.getenv('JOBS_BUCKET')
    if not name or os.getenv('JOBS_GCS_DISABLED', '').lower() in ('1', 'true'):
        return None
    from google.cloud import storage
    if _client is None:
        _client = storage.Client()
    return _client.bucket(name)


@contextmanager
def image_slot(deadline):
    """Share image capacity between Quick Books on this worker process."""
    if not _image_slots.acquire(timeout=max(0, deadline-time.monotonic())):
        raise TimeoutError('Quick Book image capacity unavailable within time budget')
    try:
        yield
    finally:
        _image_slots.release()


def checkpoint(job_id, root, paths):
    bucket = _bucket()
    if bucket is None:
        return
    root = Path(root).resolve()
    for path in paths:
        path = Path(path).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError('Invalid checkpoint file')
        relative = path.relative_to(root).as_posix()
        bucket.blob(f'quick-checkpoints/{job_id}/{relative}').upload_from_filename(str(path))


def restore(job_id, root):
    bucket = _bucket()
    if bucket is None:
        return
    root = Path(root).resolve()
    prefix = f'quick-checkpoints/{job_id}/'
    for blob in bucket.list_blobs(prefix=prefix):
        relative = blob.name[len(prefix):]
        target = (root / relative).resolve()
        if not target.is_relative_to(root) or target == root:
            raise ValueError('Invalid checkpoint path')
        target.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(str(target))


def acquire(job_id):
    """Single active worker per job; a crashed worker's cloud lease expires."""
    with _lock:
        if job_id in _active:
            return False, None
        _active.add(job_id)
    try:
        bucket = _bucket()
        if bucket is None:
            return True, None
        from google.api_core.exceptions import PreconditionFailed, NotFound
        blob = bucket.blob(f'quick-leases/{job_id}.json')
        try:
            blob.upload_from_string(json.dumps({'expires': time.time()+1200}), if_generation_match=0)
        except PreconditionFailed:
            try:
                blob.reload()
                generation = blob.generation
                data = json.loads(blob.download_as_text(if_generation_match=generation))
                if data['expires'] > time.time():
                    with _lock:
                        _active.discard(job_id)
                    return False, None
                blob.upload_from_string(json.dumps({'expires': time.time()+1200}), if_generation_match=generation)
            except (PreconditionFailed, NotFound):
                with _lock:
                    _active.discard(job_id)
                return False, None
        return True, blob
    except Exception:
        with _lock:
            _active.discard(job_id)
        raise


def release(job_id, lease):
    try:
        if lease is not None:
            lease.delete(if_generation_match=lease.generation)
    finally:
        with _lock:
            _active.discard(job_id)
