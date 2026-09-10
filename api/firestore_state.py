"""Firestore project-state writer for the Story Service.

The web app creates ``projects/{projectId}`` (owner uid, storyline, payment, ...). When a
generation job is started with ``project_id``, the API mirrors live job progress into that
document so the client can subscribe with ``onSnapshot`` and watch the book fill in:

    status      : generating | ready | failed
    stage       : last pipeline stage name (see story_api progress events)
    story       : {title, coverText, pages:[{pageNumber, story}], characters:[{index,name}]}
    images      : {cover|page_N|char_N : {url, gcsPath, readyAt, model}}
    imagesDone / imagesTotal
    artifacts   : {html|pdf|interiorPdf|coverPdf : {url, gcsPath}}
    timing, cost, error, stages[]

All writes are best-effort and never raise into the pipeline.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("firestore_state")

_CLIENT = None


def firestore_enabled() -> bool:
    flag = (os.getenv("FIRESTORE_ENABLED") or "true").strip().lower()
    return flag not in ("0", "false", "no", "off")


def _client():
    global _CLIENT
    if _CLIENT is not None:
        return _CLIENT
    from google.cloud import firestore  # lazy import; optional dependency locally

    project = os.getenv("FIRESTORE_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT") or None
    database = os.getenv("FIRESTORE_DATABASE") or "(default)"
    _CLIENT = firestore.Client(project=project, database=database)
    return _CLIENT


def _image_key(item: Dict[str, Any]) -> Optional[str]:
    t = (item.get("type") or "").lower()
    if t == "cover":
        return "cover"
    if t == "page":
        pn = item.get("page_number")
        if pn is None:
            name = str(item.get("name") or "")
            digits = "".join(ch for ch in name if ch.isdigit())
            pn = int(digits) if digits else None
        return f"page_{pn}" if pn is not None else None
    if t == "character":
        name = str(item.get("output_image") or item.get("name") or "")
        digits = "".join(ch for ch in name.split("/")[-1] if ch.isdigit())
        return f"char_{digits or '1'}"
    return None


class ProjectStateWriter:
    """Mirrors job progress into ``projects/{project_id}``."""

    def __init__(self, project_id: Optional[str], job_id: str):
        self.project_id = (project_id or "").strip() or None
        self.job_id = job_id
        self._failed = False

    @property
    def enabled(self) -> bool:
        return bool(self.project_id) and firestore_enabled() and not self._failed

    # ---- low level -------------------------------------------------------

    def update(self, fields: Dict[str, Any]) -> None:
        if not self.enabled:
            return
        try:
            from google.cloud import firestore

            doc = _client().collection("projects").document(self.project_id)
            payload = dict(fields)
            payload["updatedAt"] = firestore.SERVER_TIMESTAMP
            payload["jobId"] = self.job_id
            doc.set(payload, merge=True)
        except Exception as e:  # noqa: BLE001
            # Do not spam: disable after the first hard failure (e.g. missing creds locally).
            self._failed = True
            logger.warning("Firestore update disabled for project=%s after error: %s", self.project_id, e)

    def append_stage(self, stage: str, extra: Optional[Dict[str, Any]] = None) -> None:
        if not self.enabled:
            return
        try:
            from google.cloud import firestore

            entry: Dict[str, Any] = {"stage": stage, "at": time.time()}
            if extra:
                # Keep the timeline light; drop large payloads.
                slim = {k: v for k, v in extra.items() if k in ("done", "total", "story_s", "images_s", "pdf_s", "phase", "count", "error_type")}
                if slim:
                    entry["meta"] = slim
            self.update({"stage": stage, "stageAt": time.time(), "stages": firestore.ArrayUnion([entry])})
        except Exception as e:  # noqa: BLE001
            logger.warning("Firestore append_stage failed: %s", e)

    # ---- high level events -----------------------------------------------

    def job_started(self, *, output_type: str, num_characters: int) -> None:
        self.update(
            {
                "status": "generating",
                "stage": "job_started",
                "stageAt": time.time(),
                "outputType": output_type,
                "numCharacters": num_characters,
                "imagesDone": 0,
                "startedAt": time.time(),
                "error": None,
            }
        )

    def story_ready(self, extra: Dict[str, Any]) -> None:
        pages = [
            {"pageNumber": p.get("page_number"), "story": p.get("story") or ""}
            for p in (extra.get("pages") or [])
        ]
        self.update(
            {
                "story": {
                    "title": extra.get("title") or "",
                    "coverText": extra.get("cover_text") or "",
                    "pages": pages,
                    "characters": extra.get("characters") or [],
                },
                "title": extra.get("title") or "",
                "imagesTotal": max(len(pages) + 1 + len(extra.get("characters") or []), 0),
            }
        )

    def image_ready(self, extra: Dict[str, Any], *, url: Optional[str], gcs_path: Optional[str]) -> None:
        key = _image_key(extra)
        fields: Dict[str, Any] = {
            "imagesDone": extra.get("done"),
            "imagesTotal": extra.get("total"),
        }
        if key:
            fields[f"images.{key}"] = {
                "url": url,
                "gcsPath": gcs_path,
                "readyAt": time.time(),
                "model": extra.get("model"),
                "elapsedS": extra.get("elapsed_s"),
                "type": extra.get("type"),
                "pageNumber": extra.get("page_number"),
            }
            if key == "cover" and url:
                fields["coverUrl"] = url
        self._update_dotted(fields)

    def artifacts_ready(self, *, artifacts: Dict[str, Dict[str, Optional[str]]], expires_days: int) -> None:
        self.update(
            {
                "artifacts": artifacts,
                "signedUrlsExpireAt": time.time() + expires_days * 86400,
            }
        )

    def succeeded(self, *, timing: Optional[Dict[str, Any]], cost: Optional[Dict[str, Any]], email_status: Optional[str]) -> None:
        self.update(
            {
                "status": "ready",
                "stage": "done",
                "stageAt": time.time(),
                "finishedAt": time.time(),
                "timing": timing or {},
                "cost": cost or {},
                "emailStatus": email_status,
            }
        )

    def failed(self, *, error: Dict[str, Any]) -> None:
        self.update(
            {
                "status": "failed",
                "stage": "failed",
                "stageAt": time.time(),
                "finishedAt": time.time(),
                "error": error,
            }
        )

    # ---- helpers -----------------------------------------------------------

    def _update_dotted(self, fields: Dict[str, Any]) -> None:
        """Update with dotted field paths (nested map keys) without clobbering siblings."""
        if not self.enabled:
            return
        try:
            from google.cloud import firestore

            doc = _client().collection("projects").document(self.project_id)
            payload = {k: v for k, v in fields.items() if v is not None}
            payload["updatedAt"] = firestore.SERVER_TIMESTAMP
            payload["jobId"] = self.job_id
            try:
                doc.update(payload)
            except Exception:
                # Document may not exist yet (API called without the web creating it first).
                doc.set({"jobId": self.job_id, "updatedAt": firestore.SERVER_TIMESTAMP}, merge=True)
                doc.update(payload)
        except Exception as e:  # noqa: BLE001
            self._failed = True
            logger.warning("Firestore dotted update disabled for project=%s after error: %s", self.project_id, e)
