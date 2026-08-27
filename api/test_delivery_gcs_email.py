r"""
Test script: upload existing outputs to GCS + email signed URLs.

Use this when you already generated outputs locally and want to validate:
  - GCS upload permissions
  - signed URL generation
  - SMTP delivery

Example:
  python test_delivery_gcs_email.py ^
    --job-id 59f4c072d5544a8a95ceafb1d36c8512 ^
    --local-dir "C:\Users\sarat\AppData\Local\Temp\story_jobs\59f4c072d5544a8a95ceafb1d36c8512\book_outputs\digi-book" ^
    --bucket lulubook ^
    --to-email sarath8roy@gmail.com ^
    --output-type DIGI_BOOK
"""

from __future__ import annotations

import argparse
from io import BytesIO
import os
import smtplib
from dataclasses import dataclass
from datetime import timedelta
from email.message import EmailMessage
from pathlib import Path
from typing import Optional

from google.cloud import storage


def _load_dotenv_if_present() -> None:
    # Optional convenience: load local .env for SMTP/GCS vars
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except Exception:
        pass


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


def _guess_content_type(path: Path) -> str:
    suf = path.suffix.lower()
    if suf == ".pdf":
        return "application/pdf"
    if suf in (".html", ".htm"):
        return "text/html; charset=utf-8"
    return "application/octet-stream"


def upload_and_sign(
    *,
    client: storage.Client,
    bucket_name: str,
    object_name: str,
    local_path: Path,
    expires_days: int,
    filename: Optional[str] = None,
) -> str:
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(object_name)
    blob.upload_from_filename(str(local_path), content_type=_guess_content_type(local_path))
    response_disposition = f'attachment; filename="{filename or local_path.name}"'
    return blob.generate_signed_url(
        version="v4",
        expiration=timedelta(days=expires_days),
        method="GET",
        response_disposition=response_disposition,
    )


@dataclass(frozen=True)
class SmtpConfig:
    host: str
    port: int
    user: str
    password: str
    from_email: str
    tls: bool


def load_smtp_config_from_env() -> SmtpConfig:
    host = os.getenv("SMTP_HOST") or ""
    port = int(os.getenv("SMTP_PORT") or "587")
    user = os.getenv("SMTP_USER") or ""
    password = os.getenv("SMTP_PASSWORD") or ""
    from_email = os.getenv("SMTP_FROM") or user
    from_name = os.getenv("SMTP_FROM_NAME") or "IMG2X"
    tls = _env_bool("SMTP_TLS", True)

    missing = [k for k, v in [("SMTP_HOST", host), ("SMTP_USER", user), ("SMTP_PASSWORD", password)] if not v]
    if missing:
        raise RuntimeError(f"Missing SMTP env vars: {', '.join(missing)}")

    return SmtpConfig(host=host, port=port, user=user, password=password, from_email=from_email, tls=tls)


def send_email(*, cfg: SmtpConfig, to_email: str, subject: str, body: str, body_html: Optional[str] = None) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    from email.utils import formataddr

    msg["From"] = formataddr((os.getenv("SMTP_FROM_NAME") or "IMG2X", cfg.from_email))
    msg["To"] = to_email
    msg.set_content(body)
    if body_html:
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

        # Embed Apple HTML instructions image inline (cid) when available
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

    with smtplib.SMTP(host=cfg.host, port=cfg.port, timeout=30) as s:
        if cfg.tls:
            s.starttls()
        s.login(cfg.user, cfg.password)
        s.send_message(msg)


def _render_links_email_html(*, title: str, subtitle: str, items: list[dict], footer: str) -> str:
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


def _pick_outputs(local_dir: Path, output_type: str) -> tuple[Optional[Path], Optional[Path]]:
    """
    Returns (pdf_path, html_path). Either may be None.
    """
    pdfs = sorted(local_dir.glob("*.pdf"))
    htmls = sorted([*local_dir.glob("*.html"), *local_dir.glob("*.htm")])

    pdf = pdfs[-1] if pdfs else None
    html = htmls[-1] if htmls else None

    # Lulu output dir likely contains 2 PDFs; keep "most recent" heuristic and let caller override if needed.
    if output_type.upper().strip() == "LULU_BOOK":
        # Try to pick both cover+interior if present.
        # If not sure, user can pass explicit paths by renaming files in the folder.
        pass

    return pdf, html


def main() -> int:
    _load_dotenv_if_present()
    ap = argparse.ArgumentParser()
    ap.add_argument("--job-id", required=True, help="Job id used for GCS object prefix jobs/<job_id>/")
    ap.add_argument("--local-dir", required=True, help="Folder containing output files (pdf/html)")
    ap.add_argument("--bucket", default=os.getenv("JOBS_BUCKET") or os.getenv("STORY_JOBS_BUCKET") or "", help="GCS bucket name")
    ap.add_argument("--to-email", required=True, help="Recipient email address")
    ap.add_argument("--output-type", default="DIGI_BOOK", choices=["DIGI_BOOK", "LULU_BOOK"])
    ap.add_argument("--expires-days", type=int, default=7, help="Signed URL expiry in days (max 7 for v4; default: 7)")
    ap.add_argument("--pdf", default=None, help="Optional explicit PDF path (overrides auto-detect)")
    ap.add_argument("--html", default=None, help="Optional explicit HTML path (overrides auto-detect)")
    args = ap.parse_args()
    if args.expires_days > 7:
        raise ValueError("GCS V4 signed URLs support max 7 days. Use --expires-days 7 or less.")

    local_dir = Path(args.local_dir)
    if not local_dir.exists():
        raise FileNotFoundError(f"local-dir not found: {local_dir}")

    if not args.bucket:
        raise RuntimeError("Bucket not provided. Pass --bucket or set JOBS_BUCKET in env.")

    # Credentials:
    # - Prefer standard GOOGLE_APPLICATION_CREDENTIALS.
    # - Accept common typo GOOGLE_APPLICATION_CREDENTIALENTIALS.
    if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS") and os.getenv("GOOGLE_APPLICATION_CREDENTIALENTIALS"):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.getenv("GOOGLE_APPLICATION_CREDENTIALENTIALS") or ""

    client = storage.Client()

    pdf_path = Path(args.pdf) if args.pdf else None
    html_path = Path(args.html) if args.html else None
    if not pdf_path and not html_path:
        pdf_path, html_path = _pick_outputs(local_dir, args.output_type)

    if args.output_type == "DIGI_BOOK" and not pdf_path:
        raise RuntimeError("Could not find a PDF in local-dir. Pass --pdf to specify explicitly.")

    # Upload + sign
    prefix = f"jobs/{args.job_id}"
    items: list[dict] = []

    if args.output_type == "LULU_BOOK":
        # Best-effort: upload everything PDF-ish in the folder with stable names.
        # If you want exact naming, pass --pdf/--html or rename files before running.
        pdfs = sorted(local_dir.glob("*.pdf"))
        if not pdfs:
            raise RuntimeError("No PDFs found for LULU_BOOK in local-dir.")
        for idx, p in enumerate(pdfs, 1):
            obj = f"{prefix}/lulu_{idx}.pdf"
            url = upload_and_sign(
                client=client,
                bucket_name=args.bucket,
                object_name=obj,
                local_path=p,
                expires_days=args.expires_days,
                filename=p.name,
            )
            items.append({"label": f"Download PDF {idx}", "url": url, "kind": "pdf"})
    else:
        # DIGI_BOOK
        if pdf_path:
            obj = f"{prefix}/digi_book.pdf"
            url = upload_and_sign(
                client=client,
                bucket_name=args.bucket,
                object_name=obj,
                local_path=pdf_path,
                expires_days=args.expires_days,
                filename=pdf_path.name,
            )
            items.append({"label": "Download PDF", "url": url, "kind": "pdf"})
        if html_path:
            obj = f"{prefix}/digi_flipbook.html"
            url = upload_and_sign(
                client=client,
                bucket_name=args.bucket,
                object_name=obj,
                local_path=html_path,
                expires_days=args.expires_days,
                filename=html_path.name,
            )
            items.append({"label": "Download Web Book", "url": url, "kind": "flipbook"})

    if not items:
        raise RuntimeError("No outputs were uploaded/signed.")

    # Email
    cfg = load_smtp_config_from_env()
    subject = "Your book files are ready"
    body = (
        "Hi there,\n\n"
        "Your storybook files are ready. Download your files below and save local copies.\n"
        f"These links expire in {args.expires_days} days.\n\n"
        + "\n".join([f"{item['label']}: {item['url']}" for item in items])
        + "\n\n"
        "Flipbook (HTML) instructions:\n"
        "- Android: opens directly.\n"
        "- Apple (iPhone/iPad/Mac): install Microsoft Edge, download the HTML file, open Files, "
        "Share, then select Edge.\n\n"
        "Thank you for creating with us,\n"
        "The img2x Team\n"
    )
    body_html = _render_links_email_html(
        title="Your storybook is ready",
        subtitle=f"Download your files below and save local copies. These links expire in {args.expires_days} days.",
        items=items,
        footer="If you need help, just reply to this email.",
    )
    send_email(cfg=cfg, to_email=args.to_email, subject=subject, body=body, body_html=body_html)

    print("OK: uploaded + emailed links")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

