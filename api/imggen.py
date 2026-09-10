from __future__ import annotations

from typing import List, Dict, Any, Optional
from pathlib import Path
from io import BytesIO
import time
import os
import json
import logging
import base64
import mimetypes
import re
import threading
import requests

from PIL import Image, ImageOps
from google import genai
from google.genai import types
from google.genai.types import GenerateContentConfig, Modality, ThinkingConfig, ImageConfig, Tool, GoogleSearch

from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from strgen import Story_content_generator


def _env_bool(key: str, default: bool = False) -> bool:
    """Parse boolean env var (true/1/yes → True, false/0/no → False)."""
    val = os.getenv(key, "").strip().lower()
    if val in ("true", "1", "yes", "on"):
        return True
    if val in ("false", "0", "no", "off"):
        return False
    return default


def _env_int(key: str, default: int) -> int:
    val = os.getenv(key, "").strip()
    if not val:
        return default
    try:
        n = int(val)
        return n if n > 0 else default
    except Exception:
        return default


def _resolve_image_provider(image_provider: Optional[str]) -> str:
    """Resolve provider name.

    Providers:
      - ``openai_images``: OpenAI-compatible ``/images/edits`` (GPT-Image-2.5 flare / sunburst via LaoZhang or OpenAI).
      - ``laozhang``: LaoZhang Gemini-style ``:generateContent`` (Nano Banana).
      - ``gemini``: direct Google GenAI SDK.
    """
    provider = (image_provider or os.getenv("IMAGE_PROVIDER") or "").strip().lower()
    if provider in ("openai_images", "openai-images", "openai", "gpt-image", "gpt_image", "gpt-image-2.5", "sunburst", "flare"):
        return "openai_images"
    if provider in ("laozhang", "lz", "laozhang_gemini"):
        # If the configured model is a gpt-image model, use openai_images endpoint
        configured_model = (os.getenv("IMAGE_MODEL") or os.getenv("LAOZHANG_IMAGE_MODEL") or "").lower()
        if "gpt-image" in configured_model or "sunburst" in configured_model or "flare" in configured_model:
            return "openai_images"
        return "laozhang"
    if provider in ("gemini", "google", "vertex", "genai"):
        return "gemini"
    
    # Auto-detection based on configured keys and model
    configured_model = (os.getenv("IMAGE_MODEL") or os.getenv("LAOZHANG_IMAGE_MODEL") or "").lower()
    if "gpt-image" in configured_model or "sunburst" in configured_model or "flare" in configured_model:
        return "openai_images"
    if os.getenv("LAOZHANG_API_KEY") or os.getenv("API_KEY_LAOZHANG"):
        if os.getenv("IMAGE_MODEL"):
            return "openai_images"
        return "laozhang"
    return "gemini"


# ---------------------------------------------------------------------------
# OpenAI-compatible Images API (GPT-Image-2.5 flare / sunburst)
# ---------------------------------------------------------------------------

DEFAULT_IMAGE_API_BASE = "https://api.laozhang.ai/v1"
# Support gpt-image-2.5-sunburst-2026-09-08 / gpt-image-2.5-sunburst / gpt-image-2.5-flare-2026-09-08
DEFAULT_IMAGE_MODEL = "gpt-image-2.5-sunburst-2026-09-08"
DEFAULT_IMAGE_QUALITY = "high"
DEFAULT_IMAGE_SIZE = "1024x1024"


OFFICIAL_OPENAI_API_BASE = "https://api.openai.com/v1"

# Names each endpoint actually serves. LaoZhang only exposes the ``-vip`` aliases for
# GPT-Image-2.5 (the official snapshot names return 503 "no channel"), while api.openai.com
# serves the dated snapshots. Ordering the aliases per endpoint avoids wasted round-trips.
_LAOZHANG_ALIASES = {
    "sunburst": ["gpt-image-2.5-sunburst-vip", "gpt-image-2.5-sunburst", "gpt-image-2.5-sunburst-2026-09-08"],
    "flare": ["gpt-image-2.5-flare-vip", "gpt-image-2.5-flare", "gpt-image-2.5-flare-2026-09-08"],
}
_OPENAI_ALIASES = {
    "sunburst": ["gpt-image-2.5-sunburst-2026-09-08", "gpt-image-2.5-sunburst"],
    "flare": ["gpt-image-2.5-flare-2026-09-08", "gpt-image-2.5-flare"],
}


def _model_family(model_name: str) -> Optional[str]:
    m = model_name.lower()
    if "sunburst" in m:
        return "sunburst"
    if "flare" in m:
        return "flare"
    return None


def _get_model_candidates(model_name: str, api_base: Optional[str] = None) -> List[str]:
    """Ordered candidate model names (aliases/snapshots) for a given endpoint."""
    family = _model_family(model_name)
    if family is None:
        return [model_name]
    base = (api_base or "").lower()
    table = _LAOZHANG_ALIASES if "laozhang" in base else _OPENAI_ALIASES
    candidates: List[str] = []
    is_official = "openai.com" in base
    # Keep the caller's exact name first unless we know this endpoint cannot serve it.
    if not (is_official and model_name.endswith("-vip")):
        candidates.append(model_name)
    for alt in table[family]:
        if alt not in candidates:
            candidates.append(alt)
    return candidates


def _normalize_api_base(base: str) -> str:
    base = base.rstrip("/")
    if not base.endswith("/v1"):
        base = base + "/v1"
    return base


def _image_endpoints() -> List[tuple[str, str, str]]:
    """Ordered ``(label, api_base, api_key)`` endpoints to try for the Images API.

    The configured ``IMAGE_API_BASE`` is always first. When ``IMAGE_API_FALLBACK`` is not
    disabled and a key for the *other* provider exists, it is appended so a rate limit or
    outage on one proxy fails over instead of failing the whole job.
    """
    primary_base = _normalize_api_base(os.getenv("IMAGE_API_BASE") or DEFAULT_IMAGE_API_BASE)
    endpoints: List[tuple[str, str, str]] = [("primary", primary_base, _image_api_key())]

    if (os.getenv("IMAGE_API_FALLBACK") or "1").strip().lower() in ("0", "false", "no", "off"):
        return endpoints

    explicit_fallback = (os.getenv("IMAGE_API_FALLBACK_BASE") or "").strip()
    explicit_key = (os.getenv("IMAGE_API_FALLBACK_KEY") or "").strip()
    if explicit_fallback and explicit_key:
        fb = _normalize_api_base(explicit_fallback)
        if fb != primary_base:
            endpoints.append(("fallback", fb, explicit_key))
        return endpoints

    openai_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    laozhang_key = (os.getenv("LAOZHANG_API_KEY") or os.getenv("API_KEY_LAOZHANG") or "").strip()
    if "openai.com" not in primary_base and openai_key:
        endpoints.append(("openai", OFFICIAL_OPENAI_API_BASE, openai_key))
    elif "laozhang" not in primary_base and laozhang_key:
        endpoints.append(("laozhang", DEFAULT_IMAGE_API_BASE, laozhang_key))
    return endpoints


# (api_base, model) -> unix time until which the pair is skipped. Populated when an
# endpoint answers 429/5xx so parallel page renders fail over immediately instead of each
# paying the same rate-limit round-trips.
_ENDPOINT_COOLDOWN: Dict[tuple[str, str], float] = {}
_COOLDOWN_LOCK = threading.Lock()


def _cooldown_seconds() -> float:
    return float(os.getenv("IMAGE_API_COOLDOWN_S") or "120")


def _in_cooldown(api_base: str, model_name: str) -> bool:
    with _COOLDOWN_LOCK:
        until = _ENDPOINT_COOLDOWN.get((api_base, model_name), 0.0)
    return until > time.time()


def _set_cooldown(api_base: str, model_name: str) -> None:
    with _COOLDOWN_LOCK:
        _ENDPOINT_COOLDOWN[(api_base, model_name)] = time.time() + _cooldown_seconds()


def _clear_cooldown(api_base: str, model_name: str) -> None:
    with _COOLDOWN_LOCK:
        _ENDPOINT_COOLDOWN.pop((api_base, model_name), None)


class ImageModerationError(RuntimeError):
    """The provider's safety system rejected the prompt/output (not fixable by retrying as-is)."""


_MODERATION_MARKERS = (
    "moderation_blocked",
    "safety system",
    "content_policy",
    "image_safety",
    "safety policy",
    "filtered by the safety",
    "prohibited_content",
    "blocked by safety",
)


def _looks_like_moderation(text: str) -> bool:
    low = (text or "").lower()
    return any(marker in low for marker in _MODERATION_MARKERS)


def is_moderation_error(err: BaseException) -> bool:
    if isinstance(err, ImageModerationError):
        return True
    return _looks_like_moderation(str(err) or "")


# Words that make realistic children's-book scenes read as "child in danger" to output moderation.
_PERIL_REWRITES = [
    (r"\b(terrified|frightened|scared|afraid|fearful|panicked)\b", "brave and focused"),
    (r"\b(screaming|crying|sobbing|wounded|injured|bleeding|hurt)\b", "smiling"),
    (r"\b(collapsing|crumbling|breaking apart|falling apart|snapping|snapped|tearing|torn)\b", "swaying gently"),
    (r"\b(dangerous|deadly|perilous|life-threatening|treacherous)\b", "exciting"),
    (r"\b(falling|plunging|tumbling)\b", "balancing"),
    (r"\b(blood|gore|weapon|weapons|gun|guns|knife|knives)\b", ""),
    (r"\b(explosion|explosions|exploding|fire|flames|burning|smoke)\b", "sparkles"),
    (r"\b(dark|deep) shadows\b", "soft shadows"),
]


_SAFETY_REWRITE_SYSTEM = (
    "You rewrite image-generation prompts for a children's picture book so they pass strict "
    "image-safety filters while keeping the same characters, outfits, setting and story beat.\n"
    "Rules:\n"
    "- Keep every instruction about photographing the same child inside the scene, "
    "relighting them to match the environment, and preserving identity from the reference.\n"
    "- Keep faces camera-facing with both eyes visible. Image models only know the "
    "uploaded front of the face; do not rewrite to profile, 3/4, or looking away.\n"
    "- Do not add a pasted-face / collage look. Relight the frontal face to the scene.\n"
    "- Remove anything that shows a child in danger, distress, fear, injury, cold, drowning, "
    "falling, being chased, or near hazards (deep/rushing water, cliffs, fire, storms, collapsing things).\n"
    "- Replace it with a calm, joyful, clearly safe version of the same moment: the child stands on "
    "dry safe ground or a stable surface, water is shallow and gentle, animals are friendly, "
    "the child smiles or looks curious and confident.\n"
    "- Keep it photographic and cinematic, warm lighting, but avoid words like 'hyper-realistic', "
    "'scared', 'struggle', 'hardest pull', 'crashing wave', 'shaking', 'debris'.\n"
    "- Output ONLY the rewritten prompt text, no preamble."
)


def rewrite_prompt_for_safety(prompt: str) -> Optional[str]:
    """Ask a text LLM to rewrite a blocked scene prompt. Returns None if unavailable."""
    if (os.getenv("IMAGE_MODERATION_LLM_REWRITE") or "1").strip().lower() in ("0", "false", "no", "off"):
        return None
    text: Optional[str] = None
    try:
        if os.getenv("OPENAI_API_KEY"):
            from langchain_openai import ChatOpenAI

            # Small, fast text model is plenty for a prompt rewrite.
            model = os.getenv("IMAGE_MODERATION_REWRITE_MODEL") or "gpt-5.4-mini"
            llm = ChatOpenAI(model=model, api_key=os.getenv("OPENAI_API_KEY"), timeout=45, max_retries=1)
            resp = llm.invoke([("system", _SAFETY_REWRITE_SYSTEM), ("human", prompt)])
            text = resp.content if isinstance(resp.content, str) else str(resp.content)
        elif os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"):
            llm = ChatGoogleGenerativeAI(model=os.getenv("IMAGE_MODERATION_REWRITE_MODEL") or "gemini-3-flash-preview", temperature=0.3)
            resp = llm.invoke([("system", _SAFETY_REWRITE_SYSTEM), ("human", prompt)])
            text = resp.content if isinstance(resp.content, str) else str(resp.content)
    except Exception as e:  # noqa: BLE001
        logger.warning("safety prompt rewrite via LLM failed: %s", e)
        return None
    text = (text or "").strip().strip("`").strip()
    if len(text) < 80:
        return None
    logger.info("safety prompt rewrite via LLM ok (%d -> %d chars)", len(prompt), len(text))
    return text


def soften_prompt_for_moderation(prompt: str, level: int = 1) -> str:
    """Rewrite a scene prompt so it stays on-story but reads as clearly safe and wholesome.

    ``level`` 1 swaps peril/fear vocabulary; level 2 additionally drops the hyper-realistic
    framing (realistic children in distress is what output moderation most often blocks);
    level 3 asks a text LLM to rewrite the scene (falls back to level 2 if that fails).
    """
    if level >= 3:
        rewritten = rewrite_prompt_for_safety(prompt)
        if rewritten:
            return (
                "Wholesome, family-friendly children's picture-book scene. Everyone is safe, calm and happy. "
                + rewritten
            )
        level = 2
    out = prompt
    for pattern, repl in _PERIL_REWRITES:
        out = re.sub(pattern, repl, out, flags=re.IGNORECASE)
    out = re.sub(r"\s{2,}", " ", out).strip()
    prefix = (
        "Wholesome, family-friendly children's picture-book scene. Everyone is safe, calm and happy; "
        "the mood is warm and playful with no danger, injury or distress. "
    )
    if level >= 2:
        out = re.sub(
            r"(ultra-realistic|hyper-realistic|hyperrealistic|photorealistic|purely photographic|8K realism|cinematic close-up)",
            "beautifully illustrated, soft painterly",
            out,
            flags=re.IGNORECASE,
        )
        prefix += "Render as a gentle storybook illustration with soft lighting and a cheerful palette. "
    return prefix + out


def _is_failover_status(status_code: int, err_text: str) -> bool:
    """True when the error is worth retrying on another alias/endpoint."""
    if status_code in (408, 409, 425, 429, 500, 502, 503, 504):
        return True
    low = err_text.lower()
    return any(kw in low for kw in ("model", "not found", "does not exist", "unsupported", "invalid_model", "rate_limit", "no available channel"))


def _image_api_key() -> str:
    """Key for the OpenAI-compatible Images endpoint.

    Prefers an explicit ``IMAGE_API_KEY``; otherwise the LaoZhang key when the base URL
    points at LaoZhang, else ``OPENAI_API_KEY``.
    """
    explicit = os.getenv("IMAGE_API_KEY")
    if explicit:
        return explicit
    base = (os.getenv("IMAGE_API_BASE") or DEFAULT_IMAGE_API_BASE).lower()
    if "laozhang" in base:
        key = os.getenv("LAOZHANG_API_KEY") or os.getenv("API_KEY_LAOZHANG")
        if key:
            return key
    key = os.getenv("LAOZHANG_API_KEY") or os.getenv("API_KEY_LAOZHANG") or os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError(
            "Missing API key for Images API. Set LAOZHANG_API_KEY, API_KEY_LAOZHANG, or IMAGE_API_KEY."
        )
    return key


def resolve_image_model(task_type: Optional[str] = None, explicit: Optional[str] = None) -> str:
    """Pick the image model for a task type.

    ``IMAGE_MODEL`` is the default for everything. ``IMAGE_MODEL_PAGES`` (optional) overrides
    for story pages only, so identity-critical sheets/cover can stay on the precise model while
    pages use a faster one.
    """
    if explicit:
        return explicit
    if task_type == "page":
        pages_model = (os.getenv("IMAGE_MODEL_PAGES") or "").strip()
        if pages_model:
            return pages_model
    return (os.getenv("IMAGE_MODEL") or os.getenv("LAOZHANG_IMAGE_MODEL") or DEFAULT_IMAGE_MODEL).strip()


def resolve_image_size(output_type: Optional[str] = None, explicit: Optional[str] = None) -> str:
    if explicit:
        return explicit
    if (output_type or "").upper() == "LULU_BOOK":
        return (os.getenv("IMAGE_SIZE_PRINT") or "2048x2048").strip()
    return (os.getenv("IMAGE_SIZE_DIGI") or os.getenv("IMAGE_SIZE") or DEFAULT_IMAGE_SIZE).strip()


def resolve_image_quality(explicit: Optional[str] = None) -> str:
    return (explicit or os.getenv("IMAGE_QUALITY") or DEFAULT_IMAGE_QUALITY).strip()


def _prepare_reference_file(path: Path, *, max_side_px: int, target_bytes: int) -> tuple[str, bytes, str]:
    """Return (filename, bytes, mime) for a reference image, downscaled to keep uploads small."""
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        w, h = im.size
        scale = min(1.0, max_side_px / float(max(w, h)))
        if scale < 1.0:
            im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        # PNG keeps facial detail lossless; fall back to JPEG if it is too large.
        buf = BytesIO()
        im.save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        if len(data) <= target_bytes:
            return (path.stem + ".png", data, "image/png")
        lo, hi = 60, 95
        best: Optional[bytes] = None
        while lo <= hi:
            q = (lo + hi) // 2
            buf = BytesIO()
            im.save(buf, format="JPEG", quality=q, optimize=True)
            data = buf.getvalue()
            if len(data) <= target_bytes:
                best = data
                lo = q + 1
            else:
                hi = q - 1
        if best is None:
            buf = BytesIO()
            im.save(buf, format="JPEG", quality=60, optimize=True)
            best = buf.getvalue()
        return (path.stem + ".jpg", best, "image/jpeg")


def _compose_prompt_with_labels(prompt: str, image_labels: Optional[List[str]], n_images: int) -> str:
    """The Images API has no interleaved parts; describe each input image's role in the prompt."""
    if not image_labels or len(image_labels) != n_images:
        return prompt
    lines = []
    for i, label in enumerate(image_labels, 1):
        clean = label.strip().rstrip(":")
        lines.append(f"Input image {i}: {clean}.")
    return "\n".join(lines) + "\n\n" + prompt


def _image_generator_openai_images(
    *,
    prompt: str,
    image_filenames: List[str],
    output_filename: Optional[str] = None,
    image_labels: Optional[List[str]] = None,
    model: Optional[str] = None,
    size: Optional[str] = None,
    quality: Optional[str] = None,
    task_type: Optional[str] = None,
    output_type: Optional[str] = None,
) -> Dict[str, Any]:
    """Generate one image via an OpenAI-compatible ``POST {base}/images/edits``.

    Works with LaoZhang (default base) and api.openai.com. Reference images are sent as
    multipart ``image[]`` parts in order; ``image_labels`` are folded into the prompt.
    Includes smart model snapshot fallback for gpt-image-2.5 models.
    """
    primary_model = resolve_image_model(task_type, model)
    size_val = resolve_image_size(output_type, size)
    quality_val = resolve_image_quality(quality)
    timeout_s = float(os.getenv("IMAGE_HTTP_TIMEOUT_S") or "420")

    ref_max_side_px = _env_int("IMAGE_REF_MAX_SIDE_PX", 1536)
    ref_target_bytes = _env_int("IMAGE_REF_TARGET_BYTES", 3_500_000)

    if not image_filenames:
        raise ValueError("openai_images provider requires at least one reference image")

    full_prompt = _compose_prompt_with_labels(prompt, image_labels, len(image_filenames))

    # Prepare reference bytes once; fresh tuples are built per HTTP attempt below.
    prepared_refs: List[tuple[str, bytes, str]] = []
    for path_str in image_filenames:
        p = Path(path_str)
        if not p.exists():
            raise FileNotFoundError(f"Image not found: {p}")
        prepared_refs.append(_prepare_reference_file(p, max_side_px=ref_max_side_px, target_bytes=ref_target_bytes))

    # Flatten (endpoint, model) attempts so a 429/503 on one proxy fails over to the next.
    attempts: List[tuple[str, str, str, str]] = []
    for label, api_base, api_key in _image_endpoints():
        for candidate in _get_model_candidates(primary_model, api_base):
            attempts.append((label, api_base, api_key, candidate))

    # Skip (endpoint, model) pairs that recently rate-limited, unless nothing else is left.
    live_attempts = [a for a in attempts if not _in_cooldown(a[1], a[3])]
    if live_attempts and len(live_attempts) < len(attempts):
        skipped = [f"{a[0]}:{a[3]}" for a in attempts if a not in live_attempts]
        logger.info("openai_images skipping cooled-down attempts: %s", ", ".join(skipped))
        attempts = live_attempts

    last_err: Optional[Exception] = None
    data: Dict[str, Any] = {}
    model_name = primary_model
    for idx, (label, api_base, api_key, model_name) in enumerate(attempts):
        is_last = idx + 1 >= len(attempts)
        url = f"{api_base}/images/edits"
        headers = {"Authorization": f"Bearer {api_key}"}
        files: List[tuple] = [("image[]", ref) for ref in prepared_refs]
        form = {
            "model": model_name,
            "prompt": full_prompt,
            "size": size_val,
            "quality": quality_val,
            "n": "1",
            "output_format": "png",
        }

        logger.info(
            "🎨 openai_images endpoint=%s model=%s (attempt %d/%d) size=%s quality=%s refs=%d task=%s url=%s",
            label, model_name, idx + 1, len(attempts), size_val, quality_val, len(files), task_type or "-", url,
        )

        t_call = time.time()
        try:
            response = requests.post(url, headers=headers, data=form, files=files, timeout=timeout_s)
        except Exception as e:
            last_err = e
            logger.warning("HTTP post error endpoint=%s model=%s: %s", label, model_name, e)
            if is_last:
                raise
            continue

        elapsed = time.time() - t_call
        logger.info("🕒 openai_images endpoint=%s model=%s status=%s elapsed_s=%.2f", label, model_name, response.status_code, elapsed)

        if response.status_code != 200:
            err_text = response.text[:1000]
            last_err = RuntimeError(f"Images API error {response.status_code} on {label} model {model_name}: {err_text}")
            if response.status_code == 451 or _looks_like_moderation(err_text):
                # Same prompt will be blocked everywhere; let the caller rewrite it instead.
                raise ImageModerationError(
                    f"Images API moderation block on {label} model {model_name}: {err_text[:400]}"
                )
            if response.status_code in (429, 502, 503, 504):
                _set_cooldown(api_base, model_name)
            if not is_last and _is_failover_status(response.status_code, err_text):
                nxt = attempts[idx + 1]
                logger.warning(
                    "endpoint=%s model=%s failed (%s %s); failing over to endpoint=%s model=%s",
                    label, model_name, response.status_code, err_text[:160], nxt[0], nxt[3],
                )
                continue
            raise last_err

        _clear_cooldown(api_base, model_name)
        try:
            data = response.json()
        except ValueError as e:
            raise RuntimeError(f"Images API returned non-JSON body: {response.text[:500]}") from e

        items = data.get("data") or []
        if not items:
            err = data.get("error")
            last_err = RuntimeError(f"Images API returned no image data: {json.dumps(err or data)[:800]}")
            if not is_last:
                logger.warning("No image data from endpoint=%s model=%s, trying next...", label, model_name)
                continue
            raise last_err

        item = items[0] or {}
        img_bytes: Optional[bytes] = None
        if item.get("b64_json"):
            img_bytes = base64.b64decode(item["b64_json"])
        elif item.get("url"):
            r2 = requests.get(item["url"], timeout=120)
            r2.raise_for_status()
            img_bytes = r2.content
        if not img_bytes:
            raise RuntimeError("Images API item had neither b64_json nor url")

        if output_filename:
            out_path = Path(output_filename)
            if out_path.suffix == "":
                out_path = out_path.with_suffix(".png")
        else:
            out_path = Path("generated_images") / f"gen_{int(time.time())}.png"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(img_bytes)

        usage = data.get("usage") if isinstance(data.get("usage"), dict) else None
        return {
            "images": [str(out_path)],
            "texts": [],
            "usage": usage,
            "model": model_name,
            "endpoint": label,
            "api_base": api_base,
            "elapsed_s": elapsed,
            "raw_response": {k: v for k, v in data.items() if k != "data"},
        }

    # All (endpoint, model) attempts were exhausted without a successful response.
    raise last_err or RuntimeError("Images API: no endpoint/model attempt succeeded")


def _encode_image_to_data_uri(
    path: Path,
    *,
    max_side_px: int = 1024,
    target_bytes: int = 500_000,
) -> str:
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Image not found: {path}")

    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")

        w, h = im.size
        scale = min(1.0, max_side_px / float(max(w, h)))
        if scale < 1.0:
            im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

        lo, hi = 40, 92
        best: Optional[bytes] = None
        while lo <= hi:
            q = (lo + hi) // 2
            buf = BytesIO()
            im.save(buf, format="JPEG", quality=q, optimize=True, progressive=True)
            data = buf.getvalue()
            if len(data) <= target_bytes:
                best = data
                lo = q + 1
            else:
                hi = q - 1

        if best is None:
            buf = BytesIO()
            im.save(buf, format="JPEG", quality=40, optimize=True, progressive=True)
            data = buf.getvalue()
        else:
            data = best

    b64 = base64.b64encode(data).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"


def _extract_data_uris(content: Any) -> List[str]:
    uris: List[str] = []
    if isinstance(content, str):
        uris.extend(re.findall(r"data:image/[^;]+;base64,[A-Za-z0-9+/=]+", content))
        return uris

    if isinstance(content, dict):
        img = content.get("image_url")
        if isinstance(img, dict) and isinstance(img.get("url"), str):
            uris.append(img["url"])
        url = content.get("url")
        if isinstance(url, str) and url.startswith("data:image/"):
            uris.append(url)
        text = content.get("text")
        if isinstance(text, str):
            uris.extend(re.findall(r"data:image/[^;]+;base64,[A-Za-z0-9+/=]+", text))
        return uris

    if isinstance(content, list):
        for item in content:
            uris.extend(_extract_data_uris(item))
        return uris

    return uris


def _image_generator_laozhang(
    *,
    prompt: str,
    image_filenames: List[str],
    output_filename: Optional[str] = None,
    image_labels: Optional[List[str]] = None,
) -> Dict[str, Any]:
    api_key = os.getenv("API_KEY_LAOZHANG") or os.getenv("LAOZHANG_API_KEY")
    if not api_key:
        raise RuntimeError("Missing API_KEY_LAOZHANG for LaoZhang image generation")

    api_base = (os.getenv("LAOZHANG_API_BASE") or "https://api.laozhang.ai").rstrip("/")
    if api_base.endswith("/v1"):
        api_base = api_base[:-3]
    if api_base.endswith("/v1beta"):
        api_base = api_base[:-6]
    model_name = os.getenv("LAOZHANG_IMAGE_MODEL") or "gemini-3.1-flash-image-preview"
    url = f"{api_base}/v1beta/models/{model_name}:generateContent"

    image_resolution = os.getenv("IMAGE_RESOLUTION") or "4K"
    aspect_ratio = os.getenv("IMAGE_ASPECT_RATIO") or "1:1"

    logger.info("🎨 Using image provider: laozhang")
    logger.info("🚀 LaoZhang API - Model: %s, URL: %s", model_name, url)
    logger.info("📐 Image config - Aspect Ratio: %s, Resolution: %s", aspect_ratio, image_resolution)
    logger.info("🧠 Thinking mode: enabled by default (Nano Banana Pro)")

    # Build content parts -- use interleaved Pattern C when labels are provided
    parts: List[Dict[str, Any]] = []
    total_b64_chars = 0

    ref_max_side_px = _env_int("IMAGE_REF_MAX_SIDE_PX", 1536)
    ref_target_bytes = _env_int("IMAGE_REF_TARGET_BYTES", 900_000)
    # Keep comfortably under typical inline limits; base64 expands ~4/3 and JSON adds overhead.
    max_total_b64_chars = _env_int("IMAGE_REF_MAX_TOTAL_B64_CHARS", 14_000_000)

    if image_labels and len(image_labels) == len(image_filenames):
        # Pattern C: [label_1, img_1, label_2, img_2, ..., prompt]
        logger.info("📌 Using interleaved Pattern C labeling (%d images)", len(image_filenames))
        for label, path_str in zip(image_labels, image_filenames):
            parts.append({"text": label})
            data_uri = _encode_image_to_data_uri(
                Path(path_str),
                max_side_px=ref_max_side_px,
                target_bytes=ref_target_bytes,
            )
            header, b64_data = data_uri.split(",", 1)
            mime = header.split(";")[0].replace("data:", "") or "image/jpeg"
            total_b64_chars += len(b64_data)
            parts.append({"inlineData": {"mimeType": mime, "data": b64_data}})
        parts.append({"text": prompt})
    else:
        # Legacy behavior: [prompt, img_1, img_2, ...]
        parts.append({"text": prompt})
        for path_str in image_filenames:
            data_uri = _encode_image_to_data_uri(
                Path(path_str),
                max_side_px=ref_max_side_px,
                target_bytes=ref_target_bytes,
            )
            header, b64_data = data_uri.split(",", 1)
            mime = header.split(";")[0].replace("data:", "") or "image/jpeg"
            total_b64_chars += len(b64_data)
            parts.append({"inlineData": {"mimeType": mime, "data": b64_data}})

    if total_b64_chars > max_total_b64_chars:
        logger.warning(
            "Reference images too large (%d base64 chars > %d). Falling back to safer encoding (1024px/500k).",
            total_b64_chars,
            max_total_b64_chars,
        )
        parts = []
        if image_labels and len(image_labels) == len(image_filenames):
            for label, path_str in zip(image_labels, image_filenames):
                parts.append({"text": label})
                data_uri = _encode_image_to_data_uri(Path(path_str), max_side_px=1024, target_bytes=500_000)
                header, b64_data = data_uri.split(",", 1)
                mime = header.split(";")[0].replace("data:", "") or "image/jpeg"
                parts.append({"inlineData": {"mimeType": mime, "data": b64_data}})
            parts.append({"text": prompt})
        else:
            parts.append({"text": prompt})
            for path_str in image_filenames:
                data_uri = _encode_image_to_data_uri(Path(path_str), max_side_px=1024, target_bytes=500_000)
                header, b64_data = data_uri.split(",", 1)
                mime = header.split(";")[0].replace("data:", "") or "image/jpeg"
                parts.append({"inlineData": {"mimeType": mime, "data": b64_data}})

    # Generation config - using only documented parameters from LaoZhang API
    use_experimental_params = _env_bool("LAOZHANG_EXPERIMENTAL_PARAMS", False)
    
    if use_experimental_params:
        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
                "temperature": 0.2,
                "topP": 0.7,
                "seed": 42,
                "imageConfig": {
                    "aspectRatio": aspect_ratio,
                    "imageSize": image_resolution,
                    "personGeneration": "ALLOW_ALL",
                },
            },
        }
        logger.info("⚙️ Using EXPERIMENTAL params: temperature, topP, seed, personGeneration")
    else:
        payload = {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "responseModalities": ["IMAGE"],
                "imageConfig": {
                    "aspectRatio": aspect_ratio,
                    "imageSize": image_resolution,
                },
            },
        }
        logger.info("⚙️ Using SAFE params: aspectRatio=%s, imageSize=%s only", aspect_ratio, image_resolution)

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    t_call = time.time()
    response = requests.post(url, headers=headers, json=payload, timeout=300)
    logger.info("🕒 LaoZhang response status=%s elapsed_s=%.2f", response.status_code, time.time() - t_call)
    
    if response.status_code != 200:
        raise RuntimeError(f"LaoZhang API error {response.status_code}: {response.text[:1000]}")

    data = response.json()
    data_uris: List[str] = []
    text_parts: List[str] = []
    candidates = data.get("candidates") or []
    for candidate in candidates:
        content = candidate.get("content") or {}
        for part in content.get("parts") or []:
            inline = part.get("inlineData") or {}
            if isinstance(inline, dict) and inline.get("data"):
                mime = inline.get("mimeType") or "image/png"
                data_uris.append(f"data:{mime};base64,{inline['data']}")
                continue
            if isinstance(part.get("text"), str):
                text_parts.append(part["text"])
                data_uris.extend(_extract_data_uris(part["text"]))

    if not data_uris:
        content = json.dumps(data)[:4000]
        data_uris.extend(_extract_data_uris(content))

    if not data_uris:
        logger.warning(
            "LaoZhang 200 but no image: candidates=%d promptFeedback=%s text_parts=%s",
            len(candidates), data.get("promptFeedback"), text_parts[:2],
        )
        raise RuntimeError("LaoZhang API returned no image data")

    def _resolve_out_path(out: str, ext: str) -> Path:
        p = Path(out)
        if p.suffix == "":
            p = p.with_suffix(ext)
        if p.parent and str(p.parent) not in (".", ""):
            p.parent.mkdir(parents=True, exist_ok=True)
        return p

    saved_paths: List[str] = []
    ts = int(time.time())

    if output_filename:
        requested_out_path = _resolve_out_path(output_filename, ".png")
    else:
        requested_out_path = None

    for idx, uri in enumerate(data_uris, 1):
        if "," not in uri:
            continue
        header, b64_data = uri.split(",", 1)
        mime = header.split(";")[0].replace("data:", "")
        ext = mimetypes.guess_extension(mime or "image/png") or ".png"
        out_path = (
            requested_out_path
            if requested_out_path is not None
            else Path("generated_images") / f"gen_{ts}_{idx}{ext}"
        )
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)

        with open(out_path, "wb") as f:
            f.write(base64.b64decode(b64_data))
        saved_paths.append(str(out_path))

        if output_filename:
            break

    return {
        "images": saved_paths,
        "texts": text_parts,
        "raw_response": data,
    }


def _make_genai_client():
    """
    Create a Google GenAI client.

    This project relies on the direct Gemini API via an API key.
    Set GEMINI_API_KEY in your environment.
    Cloud Run setups often use GOOGLE_API_KEY, which is also accepted.
    """
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Missing GEMINI_API_KEY / GOOGLE_API_KEY. Set it in your environment to use the Gemini API "
            "(example PowerShell: $env:GEMINI_API_KEY='YOUR_KEY')."
        )
    logger.info("Using Gemini API (GEMINI_API_KEY auth)")
    return genai.Client(api_key=api_key)


def image_generator(
    prompt: str,
    image_filenames: List[str],
    output_filename: Optional[str] = None,
    use_google_search: bool = False,
    image_provider: Optional[str] = None,
    image_labels: Optional[List[str]] = None,
    image_model: Optional[str] = None,
    image_size: Optional[str] = None,
    image_quality: Optional[str] = None,
    task_type: Optional[str] = None,
    output_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generate images with Gemini or GPT-Image using a prompt + reference image filenames.
    """
    provider = _resolve_image_provider(image_provider)
    if provider == "openai_images":
        return _image_generator_openai_images(
            prompt=prompt,
            image_filenames=image_filenames,
            output_filename=output_filename,
            image_labels=image_labels,
            model=image_model,
            size=image_size,
            quality=image_quality,
            task_type=task_type,
            output_type=output_type,
        )
    if provider == "laozhang":
        return _image_generator_laozhang(
            prompt=prompt,
            image_filenames=image_filenames,
            output_filename=output_filename,
            image_labels=image_labels,
        )

    # ---- Hardcoded config ----
    MODEL = "gemini-3.1-flash-image-preview"
    DEFAULT_OUTPUT_DIR = Path("generated_images")
    DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    TEMPERATURE = 0.2
    TOP_P = 0.7
    SEED = 42
    ENABLE_THINKING = False
    
    IMAGE_RESOLUTION = "4K"
    ASPECT_RATIO = "1:1"

    SYSTEM_INSTRUCTION = (
        "You are a photoreal image generator for character-consistent storybook scenes. "
        "Follow the prompt exactly. "
        "The reference is WHO the person is, not a face to paste. "
        "Photograph that same person inside the new scene: same age, bone structure, "
        "skin tone, and hair, but relight face, skin, hair, and clothes to match the "
        "scene's key light, weather, and color. "
        "Every human face points at the camera with both eyes visible -- the model "
        "only knows the uploaded front of the face. Body does the action; head stays "
        "frontal. Subtle photo-like expression only. "
        "Forbidden: face swap, cutout, collage, studio-lit face on a location plate, "
        "profile, 3/4 face, looking away. "
        "Output one real photograph with shared grain and texture across face and background."
    )

    client = _make_genai_client()

    reference_images = []
    for path_str in image_filenames:
        p = Path(path_str)
        if not p.exists():
            raise FileNotFoundError(f"Image not found: {p}")
        pil_image = Image.open(p).convert("RGB")
        reference_images.append((p, pil_image))
        logger.info(f"Loaded reference image: {p}")

    contents = []
    
    if image_labels and len(image_labels) == len(reference_images):
        logger.info("📌 Using interleaved Pattern C labeling (%d images)", len(reference_images))
        for label, (p, pil_image) in zip(image_labels, reference_images):
            contents.append(label)
            contents.append(pil_image)
            logger.info(f"Added: '{label}' -> {p.name}")
    else:
        for i, (p, pil_image) in enumerate(reference_images):
            char_name = p.stem.replace("_", " ").replace("-", " ").title()
            if i == 0:
                label = (
                    "Identity reference: photograph this same person inside the new scene; "
                    "face the camera with both eyes visible; relight them; do not paste the face; "
                    "do not invent a side of the face."
                )
            elif i == 1:
                label = f"Costume reference for {char_name}: same outfit and body, newly photographed in the scene."
            else:
                label = f"Companion reference ({char_name}): keep this exact look, photographed in the scene."
            contents.append(label)
            contents.append(pil_image)
            logger.info(f"Added: '{label}' -> {p.name}")
    
    contents.append(prompt)
    logger.info(f"Added prompt ({len(prompt)} chars)")

    # ``person_generation`` only exists in some google-genai releases; build the config
    # defensively so an SDK upgrade/downgrade cannot break the Gemini fallback path.
    try:
        image_config = ImageConfig(
            image_size=IMAGE_RESOLUTION,
            aspect_ratio=ASPECT_RATIO,
            person_generation="ALLOW_ALL",
        )
    except Exception:  # noqa: BLE001  (pydantic extra_forbidden on older/newer SDKs)
        image_config = ImageConfig(image_size=IMAGE_RESOLUTION, aspect_ratio=ASPECT_RATIO)

    gen_config_kwargs: dict = dict(
        system_instruction=SYSTEM_INSTRUCTION,
        response_modalities=[Modality.TEXT, Modality.IMAGE],
        temperature=TEMPERATURE,
        top_p=TOP_P,
        seed=SEED,
        image_config=image_config,
    )
    
    if use_google_search:
        try:
            gen_config_kwargs["tools"] = [Tool(google_search=GoogleSearch())]
        except TypeError:
            gen_config_kwargs["tools"] = [types.Tool(googleSearch=types.GoogleSearch())]
        logger.info("Google Search grounding ENABLED - model can fetch real-time info")
    
    if ENABLE_THINKING:
        gen_config_kwargs["thinking_config"] = ThinkingConfig(include_thoughts=True)

    gen_config = GenerateContentConfig(**gen_config_kwargs)

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=contents,
            config=gen_config,
        )
    except Exception as e:
        logger.error(f"Error calling Gemini API: {e}")
        raise RuntimeError(f"Gemini API call failed: {e}") from e

    logger.info(f"Response received from model: {MODEL}")
    
    if not hasattr(response, 'candidates') or not response.candidates:
        logger.error("No candidates in response")
        if hasattr(response, 'prompt_feedback'):
            logger.error(f"Prompt feedback: {response.prompt_feedback}")
        if hasattr(response, 'usage_metadata'):
            logger.error(f"Usage metadata: {response.usage_metadata}")
        raise RuntimeError("Gemini API returned no candidates. Check prompt safety filters or API limits.")
    
    first_candidate = response.candidates[0]
    if not hasattr(first_candidate, 'content') or not first_candidate.content:
        logger.error("No content in first candidate")
        if hasattr(first_candidate, 'finish_reason'):
            logger.error(f"Finish reason: {first_candidate.finish_reason}")
        if hasattr(first_candidate, 'safety_ratings'):
            logger.error(f"Safety ratings: {first_candidate.safety_ratings}")
        raise RuntimeError("First candidate has no content. Check safety ratings or finish reason.")

    parts = first_candidate.content.parts
    if not parts:
        logger.error("No parts found in content")
        raise RuntimeError("Response content has no parts. This is unexpected.")
    
    logger.info(f"Found {len(parts)} parts in response")

    saved_paths: List[str] = []
    text_parts: List[str] = []
    ts = int(time.time())

    def _resolve_out_path(out: str) -> Path:
        p = Path(out)
        if p.suffix == "":
            p = p.with_suffix(".png")
        if p.parent and str(p.parent) not in (".", ""):
            p.parent.mkdir(parents=True, exist_ok=True)
        return p

    if output_filename:
        requested_out_path = _resolve_out_path(output_filename)
        base_stem = requested_out_path.stem or f"gen_{ts}"
    else:
        requested_out_path = None
        base_stem = f"gen_{ts}"

    img_counter = 1
    first_image_saved = False
    thought_parts: List[str] = []
    
    for i, part in enumerate(parts):
        logger.info(f"Processing part {i+1}/{len(parts)}")
        
        if hasattr(part, "thought") and part.thought:
            thought_text = part.text if hasattr(part, "text") else str(part)
            logger.info(f"🧠 Model Thought: {thought_text[:200]}...")
            thought_parts.append(thought_text)
            continue
        
        if hasattr(part, "text") and part.text:
            logger.info(f"Found text part: {part.text[:100]}...")
            text_parts.append(part.text.strip())
            continue

        if hasattr(part, "inline_data") and part.inline_data and hasattr(part.inline_data, "data"):
            data = part.inline_data.data
            if not data:
                logger.warning(f"Image part {i+1} has no data; skipping")
                continue
            logger.info(f"Found image part {i+1} with data length: {len(data)}")
            
            if first_image_saved and output_filename:
                logger.warning(f"Skipping additional image {i+1} - only using first image to match expected filename")
                continue
            
            if output_filename:
                out_path = requested_out_path
            else:
                out_path = DEFAULT_OUTPUT_DIR / f"gen_{ts}_{img_counter}.png"

            logger.info(f"Saving image to: {out_path}")

            try:
                img = Image.open(BytesIO(data))
                img.save(out_path)
                saved_paths.append(str(out_path))
                logger.info(f"Successfully saved image: {out_path}")
                first_image_saved = True
                img_counter += 1

            except Exception as e:
                logger.error(f"Error saving image: {e}")
                raise RuntimeError(f"Failed to save image: {e}") from e
    
    if len(saved_paths) == 0:
        logger.error("No images were generated!")
        logger.error(f"Text parts received: {len(text_parts)}")
        for i, text in enumerate(text_parts):
            logger.error(f"  Text {i+1}: {text[:200]}...")
            
        raise RuntimeError(
            "No images were generated. Check the logs above for text responses "
            "and consider rephrasing your prompt to avoid safety filters."
        )

    if thought_parts:
        logger.info(f"🧠 Model reasoning captured ({len(thought_parts)} thought blocks)")
        for i, thought in enumerate(thought_parts):
            logger.debug(f"  Thought {i+1}: {thought[:300]}...")
    
    grounding_metadata = None
    if use_google_search and hasattr(first_candidate, 'grounding_metadata'):
        grounding_metadata = first_candidate.grounding_metadata
        if grounding_metadata:
            logger.info("🔍 Google Search grounding metadata captured")
            if hasattr(grounding_metadata, 'search_entry_point'):
                logger.info(f"   Search entry: {grounding_metadata.search_entry_point}")
            if hasattr(grounding_metadata, 'grounding_chunks') and grounding_metadata.grounding_chunks:
                logger.info(f"   Grounding chunks: {len(grounding_metadata.grounding_chunks)}")
    
    logger.info(f"Successfully processed {len(saved_paths)} images, {len(text_parts)} text parts, {len(thought_parts)} thoughts")
    return {
        "images": saved_paths, 
        "texts": text_parts, 
        "thoughts": thought_parts, 
        "grounding_metadata": grounding_metadata,
        "raw_response": response
    }


def image_generator_with_search(
    prompt: str,
    image_filenames: List[str],
    output_filename: Optional[str] = None,
    image_labels: Optional[List[str]] = None,
) -> Dict[str, Any]:
    return image_generator(
        prompt=prompt,
        image_filenames=image_filenames,
        output_filename=output_filename,
        use_google_search=True,
        image_labels=image_labels,
    )
