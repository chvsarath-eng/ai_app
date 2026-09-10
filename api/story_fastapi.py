from __future__ import annotations

import json
import os
import shutil
import logging
import time
import threading
import tempfile
from io import BytesIO
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Query
from fastapi.responses import JSONResponse, FileResponse
from starlette.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool

from dotenv import load_dotenv

import story_api

logger = logging.getLogger("story_fastapi")

# Load .env from current working directory (project root when running uvicorn there)
load_dotenv()

_JOBS: Dict[str, Dict[str, Any]] = {}

_GCS_CLIENT = None

_JOB_STATE_FILE = "job_state.json"


def _jobs_root() -> Path:
    """Local root for per-job workspaces (Cloud Run safe: defaults to the temp dir)."""
    return Path(os.getenv("STORY_JOBS_DIR") or tempfile.gettempdir()) / "story_jobs"


def _persist_job_state(job_id: str) -> None:
    """
    Snapshot the in-memory job record to ``<job_dir>/job_state.json``.

    Without a GCS bucket the process memory is the only job index; a restart would
    otherwise turn every finished book into "Job not found" although its files are
    still on disk. Best-effort: never raises.
    """
    job = _JOBS.get(job_id)
    if not job:
        return
    job_dir = job.get("job_dir")
    if not job_dir:
        return
    try:
        path = Path(str(job_dir)) / _JOB_STATE_FILE
        if not path.parent.exists():
            return
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(job, default=str, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, path)
    except Exception as e:  # noqa: BLE001
        logger.warning("Could not persist job state for %s: %s", job_id, e)


def _load_jobs_from_disk() -> int:
    """Rehydrate ``_JOBS`` from ``job_state.json`` files left by a previous process."""
    root = _jobs_root()
    if not root.exists():
        return 0
    loaded = 0
    for state_path in root.glob(f"*/{_JOB_STATE_FILE}"):
        try:
            job = json.loads(state_path.read_text(encoding="utf-8"))
        except Exception as e:  # noqa: BLE001
            logger.warning("Skipping unreadable job state %s: %s", state_path, e)
            continue
        job_id = str(job.get("job_id") or state_path.parent.name)
        if job_id in _JOBS:
            continue
        job["job_dir"] = str(state_path.parent)
        if job.get("status") in ("queued", "running"):
            # The worker thread died with the old process; the job cannot resume.
            job["status"] = "failed"
            job["error"] = {
                "type": "Interrupted",
                "message": "Generation was interrupted by a story service restart.",
                "stage": job.get("stage"),
            }
            job["finished_at"] = job.get("finished_at") or time.time()
        _JOBS[job_id] = job
        loaded += 1
    if loaded:
        logger.info("Rehydrated %d job(s) from %s", loaded, root)
    return loaded


app = FastAPI(
    title="Story Generator API",
    version="1.0.0",
)


@app.on_event("startup")
def _startup_rehydrate_jobs() -> None:
    try:
        _load_jobs_from_disk()
    except Exception as e:  # noqa: BLE001
        logger.warning("Job rehydration failed: %s", e)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


def _image_endpoint_summary() -> List[Dict[str, Any]]:
    """Failover chain for the Images API (labels + bases + model aliases, never keys)."""
    import imggen as _imggen

    try:
        endpoints = _imggen._image_endpoints()
    except Exception as e:  # noqa: BLE001  (missing key etc.)
        return [{"label": "primary", "error": str(e)}]
    cover_model = _imggen.resolve_image_model("cover")
    return [
        {
            "label": label,
            "apiBase": base,
            "models": _imggen._get_model_candidates(cover_model, base),
        }
        for label, base, _key in endpoints
    ]


@app.get("/admin/config")
def admin_config() -> Dict[str, Any]:
    """
    Effective runtime configuration for the web Admin panel (no secrets, only presence flags).
    """
    import imggen as _imggen  # local import keeps startup light

    provider = _imggen._resolve_image_provider(None)
    running = sum(1 for j in _JOBS.values() if j.get("status") in ("queued", "running"))
    return {
        "status": "ok",
        "image": {
            "provider": provider,
            "model": _imggen.resolve_image_model("cover"),
            "modelPages": _imggen.resolve_image_model("page"),
            "apiBase": os.getenv("IMAGE_API_BASE") or _imggen.DEFAULT_IMAGE_API_BASE,
            # Ordered failover chain (e.g. LaoZhang -> api.openai.com) without exposing keys.
            "endpoints": _image_endpoint_summary(),
            "quality": os.getenv("IMAGE_QUALITY") or _imggen.DEFAULT_IMAGE_QUALITY,
            "sizeDigital": _imggen.resolve_image_size("DIGI_BOOK"),
            "sizePrint": _imggen.resolve_image_size("LULU_BOOK"),
            "resolution": os.getenv("IMAGE_RESOLUTION") or None,
            "aspectRatio": os.getenv("IMAGE_ASPECT_RATIO") or None,
            "concurrency": os.getenv("IMAGE_CONCURRENCY") or None,
        },
        "story": {
            "provider": os.getenv("STORY_MODEL_PROVIDER") or os.getenv("MODEL_PROVIDER") or "gemini",
            "model": os.getenv("STORY_MODEL") or os.getenv("MODEL") or None,
        },
        "keys": {
            "laozhang": bool(os.getenv("LAOZHANG_API_KEY") or os.getenv("API_KEY_LAOZHANG")),
            "openai": bool(os.getenv("OPENAI_API_KEY")),
            "gemini": bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")),
            "smtp": bool(os.getenv("SMTP_HOST")),
        },
        "storage": {
            "jobsBucket": _jobs_bucket_name(),
            "firestoreEnabled": (os.getenv("FIRESTORE_ENABLED") or "true").strip().lower() not in ("0", "false", "no", "off"),
        },
        "jobs": {
            "inMemory": len(_JOBS),
            "active": running,
        },
    }


@app.post("/admin/test-image-api")
def admin_test_image_api(model: Optional[str] = Form(None)) -> Dict[str, Any]:
    """
    Lightweight connectivity check against the OpenAI-compatible Images endpoint:
    lists models and reports whether the requested model (or an alias) is available.
    """
    import imggen as _imggen
    import requests as _requests

    base = (os.getenv("IMAGE_API_BASE") or _imggen.DEFAULT_IMAGE_API_BASE).rstrip("/")
    wanted = (model or _imggen.resolve_image_model("cover")).strip()
    try:
        key = _imggen._image_api_key()
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "apiBase": base, "model": wanted}

    t0 = time.time()
    try:
        r = _requests.get(f"{base}/models", headers={"Authorization": f"Bearer {key}"}, timeout=15)
        elapsed_ms = int((time.time() - t0) * 1000)
        if r.status_code != 200:
            return {"ok": False, "status": r.status_code, "error": r.text[:300], "apiBase": base, "model": wanted, "elapsedMs": elapsed_ms}
        data = r.json() if r.content else {}
        ids = [str(m.get("id")) for m in (data.get("data") or []) if isinstance(m, dict)]
        candidates = _imggen._get_model_candidates(wanted, base)
        matched = next((c for c in candidates if c in ids), None)
        return {
            "ok": True,
            "apiBase": base,
            "model": wanted,
            "matchedModel": matched,
            "modelListed": matched is not None,
            "candidates": candidates,
            "failover": _image_endpoint_summary(),
            "imageModelsAvailable": sorted(i for i in ids if "image" in i.lower())[:40],
            "elapsedMs": elapsed_ms,
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e), "apiBase": base, "model": wanted}


def _jobs_bucket_name() -> Optional[str]:
    """
    If set, job status + outputs are persisted to GCS for Cloud Run scalability.
    """
    # Set JOBS_GCS_DISABLED=true to run fully local (no bucket uploads / signed URLs).
    if (os.getenv("JOBS_GCS_DISABLED") or "").strip().lower() in ("1", "true", "yes", "on"):
        return None
    return (os.getenv("JOBS_BUCKET") or os.getenv("STORY_JOBS_BUCKET") or "").strip() or None


def _gcs_client():
    """
    Lazy init to avoid import cost when unused locally.
    Uses Application Default Credentials on Cloud Run.
    """
    global _GCS_CLIENT
    if _GCS_CLIENT is not None:
        return _GCS_CLIENT
    from google.cloud import storage

    _GCS_CLIENT = storage.Client()
    return _GCS_CLIENT


def _gcs_job_prefix(job_id: str) -> str:
    return f"jobs/{job_id}"

def _env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "y", "on")


def _inline_image_max_bytes() -> int:
    raw = os.getenv("INLINE_IMAGE_MAX_BYTES") or "1200000"
    try:
        return max(100000, int(raw))
    except ValueError:
        return 1200000


def _prepare_inline_image_bytes(path: Path, *, max_width: int = 900) -> Optional[bytes]:
    try:
        raw = path.read_bytes()
    except Exception:
        return None

    max_bytes = _inline_image_max_bytes()
    if len(raw) <= max_bytes:
        return raw

    try:
        from PIL import Image
    except Exception:
        return None

    try:
        with Image.open(BytesIO(raw)) as im:
            im = im.convert("RGB")
            if im.width > max_width:
                ratio = max_width / im.width
                new_size = (max_width, max(1, int(im.height * ratio)))
                im = im.resize(new_size, Image.LANCZOS)
            buf = BytesIO()
            im.save(buf, format="JPEG", quality=75, optimize=True, progressive=True)
            data = buf.getvalue()
            if len(data) <= max_bytes:
                return data
            if len(data) < len(raw):
                return data
            return None
    except Exception:
        return None


def _signed_url_expires_days() -> int:
    raw = os.getenv("SIGNED_URL_EXPIRES_DAYS") or "7"
    try:
        days = int(raw)
    except ValueError:
        days = 7
    if days < 1:
        days = 1
    if days > 7:
        days = 7
    return days


def _guess_content_type(path: Path) -> str:
    suf = path.suffix.lower()
    if suf == ".pdf":
        return "application/pdf"
    if suf in (".html", ".htm"):
        return "text/html; charset=utf-8"
    return "application/octet-stream"


def _gcs_write_json(*, job_id: str, name: str, payload: Dict[str, Any]) -> None:
    bucket_name = _jobs_bucket_name()
    if not bucket_name:
        return
    import json as _json

    client = _gcs_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"{_gcs_job_prefix(job_id)}/{name}")
    blob.upload_from_string(
        _json.dumps(payload, ensure_ascii=False),
        content_type="application/json; charset=utf-8",
    )


def _gcs_read_json(*, job_id: str, name: str) -> Optional[Dict[str, Any]]:
    bucket_name = _jobs_bucket_name()
    if not bucket_name:
        return None
    client = _gcs_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"{_gcs_job_prefix(job_id)}/{name}")
    if not blob.exists():
        return None
    data = blob.download_as_bytes()
    import json as _json

    return _json.loads(data.decode("utf-8"))


def _gcs_upload_file(*, job_id: str, name: str, local_path: str, content_type: str) -> str:
    bucket_name = _jobs_bucket_name()
    if not bucket_name:
        raise RuntimeError("JOBS_BUCKET is not set; cannot upload outputs")
    client = _gcs_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"{_gcs_job_prefix(job_id)}/{name}")
    blob.upload_from_filename(local_path, content_type=content_type)
    return f"gs://{bucket_name}/{blob.name}"


def _gcs_generate_signed_url(
    *,
    job_id: str,
    name: str,
    expires_days: int,
    filename: Optional[str] = None,
) -> str:
    bucket_name = _jobs_bucket_name()
    if not bucket_name:
        raise RuntimeError("JOBS_BUCKET is not set; cannot sign URLs")
    client = _gcs_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"{_gcs_job_prefix(job_id)}/{name}")
    response_disposition = f'attachment; filename="{filename or Path(name).name}"'
    return blob.generate_signed_url(
        version="v4",
        expiration=timedelta(days=expires_days),
        method="GET",
        response_disposition=response_disposition,
    )


def _gcs_download_bytes(*, job_id: str, name: str) -> Optional[bytes]:
    bucket_name = _jobs_bucket_name()
    if not bucket_name:
        return None
    client = _gcs_client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"{_gcs_job_prefix(job_id)}/{name}")
    if not blob.exists():
        return None
    return blob.download_as_bytes()


def _save_uploads(files: List[UploadFile], base_dir: Path) -> List[str]:
    base_dir.mkdir(parents=True, exist_ok=True)
    saved: List[str] = []

    for f in files:
        # Prefer original name; ensure uniqueness
        name = (f.filename or "image").strip() or "image"
        safe_name = name.replace("\\", "_").replace("/", "_")
        out_path = base_dir / safe_name
        if out_path.exists():
            out_path = base_dir / f"{out_path.stem}_{uuid4().hex}{out_path.suffix}"

        try:
            with out_path.open("wb") as dst:
                shutil.copyfileobj(f.file, dst)
        finally:
            try:
                f.file.close()
            except Exception:
                pass

        saved.append(str(out_path))

    return saved


def _save_face_upload_as_standard_name(file: UploadFile, job_dir: Path) -> str:
    """
    Save the user uploaded face image as:
      <job_dir>/input_images/original_face.jpeg

    Converts to JPEG (RGB) for consistency across models.
    """
    from PIL import Image, ImageOps

    input_dir = job_dir / "input_images"
    input_dir.mkdir(parents=True, exist_ok=True)
    out_path = input_dir / "original_face.jpeg"

    raw = file.file.read()

    try:
        from io import BytesIO

        with Image.open(BytesIO(raw)) as im:
            im = ImageOps.exif_transpose(im)
            if im.mode != "RGB":
                im = im.convert("RGB")
            im.save(out_path, format="JPEG", quality=95, optimize=True)
    finally:
        try:
            file.file.close()
        except Exception:
            pass

    return str(out_path)


def _run_story_job(
    *,
    job_id: str,
    story_prompt: str,
    image_paths: List[str],
    output_dir: str,
    save_files: bool,
    pricing: Optional[story_api.GeminiTokenPricing],
    keep_uploads: bool,
    upload_dir: Path,
) -> None:
    started_at = time.time()
    _JOBS[job_id]["status"] = "running"
    _JOBS[job_id]["started_at"] = started_at
    _gcs_write_json(
        job_id=job_id,
        name="status.json",
        payload={"job_id": job_id, "status": "running", "started_at": started_at},
    )

    try:
        result: Dict[str, Any] = story_api.generate_story_json_with_cost(
            story_prompt=story_prompt,
            image_paths=image_paths,
            output_dir=output_dir,
            save_files=save_files,
            pricing=pricing,
        )
        result["request_id"] = job_id
        result["input_images_count"] = len(image_paths)
        result["status"] = "succeeded"

        _JOBS[job_id]["status"] = "succeeded"
        _JOBS[job_id]["result"] = result
        _gcs_write_json(job_id=job_id, name="status.json", payload={"job_id": job_id, "status": "succeeded", "result": result})
    except Exception as e:
        logger.exception("job_id=%s failed: %s", job_id, e)
        _JOBS[job_id]["status"] = "failed"
        _JOBS[job_id]["error"] = {"type": e.__class__.__name__, "message": str(e)}
        # Best-effort: if a raw output file was written locally, upload it for debugging.
        try:
            if _jobs_bucket_name():
                p = Path("last_story_raw.txt")
                if p.exists():
                    uri = _gcs_upload_file(
                        job_id=job_id,
                        name="last_story_raw.txt",
                        local_path=str(p),
                        content_type="text/plain; charset=utf-8",
                    )
                    _JOBS[job_id]["error"]["debug_gcs_uri"] = uri
        except Exception:
            pass
        _gcs_write_json(
            job_id=job_id,
            name="status.json",
            payload={"job_id": job_id, "status": "failed", "error": _JOBS[job_id]["error"]},
        )
    finally:
        _JOBS[job_id]["finished_at"] = time.time()
        _JOBS[job_id]["duration_s"] = _JOBS[job_id]["finished_at"] - started_at
        _persist_job_state(job_id)

        if not keep_uploads:
            try:
                shutil.rmtree(upload_dir, ignore_errors=True)
            except Exception:
                pass


def _run_ebook_job(
    *,
    job_id: str,
    job_dir: Path,
    story_prompt: str,
    face_image_path: str,
    face_image_paths: Optional[List[str]] = None,
    character_metadata: Optional[List[Dict[str, Any]]] = None,
    pricing: Optional[story_api.GeminiTokenPricing],
    keep_job_dir: bool,
    email: Optional[str],
    output_type: str = "DIGI_BOOK",
    model_provider: Optional[str] = None,
    model: Optional[str] = None,
    use_v2: bool = False,
    project_id: Optional[str] = None,
    image_params: Optional[Dict[str, Any]] = None,
) -> None:
    from firestore_state import ProjectStateWriter

    state = ProjectStateWriter(project_id, job_id)

    def _render_links_email_html(*, title: str, subtitle: str, items: List[Dict[str, str]], footer: str) -> str:
        # Inline-styles for maximum compatibility (Gmail, iOS Mail, etc.)
        cards = []
        for item in items:
            kind = item.get("kind")
            if kind == "flipbook":
                card_title = "Interactive Web Book"
                card_desc = "Download and open in your browser for an interactive reading experience."
            else:
                card_title = "Printable PDF"
                card_desc = "Best for standard reading and printing across all devices."
            
            cards.append(
                f"""
            <tr>
              <td style="padding:12px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #eef0f4;border-radius:12px;text-align:center;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <div style="font-size:14px;font-weight:700;color:#111827;font-family:Arial,Helvetica,sans-serif;">{card_title}</div>
                      <div style="margin-top:4px;font-size:12px;color:#6b7280;font-family:Arial,Helvetica,sans-serif;">{card_desc}</div>
                      <div style="margin-top:10px;">
                        <a href="{item['url']}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;
                           padding:10px 16px;border-radius:10px;font-weight:700;font-family:Arial,Helvetica,sans-serif;
                           box-shadow:0 8px 18px rgba(17,24,39,0.12);letter-spacing:0.2px;">
                          {item['label']}
                        </a>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            """
            )
        cards_html = "\n".join(cards)
        links = "\n".join(
            f'<div style="margin-top:6px;"><a href="{item["url"]}" style="color:#2563eb;text-decoration:underline;">{item["label"]}</a></div>'
            for item in items
        )
        
        has_flipbook = any(item.get("kind") == "flipbook" for item in items)
        apple_instructions_html = ""
        if has_flipbook:
            apple_instructions_html = """
                <div style="margin-top:10px;padding:14px 16px;background:#ffffff;border:1px solid #eef0f4;border-radius:10px;text-align:center;">
                  <div style="margin-top:6px;">
                    <img src="cid:apple-instructions" alt="Apple HTML instructions" style="display:inline-block;width:100%;max-width:560px;border:0;outline:none;text-decoration:none;border-radius:8px;">
                  </div>
                </div>
            """
            
        return f"""<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f7f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7f7fb;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #eceef3;box-shadow:0 14px 34px rgba(17,24,39,0.08);">
            <tr>
              <td style="padding:18px 22px;background:#ffffff;color:#111827;border-bottom:1px solid #eef0f4;" align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td align="center">
                      <img src="cid:img2x-logo" alt="IMG2X" width="180" style="display:inline-block;border:0;outline:none;text-decoration:none;">
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 22px;text-align:center;">
                <div style="font-size:22px;font-weight:800;color:#111827;font-family:Arial,Helvetica,sans-serif;">{title}</div>
                <div style="margin-top:8px;font-size:14px;line-height:1.55;color:#374151;font-family:Arial,Helvetica,sans-serif;">{subtitle}</div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;">
                  {cards_html}
                </table>
                {apple_instructions_html}
                <div style="margin-top:12px;font-size:12px;color:#6b7280;font-family:Arial,Helvetica,sans-serif;">
                  If the buttons don't work, use the links below:
                  {links}
                </div>

                <div style="margin-top:18px;font-size:12px;color:#6b7280;font-family:Arial,Helvetica,sans-serif;">
                  {footer}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""

    def _maybe_send_email(*, to_email: str, items: List[Dict[str, str]], expires_days: int) -> str:
        """
        Minimal email sender (no external deps).
        Enable by setting env vars:
          SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
          SMTP_TLS=true|false (default true)
          SMTP_SSL=true|false (default false)
          SMTP_DEBUG=true|false (default false; logs SMTP conversation)
        
        Returns status: 'sent', 'skipped_no_smtp_config', 'skipped_no_links'
        Raises exception on SMTP failure.
        """
        import smtplib
        from email.message import EmailMessage
        from email.utils import formataddr

        if not items:
            logger.warning("Email requested but no signed URLs available; skipping send.")
            return "skipped_no_links"

        host = os.getenv("SMTP_HOST")
        port = int(os.getenv("SMTP_PORT") or "587")
        user = os.getenv("SMTP_USER")
        password = os.getenv("SMTP_PASSWORD")
        from_email = os.getenv("SMTP_FROM") or user
        from_name = os.getenv("SMTP_FROM_NAME") or "IMG2X"
        use_tls = _env_bool("SMTP_TLS", True)
        use_ssl = _env_bool("SMTP_SSL", False)
        smtp_debug = _env_bool("SMTP_DEBUG", False)

        if use_ssl and use_tls:
            logger.warning("SMTP_TLS ignored because SMTP_SSL is enabled.")
            use_tls = False

        logger.info(
            "SMTP config job_id=%s host=%s port=%s tls=%s ssl=%s user=%s from=%s to=%s items=%d has_password=%s",
            job_id,
            host,
            port,
            use_tls,
            use_ssl,
            user,
            from_email,
            to_email,
            len(items),
            bool(password),
        )

        if not (host and from_email and user and password):
            logger.warning(
                "Email requested but SMTP env vars not set; skipping. host=%s user=%s pass=%s",
                bool(host),
                bool(user),
                bool(password),
            )
            return "skipped_no_smtp_config"

        def _safe_smtp_resp(resp: object) -> str:
            if isinstance(resp, bytes):
                try:
                    return resp.decode("utf-8", "ignore")[:200]
                except Exception:
                    return repr(resp)[:200]
            return str(resp)[:200]

        subject = "Your book files are ready"
        body = (
            "Hi there,\n\n"
            "Your storybook files are ready. Download your files below and save local copies.\n"
            f"These links expire in {expires_days} days.\n\n"
            + "\n".join([f"{item['label']}: {item['url']}" for item in items])
            + "\n\n"
            "Thank you for creating with us,\n"
            "The img2x Team\n"
        )
        body_html = _render_links_email_html(
            title="Your storybook is ready",
            subtitle=f"Download your files below and save local copies. These links expire in {expires_days} days.",
            items=items,
            footer="If you need help, just reply to this email.",
        )

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = formataddr((from_name, from_email))
        msg["To"] = to_email
        msg.set_content(body)
        msg.add_alternative(body_html, subtype="html")
        # Embed IMG2X logo inline (cid) when available
        try:
            logo_path = Path(__file__).resolve().parent / "icon.png"
            if logo_path.exists():
                logo_bytes = logo_path.read_bytes()
                html_part = msg.get_payload()[-1]  # the HTML alternative
                html_part.add_related(
                    logo_bytes,
                    maintype="image",
                    subtype="png",
                    cid="<img2x-logo>",
                    filename="icon.png",
                )
        except Exception:
            pass
        # Embed Apple HTML instructions image inline if available
        try:
            apple_path = Path(__file__).resolve().parent / "appleinst.jpeg"
            if apple_path.exists():
                apple_bytes = _prepare_inline_image_bytes(apple_path)
                if apple_bytes:
                    html_part = msg.get_payload()[-1]  # the HTML alternative
                    html_part.add_related(
                        apple_bytes,
                        maintype="image",
                        subtype="jpeg",
                        cid="<apple-instructions>",
                        filename="appleinst.jpeg",
                    )
        except Exception:
            pass

        def _try_send(use_host: str, use_ssl_mode: bool, use_port: int, use_starttls: bool) -> str:
            """Attempt to send email with specified SSL/TLS configuration."""
            smtp_cls = smtplib.SMTP_SSL if use_ssl_mode else smtplib.SMTP
            logger.info("SMTP connect job_id=%s ssl=%s host=%s port=%s", job_id, use_ssl_mode, use_host, use_port)
            
            with smtp_cls(host=use_host, port=use_port, timeout=30) as s:
                if smtp_debug:
                    logger.warning("SMTP_DEBUG enabled; SMTP conversation will be logged.")
                    s.set_debuglevel(1)
                code, resp = s.ehlo()
                logger.info("SMTP EHLO code=%s resp=%s", code, _safe_smtp_resp(resp))
                
                if use_starttls:
                    logger.info("SMTP STARTTLS begin")
                    code, resp = s.starttls()
                    logger.info("SMTP STARTTLS code=%s resp=%s", code, _safe_smtp_resp(resp))
                    code, resp = s.ehlo()
                    logger.info("SMTP EHLO after STARTTLS code=%s resp=%s", code, _safe_smtp_resp(resp))
                logger.info("SMTP login user=%s", user)

                _auth_mode = (os.getenv("SMTP_AUTH_MODE") or "").strip().upper()

                if _auth_mode == "LOGIN":
                    import base64 as _b64
                    code, resp = s.docmd("AUTH", "LOGIN")
                    if code != 334:
                        raise smtplib.SMTPAuthenticationError(code, resp)
                    code, resp = s.docmd(_b64.b64encode(user.encode("utf-8")).decode("ascii"))
                    if code != 334:
                        raise smtplib.SMTPAuthenticationError(code, resp)
                    code, resp = s.docmd(_b64.b64encode(password.encode("utf-8")).decode("ascii"))
                    if code != 235:
                        raise smtplib.SMTPAuthenticationError(code, resp)
                elif _auth_mode == "PLAIN":
                    import base64 as _b64
                    auth_str = "\x00" + user + "\x00" + password
                    code, resp = s.docmd("AUTH", "PLAIN " + _b64.b64encode(auth_str.encode("utf-8")).decode("ascii"))
                    if code != 235:
                        raise smtplib.SMTPAuthenticationError(code, resp)
                else:
                    s.login(user, password)

                logger.info("SMTP login ok")
                s.send_message(msg)
            logger.info("Sent storybook email to %s via port %d host=%s", to_email, use_port, use_host)
            return "sent" if use_port == port else "sent_via_ssl_fallback"

        # Try primary configuration first
        try:
            return _try_send(host, use_ssl, port, use_tls)
        except smtplib.SMTPAuthenticationError as e:
            logger.error("SMTP auth failed code=%s error=%s", getattr(e, "smtp_code", None), getattr(e, "smtp_error", None))
            
            # Fallback: If using STARTTLS on 587 and it failed, try SSL on 465
            if port == 587 and use_tls and not use_ssl:
                try:
                    return _try_send(host, use_ssl_mode=True, use_port=465, use_starttls=False)
                except smtplib.SMTPAuthenticationError as ssl_err:
                    pass

            _alt_hosts_raw = os.getenv("SMTP_ALT_HOSTS") or ""
            _alt_hosts = [h.strip() for h in _alt_hosts_raw.split(",") if h.strip()]

            for _alt in _alt_hosts:
                try:
                    return _try_send(_alt, use_ssl, port, use_tls)
                except smtplib.SMTPAuthenticationError:
                    # Try SSL fallback for alternate host if using STARTTLS on 587
                    if port == 587 and use_tls and not use_ssl:
                        try:
                            return _try_send(_alt, use_ssl_mode=True, use_port=465, use_starttls=False)
                        except smtplib.SMTPAuthenticationError:
                            continue
                    continue

            # Re-raise original error if all fallbacks failed
            raise e


    def _update_stage(stage: str, extra: Optional[Dict[str, Any]] = None) -> None:
        now = time.time()
        _JOBS[job_id]["stage"] = stage
        _JOBS[job_id]["stage_at"] = now
        payload: Dict[str, Any] = {
            "job_id": job_id,
            "status": _JOBS[job_id].get("status"),
            "stage": stage,
            "updated_at": now,
        }
        if extra:
            payload.update(extra)
        try:
            _gcs_write_json(job_id=job_id, name="status.json", payload=payload)
        except Exception:
            logger.exception("Failed to write status.json for job_id=%s", job_id)
        _persist_job_state(job_id)
        # Skip logging the full story/image payloads.
        if stage in ("story_ready", "image_ready"):
            logger.info("job_id=%s stage=%s keys=%s", job_id, stage, sorted((extra or {}).keys()))
        else:
            logger.info("job_id=%s stage=%s extra=%s", job_id, stage, extra or {})

    def _publish_image(extra: Dict[str, Any]) -> None:
        """Upload a freshly generated image to GCS and expose a signed URL for live preview."""
        saved = str(extra.get("saved_path") or "")
        if not saved or not Path(saved).exists():
            return
        rel = str(extra.get("output_image") or Path(saved).name).replace("\\", "/")
        name = f"images/{Path(rel).name}"
        url: Optional[str] = None
        gcs_uri: Optional[str] = None
        try:
            if _jobs_bucket_name():
                gcs_uri = _gcs_upload_file(
                    job_id=job_id,
                    name=name,
                    local_path=saved,
                    content_type="image/png" if saved.lower().endswith(".png") else "image/jpeg",
                )
                try:
                    url = _gcs_generate_signed_url(
                        job_id=job_id,
                        name=name,
                        expires_days=_signed_url_expires_days(),
                        filename=Path(rel).name,
                    ).replace("attachment%3B", "inline%3B")
                except Exception as e:  # noqa: BLE001
                    logger.warning("Failed to sign preview URL for %s: %s", name, e)
        except Exception as e:  # noqa: BLE001
            logger.warning("Failed to upload preview image %s: %s", name, e)
        # Local fallback: serve the file straight from the job dir so the web app can
        # render live previews without GCS (dev / single-instance deployments).
        if not url:
            url = f"/jobs/{job_id}/images/{Path(rel).name}"
        _JOBS[job_id].setdefault("images", {})[Path(rel).name] = {
            "url": url,
            "gcs_uri": gcs_uri,
            "local_path": saved,
            "type": extra.get("type"),
            "page_number": extra.get("page_number"),
        }
        _JOBS[job_id]["images_done"] = extra.get("done")
        _JOBS[job_id]["images_total"] = extra.get("total")
        state.image_ready(extra, url=url, gcs_path=gcs_uri)

    def _on_progress(stage: str, extra: Optional[Dict[str, Any]] = None) -> None:
        """Progress hook: legacy stage tracking + live Firestore mirroring."""
        extra = extra or {}
        if stage == "story_ready":
            _JOBS[job_id]["story"] = extra
            state.story_ready(extra)
            _update_stage(stage, {"pages": len(extra.get("pages") or []), "title": extra.get("title")})
            return
        if stage == "image_ready":
            _publish_image(extra)
            _update_stage(stage, {"done": extra.get("done"), "total": extra.get("total"), "name": extra.get("name")})
            return
        _update_stage(stage, extra)
        if stage in (
            "story_generation_start", "images_start", "images_phase_start", "images_phase_done",
            "images_done", "pdf_generation_start", "pdf_generation_done", "upload_start",
            "upload_done", "email_done", "email_failed",
        ):
            state.append_stage(stage, extra)

    started_at = time.time()
    _JOBS[job_id]["status"] = "running"
    _JOBS[job_id]["started_at"] = started_at
    _update_stage(
        "job_started",
        {
            "started_at": started_at,
            "output_type": output_type,
            "model_provider": model_provider,
            "model": model,
        },
    )
    state.job_started(output_type=output_type, num_characters=len(face_image_paths or [face_image_path]))

    try:
        if use_v2 and face_image_paths:
            logger.info("job_id=%s using V2 multi-character pipeline (%d characters)", job_id, len(face_image_paths))
            result = story_api.generate_ebook_html_bundle_v2(
                job_dir=str(job_dir),
                story_prompt=story_prompt,
                face_image_paths=face_image_paths,
                character_metadata=character_metadata,
                pricing=pricing,
                output_type=output_type,
                model_provider=model_provider,
                model=model,
                progress_cb=_on_progress,
                image_params=image_params,
            )
        else:
            result = story_api.generate_ebook_html_bundle(
                job_dir=str(job_dir),
                story_prompt=story_prompt,
                face_image_path=face_image_path,
                pricing=pricing,
                output_type=output_type,
                model_provider=model_provider,
                model=model,
                progress_cb=_on_progress,
            )
        result["job_id"] = job_id
        result["email"] = email
        result["output_type"] = output_type
        result["status"] = "succeeded"

        # Upload all artifacts to GCS based on output_type
        gcs_artifacts = {}
        signed_items: List[Dict[str, str]] = []
        signed_urls: Dict[str, str] = {}
        signed_url_errors: List[Dict[str, str]] = []
        expires_days = _signed_url_expires_days()
        _update_stage("upload_start", {"output_type": output_type})
        try:
            if _jobs_bucket_name():
                # Upload story_data.json (contains all story text + image prompts for debugging)
                story_json_local = str(result.get("story_json_path") or "")
                if story_json_local and Path(story_json_local).exists():
                    try:
                        gcs_uri = _gcs_upload_file(
                            job_id=job_id,
                            name="story_data.json",
                            local_path=story_json_local,
                            content_type="application/json; charset=utf-8",
                        )
                        result["story_json_gcs_uri"] = gcs_uri
                        gcs_artifacts["story_json"] = gcs_uri
                        logger.info("Uploaded story_data.json to GCS: %s", gcs_uri)
                    except Exception as e:
                        logger.warning("Failed to upload story_data.json to GCS: %s", e)

                # Upload HTML (flipbook for DIGI_BOOK, none for LULU_BOOK)
                html_path = str(result.get("html_path") or "")
                if html_path and Path(html_path).exists():
                    gcs_uri = _gcs_upload_file(
                        job_id=job_id,
                        name="storybook.html",
                        local_path=html_path,
                        content_type=_guess_content_type(Path(html_path)),
                    )
                    result["html_gcs_uri"] = gcs_uri
                    gcs_artifacts["html"] = gcs_uri
                    try:
                        signed_url = _gcs_generate_signed_url(
                            job_id=job_id,
                            name="storybook.html",
                            expires_days=expires_days,
                            filename=Path(html_path).name,
                        )
                        signed_urls["html"] = signed_url
                        signed_items.append(
                            {"label": "Download Web Book", "url": signed_url, "kind": "flipbook"}
                        )
                    except Exception as e:
                        logger.exception("Failed to sign HTML URL for job_id=%s: %s", job_id, e)
                        signed_url_errors.append({"type": e.__class__.__name__, "message": str(e)})

                # Upload PDF(s) based on output_type
                if output_type == "DIGI_BOOK":
                    pdf_path = str(result.get("pdf_path") or "")
                    if pdf_path and Path(pdf_path).exists():
                        gcs_uri = _gcs_upload_file(
                            job_id=job_id,
                            name="storybook.pdf",
                            local_path=pdf_path,
                            content_type=_guess_content_type(Path(pdf_path)),
                        )
                        result["pdf_gcs_uri"] = gcs_uri
                        gcs_artifacts["pdf"] = gcs_uri
                        try:
                            signed_url = _gcs_generate_signed_url(
                                job_id=job_id,
                                name="storybook.pdf",
                                expires_days=expires_days,
                                filename=Path(pdf_path).name,
                            )
                            signed_urls["pdf"] = signed_url
                            signed_items.append({"label": "Download PDF", "url": signed_url, "kind": "pdf"})
                        except Exception as e:
                            logger.exception("Failed to sign PDF URL for job_id=%s: %s", job_id, e)
                            signed_url_errors.append({"type": e.__class__.__name__, "message": str(e)})
                elif output_type == "LULU_BOOK":
                    interior_path = str(result.get("interior_pdf_path") or "")
                    if interior_path and Path(interior_path).exists():
                        gcs_uri = _gcs_upload_file(
                            job_id=job_id,
                            name="interior.pdf",
                            local_path=interior_path,
                            content_type=_guess_content_type(Path(interior_path)),
                        )
                        result["interior_gcs_uri"] = gcs_uri
                        gcs_artifacts["interior_pdf"] = gcs_uri
                        try:
                            signed_url = _gcs_generate_signed_url(
                                job_id=job_id,
                                name="interior.pdf",
                                expires_days=expires_days,
                                filename=Path(interior_path).name,
                            )
                            signed_urls["interior_pdf"] = signed_url
                            signed_items.append({"label": "Download Interior PDF", "url": signed_url, "kind": "pdf"})
                        except Exception as e:
                            logger.exception("Failed to sign interior PDF URL for job_id=%s: %s", job_id, e)
                            signed_url_errors.append({"type": e.__class__.__name__, "message": str(e)})

                    cover_path = str(result.get("cover_pdf_path") or "")
                    if cover_path and Path(cover_path).exists():
                        gcs_uri = _gcs_upload_file(
                            job_id=job_id,
                            name="cover.pdf",
                            local_path=cover_path,
                            content_type=_guess_content_type(Path(cover_path)),
                        )
                        result["cover_gcs_uri"] = gcs_uri
                        gcs_artifacts["cover_pdf"] = gcs_uri
                        try:
                            signed_url = _gcs_generate_signed_url(
                                job_id=job_id,
                                name="cover.pdf",
                                expires_days=expires_days,
                                filename=Path(cover_path).name,
                            )
                            signed_urls["cover_pdf"] = signed_url
                            signed_items.append({"label": "Download Cover PDF", "url": signed_url, "kind": "pdf"})
                        except Exception as e:
                            logger.exception("Failed to sign cover PDF URL for job_id=%s: %s", job_id, e)
                            signed_url_errors.append({"type": e.__class__.__name__, "message": str(e)})

                result["gcs_artifacts"] = gcs_artifacts
                if signed_urls:
                    signed_urls["expires_days"] = str(expires_days)
                    result["signed_urls"] = signed_urls
                if signed_url_errors:
                    result["signed_url_errors"] = signed_url_errors
                _on_progress("upload_done", {"artifact_count": len(gcs_artifacts)})
                _fs_artifacts: Dict[str, Dict[str, Optional[str]]] = {}
                _key_map = {"html": "html", "pdf": "pdf", "interior_pdf": "interiorPdf", "cover_pdf": "coverPdf"}
                for k, fs_key in _key_map.items():
                    if k in gcs_artifacts:
                        _fs_artifacts[fs_key] = {"gcsPath": gcs_artifacts.get(k), "url": signed_urls.get(k)}
                if _fs_artifacts:
                    state.artifacts_ready(artifacts=_fs_artifacts, expires_days=expires_days)
            else:
                _update_stage("upload_skipped_no_bucket")
        except Exception as e:
            logger.exception("Failed to upload artifacts to GCS for job_id=%s: %s", job_id, e)
            result["gcs_upload_error"] = {"type": e.__class__.__name__, "message": str(e)}
            _update_stage("upload_failed", {"error_type": e.__class__.__name__})

        # Optional email delivery (only if SMTP is configured)
        if email:
            try:
                _update_stage("email_start", {"has_links": bool(signed_items)})
                email_result = _maybe_send_email(
                    to_email=email,
                    items=signed_items,
                    expires_days=expires_days,
                )
                result["email_status"] = email_result if email_result else "sent"
                _update_stage("email_done", {"email_status": result["email_status"]})
            except Exception as e:
                logger.exception("Failed to send email for job_id=%s: %s", job_id, e)
                result["email_status"] = "failed"
                result["email_error"] = {"type": e.__class__.__name__, "message": str(e)}
                _update_stage("email_failed", {"error_type": e.__class__.__name__})

        _JOBS[job_id]["status"] = "succeeded"
        _JOBS[job_id]["result"] = result
        _gcs_write_json(job_id=job_id, name="status.json", payload={"job_id": job_id, "status": "succeeded", "result": result})
        state.succeeded(
            timing=result.get("timing"),
            cost=result.get("cost"),
            email_status=result.get("email_status"),
        )
    except Exception as e:
        logger.exception("ebook job_id=%s failed: %s", job_id, e)
        _JOBS[job_id]["status"] = "failed"
        _JOBS[job_id]["error"] = {
            "type": e.__class__.__name__,
            "message": str(e),
            "stage": _JOBS[job_id].get("stage"),
        }
        state.failed(error=_JOBS[job_id]["error"])
        # Best-effort: upload raw story output if present (helps debug JSON parsing failures).
        try:
            if _jobs_bucket_name():
                p = job_dir / "last_story_raw.txt"
                if p.exists():
                    uri = _gcs_upload_file(
                        job_id=job_id,
                        name="last_story_raw.txt",
                        local_path=str(p),
                        content_type="text/plain; charset=utf-8",
                    )
                    _JOBS[job_id]["error"]["debug_gcs_uri"] = uri
        except Exception:
            pass
        _gcs_write_json(
            job_id=job_id,
            name="status.json",
            payload={"job_id": job_id, "status": "failed", "error": _JOBS[job_id]["error"]},
        )
    finally:
        _JOBS[job_id]["finished_at"] = time.time()
        _JOBS[job_id]["duration_s"] = _JOBS[job_id]["finished_at"] - started_at
        _persist_job_state(job_id)

        # Without a GCS bucket the job dir is the only copy of the finished book
        # (served by /jobs/{id}/storybook.html + /storybook.pdf), so never delete it.
        if not keep_job_dir and _jobs_bucket_name() and _JOBS[job_id].get("status") != "running":
            try:
                shutil.rmtree(job_dir, ignore_errors=True)
            except Exception:
                pass


@app.post("/generate-story")
async def generate_story(
    story_prompt: str = Form(...),
    images: List[UploadFile] = File(...),
    credentials_path: Optional[str] = Form(None),
    google_api_key: Optional[str] = Form(None),
    output_dir: str = Form("generated"),
    save_files: bool = Form(True),
    keep_uploads: bool = Form(False),
    input_usd_per_1m: Optional[float] = Form(None),
    output_usd_per_1m: Optional[float] = Form(None),
) -> JSONResponse:
    """
    Multipart form-data:
      - story_prompt: string (required)
      - images: files[] (required)
      - credentials_path: string (optional) sets GOOGLE_APPLICATION_CREDENTIALS
      - google_api_key: string (optional) sets GOOGLE_API_KEY for Gemini Developer API (for LangChain Google GenAI)
      - output_dir: string (optional)
      - save_files: bool (optional)
      - keep_uploads: bool (optional) keep uploaded files on disk for debugging (default False)
      - input_usd_per_1m: float (optional)
      - output_usd_per_1m: float (optional)
    """
    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required")

    request_id = uuid4().hex

    if credentials_path:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

    # If the code path uses Gemini Developer API (ChatGoogleGenerativeAI), it needs an API key.
    # Allow passing it per-request (useful for testing), otherwise rely on env/.env.
    if google_api_key:
        os.environ["GOOGLE_API_KEY"] = google_api_key
        os.environ["GEMINI_API_KEY"] = google_api_key

    if not (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")):
        return JSONResponse(
            status_code=400,
            content={
                "request_id": request_id,
                "error": {
                    "type": "MissingCredentials",
                    "message": (
                        "No credentials found for the server process. "
                        "Set GOOGLE_API_KEY (Gemini Developer API) in .env/environment, "
                        "or set GOOGLE_APPLICATION_CREDENTIALS (Vertex AI), "
                        "or pass google_api_key/credentials_path in the request."
                    ),
                },
            },
        )

    pricing = None
    if input_usd_per_1m is not None and output_usd_per_1m is not None:
        pricing = story_api.GeminiTokenPricing(
            input_usd_per_1m=float(input_usd_per_1m),
            output_usd_per_1m=float(output_usd_per_1m),
        )

    upload_dir = Path("uploads") / request_id
    image_paths = _save_uploads(images, upload_dir)

    try:
        result: Dict[str, Any] = await run_in_threadpool(
            story_api.generate_story_json_with_cost,
            story_prompt=story_prompt,
            image_paths=image_paths,
            output_dir=output_dir,
            save_files=save_files,
            pricing=pricing,
        )
    except Exception as e:
        logger.exception("request_id=%s failed: %s", request_id, e)
        return JSONResponse(
            status_code=500,
            content={
                "request_id": request_id,
                "error": {"type": e.__class__.__name__, "message": str(e)},
            },
        )
    finally:
        if not keep_uploads:
            try:
                shutil.rmtree(upload_dir, ignore_errors=True)
            except Exception:
                pass

    # Add request metadata
    result["request_id"] = request_id
    result["input_images_count"] = len(image_paths)

    return JSONResponse(result)


@app.post("/generate-story-async")
async def generate_story_async(
    story_prompt: str = Form(...),
    images: List[UploadFile] = File(...),
    credentials_path: Optional[str] = Form(None),
    google_api_key: Optional[str] = Form(None),
    output_dir: str = Form("generated"),
    save_files: bool = Form(True),
    keep_uploads: bool = Form(False),
    input_usd_per_1m: Optional[float] = Form(None),
    output_usd_per_1m: Optional[float] = Form(None),
) -> JSONResponse:
    """
    Same inputs as /generate-story, but returns immediately with a job id.
    Poll /jobs/{job_id} until status == "succeeded" (or "failed").
    """
    if not images:
        raise HTTPException(status_code=400, detail="At least one image is required")

    job_id = uuid4().hex

    if credentials_path:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path

    if google_api_key:
        os.environ["GOOGLE_API_KEY"] = google_api_key
        os.environ["GEMINI_API_KEY"] = google_api_key

    if not (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")):
        return JSONResponse(
            status_code=400,
            content={
                "request_id": job_id,
                "error": {
                    "type": "MissingCredentials",
                    "message": (
                        "No credentials found for the server process. "
                        "Set GOOGLE_API_KEY (Gemini Developer API) in .env/environment, "
                        "or set GOOGLE_APPLICATION_CREDENTIALS (Vertex AI), "
                        "or pass google_api_key/credentials_path in the request."
                    ),
                },
            },
        )

    pricing = None
    if input_usd_per_1m is not None and output_usd_per_1m is not None:
        pricing = story_api.GeminiTokenPricing(
            input_usd_per_1m=float(input_usd_per_1m),
            output_usd_per_1m=float(output_usd_per_1m),
        )

    upload_dir = Path("uploads") / job_id
    image_paths = _save_uploads(images, upload_dir)

    _JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "created_at": time.time(),
        "input_images_count": len(image_paths),
    }

    t = threading.Thread(
        target=_run_story_job,
        kwargs=dict(
            job_id=job_id,
            story_prompt=story_prompt,
            image_paths=image_paths,
            output_dir=output_dir,
            save_files=save_files,
            pricing=pricing,
            keep_uploads=keep_uploads,
            upload_dir=upload_dir,
        ),
        daemon=True,
    )
    t.start()

    return JSONResponse({"job_id": job_id, "status": "queued"})


@app.get("/jobs/{job_id}")
def get_job(job_id: str) -> JSONResponse:
    job = _JOBS.get(job_id)
    if not job:
        # Cross-instance fallback: fetch status from GCS
        gcs = _gcs_read_json(job_id=job_id, name="status.json")
        if not gcs:
            raise HTTPException(status_code=404, detail="Job not found")
        status = gcs.get("status")
        if status == "succeeded":
            result = dict((gcs.get("result") or {}))
            result.setdefault("job_id", job_id)
            result["status"] = "succeeded"
            return JSONResponse(result)
        if status == "failed":
            return JSONResponse({"job_id": job_id, "status": "failed", "error": gcs.get("error")})
        return JSONResponse(
            {
                "job_id": job_id,
                "status": status or "unknown",
                "stage": gcs.get("stage"),
                "updated_at": gcs.get("updated_at"),
            }
        )

    status = job.get("status")
    if status == "succeeded":
        # Always include status so clients can reliably stop polling.
        result = dict(job.get("result") or {})
        result.setdefault("job_id", job_id)
        result["status"] = "succeeded"
        # Keep the live-preview fields available after completion so the web
        # "My Books" / project pages can render the finished book from one payload.
        result.setdefault("story", job.get("story"))
        result.setdefault("images", job.get("images") or {})
        result.setdefault("images_done", job.get("images_done"))
        result.setdefault("images_total", job.get("images_total"))
        result.setdefault("created_at", job.get("created_at"))
        result.setdefault("project_id", job.get("project_id"))
        local_urls: Dict[str, str] = {}
        if result.get("html_path") and Path(str(result["html_path"])).exists():
            local_urls["html"] = f"/jobs/{job_id}/storybook.html?inline=true"
        if result.get("pdf_path") and Path(str(result["pdf_path"])).exists():
            local_urls["pdf"] = f"/jobs/{job_id}/storybook.pdf"
        result.setdefault("local_urls", local_urls)
        return JSONResponse(result)
    if status == "failed":
        # 200 (not 500): the request itself succeeded; the job outcome is in ``status``.
        # Include whatever was rendered so the UI can show partial progress alongside the error.
        return JSONResponse(
            {
                "job_id": job_id,
                "status": "failed",
                "error": job.get("error"),
                "stage": job.get("stage"),
                "created_at": job.get("created_at"),
                "finished_at": job.get("finished_at"),
                "project_id": job.get("project_id"),
                "story": job.get("story"),
                "images": job.get("images") or {},
                "images_done": job.get("images_done"),
                "images_total": job.get("images_total"),
            }
        )

    # queued/running -- include live progress so clients can render the book as it fills in
    return JSONResponse(
        {
            "job_id": job_id,
            "status": status,
            "stage": job.get("stage"),
            "stage_at": job.get("stage_at"),
            "created_at": job.get("created_at"),
            "started_at": job.get("started_at"),
            "job_dir": job.get("job_dir"),
            "keep_job_dir": job.get("keep_job_dir"),
            "email": job.get("email"),
            "project_id": job.get("project_id"),
            "story": job.get("story"),
            "images": job.get("images") or {},
            "images_done": job.get("images_done"),
            "images_total": job.get("images_total"),
        }
    )


@app.get("/jobs/{job_id}/images/{name}")
def get_job_image(job_id: str, name: str) -> FileResponse:
    """Serve a generated preview image from the local job dir (no-GCS fallback)."""
    job = _JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    safe_name = Path(name).name
    entry = (job.get("images") or {}).get(safe_name) or {}
    local_path = entry.get("local_path")
    if not local_path or not Path(local_path).exists():
        raise HTTPException(status_code=404, detail="Image not found")
    media_type = "image/png" if str(local_path).lower().endswith(".png") else "image/jpeg"
    return FileResponse(path=local_path, media_type=media_type, headers={"Cache-Control": "public, max-age=3600"})


@app.get("/jobs/{job_id}/storybook.pdf")
def get_job_pdf(job_id: str) -> FileResponse:
    """Serve the finished PDF from the local job dir (no-GCS fallback)."""
    job = _JOBS.get(job_id)
    if not job or job.get("status") != "succeeded":
        raise HTTPException(status_code=404, detail="PDF not ready")
    result = job.get("result") or {}
    pdf_path = result.get("pdf_path") or result.get("interior_pdf_path")
    if not pdf_path or not Path(str(pdf_path)).exists():
        raise HTTPException(status_code=404, detail="PDF not found")
    return FileResponse(path=str(pdf_path), media_type="application/pdf", filename="storybook.pdf")


@app.delete("/jobs/{job_id}")
def delete_job(job_id: str) -> Dict[str, Any]:
    job = _JOBS.pop(job_id, None)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"deleted": True, "job_id": job_id}


def _save_face_uploads_v2(files: List[UploadFile], job_dir: Path) -> List[str]:
    """
    Save 1-4 face uploads as char_1_face.jpeg, char_2_face.jpeg, etc.
    Converts to JPEG (RGB) for consistency.
    """
    from PIL import Image as _PILImage, ImageOps as _PILOps

    input_dir = job_dir / "input_images"
    input_dir.mkdir(parents=True, exist_ok=True)
    paths: List[str] = []

    for i, f in enumerate(files, 1):
        out_path = input_dir / f"char_{i}_face.jpeg"
        raw = f.file.read()
        try:
            from io import BytesIO as _BIO
            with _PILImage.open(_BIO(raw)) as im:
                im = _PILOps.exif_transpose(im)
                if im.mode != "RGB":
                    im = im.convert("RGB")
                im.save(out_path, format="JPEG", quality=95, optimize=True)
        finally:
            try:
                f.file.close()
            except Exception:
                pass
        paths.append(str(out_path))

    return paths


def _download_face_refs_from_gcs(gcs_uris: List[str], job_dir: Path) -> List[str]:
    """
    Fetch 1-4 pre-uploaded face photos (``gs://bucket/path``) and normalize them to
    char_N_face.jpeg, mirroring `_save_face_uploads_v2`.
    """
    from io import BytesIO as _BIO
    from PIL import Image as _PILImage, ImageOps as _PILOps

    input_dir = job_dir / "input_images"
    input_dir.mkdir(parents=True, exist_ok=True)
    client = _gcs_client()
    paths: List[str] = []
    allowed_bucket = os.getenv("UPLOADS_BUCKET") or None

    for i, uri in enumerate(gcs_uris, 1):
        if not uri.startswith("gs://"):
            raise ValueError(f"Invalid GCS URI (expected gs://): {uri}")
        bucket_name, _, blob_name = uri[len("gs://"):].partition("/")
        if not bucket_name or not blob_name:
            raise ValueError(f"Invalid GCS URI: {uri}")
        if allowed_bucket and bucket_name not in (allowed_bucket, _jobs_bucket_name()):
            raise ValueError(f"GCS bucket not allowed: {bucket_name}")
        blob = client.bucket(bucket_name).blob(blob_name)
        raw = blob.download_as_bytes()
        out_path = input_dir / f"char_{i}_face.jpeg"
        with _PILImage.open(_BIO(raw)) as im:
            im = _PILOps.exif_transpose(im)
            if im.mode != "RGB":
                im = im.convert("RGB")
            im.save(out_path, format="JPEG", quality=95, optimize=True)
        paths.append(str(out_path))

    return paths


@app.post("/generate-ebook-async")
async def generate_ebook_async(
    story_prompt: str = Form(...),
    image: Optional[UploadFile] = File(None),
    images: Optional[List[UploadFile]] = File(None),
    character_metadata: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    output_type: str = Form("DIGI_BOOK"),
    keep_job_dir: bool = Form(False),
    credentials_path: Optional[str] = Form(None),
    google_api_key: Optional[str] = Form(None),
    openai_api_key: Optional[str] = Form(None),
    model_provider: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    input_usd_per_1m: Optional[float] = Form(None),
    output_usd_per_1m: Optional[float] = Form(None),
    project_id: Optional[str] = Form(None),
    image_gcs_uris: Optional[List[str]] = Form(None),
    image_provider: Optional[str] = Form(None),
    image_model: Optional[str] = Form(None),
    image_model_pages: Optional[str] = Form(None),
    image_quality: Optional[str] = Form(None),
    image_size: Optional[str] = Form(None),
) -> JSONResponse:
    """
    Production-friendly pipeline supporting 1-4 character face photos.

    V1 (backward compatible): Send a single face photo via `image` field.
    V2 (multi-character):     Send 1-4 face photos via `images` field
                              + optional `character_metadata` JSON string.

    Inputs (multipart form-data):
      - story_prompt: required
      - image: single face photo (V1 backward compat)
      - images: 1-4 face photos (V2 multi-character)
      - image_gcs_uris: alternative to uploads: 1-4 `gs://bucket/path` URIs (pre-uploaded by the web app)
      - character_metadata: optional JSON string with character info:
        [{"name": "Rahul", "age": 35, "gender": "male", "relationship": "father"}, ...]
      - email: optional (email the results)
      - output_type: "DIGI_BOOK" (default) or "LULU_BOOK"
      - keep_job_dir: optional (debug)
      - model_provider: optional ("openai" or "gemini") for the story LLM
      - model: optional story model name
      - project_id: optional Firestore `projects/{id}` doc to mirror live progress into
      - image_provider / image_model / image_model_pages / image_quality / image_size:
        optional per-job image generation overrides (see imggen.py)

    Returns immediately with job_id. Poll:
      - GET /jobs/{job_id} for status (includes live `story`, `images`, `images_done/total`)
      - GET /jobs/{job_id}/storybook.html for the final HTML (when succeeded)
    """
    # Determine which upload path was used
    upload_files: List[UploadFile] = []
    if images:
        upload_files = [f for f in images if f and f.filename]
    if not upload_files and image:
        upload_files = [image]

    gcs_refs: List[str] = []
    if image_gcs_uris:
        for u in image_gcs_uris:
            for part in str(u).split(","):
                part = part.strip()
                if part:
                    gcs_refs.append(part)

    if not upload_files and not gcs_refs:
        raise HTTPException(
            status_code=400,
            detail="At least one face image is required (use 'image', 'images' or 'image_gcs_uris')",
        )

    if len(upload_files) > 4 or len(gcs_refs) > 4:
        raise HTTPException(status_code=400, detail="Maximum 4 face images allowed")

    # Parse character_metadata if provided
    parsed_metadata: Optional[List[Dict[str, Any]]] = None
    if character_metadata:
        try:
            import json as _json
            parsed_metadata = _json.loads(character_metadata)
            if not isinstance(parsed_metadata, list):
                raise ValueError("character_metadata must be a JSON array")
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid character_metadata JSON: {e}",
            )

    # Detect pipeline version: V2 if >1 image OR metadata provided OR GCS refs, else V1
    use_v2 = len(upload_files) > 1 or parsed_metadata is not None or bool(gcs_refs)

    job_id = uuid4().hex

    if credentials_path:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = credentials_path
    if google_api_key:
        os.environ["GOOGLE_API_KEY"] = google_api_key
        os.environ["GEMINI_API_KEY"] = google_api_key
    if openai_api_key:
        os.environ["OPENAI_API_KEY"] = openai_api_key

    # Normalize model_provider
    normalized_provider = (model_provider or "").strip().lower()
    if normalized_provider in ("openai", "oai", "gpt"):
        normalized_provider = "openai"
    elif normalized_provider in ("gemini", "google", "vertex", "genai"):
        normalized_provider = "gemini"
    elif model:
        model_lower = model.lower()
        if "gpt" in model_lower or model_lower.startswith(("o1", "o3", "o4")):
            normalized_provider = "openai"
        else:
            normalized_provider = "gemini"
    else:
        env_provider = (os.getenv("STORY_MODEL_PROVIDER") or os.getenv("DEFAULT_MODEL_PROVIDER") or "").strip().lower()
        if env_provider in ("openai", "oai", "gpt"):
            normalized_provider = "openai"
        elif env_provider in ("gemini", "google", "vertex", "genai"):
            normalized_provider = "gemini"
        elif os.getenv("OPENAI_API_KEY"):
            normalized_provider = "openai"
        else:
            normalized_provider = "gemini"

    # Check credentials based on provider
    if normalized_provider == "openai":
        if not os.getenv("OPENAI_API_KEY"):
            return JSONResponse(
                status_code=400,
                content={
                    "job_id": job_id,
                    "error": {
                        "type": "MissingCredentials",
                        "message": "OpenAI provider selected but OPENAI_API_KEY not set.",
                    },
                },
            )
    elif not (os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_APPLICATION_CREDENTIALS")):
        return JSONResponse(
            status_code=400,
            content={
                "job_id": job_id,
                "error": {
                    "type": "MissingCredentials",
                    "message": (
                        "No credentials found for the server process. "
                        "Set GOOGLE_API_KEY / GEMINI_API_KEY (Gemini Developer API), "
                        "or set GOOGLE_APPLICATION_CREDENTIALS (Vertex AI)."
                    ),
                },
            },
        )

    pricing = None
    if input_usd_per_1m is not None and output_usd_per_1m is not None:
        pricing = story_api.GeminiTokenPricing(
            input_usd_per_1m=float(input_usd_per_1m),
            output_usd_per_1m=float(output_usd_per_1m),
        )

    # Per-job workspace (Cloud Run safe: write under /tmp)
    job_root = Path(os.getenv("STORY_JOBS_DIR") or tempfile.gettempdir())
    job_dir = job_root / "story_jobs" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    # Save face images
    if gcs_refs:
        try:
            face_paths = await run_in_threadpool(_download_face_refs_from_gcs, gcs_refs, job_dir)
        except Exception as e:
            shutil.rmtree(job_dir, ignore_errors=True)
            raise HTTPException(status_code=400, detail=f"Failed to fetch image_gcs_uris: {e}")
    elif use_v2:
        face_paths = _save_face_uploads_v2(upload_files, job_dir)
    else:
        face_path = _save_face_upload_as_standard_name(upload_files[0], job_dir)
        face_paths = [face_path]

    # Normalize output_type
    output_type_normalized = (output_type or "DIGI_BOOK").upper().strip()
    if output_type_normalized not in ("DIGI_BOOK", "LULU_BOOK"):
        output_type_normalized = "DIGI_BOOK"

    image_params: Dict[str, Any] = {
        k: v.strip()
        for k, v in {
            "provider": image_provider,
            "model": image_model,
            "model_pages": image_model_pages,
            "quality": image_quality,
            "size": image_size,
        }.items()
        if isinstance(v, str) and v.strip()
    }
    project_id_clean = (project_id or "").strip() or None

    _JOBS[job_id] = {
        "job_id": job_id,
        "status": "queued",
        "created_at": time.time(),
        "job_dir": str(job_dir),
        "email": email,
        "keep_job_dir": keep_job_dir,
        "output_type": output_type_normalized,
        "pipeline_version": "v2" if use_v2 else "v1",
        "num_characters": len(face_paths),
        "project_id": project_id_clean,
        "image_params": image_params,
    }
    _persist_job_state(job_id)
    _gcs_write_json(
        job_id=job_id,
        name="status.json",
        payload={"job_id": job_id, "status": "queued", "created_at": _JOBS[job_id]["created_at"]},
    )

    t = threading.Thread(
        target=_run_ebook_job,
        kwargs=dict(
            job_id=job_id,
            job_dir=job_dir,
            story_prompt=story_prompt,
            face_image_path=face_paths[0] if not use_v2 else face_paths[0],
            face_image_paths=face_paths if use_v2 else None,
            character_metadata=parsed_metadata if use_v2 else None,
            pricing=pricing,
            keep_job_dir=keep_job_dir,
            email=email,
            output_type=output_type_normalized,
            model_provider=normalized_provider,
            model=model,
            use_v2=use_v2,
            project_id=project_id_clean,
            image_params=image_params or None,
        ),
        daemon=True,
    )
    t.start()

    return JSONResponse(
        {
            "job_id": job_id,
            "status": "queued",
            "status_url": f"/jobs/{job_id}",
            "html_url": f"/jobs/{job_id}/storybook.html",
            "pipeline_version": "v2" if use_v2 else "v1",
            "num_characters": len(face_paths),
            "project_id": project_id_clean,
        }
    )


@app.get("/jobs/{job_id}/storybook.html")
def get_job_html(
    job_id: str,
    inline: bool = Query(False, description="If true, serve HTML inline for iframe preview"),
    download: bool = Query(True, description="If true, force download (ignored when inline=true)"),
) -> FileResponse:
    job = _JOBS.get(job_id)
    disposition = "inline" if inline else ("attachment" if download else "inline")
    headers = {"Content-Disposition": f'{disposition}; filename="storybook.html"'}
    # Prefer local file when running on the instance that generated it
    if job and job.get("status") == "succeeded":
        result = job.get("result") or {}
        html_path = result.get("html_path")
        if html_path and Path(html_path).exists():
            return FileResponse(path=html_path, media_type="text/html", filename="storybook.html", headers=headers)

    # Cross-instance fallback: serve from GCS
    gcs_status = _gcs_read_json(job_id=job_id, name="status.json")
    if not gcs_status:
        raise HTTPException(status_code=404, detail="Job not found")
    if gcs_status.get("status") != "succeeded":
        raise HTTPException(status_code=409, detail=f"Job not ready (status={gcs_status.get('status')})")

    data = _gcs_download_bytes(job_id=job_id, name="storybook.html")
    if not data:
        raise HTTPException(status_code=404, detail="HTML not found")

    return StreamingResponse(iter([data]), media_type="text/html", headers=headers)

