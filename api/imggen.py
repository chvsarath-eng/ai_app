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

# NOTE: Set GOOGLE_APPLICATION_CREDENTIALS in your notebook/script, not here.
# Example: os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = r"path/to/your/credentials.json"

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
      - ``openai_images``: OpenAI-compatible ``/images/edits`` (GPT-Image-2.5 via LaoZhang or OpenAI).
      - ``laozhang``: LaoZhang Gemini-style ``:generateContent`` (Nano Banana).
      - ``gemini``: direct Google GenAI SDK.
    """
    provider = (image_provider or os.getenv("IMAGE_PROVIDER") or "").strip().lower()
    if provider in ("openai_images", "openai-images", "openai", "gpt-image", "gpt_image"):
        return "openai_images"
    if provider in ("laozhang", "lz", "laozhang_gemini"):
        return "laozhang"
    if provider in ("gemini", "google", "vertex", "genai"):
        return "gemini"
    if os.getenv("LAOZHANG_API_KEY") or os.getenv("API_KEY_LAOZHANG"):
        return "laozhang"
    return "gemini"


# ---------------------------------------------------------------------------
# OpenAI-compatible Images API (GPT-Image-2.5 flare / sunburst)
# ---------------------------------------------------------------------------

DEFAULT_IMAGE_API_BASE = "https://api.laozhang.ai/v1"
# LaoZhang exposes GPT-Image-2.5 as "-vip" routes on the default group. The dated OpenAI snapshot
# (gpt-image-2.5-sunburst-2026-09-08) is only routed on enterprise groups / api.openai.com; override
# with IMAGE_MODEL when the key has access.
DEFAULT_IMAGE_MODEL = "gpt-image-2.5-sunburst-vip"
DEFAULT_IMAGE_QUALITY = "high"
DEFAULT_IMAGE_SIZE = "1024x1024"


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
        key = os.getenv("API_KEY_LAOZHANG") or os.getenv("LAOZHANG_API_KEY")
        if key:
            return key
    key = os.getenv("OPENAI_API_KEY") or os.getenv("API_KEY_LAOZHANG") or os.getenv("LAOZHANG_API_KEY")
    if not key:
        raise RuntimeError(
            "Missing API key for Images API. Set IMAGE_API_KEY, API_KEY_LAOZHANG or OPENAI_API_KEY."
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
    return (os.getenv("IMAGE_MODEL") or DEFAULT_IMAGE_MODEL).strip()


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
    """
    api_key = _image_api_key()
    api_base = (os.getenv("IMAGE_API_BASE") or DEFAULT_IMAGE_API_BASE).rstrip("/")
    if not api_base.endswith("/v1"):
        api_base = api_base + "/v1"
    url = f"{api_base}/images/edits"

    model_name = resolve_image_model(task_type, model)
    size_val = resolve_image_size(output_type, size)
    quality_val = resolve_image_quality(quality)
    timeout_s = float(os.getenv("IMAGE_HTTP_TIMEOUT_S") or "420")

    ref_max_side_px = _env_int("IMAGE_REF_MAX_SIDE_PX", 1536)
    ref_target_bytes = _env_int("IMAGE_REF_TARGET_BYTES", 3_500_000)

    if not image_filenames:
        raise ValueError("openai_images provider requires at least one reference image")

    full_prompt = _compose_prompt_with_labels(prompt, image_labels, len(image_filenames))

    files: List[tuple] = []
    for path_str in image_filenames:
        p = Path(path_str)
        if not p.exists():
            raise FileNotFoundError(f"Image not found: {p}")
        fname, data, mime = _prepare_reference_file(p, max_side_px=ref_max_side_px, target_bytes=ref_target_bytes)
        files.append(("image[]", (fname, data, mime)))

    form = {
        "model": model_name,
        "prompt": full_prompt,
        "size": size_val,
        "quality": quality_val,
        "n": "1",
        "output_format": "png",
    }

    logger.info(
        "🎨 openai_images model=%s size=%s quality=%s refs=%d task=%s url=%s",
        model_name, size_val, quality_val, len(files), task_type or "-", url,
    )

    headers = {"Authorization": f"Bearer {api_key}"}
    t_call = time.time()
    response = requests.post(url, headers=headers, data=form, files=files, timeout=timeout_s)
    elapsed = time.time() - t_call
    logger.info("🕒 openai_images status=%s elapsed_s=%.2f", response.status_code, elapsed)

    if response.status_code != 200:
        raise RuntimeError(f"Images API error {response.status_code}: {response.text[:1000]}")

    try:
        data = response.json()
    except ValueError as e:
        raise RuntimeError(f"Images API returned non-JSON body: {response.text[:500]}") from e

    items = data.get("data") or []
    if not items:
        err = data.get("error")
        raise RuntimeError(f"Images API returned no image data: {json.dumps(err or data)[:800]}")

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
        "elapsed_s": elapsed,
        "raw_response": {k: v for k, v in data.items() if k != "data"},
    }


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
    # Note: temperature/topP/seed may not be supported by all models
    # personGeneration moved inside imageConfig per Gemini API spec
    use_experimental_params = _env_bool("LAOZHANG_EXPERIMENTAL_PARAMS", False)
    
    if use_experimental_params:
        # Experimental: includes temperature, topP, seed, personGeneration
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
        # Safe/minimal: only documented working parameters
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
    Generate images with Gemini using a prompt + reference image filenames.

    Hardcoded:
      - model="gemini-3-pro-image-preview"
      - output_dir="generated_images"
      - temperature (tunable)
      - system_instruction focused on photoreal fidelity (esp. eyes/face)

    Args:
        prompt: The text prompt.
        image_filenames: List of paths (str) to reference images.
        output_filename: Desired output filename (with or without extension).
                         If multiple images are returned, they will be numbered:
                         <stem>_1.<ext>, <stem>_2.<ext>, ...
        use_google_search: If True, enables Google Search grounding for real-time
                          information (e.g., accurate costume details, cultural 
                          references, historical accuracy). Default: False.

    Returns:
        dict with:
          - images: saved image file paths
          - texts: any text parts returned
          - grounding_metadata: search grounding info (if enabled)
          - raw_response: SDK response object
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

    # Sampling params: lower randomness helps identity lock.
    TEMPERATURE = 0.2
    TOP_P = 0.7
    # Reproducibility (best-effort; model may still vary).
    SEED = 42
    # THINKING MODE:
    # Some Vertex image models reject ThinkingConfig/include_thoughts unless "thinking" is enabled
    # for that model. To avoid 400 INVALID_ARGUMENT, keep this OFF for image generation.
    ENABLE_THINKING = False
    
    # IMAGE RESOLUTION: Options are "1K", "2K", "4K" (4K costs more)
    # See: https://dev.to/googleai/introducing-nano-banana-pro-complete-developer-tutorial-5fc8
    IMAGE_RESOLUTION = "4K"
    
    # ASPECT RATIO: "1:1", "16:9", "9:16", "4:3", "3:4", etc.
    ASPECT_RATIO = "1:1"

    # System instruction optimized for identity-preserving storybook generation
    SYSTEM_INSTRUCTION = (
        "You are a photoreal image generator specializing in character-consistent storybook illustrations. "
        "Follow the prompt instructions exactly. "
        "CRITICAL: Preserve facial identity from reference images with 100% accuracy - "
        "same bone structure, facial features, skin tone, and age appearance. "
        "Output ultra-realistic 8K photographic images with natural skin texture, "
        "visible pores in focus areas, cinematic lighting, and dramatic depth of field. "
        "Hair should look natural with flyaways, not wig-like. "
        "Always maintain the exact face angle, expression, and identity specified in the prompt."
    )


    # ---- Client ----
    client = _make_genai_client()

    # ---- Open images as PIL Images (simpler approach) ----
    reference_images = []
    for path_str in image_filenames:
        p = Path(path_str)
        if not p.exists():
            raise FileNotFoundError(f"Image not found: {p}")
        # Load as PIL Image directly
        pil_image = Image.open(p).convert("RGB")
        reference_images.append((p, pil_image))  # Keep path for labeling
        logger.info(f"Loaded reference image: {p}")

    # ---- Build INTERLEAVED contents: text-image-text-image-prompt ----
    # Pattern C from ARCHITECTURE_V2.md: Each image preceded by its label
    # for clear model understanding of multi-character references.
    # See: https://ai.google.dev/gemini-api/docs/image-understanding
    
    contents = []
    
    if image_labels and len(image_labels) == len(reference_images):
        # V2: Use provided labels for precise character identification
        logger.info("📌 Using interleaved Pattern C labeling (%d images)", len(reference_images))
        for label, (p, pil_image) in zip(image_labels, reference_images):
            contents.append(label)
            contents.append(pil_image)
            logger.info(f"Added: '{label}' -> {p.name}")
    else:
        # V1 legacy: auto-generated labels from filenames
        for i, (p, pil_image) in enumerate(reference_images):
            char_name = p.stem.replace("_", " ").replace("-", " ").title()
            if i == 0:
                label = f"Reference Face Photo (use this exact face):"
            elif i == 1:
                label = f"Character Costume ({char_name} - copy this outfit and hair):"
            else:
                label = f"Supporting Character ({char_name}):"
            contents.append(label)
            contents.append(pil_image)
            logger.info(f"Added: '{label}' -> {p.name}")
    
    # Add the prompt text last
    contents.append(prompt)
    logger.info(f"Added prompt ({len(prompt)} chars)")

    # ---- CRITICAL: Request both IMAGE and TEXT output ----
    # See: https://dev.to/googleai/introducing-nano-banana-pro-complete-developer-tutorial-5fc8
    gen_config_kwargs: dict = dict(
        system_instruction=SYSTEM_INSTRUCTION,
        response_modalities=[Modality.TEXT, Modality.IMAGE],
        temperature=TEMPERATURE,
        top_p=TOP_P,
        seed=SEED,
        # IMAGE CONFIG: Resolution, aspect ratio, and person generation
        # personGeneration: ALLOW_ALL enables generation of adults AND children (required for storybooks)
        image_config=ImageConfig(
            image_size=IMAGE_RESOLUTION,  # "1K", "2K", or "4K"
            aspect_ratio=ASPECT_RATIO,    # "1:1", "16:9", etc.
            person_generation="ALLOW_ALL",  # Enable adults + children for storybooks
        ),
    )
    
    # ---- GOOGLE SEARCH GROUNDING ----
    # When enabled, the model can search for real-time information like:
    # - Accurate costume/outfit details for characters
    # - Cultural/historical references
    # - Location-specific details
    # - Current trends or styles
    # Note: Image-based search results are excluded from generation
    if use_google_search:
        # The SDK has had both google_search and googleSearch shapes across examples.
        # Prefer the snake_case constructor used by our imports, but fall back if needed.
        try:
            gen_config_kwargs["tools"] = [Tool(google_search=GoogleSearch())]
        except TypeError:
            gen_config_kwargs["tools"] = [types.Tool(googleSearch=types.GoogleSearch())]
        logger.info("Google Search grounding ENABLED - model can fetch real-time info")
    
    if ENABLE_THINKING:
        # Only enable when you have confirmed your target model supports it.
        # Otherwise Vertex may return:
        # "Thinking_config.include_thoughts is only enabled when thinking is enabled."
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

    # ---- Simplified response processing with better error handling ----
    logger.info(f"Response received from model: {MODEL}")
    
    # Basic validation
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

    # ---- Parse and save outputs ----
    saved_paths: List[str] = []
    text_parts: List[str] = []

    ts = int(time.time())

    def _resolve_out_path(out: str) -> Path:
        """
        Respect user-provided directories in output_filename.
        If no extension is provided, default to .png.
        """
        p = Path(out)
        if p.suffix == "":
            p = p.with_suffix(".png")
        # Ensure directory exists (supports output like generated/page_1.png)
        if p.parent and str(p.parent) not in (".", ""):
            p.parent.mkdir(parents=True, exist_ok=True)
        return p

    if output_filename:
        requested_out_path = _resolve_out_path(output_filename)
        base_stem = requested_out_path.stem or f"gen_{ts}"
    else:
        requested_out_path = None
        base_stem = f"gen_{ts}"

    # ---- Process parts and save outputs ----
    img_counter = 1
    first_image_saved = False  # Track if we've saved the first image
    thought_parts: List[str] = []  # Store model's thinking process
    
    for i, part in enumerate(parts):
        logger.info(f"Processing part {i+1}/{len(parts)}")
        
        # Handle THINKING parts (model's reasoning process)
        # See: https://dev.to/googleai/introducing-nano-banana-pro-complete-developer-tutorial-5fc8
        if hasattr(part, "thought") and part.thought:
            thought_text = part.text if hasattr(part, "text") else str(part)
            logger.info(f"🧠 Model Thought: {thought_text[:200]}...")
            thought_parts.append(thought_text)
            continue
        
        # Handle text parts (captions, descriptions)
        if hasattr(part, "text") and part.text:
            logger.info(f"Found text part: {part.text[:100]}...")
            text_parts.append(part.text.strip())
            continue

        # Handle image parts
        if hasattr(part, "inline_data") and part.inline_data and hasattr(part.inline_data, "data"):
            data = part.inline_data.data
            if not data:
                logger.warning(f"Image part {i+1} has no data; skipping")
                continue
            logger.info(f"Found image part {i+1} with data length: {len(data)}")
            
            # CRITICAL FIX: Only save the FIRST image to avoid filename conflicts
            if first_image_saved and output_filename:
                logger.warning(f"Skipping additional image {i+1} - only using first image to match expected filename")
                continue
            
            # Determine output filename - always use exact name requested (no _1, _2 suffixes)
            if output_filename:
                out_path = requested_out_path
            else:
                out_path = DEFAULT_OUTPUT_DIR / f"gen_{ts}_{img_counter}.png"

            logger.info(f"Saving image to: {out_path}")

            try:
                # Save the image
                img = Image.open(BytesIO(data))
                img.save(out_path)
                saved_paths.append(str(out_path))
                logger.info(f"Successfully saved image: {out_path}")
                first_image_saved = True
                img_counter += 1

            except Exception as e:
                logger.error(f"Error saving image: {e}")
                raise RuntimeError(f"Failed to save image: {e}") from e
    
    # ---- Validate we got at least one image ----
    if len(saved_paths) == 0:
        logger.error("No images were generated!")
        logger.error("This might be because:")
        logger.error("1. Safety filters blocked the content")
        logger.error("2. The model didn't understand it should return an image")
        logger.error("3. There was an issue with the response_modalities setting")
        
        # Show what we did get
        logger.error(f"Text parts received: {len(text_parts)}")
        for i, text in enumerate(text_parts):
            logger.error(f"  Text {i+1}: {text[:200]}...")
            
        raise RuntimeError(
            "No images were generated. Check the logs above for text responses "
            "and consider rephrasing your prompt to avoid safety filters."
        )

    # Log thinking summary if available
    if thought_parts:
        logger.info(f"🧠 Model reasoning captured ({len(thought_parts)} thought blocks)")
        for i, thought in enumerate(thought_parts):
            logger.debug(f"  Thought {i+1}: {thought[:300]}...")
    
    # ---- Extract grounding metadata if Google Search was used ----
    grounding_metadata = None
    if use_google_search and hasattr(first_candidate, 'grounding_metadata'):
        grounding_metadata = first_candidate.grounding_metadata
        if grounding_metadata:
            logger.info("🔍 Google Search grounding metadata captured")
            # Log search queries if available
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
    """
    Convenience wrapper for image_generator with Google Search grounding enabled.
    
    Use this when you need the model to look up real-time information for:
    - Accurate costume/outfit details (e.g., "traditional Indian wedding attire")
    - Cultural/historical references (e.g., "Viking warrior armor")
    - Location-specific details (e.g., "current Tokyo street fashion")
    - Character-specific details (e.g., "Spider-Man suit details")
    
    Note: Image-based search results are excluded from generation.
    The model uses text-based search results to inform the image creation.
    
    Args:
        prompt: The text prompt (can include search-worthy terms).
        image_filenames: List of paths to reference images.
        output_filename: Desired output filename.
        image_labels: Optional labels for interleaved Pattern C labeling.
    
    Returns:
        dict with images, texts, thoughts, grounding_metadata, raw_response
    """
    return image_generator(
        prompt=prompt,
        image_filenames=image_filenames,
        output_filename=output_filename,
        use_google_search=True,
        image_labels=image_labels,
    )

