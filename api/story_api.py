from __future__ import annotations

import json
import os
import ast
import re
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

from strgen import Story_content_generator_with_usage, Story_content_generator
from storygen_v2 import (
    Story_content_generator_v2,
    build_identity_card,
    anatomy_lock_suffix,
    emotion_lock_suffix,
    scene_integration_prefix,
    sheet_anti_collage_suffix,
    sheet_companion_suffix,
    strip_collage_language,
)

import time

logger = logging.getLogger("story_api")


def _ensure_story_paths_consistent(story: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enforce critical path conventions so downstream steps can rely on:
      - original face at: input_images/original_face.jpeg
      - generated outputs use relative paths as returned by the model
    """
    face_rel = "input_images/original_face.jpeg"

    try:
        if "characters" in story and "main_character" in story["characters"]:
            story["characters"]["main_character"]["input_images"] = [face_rel]
    except Exception:
        pass

    try:
        if "book" in story and isinstance(story["book"], dict):
            imgs = story["book"].get("input_images") or []
            imgs = [p for p in imgs if isinstance(p, str)]
            if not imgs or imgs[0] != face_rel:
                imgs = [face_rel] + [p for p in imgs if p != face_rel]
            story["book"]["input_images"] = imgs
    except Exception:
        pass

    try:
        if "pages" in story and isinstance(story["pages"], list):
            for page in story["pages"]:
                if not isinstance(page, dict):
                    continue
                imgs = page.get("input_images") or []
                imgs = [p for p in imgs if isinstance(p, str)]
                if not imgs or imgs[0] != face_rel:
                    imgs = [face_rel] + [p for p in imgs if p != face_rel]
                page["input_images"] = imgs
    except Exception:
        pass

    return story


def _limit_supporting_characters(story: Dict[str, Any], max_supporting: int = 1) -> Dict[str, Any]:
    """
    Enforce a hard cap on supporting characters and clean up any references.
    """
    try:
        characters = story.get("characters")
        if not isinstance(characters, dict):
            return story

        supports = characters.get("supporting_characters")
        if not isinstance(supports, list):
            supports = []

        kept: List[Dict[str, Any]] = [s for s in supports if isinstance(s, dict)][:max_supporting]
        characters["supporting_characters"] = kept
        story["characters"] = characters

        allowed_support_images = {
            s.get("output_image")
            for s in kept
            if isinstance(s.get("output_image"), str)
        }

        def _filter_images(images: Any) -> Any:
            if not isinstance(images, list):
                return images
            filtered: List[str] = []
            for p in images:
                if not isinstance(p, str):
                    continue
                if p.startswith("generated/support_") and p not in allowed_support_images:
                    continue
                filtered.append(p)
            return filtered

        if isinstance(story.get("book"), dict):
            story["book"]["input_images"] = _filter_images(story["book"].get("input_images"))
        if isinstance(story.get("pages"), list):
            for page in story["pages"]:
                if isinstance(page, dict):
                    page["input_images"] = _filter_images(page.get("input_images"))
    except Exception:
        return story

    return story


def _to_abs_paths(*, base_dir: Path, rel_paths: List[str]) -> List[str]:
    out: List[str] = []
    for p in rel_paths:
        if not p:
            continue
        pp = Path(p)
        out.append(str(pp if pp.is_absolute() else (base_dir / pp)))
    return out


def clean_json_output(json_str: str) -> str:
    """
    Remove markdown code fences from an LLM JSON string (best-effort).
    """
    s = (json_str or "").strip()
    if not s:
        return s

    if s.startswith("```"):
        # Remove first fence
        s = s.split("```", 1)[1]
        s = s.lstrip()
        # Remove optional language tag
        if s.startswith("json"):
            s = s[4:].lstrip()
        # Remove trailing fence
        if "```" in s:
            s = s.rsplit("```", 1)[0].strip()

    return s.strip()


def _unwrap_double_curly_braces(s: str) -> str:
    """
    Some LLMs output JSON wrapped in double-curly braces like:
      {{ "foo": "bar" }}
    which is not valid JSON. Convert the OUTERMOST wrapper only.
    """
    t = (s or "").strip()
    if t.startswith("{{") and t.endswith("}}"):
        # Only unwrap if it looks like a single top-level object wrapper.
        # (Avoid touching templating syntax; this file isn't Liquid, but be safe.)
        inner = t[2:-2].strip()
        if inner.startswith("{") or inner.startswith("[") or ":" in inner:
            return "{" + inner + "}"
    return t


def _extract_first_json_object_block(s: str) -> Optional[str]:
    """
    Best-effort extraction of the first {...} JSON object from a string.
    This helps when the model adds extra prose before/after the JSON.
    """
    if not s:
        return None
    start = s.find("{")
    end = s.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return s[start : end + 1]


_JSON_LINE_COMMENT_RE = re.compile(r"^\s*//.*$", re.MULTILINE)
_JSON_BLOCK_COMMENT_RE = re.compile(r"/\*[\s\S]*?\*/", re.MULTILINE)
_JSON_TRAILING_COMMA_RE = re.compile(r",(\s*[\]}])")


def _cleanup_jsonish(s: str) -> str:
    """
    Best-effort cleanup for model outputs that are *almost* JSON:
      - Remove full-line // comments (common when the model echoes schema comments)
      - Remove /* ... */ block comments
      - Remove trailing commas before } or ]

    NOTE: This is intentionally conservative:
      - It does NOT strip inline // comments because that could corrupt URLs (https://...)
    """
    t = (s or "").replace("\r\n", "\n").replace("\r", "\n")
    t = _JSON_BLOCK_COMMENT_RE.sub("", t)
    t = _JSON_LINE_COMMENT_RE.sub("", t)
    # Repeat trailing-comma removal until stable (handles nested cases).
    prev = None
    while prev != t:
        prev = t
        t = _JSON_TRAILING_COMMA_RE.sub(r"\1", t)
    return t.strip()


def parse_llm_json(raw_text: str) -> Dict[str, Any]:
    """
    Parse JSON-ish model output into a Python dict.
    Handles:
      - markdown fences
      - leading/trailing text
      - outer {{ ... }} wrapper
      - python-dict-like output via ast.literal_eval (fallback)
    """
    cleaned = clean_json_output(raw_text)
    cleaned = _unwrap_double_curly_braces(cleaned)
    cleaned = _cleanup_jsonish(cleaned)

    # 1) Strict JSON
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 2) Extract likely JSON block and retry
    block = _extract_first_json_object_block(cleaned)
    if block:
        block = _unwrap_double_curly_braces(block)
        block = _cleanup_jsonish(block)
        try:
            return json.loads(block)
        except json.JSONDecodeError:
            pass

    # 3) Fallback: python literal dict/list (single quotes, trailing commas, etc.)
    # NOTE: this is safe-ish compared to eval(), but still only use on trusted output.
    candidate = _cleanup_jsonish(block or cleaned)
    try:
        val = ast.literal_eval(candidate)
        if isinstance(val, dict):
            return val
        # Some models return list at top-level; wrap for compatibility.
        if isinstance(val, list):
            return {"items": val}
    except Exception:
        pass

    # Give a helpful error with a short preview
    preview = (cleaned or "").strip().replace("\n", "\\n")
    preview = preview[:500]
    raise ValueError(
        "Model output was not valid JSON. "
        "Preview (first 500 chars): "
        f"{preview}"
    )


def _coerce_model_text_to_string(value: Any) -> str:
    """
    LangChain/Gemini can return message content as:
      - str
      - dict like {"type": "text", "text": "...", ...}
      - list of such dicts (multimodal parts)
    This normalizes it into a single string (concatenated text parts).
    """
    if value is None:
        return ""

    if isinstance(value, str):
        return value

    # Common: {"type":"text","text":"..."}
    if isinstance(value, dict):
        if isinstance(value.get("text"), str):
            return value["text"]
        # Sometimes {"content": "..."} or {"message": "..."}
        for k in ("content", "message", "data"):
            if isinstance(value.get(k), str):
                return value[k]
        return json.dumps(value, ensure_ascii=False)

    # Common: [{"type":"text","text":"..."}, ...]
    if isinstance(value, list):
        parts: List[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
                continue
            if isinstance(item, dict):
                if isinstance(item.get("text"), str):
                    parts.append(item["text"])
                    continue
                if isinstance(item.get("content"), str):
                    parts.append(item["content"])
                    continue
            # Fallback: stable stringify
            parts.append(str(item))
        return "\n".join(p for p in parts if p.strip())

    return str(value)


@dataclass(frozen=True)
class GeminiTokenPricing:
    """
    Token pricing in USD per 1M tokens.
    Supply the correct rates for your billing model + model name.
    """

    input_usd_per_1m: float
    output_usd_per_1m: float


def estimate_gemini_cost_usd(
    usage: Dict[str, Any],
    *,
    pricing: Optional[GeminiTokenPricing] = None,
) -> Optional[Dict[str, Any]]:
    """
    Estimate USD cost from normalized usage.

    Expected minimal shape:
      usage = {"input_tokens": int, "output_tokens": int, "total_tokens": int?}

    Extra fields are allowed (and ignored for billing math), e.g.:
      usage["output_token_details"]["reasoning"]  # Gemini "thinking" tokens breakdown

    If pricing is not provided and env vars are missing, returns None.

    Env fallbacks:
      - GEMINI_INPUT_USD_PER_1M
      - GEMINI_OUTPUT_USD_PER_1M
    """
    if not usage:
        return None

    input_tokens = int(usage.get("input_tokens") or 0)
    output_tokens = int(usage.get("output_tokens") or 0)

    # Optional: surface reasoning token breakdown for debugging.
    reasoning_tokens: Optional[int] = None
    output_details = usage.get("output_token_details")
    if isinstance(output_details, dict):
        r = output_details.get("reasoning")
        if isinstance(r, int):
            reasoning_tokens = r

    if pricing is None:
        in_rate = os.getenv("GEMINI_INPUT_USD_PER_1M")
        out_rate = os.getenv("GEMINI_OUTPUT_USD_PER_1M")
        if in_rate and out_rate:
            pricing = GeminiTokenPricing(
                input_usd_per_1m=float(in_rate),
                output_usd_per_1m=float(out_rate),
            )
        else:
            return None

    input_cost = (input_tokens / 1_000_000.0) * pricing.input_usd_per_1m
    output_cost = (output_tokens / 1_000_000.0) * pricing.output_usd_per_1m
    total_cost = input_cost + output_cost

    result: Dict[str, Any] = {
        "currency": "USD",
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "input_usd_per_1m": pricing.input_usd_per_1m,
        "output_usd_per_1m": pricing.output_usd_per_1m,
        "input_cost_usd": input_cost,
        "output_cost_usd": output_cost,
        "total_cost_usd": total_cost,
    }

    # Debug-only fields (do not affect cost math).
    if reasoning_tokens is not None:
        result["reasoning_tokens"] = reasoning_tokens

    return result


def estimate_story_cost_usd(
    usage: Optional[Dict[str, Any]],
    *,
    model: Optional[str] = None,
    pricing: Optional[GeminiTokenPricing] = None,
) -> Optional[Dict[str, Any]]:
    """USD estimate for the story LLM call. Uses explicit rates, then known model defaults."""
    if pricing is not None:
        out = estimate_gemini_cost_usd(usage or {}, pricing=pricing)
        if out:
            out["model"] = model
            out["billing"] = "token"
        return out

    env_in = os.getenv("STORY_INPUT_USD_PER_1M") or os.getenv("GEMINI_INPUT_USD_PER_1M")
    env_out = os.getenv("STORY_OUTPUT_USD_PER_1M") or os.getenv("GEMINI_OUTPUT_USD_PER_1M")
    name = (model or "").lower()
    if "terra" in name:
        rates = GeminiTokenPricing(float(env_in or 2.0), float(env_out or 12.0))
    elif "gpt-5.5" in name:
        rates = GeminiTokenPricing(float(env_in or 5.0), float(env_out or 30.0))
    elif env_in and env_out:
        rates = GeminiTokenPricing(float(env_in), float(env_out))
    else:
        return None
    out = estimate_gemini_cost_usd(usage or {}, pricing=rates)
    if out:
        out["model"] = model
        out["billing"] = "token"
    return out


def build_book_ai_cost(
    *,
    story_model: Optional[str],
    story_usage: Optional[Dict[str, Any]],
    story_cost: Optional[Dict[str, Any]],
    image_items: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Roll up story + every successful image call into one finished-book total."""
    from imggen import estimate_image_call_cost_usd

    story = dict(story_cost or {}) if story_cost else estimate_story_cost_usd(
        story_usage or {}, model=story_model
    ) or {}
    story_usd = float(story.get("total_cost_usd") or 0.0)

    image_rows: List[Dict[str, Any]] = []
    images_usd = 0.0
    for item in image_items:
        cost = item.get("cost")
        if not isinstance(cost, dict) or cost.get("usd") is None:
            cost = estimate_image_call_cost_usd(
                model_name=item.get("model"),
                usage=item.get("usage") if isinstance(item.get("usage"), dict) else None,
                api_base=item.get("api_base"),
            )
        usd = float(cost.get("usd") or 0.0)
        images_usd += usd
        image_rows.append(
            {
                "name": item.get("name"),
                "type": item.get("type"),
                "page_number": item.get("page_number"),
                "model": item.get("model") or cost.get("model"),
                "billing": cost.get("billing"),
                "usd": usd,
            }
        )

    total = round(story_usd + images_usd, 6)
    summary = {
        "currency": "USD",
        "total_usd": total,
        "story": {
            "model": story_model,
            "billing": story.get("billing") or "token",
            "input_tokens": story.get("input_tokens") or (story_usage or {}).get("input_tokens"),
            "output_tokens": story.get("output_tokens") or (story_usage or {}).get("output_tokens"),
            "usd": round(story_usd, 6),
        },
        "images": {
            "count": len(image_rows),
            "usd": round(images_usd, 6),
            "items": image_rows,
        },
        "note": (
            "Images on LaoZhang -vip / gpt-image-2-web are $0.03 per successful call. "
            "Story is token-billed. Failed 503s are not counted."
        ),
    }
    return summary


def _persist_ai_cost(
    base_dir: Path,
    cost: Dict[str, Any],
    progress: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> None:
    try:
        (Path(base_dir) / "cost.json").write_text(json.dumps(cost, indent=2), encoding="utf-8")
    except Exception:
        logger.exception("failed to write cost.json")
    logger.info(
        "ai_cost_total usd=%.4f story_usd=%.4f images_usd=%.4f image_calls=%d",
        float(cost.get("total_usd") or 0),
        float((cost.get("story") or {}).get("usd") or 0),
        float((cost.get("images") or {}).get("usd") or 0),
        int((cost.get("images") or {}).get("count") or 0),
    )
    if progress:
        try:
            progress("ai_cost_ready", cost)
        except Exception:
            logger.exception("progress_cb failed for ai_cost_ready")


def _write_image_manifest(
    base_dir: Path,
    *,
    output_type: str,
    tasks: List[Dict[str, Any]],
    generated: Optional[List[Dict[str, Any]]] = None,
    image_params: Optional[Dict[str, Any]] = None,
) -> Path:
    """Save prompts + refs so a later hardcover order can re-render at print size."""
    from imggen import resolve_image_model, resolve_image_quality, resolve_image_size

    params = image_params or {}
    payload = {
        "version": 1,
        "output_type": output_type,
        "size": resolve_image_size(output_type, params.get("size")),
        "print_size": resolve_image_size("LULU_BOOK"),
        "model": resolve_image_model("cover", params.get("model"), output_type),
        "quality": resolve_image_quality("cover", params.get("quality"), output_type),
        "tasks": tasks,
        "generated": generated or [],
    }
    path = Path(base_dir) / "image_manifest.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def generate_story_json_with_cost(
    *,
    story_prompt: str,
    image_paths: List[str],
    output_dir: str = "generated",
    save_files: bool = True,
    pricing: Optional[GeminiTokenPricing] = None,
    model: Optional[str] = None,
    model_provider: Optional[str] = None,
    temperature: float = 0.4,
    thinking_level: str = "high",
    seed: int = 42,
    save_dir: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Notebook -> function:
    - calls Gemini via LangChain (see strgen.py)
    - cleans/parses JSON
    - optionally saves story_data.json + timestamped copy
    - returns story dict + token usage + cost estimate

    Returns:
      {
        "story": <dict>,
        "model": <str>,
        "usage": <dict>,          # may be {}
        "cost": <dict|None>,      # None if no rates available
        "files": { ... }          # only when save_files=True
      }
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    # Prefer the usage-enabled version; fall back to old string-only function if needed.
    raw_text: str
    usage: Dict[str, int]
    try:
        out = Story_content_generator_with_usage(
            story_prompt=story_prompt,
            image_paths=image_paths,
            output_dir=output_dir,
            model=model,
            model_provider=model_provider,
            temperature=temperature,
            thinking_level=thinking_level,
            seed=seed,
        )
        raw_text = _coerce_model_text_to_string(out.get("text"))
        usage = dict(out.get("usage") or {})
    except Exception:
        raw_text = Story_content_generator(
            story_prompt=story_prompt,
            image_paths=image_paths,
            output_dir=output_dir,
            model=model,
            model_provider=model_provider,
            temperature=temperature,
            thinking_level=thinking_level,
            seed=seed,
        )
        usage = {}

    try:
        story = parse_llm_json(raw_text)
    except Exception as e:
        # Persist the raw output for debugging (helps when model returns non-JSON).
        try:
            base = Path(save_dir).resolve() if save_dir else Path(".").resolve()
            base.mkdir(parents=True, exist_ok=True)
            with (base / "last_story_raw.txt").open("w", encoding="utf-8") as f:
                f.write(raw_text or "")
        except Exception:
            pass
        raise ValueError(
            "Failed to parse model output as JSON. "
            "Saved raw output to last_story_raw.txt for inspection."
        ) from e

    # Enforce supporting character limit and consistent relative paths used downstream.
    story = _limit_supporting_characters(story, max_supporting=1)
    story = _ensure_story_paths_consistent(story)

    files: Dict[str, str] = {}
    if save_files:
        base = Path(save_dir).resolve() if save_dir else Path(".").resolve()
        base.mkdir(parents=True, exist_ok=True)

        story_filename = base / "story_data.json"
        with story_filename.open("w", encoding="utf-8") as f:
            json.dump(story, f, indent=2, ensure_ascii=False)

        files = {
            "story_data": str(story_filename),
        }

    return {
        "story": story,
        "model": model,
        "usage": usage,
        "cost": estimate_story_cost_usd(usage, model=model, pricing=pricing),
        "files": files,
    }


def generate_ebook_html_bundle(
    *,
    job_dir: str,
    story_prompt: str,
    face_image_path: str,
    pricing: Optional[GeminiTokenPricing] = None,
    model: Optional[str] = None,
    model_provider: Optional[str] = None,
    output_type: str = "DIGI_BOOK",
    temperature: float = 0.4,
    thinking_level: str = "high",
    seed: int = 42,
    progress_cb: Optional[Callable[[str, Dict[str, Any]], None]] = None,
) -> Dict[str, Any]:
    """
    End-to-end pipeline:
      - story JSON (story_data.json) inside job_dir
      - generate all images referenced in JSON
      - generate PDF and HTML flipbook based on output_type

    output_type:
      - "DIGI_BOOK": generates PDF + HTML flipbook for digital viewing
      - "LULU_BOOK": generates interior PDF + cover PDF for print

    Returns high-level paths + timing.
    """
    from imggen import image_generator
    from create_storybook_html import create_storybook_html
    from lulu_digi_book_maker import generate_lulu_pdfs
    from concurrent.futures import ThreadPoolExecutor, as_completed

    # Normalize output_type
    output_type = (output_type or "DIGI_BOOK").upper().strip()
    if output_type not in ("DIGI_BOOK", "LULU_BOOK"):
        output_type = "DIGI_BOOK"

    def _progress(stage: str, extra: Optional[Dict[str, Any]] = None) -> None:
        details = extra or {}
        logger.info("stage=%s details=%s", stage, details)
        if progress_cb:
            try:
                progress_cb(stage, details)
            except Exception:
                logger.exception("progress_cb failed for stage=%s", stage)

    # Determine model based on provider
    if model_provider and model_provider.lower() in ("openai", "oai", "gpt"):
        model = model or os.getenv("STORY_MODEL") or "gpt-5.6-terra"
    else:
        model = model or os.getenv("STORY_MODEL") or "gemini-3.1-pro-preview"

    base_dir = Path(job_dir).resolve()
    base_dir.mkdir(parents=True, exist_ok=True)
    (base_dir / "input_images").mkdir(parents=True, exist_ok=True)
    (base_dir / "generated").mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    _progress(
        "story_generation_start",
        {"model_provider": model_provider, "model": model, "thinking_level": thinking_level},
    )
    story_out = generate_story_json_with_cost(
        story_prompt=story_prompt,
        image_paths=[face_image_path],
        output_dir=str(base_dir / "generated"),
        save_files=True,
        pricing=pricing,
        model=model,
        model_provider=model_provider,
        temperature=temperature,
        thinking_level=thinking_level,
        seed=seed,
        save_dir=str(base_dir),
    )
    story = story_out["story"]
    t_story = time.time() - t0
    _progress(
        "story_generation_done",
        {
            "story_s": t_story,
            "pages": len(story.get("pages") or []),
            "supporting_characters": len(
                ((story.get("characters") or {}).get("supporting_characters") or [])
            ),
        },
    )

    # --- Concurrency knobs (keep simple) ---
    # 5-at-a-time as requested; can be overridden via env if needed later.
    max_image_workers = int(os.getenv("IMAGE_CONCURRENCY") or "5")

    def _is_retryable_error(e: Exception) -> bool:
        msg = (str(e) or "").lower()
        return (
            "429" in msg
            or "resource_exhausted" in msg
            or "rate limit" in msg
            or "quota" in msg
            or "too many requests" in msg
            or "exceeded" in msg and "limit" in msg
            or "no images were generated" in msg
            or "no parts found in content" in msg
            or "image part" in msg and "no data" in msg
        )

    def _call_image_with_retry(
        *,
        prompt: str,
        image_filenames: List[str],
        output_filename: str,
        task_name: str,
    ) -> Dict[str, Any]:
        # Very small, production-friendly backoff. Avoids failing whole job on transient 429.
        max_attempts = int(os.getenv("IMAGE_MAX_ATTEMPTS") or "6")
        base_sleep_s = float(os.getenv("IMAGE_RETRY_BASE_SLEEP_S") or "2.0")
        prompt_len = len(prompt or "")
        for attempt in range(1, max_attempts + 1):
            try:
                logger.info(
                    "image_call_start task=%s attempt=%d/%d prompt_len=%d inputs=%d",
                    task_name,
                    attempt,
                    max_attempts,
                    prompt_len,
                    len(image_filenames),
                )
                t_call = time.time()
                result = image_generator(
                    prompt=prompt,
                    image_filenames=image_filenames,
                    output_filename=output_filename,
                )
                logger.info(
                    "image_call_done task=%s attempt=%d elapsed_s=%.2f",
                    task_name,
                    attempt,
                    time.time() - t_call,
                )
                return result
            except Exception as e:
                err_msg = (str(e) or "")[:300]
                if attempt >= max_attempts or not _is_retryable_error(e):
                    logger.error("image_call_failed task=%s attempt=%d error=%s", task_name, attempt, err_msg)
                    raise
                sleep_s = min(60.0, base_sleep_s * (2 ** (attempt - 1)))
                logger.warning(
                    "image_call_retry task=%s attempt=%d sleep_s=%.2f error=%s",
                    task_name,
                    attempt,
                    sleep_s,
                    err_msg,
                )
                time.sleep(sleep_s)
        # Unreachable
        return {}

    # Build unified generation task list (characters, cover, pages) – same logic as notebook.
    generation_tasks: List[Dict[str, Any]] = []

    main_char = (story.get("characters") or {}).get("main_character") or {}
    if main_char:
        generation_tasks.append(
            {
                "type": "character",
                "name": f"Main Character ({main_char.get('name', 'Unknown')})",
                "prompt": main_char.get("prompt", ""),
                "input_images": main_char.get("input_images", []),
                "output_image": main_char.get("output_image", "generated/main.png"),
            }
        )

    for i, char in enumerate(((story.get("characters") or {}).get("supporting_characters") or []), 1):
        if not isinstance(char, dict):
            continue
        generation_tasks.append(
            {
                "type": "character",
                "name": f"Supporting Character {i} ({char.get('name', 'Unknown')})",
                "prompt": char.get("prompt", ""),
                "input_images": char.get("input_images", []),
                "output_image": char.get("output_image", f"generated/support_{i}.png"),
            }
        )

    if isinstance(story.get("book"), dict):
        book = story["book"]
        generation_tasks.append(
            {
                "type": "cover",
                "name": f"Book Cover ({book.get('title', 'Untitled')})",
                "prompt": book.get("prompt", ""),
                "input_images": book.get("input_images", []),
                "output_image": book.get("output_image", "generated/book_cover.png"),
            }
        )

    for page in (story.get("pages") or []):
        if not isinstance(page, dict):
            continue
        generation_tasks.append(
            {
                "type": "page",
                "name": f"Page {page.get('page_number', '?')}",
                "prompt": page.get("prompt", ""),
                "input_images": page.get("input_images", []),
                "output_image": page.get("output_image", "generated/page.png"),
            }
        )

    # Generate images with simple dependency phases:
    #  - Phase 1 (parallel): character sheets (main + supporting)
    #  - Phase 2 (parallel): cover + pages (now that refs exist)
    t1 = time.time()
    generated: List[Dict[str, Any]] = []
    phase1 = [t for t in generation_tasks if t.get("type") == "character"]
    phase2 = [t for t in generation_tasks if t.get("type") != "character"]
    _progress(
        "images_start",
        {
            "tasks_total": len(generation_tasks),
            "phase1": len(phase1),
            "phase2": len(phase2),
            "concurrency": max_image_workers,
        },
    )

    def _run_one(task: Dict[str, Any]) -> Dict[str, Any]:
        rel_inputs = (task.get("input_images") or []) if isinstance(task.get("input_images"), list) else []
        abs_inputs = _to_abs_paths(base_dir=base_dir, rel_paths=[str(p) for p in rel_inputs])
        rel_out = str(task.get("output_image") or "")
        if not rel_out:
            raise ValueError(f"Task missing output_image: {task.get('name')}")
        abs_out = str((base_dir / rel_out).resolve())

        task_name = task.get("name") or task.get("type") or "image"
        task_type = task.get("type") or "unknown"
        task_start = time.time()
        logger.info(
            "image_task_start name=%s type=%s inputs=%d",
            task_name,
            task_type,
            len(abs_inputs),
        )
        res = _call_image_with_retry(
            prompt=str(task.get("prompt") or ""),
            image_filenames=abs_inputs,
            output_filename=abs_out,
            task_name=task_name,
        )
        saved = (res.get("images") or [None])[0]
        logger.info(
            "image_task_done name=%s type=%s elapsed_s=%.2f output=%s",
            task_name,
            task_type,
            time.time() - task_start,
            rel_out,
        )
        return {
            "name": task.get("name"),
            "type": task.get("type"),
            "output_image": rel_out,
            "saved_path": saved,
            "model": res.get("model"),
            "usage": res.get("usage"),
            "cost": res.get("cost"),
            "api_base": res.get("api_base"),
        }

    def _run_phase(tasks: List[Dict[str, Any]], *, phase_name: str) -> List[Dict[str, Any]]:
        if not tasks:
            return []
        phase_start = time.time()
        _progress("images_phase_start", {"phase": phase_name, "count": len(tasks)})
        results: List[Dict[str, Any]] = []
        failed: List[Tuple[Dict[str, Any], Exception]] = []
        with ThreadPoolExecutor(max_workers=max_image_workers) as ex:
            fut_to_task = {ex.submit(_run_one, task): task for task in tasks}
            for fut in as_completed(fut_to_task):
                task = fut_to_task[fut]
                try:
                    results.append(fut.result())
                except Exception as e:
                    failed.append((task, e))
        # Retry only failed tasks (avoid re-running successful ones)
        retry_rounds = int(os.getenv("IMAGE_FAILED_TASK_RETRIES") or "2")
        for round_idx in range(1, retry_rounds + 1):
            if not failed:
                break
            logger.warning(
                "Retrying %d failed image tasks (round %d/%d)",
                len(failed),
                round_idx,
                retry_rounds,
            )
            next_failed: List[Tuple[Dict[str, Any], Exception]] = []
            for task, _err in failed:
                try:
                    results.append(_run_one(task))
                except Exception as e:
                    next_failed.append((task, e))
            failed = next_failed
        if failed:
            # Keep it simple: fail the job with a concise error list.
            errors = [f"{task.get('name') or task.get('type')}: {err}" for task, err in failed]
            raise RuntimeError("One or more image generations failed: " + " | ".join(errors[:5]))
        _progress(
            "images_phase_done",
            {"phase": phase_name, "count": len(results), "elapsed_s": time.time() - phase_start},
        )
        return results

    generated.extend(_run_phase(phase1, phase_name="characters"))
    generated.extend(_run_phase(phase2, phase_name="pages_and_cover"))
    t_images = time.time() - t1
    _progress(
        "images_done",
        {"generated_count": len(generated), "images_s": t_images},
    )

    # Generate PDF and flipbook based on output_type
    _progress("pdf_generation_start", {"output_type": output_type})
    t2 = time.time()
    story_json_path = str(base_dir / "story_data.json")
    images_dir = str(base_dir / "generated")
    output_dir = str(base_dir / "book_outputs")

    # generate_lulu_pdfs returns (pdf_path, html_path) for DIGI_BOOK
    # or (interior_path, cover_path) for LULU_BOOK
    pdf_result = generate_lulu_pdfs(
        story_data_path=story_json_path,
        images_dir=images_dir,
        output_dir=output_dir,
        output_type=output_type,
        upload_outputs=False,  # We handle uploads separately
    )

    t_pdf = time.time() - t2
    _progress("pdf_generation_done", {"pdf_s": t_pdf})

    # Build result based on output_type
    result: Dict[str, Any] = {
        "job_dir": str(base_dir),
        "story_json_path": story_json_path,
        "output_type": output_type,
        "generated_count": len(generated),
        "generated": generated,
        "cost": build_book_ai_cost(
            story_model=story_out.get("model"),
            story_usage=story_out.get("usage"),
            story_cost=story_out.get("cost"),
            image_items=generated,
        ),
    }

    if output_type == "DIGI_BOOK":
        pdf_path, html_path = pdf_result
        result["pdf_path"] = str(pdf_path) if pdf_path else None
        result["html_path"] = str(html_path) if html_path else None
        result["artifacts"] = {
            "pdf": str(pdf_path) if pdf_path else None,
            "flipbook_html": str(html_path) if html_path else None,
        }
    else:  # LULU_BOOK
        interior_path, cover_path = pdf_result
        result["interior_pdf_path"] = str(interior_path) if interior_path else None
        result["cover_pdf_path"] = str(cover_path) if cover_path else None
        result["artifacts"] = {
            "interior_pdf": str(interior_path) if interior_path else None,
            "cover_pdf": str(cover_path) if cover_path else None,
        }
        # No HTML for LULU_BOOK
        result["html_path"] = None

    result["timing"] = {
        "story_s": t_story,
        "images_s": t_images,
        "pdf_s": t_pdf,
        "total_s": time.time() - t0,
    }
    _persist_ai_cost(base_dir, result["cost"], _progress)
    _progress("pipeline_done", {"timing": result["timing"], "cost": result["cost"]})

    return result


# ═══════════════════════════════════════════════════════════════════════════
# V2 -- Multi-character orchestration
# ═══════════════════════════════════════════════════════════════════════════


_RECURRING_PET_LOCKS = {
    "dog": "the same medium dog every page: warm tan coat, darker ears, white chest blaze, brown eyes, black nose, slightly floppy ears",
    "puppy": "the same small puppy every page: warm tan coat, darker ears, white chest blaze, brown eyes, black nose",
    "cat": "the same cat every page: short orange tabby coat, white paws, green eyes, pink nose",
    "kitten": "the same kitten every page: short orange tabby coat, white paws, green eyes",
    "horse": "the same horse every page: chestnut coat, black mane and tail, white star on the forehead",
    "pony": "the same pony every page: chestnut coat, black mane, white star on the forehead",
}


def _maybe_add_recurring_companion(story: Dict[str, Any], num_uploaded: int) -> None:
    """If the story keeps naming a pet but the model skipped a sheet, add one."""
    characters = story.get("characters")
    if not isinstance(characters, list):
        return
    if any(isinstance(c, dict) and (c.get("source") == "invented") for c in characters):
        return
    if len([c for c in characters if isinstance(c, dict)]) > num_uploaded:
        return
    pages = story.get("pages") if isinstance(story.get("pages"), list) else []
    blob = " ".join(
        str(p.get("story") or "") + " " + str(p.get("prompt") or "")
        for p in pages if isinstance(p, dict)
    ).lower()
    book = story.get("book") if isinstance(story.get("book"), dict) else {}
    blob += " " + str(book.get("prompt") or "").lower()
    if not blob:
        return
    counts = {word: len(re.findall(rf"\b{word}s?\b", blob)) for word in _RECURRING_PET_LOCKS}
    best = max(counts, key=counts.get)
    if counts[best] < 3:
        return
    lock = _RECURRING_PET_LOCKS[best]
    name = best.title()
    idx = len(characters) + 1
    characters.append({
        "index": idx,
        "name": name,
        "character_type": best,
        "source": "invented",
        "role": "companion",
        "description": lock,
        "identity_card": lock,
        "prompt": (
            f"Create a two-panel studio identity sheet of ONLY {name}, {lock}. "
            "LEFT a close-up of this companion. RIGHT a full-body of the same companion. "
            "Zero humans. Do not copy any child's face."
        ),
    })
    logger.info("added invented companion from story text: %s mentions=%d", best, counts[best])


COMPANION_STUDIO_REF = "input_images/companion_studio_ref.jpeg"
PAGE_STORY_MIN_WORDS = 160
PAGE_STORY_TARGET_WORDS = 180


def _ensure_companion_studio_ref(base_dir: Optional[Path] = None) -> str:
    """Blank studio plate so invented companions are not generated from the child's face."""
    dest = (Path(base_dir) / COMPANION_STUDIO_REF) if base_dir else Path(COMPANION_STUDIO_REF)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 800:
        return COMPANION_STUDIO_REF
    from PIL import Image
    Image.new("RGB", (1024, 1024), (236, 230, 218)).save(dest, format="JPEG", quality=90)
    return COMPANION_STUDIO_REF


def _page_word_count(text: Any) -> int:
    return len(str(text or "").split())


def _expand_short_page_stories(
    story: Dict[str, Any],
    *,
    model_provider: Optional[str],
    model: Optional[str],
    thinking_level: str = "high",
    seed: int = 42,
) -> Dict[str, Any]:
    """If the model wrote sparse pages, expand them so the printed right page fills."""
    from strgen import _build_llm
    from langchain_core.messages import HumanMessage, SystemMessage

    pages = story.get("pages") if isinstance(story.get("pages"), list) else []
    short = [
        p for p in pages
        if isinstance(p, dict) and _page_word_count(p.get("story")) < PAGE_STORY_MIN_WORDS
    ]
    if not short:
        return story

    payload = [
        {
            "page_number": p.get("page_number"),
            "story": p.get("story") or "",
            "words": _page_word_count(p.get("story")),
        }
        for p in short
    ]
    llm = _build_llm(
        model_provider=model_provider,
        model=model,
        temperature=0.4,
        thinking_level=thinking_level,
        seed=seed,
    )
    messages = [
        SystemMessage(content=(
            "You expand children's storybook pages so each printed right-hand page looks full. "
            "Keep the same events, characters, and order. Simple everyday English. "
            "Each rewritten page: 160-200 words, 12-16 sentences, 4 short paragraphs. "
            "Return JSON only: {\"pages\": [{\"page_number\": 1, \"story\": \"...\"}]}"
        )),
        HumanMessage(content=json.dumps({"pages": payload}, ensure_ascii=False)),
    ]
    try:
        message = llm.invoke(messages)
        raw = _coerce_model_text_to_string(getattr(message, "content", ""))
        expanded = parse_llm_json(raw)
    except Exception:
        logger.exception("short_page_expand_failed count=%d", len(short))
        return story

    by_num = {}
    for item in (expanded.get("pages") or []):
        if isinstance(item, dict) and item.get("page_number") is not None:
            by_num[int(item["page_number"])] = str(item.get("story") or "").strip()
    filled = 0
    for page in pages:
        if not isinstance(page, dict):
            continue
        try:
            num = int(page.get("page_number"))
        except (TypeError, ValueError):
            continue
        new_text = by_num.get(num)
        if new_text and _page_word_count(new_text) > _page_word_count(page.get("story")):
            page["story"] = new_text
            filled += 1
    logger.info(
        "short_page_expand pages=%d expanded=%d",
        len(short),
        filled,
    )
    return story


def _ensure_story_paths_consistent_v2(
    story: Dict[str, Any],
    num_characters: int,
    *,
    base_dir: Optional[Path] = None,
) -> Dict[str, Any]:
    """
    Enforce V2 path conventions:
      - Uploaded face photos at: input_images/char_N_face.jpeg
      - Invented companions use a blank studio plate, never the child's face
      - Character sheets at: generated/char_N_sheet.png
      - Cover/page input_images use original face then costume sheet per uploaded person
    """
    _maybe_add_recurring_companion(story, num_characters)
    # Fix character paths
    characters = story.get("characters")
    if isinstance(characters, list):
        # Drop extra invented companions beyond one so payloads stay small.
        uploaded: List[Dict[str, Any]] = []
        invented: List[Dict[str, Any]] = []
        _animal_tokens = ("pet", "animal", "dog", "cat", "horse", "puppy", "kitten", "bird")
        for char in characters:
            if not isinstance(char, dict):
                continue
            source = (char.get("source") or "").strip().lower()
            kind = " ".join(
                str(char.get(k) or "") for k in ("character_type", "relationship", "role", "description")
            ).lower()
            looks_animal = any(tok in kind for tok in _animal_tokens)
            if source == "invented" or looks_animal or len(uploaded) >= num_characters:
                invented.append(char)
            else:
                uploaded.append(char)
        characters[:] = uploaded + invented[:1]
        for i, char in enumerate(characters, 1):
            if not isinstance(char, dict):
                continue
            char["index"] = i
            is_invented = i > num_characters or (char.get("source") or "").lower() == "invented"
            if is_invented:
                char["source"] = "invented"
                char["role"] = char.get("role") or "companion"
                char["input_images"] = [_ensure_companion_studio_ref(base_dir)]
                char["output_image"] = f"generated/char_{i}_sheet.png"
                char["identity_card"] = build_identity_card(char)
                raw_prompt = strip_collage_language(str(char.get("prompt") or ""))
                leaked_human = any(
                    tok in raw_prompt.lower()
                    for tok in ("uploaded face", "same person", "child's face", "two-panel identity sheet only")
                )
                if not raw_prompt or leaked_human:
                    name = char.get("name") or "the companion"
                    card = char.get("identity_card") or name
                    raw_prompt = (
                        f"Create a two-panel studio identity sheet of ONLY {name}, {card}. "
                        "LEFT a close-up of this companion. RIGHT a full-body of the same companion. "
                        "Zero humans. No child's face."
                    )
                char["prompt"] = raw_prompt + sheet_companion_suffix(char)
            else:
                char["source"] = "photo"
                char["input_images"] = [f"input_images/char_{i}_face.jpeg"]
                if "role" not in char:
                    char["role"] = "main" if i == 1 else "supporting"
                char["output_image"] = f"generated/char_{i}_sheet.png"
                char["identity_card"] = build_identity_card(char)
                char["prompt"] = strip_collage_language(str(char.get("prompt") or "")) + sheet_anti_collage_suffix()

    char_list = characters if isinstance(characters, list) else []
    total_chars = len(char_list) or num_characters
    valid_idxs = {c.get("index") for c in char_list if isinstance(c, dict)}
    companion_idxs = [
        c.get("index")
        for c in char_list
        if isinstance(c, dict) and (c.get("source") == "invented")
    ]

    def _clean_cis(raw: List[Any]) -> List[int]:
        cleaned = [int(x) for x in raw if isinstance(x, (int, float)) and int(x) in valid_idxs]
        return cleaned or [1]

    def _build_input_images_for_scene(chars_in_scene: List[int]) -> List[str]:
        imgs: List[str] = []
        for idx in chars_in_scene:
            char = next((c for c in char_list if isinstance(c, dict) and c.get("index") == idx), None)
            invented = bool(char and (char.get("source") or "") == "invented")
            if not invented:
                imgs.append(f"input_images/char_{idx}_face.jpeg")
            imgs.append(f"generated/char_{idx}_sheet.png")
        return imgs

    def _include_companion_if_mentioned(cis: List[int], text: str) -> List[int]:
        out = [int(x) for x in cis if isinstance(x, (int, float))]
        blob = (text or "").lower()
        for char in char_list:
            if not isinstance(char, dict) or char.get("source") != "invented":
                continue
            idx = char.get("index")
            name = str(char.get("name") or "").strip().lower()
            kind = str(char.get("character_type") or "").strip().lower()
            tokens = [t for t in (name, kind) if t and t not in ("pet", "animal", "companion")]
            if idx and idx not in out and any(t in blob for t in tokens):
                out.append(idx)
        return out or [1]

    def _finalize_scene_prompt(raw: str, cis: List[int], story_text: str = "", emotion_beat: Optional[str] = None) -> str:
        cleaned = strip_collage_language(str(raw or ""))
        prefix = scene_integration_prefix(char_list, cis)
        return f"{prefix}{cleaned}{emotion_lock_suffix(story_text, emotion_beat)}{anatomy_lock_suffix()}"

    # Fix book paths
    book = story.get("book")
    if isinstance(book, dict):
        cis = book.get("characters_in_scene")
        if not (isinstance(cis, list) and cis):
            cis = list(range(1, total_chars + 1))
        cis = _clean_cis(cis)
        if companion_idxs:
            for idx in companion_idxs:
                if idx not in cis:
                    cis.append(idx)
        book["characters_in_scene"] = cis
        book["input_images"] = _build_input_images_for_scene(cis)
        book["prompt"] = _finalize_scene_prompt(book.get("prompt", ""), cis, book.get("title") or "", "focused")
        if not book.get("output_image"):
            book["output_image"] = "generated/book_cover.png"

    # Fix page paths
    pages = story.get("pages")
    if isinstance(pages, list):
        for i, page in enumerate(pages, 1):
            if not isinstance(page, dict):
                continue
            if page.get("page_number") is None:
                page["page_number"] = i
            cis = page.get("characters_in_scene")
            if not (isinstance(cis, list) and cis):
                cis = [1]
            cis = _include_companion_if_mentioned(
                _clean_cis(cis),
                str(page.get("story") or "") + " " + str(page.get("prompt") or ""),
            )
            page["characters_in_scene"] = cis
            page["input_images"] = _build_input_images_for_scene(cis)
            page["prompt"] = _finalize_scene_prompt(
                page.get("prompt", ""),
                cis,
                str(page.get("story") or ""),
                page.get("emotion_beat"),
            )
            if not page.get("output_image"):
                page["output_image"] = f"generated/page_{page['page_number']}.png"

    return story


def generate_ebook_html_bundle_v2(
    *,
    job_dir: str,
    story_prompt: str,
    face_image_paths: List[str],
    character_metadata: Optional[List[Dict[str, Any]]] = None,
    pricing: Optional[GeminiTokenPricing] = None,
    model: Optional[str] = None,
    model_provider: Optional[str] = None,
    output_type: str = "DIGI_BOOK",
    temperature: float = 0.4,
    thinking_level: str = "high",
    seed: int = 42,
    progress_cb: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    image_params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    V2 multi-character pipeline:
      1. Generate story JSON via storygen_v2 (multi-character system prompt)
      2. Phase 1: Generate character sheets (one per character, parallel)
      3. Phase 2: Generate cover + pages with interleaved Pattern C labeling
      4. Generate PDF + HTML flipbook

    Args:
        face_image_paths: List of 1-4 face image paths.
        character_metadata: Optional list of dicts with name/age/gender/relationship.
        image_params: Optional per-job overrides for image generation:
            ``provider``, ``model``, ``model_pages``, ``quality``, ``size``.

    Progress events (via ``progress_cb``), in addition to the legacy stage names:
        ``story_ready``  -> {title, cover_text, pages:[{page_number, story}], characters:[{index,name}]}
        ``image_ready``  -> {type, name, page_number, output_image, saved_path, elapsed_s, done, total}
    """
    from imggen import image_generator
    from create_storybook_html import create_storybook_html
    from lulu_digi_book_maker import generate_lulu_pdfs
    from concurrent.futures import ThreadPoolExecutor, as_completed


    num_chars = len(face_image_paths)
    if num_chars < 1 or num_chars > 4:
        raise ValueError(f"Expected 1-4 face images, got {num_chars}")

    output_type = (output_type or "DIGI_BOOK").upper().strip()
    if output_type not in ("DIGI_BOOK", "LULU_BOOK"):
        output_type = "DIGI_BOOK"

    def _progress(stage: str, extra: Optional[Dict[str, Any]] = None) -> None:
        details = extra or {}
        logger.info("stage=%s details=%s", stage, details)
        if progress_cb:
            try:
                progress_cb(stage, details)
            except Exception:
                logger.exception("progress_cb failed for stage=%s", stage)

    # Model selection
    if model_provider and model_provider.lower() in ("openai", "oai", "gpt"):
        model = model or os.getenv("STORY_MODEL") or "gpt-5.6-terra"
    else:
        model = model or os.getenv("STORY_MODEL") or "gemini-3.1-pro-preview"

    base_dir = Path(job_dir).resolve()
    base_dir.mkdir(parents=True, exist_ok=True)
    (base_dir / "input_images").mkdir(parents=True, exist_ok=True)
    (base_dir / "generated").mkdir(parents=True, exist_ok=True)

    normalized_faces: List[str] = []
    for i, face_path in enumerate(face_image_paths, 1):
        dest = base_dir / "input_images" / f"char_{i}_face.jpeg"
        src = Path(face_path)
        if not src.exists():
            raise FileNotFoundError(f"Face photo not found: {src}")
        if src.resolve() != dest.resolve():
            from PIL import Image as _PILImage, ImageOps as _PILOps
            with _PILImage.open(src) as im:
                im = _PILOps.exif_transpose(im)
                if im.mode != "RGB":
                    im = im.convert("RGB")
                im.save(dest, format="JPEG", quality=95, optimize=True)
        normalized_faces.append(str(dest))
    face_image_paths = normalized_faces

    # Build character_inputs for storygen_v2
    character_inputs: List[Dict[str, Any]] = []
    for i, face_path in enumerate(face_image_paths):
        meta = {}
        if character_metadata and i < len(character_metadata):
            meta = character_metadata[i] or {}

        character_inputs.append({
            "face_path": face_path,
            "name": meta.get("name") or f"Character {i + 1}",
            "age": meta.get("age"),
            "gender": meta.get("gender"),
            "relationship": meta.get("relationship") or ("main" if i == 0 else "family"),
            "role": "main" if i == 0 else "supporting",
        })

    # --- Step 1: Story Generation ---
    t0 = time.time()
    _progress(
        "story_generation_start",
        {
            "model_provider": model_provider,
            "model": model,
            "num_characters": num_chars,
            "thinking_level": thinking_level,
        },
    )

    story_result = Story_content_generator_v2(
        story_prompt=story_prompt,
        character_inputs=character_inputs,
        output_dir=str(base_dir / "generated"),
        model=model,
        model_provider=model_provider,
        temperature=temperature,
        thinking_level=thinking_level,
        seed=seed,
    )

    raw_text = _coerce_model_text_to_string(story_result.get("text"))
    usage = dict(story_result.get("usage") or {})

    try:
        story = parse_llm_json(raw_text)
    except Exception as e:
        try:
            with (base_dir / "last_story_raw.txt").open("w", encoding="utf-8") as f:
                f.write(raw_text or "")
        except Exception:
            pass
        raise ValueError(
            "Failed to parse V2 model output as JSON. "
            "Saved raw output to last_story_raw.txt for inspection."
        ) from e

    # Enforce V2 paths
    story = _ensure_story_paths_consistent_v2(story, num_chars, base_dir=base_dir)
    story = _expand_short_page_stories(
        story,
        model_provider=model_provider,
        model=model,
        thinking_level=thinking_level,
        seed=seed,
    )

    # Save story_data.json
    story_json_path = str(base_dir / "story_data.json")
    with open(story_json_path, "w", encoding="utf-8") as f:
        json.dump(story, f, indent=2, ensure_ascii=False)

    t_story = time.time() - t0
    _progress(
        "story_generation_done",
        {
            "story_s": t_story,
            "pages": len(story.get("pages") or []),
            "characters": len(story.get("characters") or []),
        },
    )

    # Publish the readable story text right away so the client can fill the book shell
    # while illustrations are still rendering.
    _book_meta = story.get("book") if isinstance(story.get("book"), dict) else {}
    _progress(
        "story_ready",
        {
            "title": _book_meta.get("title") or "",
            "cover_text": _book_meta.get("cover_text") or _book_meta.get("subtitle") or "",
            "pages": [
                {"page_number": p.get("page_number", i + 1), "story": p.get("story") or ""}
                for i, p in enumerate(story.get("pages") or [])
                if isinstance(p, dict)
            ],
            "characters": [
                {"index": c.get("index", i + 1), "name": c.get("name") or f"Character {i + 1}"}
                for i, c in enumerate(story.get("characters") or [])
                if isinstance(c, dict)
            ],
            "story_s": t_story,
        },
    )

    # --- Concurrency setup ---
    # Default is high enough to render cover + 10 pages in a single wave; 429s are retried below.
    max_image_workers = int(os.getenv("IMAGE_CONCURRENCY") or "10")
    _img = image_params or {}
    _img_provider = _img.get("provider") or None
    _img_model = _img.get("model") or None
    _img_model_pages = _img.get("model_pages") or None
    _img_quality = _img.get("quality") or None
    _img_quality_pages = _img.get("quality_pages") or os.getenv("IMAGE_QUALITY_PAGES") or None
    _img_size = _img.get("size") or None

    def _is_retryable_error(e: Exception) -> bool:
        msg = (str(e) or "").lower()
        return (
            "429" in msg
            or "resource_exhausted" in msg
            or "rate limit" in msg
            or "quota" in msg
            or "too many requests" in msg
            or "no images were generated" in msg
            or "no parts found in content" in msg
            or "503" in msg
            or "502" in msg
            or "timed out" in msg
            or "timeout" in msg
        )

    def _call_image_with_retry_v2(
        *,
        prompt: str,
        image_filenames: List[str],
        output_filename: str,
        task_name: str,
        image_labels: Optional[List[str]] = None,
        task_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        from imggen import is_moderation_error, soften_prompt_for_moderation

        max_attempts = int(os.getenv("IMAGE_MAX_ATTEMPTS") or "6")
        base_sleep_s = float(os.getenv("IMAGE_RETRY_BASE_SLEEP_S") or "2.0")
        is_print = (output_type or "").upper() == "LULU_BOOK"
        if is_print:
            model_for_task = _img.get("model_print") or _img_model
            quality_for_task = _img.get("quality_print") or "high"
        elif task_type == "character":
            model_for_task = _img_model
            quality_for_task = _img_quality or "high"
        else:
            # Digital cover/pages: cheaper SKU — flare + medium unless overridden.
            model_for_task = _img_model_pages
            quality_for_task = _img_quality_pages or "medium"

        # Moderation blocks are deterministic for a given prompt: rewrite the scene to be
        # clearly wholesome (2 levels), then try the alternate provider before giving up.
        moderation_level = 0
        max_moderation_rewrites = int(os.getenv("IMAGE_MODERATION_REWRITES") or "3")
        provider_for_task = _img_provider
        current_prompt = prompt
        has_gemini = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
        tried_alt_provider = False

        for attempt in range(1, max_attempts + 1):
            try:
                logger.info(
                    "image_call_start task=%s attempt=%d/%d prompt_len=%d inputs=%d provider=%s moderation_level=%d",
                    task_name, attempt, max_attempts, len(current_prompt or ""), len(image_filenames),
                    provider_for_task or "auto", moderation_level,
                )
                t_call = time.time()
                result = image_generator(
                    prompt=current_prompt,
                    image_filenames=image_filenames,
                    output_filename=output_filename,
                    image_labels=image_labels,
                    image_provider=provider_for_task,
                    image_model=model_for_task if provider_for_task == _img_provider else None,
                    image_quality=quality_for_task,
                    image_size=_img_size,
                    task_type=task_type,
                    output_type=output_type,
                )
                logger.info(
                    "image_call_done task=%s attempt=%d elapsed_s=%.2f",
                    task_name, attempt, time.time() - t_call,
                )
                if moderation_level or tried_alt_provider:
                    result["moderation_rewritten"] = moderation_level
                    result["provider_fallback"] = provider_for_task if tried_alt_provider else None
                return result
            except Exception as e:
                err_msg = (str(e) or "")[:300]
                if is_moderation_error(e):
                    if moderation_level < max_moderation_rewrites:
                        moderation_level += 1
                        current_prompt = soften_prompt_for_moderation(prompt, level=moderation_level)
                        logger.warning(
                            "image_moderation_blocked task=%s attempt=%d; retrying with softened prompt level=%d",
                            task_name, attempt, moderation_level,
                        )
                        continue
                    if not tried_alt_provider and has_gemini and (provider_for_task or "") != "gemini":
                        tried_alt_provider = True
                        provider_for_task = "gemini"
                        # Keep the most-softened prompt we already have for the alternate provider.
                        if moderation_level == 0:
                            current_prompt = soften_prompt_for_moderation(prompt, level=1)
                        logger.warning(
                            "image_moderation_blocked task=%s attempt=%d; falling back to provider=gemini",
                            task_name, attempt,
                        )
                        continue
                    logger.error("image_call_failed task=%s attempt=%d error=%s", task_name, attempt, err_msg)
                    raise
                if attempt >= max_attempts or not _is_retryable_error(e):
                    logger.error("image_call_failed task=%s attempt=%d error=%s", task_name, attempt, err_msg)
                    raise
                sleep_s = min(60.0, base_sleep_s * (2 ** (attempt - 1)))
                logger.warning(
                    "image_call_retry task=%s attempt=%d sleep_s=%.2f error=%s",
                    task_name, attempt, sleep_s, err_msg,
                )
                time.sleep(sleep_s)
        return {}

    # --- Step 2: Image Generation ---
    t1 = time.time()

    # Phase 1: Character sheets (each uses only that character's face)
    phase1_tasks: List[Dict[str, Any]] = []
    characters = story.get("characters") or []
    for char in characters:
        if not isinstance(char, dict):
            continue
        idx = char.get("index", 1)
        name = char.get("name", f"Character {idx}")
        is_invented = (char.get("source") or "") == "invented"
        if is_invented:
            sheet_label = (
                f"Empty studio plate only -- not a person. Do not copy any human face. "
                f"Create {name} as a new companion: {char.get('identity_card') or name}. "
                "Two panels of this companion only. Zero humans."
            )
        else:
            sheet_label = (
                f"{name}'s real photograph — identity only. Build a two-panel identity sheet: "
                f"LEFT a head-and-shoulders camera-facing close-up of this exact face with no "
                f"hands in that panel, RIGHT a camera-facing full-body costume reference with "
                f"exactly two hands at the sides. Same person, both eyes visible. Relight for "
                f"the studio. No extra limbs, no floating hands, no profile, no 3/4, no back "
                f"view. Identity: {char.get('identity_card') or name}."
            )
        phase1_tasks.append({
            "type": "character",
            "name": f"Character {idx} ({name})",
            "prompt": char.get("prompt", ""),
            "input_images": char.get("input_images", []),
            "output_image": char.get("output_image", f"generated/char_{idx}_sheet.png"),
            "image_labels": [sheet_label],
        })

    # Phase 2: Cover + pages (multi-character with interleaved labeling)
    phase2_tasks: List[Dict[str, Any]] = []

    # Build character name lookup
    char_name_map: Dict[int, str] = {}
    for char in characters:
        if isinstance(char, dict):
            char_name_map[char.get("index", 0)] = char.get("name", "Unknown")

    def _labels_for_scene(cis: List[int]) -> List[str]:
        labels: List[str] = []
        for char_idx in cis:
            cname = char_name_map.get(char_idx, f"Character {char_idx}")
            char = next((c for c in characters if isinstance(c, dict) and c.get("index") == char_idx), None)
            invented = bool(char and (char.get("source") or "") == "invented")
            if not invented:
                labels.append(
                    f"IDENTITY close-up of {cname}. Face identity only -- do not use this "
                    f"crop as body scale. Photograph this same face at a normal adult size "
                    f"on a full torso, camera-facing, both eyes visible. Relight it to the "
                    f"scene. Do not invent a side of the face."
                )
            labels.append(
                f"COSTUME and body of {cname}. This sheet defines height, shoulder width, "
                f"arm length, and outfit. Keep adult proportions: head about 1/7 of height, "
                f"shoulders wider than the head. Face the camera with both eyes visible; "
                f"relight face and clothes to match. Same person or companion, not a cutout."
            )
        return labels

    # Cover: original face first (identity), then costume sheet (body)
    book = story.get("book")
    if isinstance(book, dict):
        cis = book.get("characters_in_scene") or list(range(1, num_chars + 1))
        cover_imgs = book.get("input_images") or []
        cover_labels = _labels_for_scene(cis)

        phase2_tasks.append({
            "type": "cover",
            "name": f"Book Cover ({book.get('title', 'Untitled')})",
            "prompt": book.get("prompt", ""),
            "input_images": cover_imgs,
            "output_image": book.get("output_image", "generated/book_cover.png"),
            "image_labels": cover_labels,
        })

    # Pages: original face first (identity), then costume sheet (body)
    for page in (story.get("pages") or []):
        if not isinstance(page, dict):
            continue
        cis = page.get("characters_in_scene") or [1]
        page_imgs = page.get("input_images") or []
        page_labels = _labels_for_scene(cis)

        phase2_tasks.append({
            "type": "page",
            "name": f"Page {page.get('page_number', '?')}",
            "page_number": page.get("page_number"),
            "prompt": page.get("prompt", ""),
            "input_images": page_imgs,
            "output_image": page.get("output_image", "generated/page.png"),
            "image_labels": page_labels,
        })

    total_image_tasks = len(phase1_tasks) + len(phase2_tasks)
    images_done_counter = {"n": 0}
    _write_image_manifest(
        base_dir,
        output_type=output_type,
        tasks=phase1_tasks + phase2_tasks,
        image_params=_img,
    )

    _progress(
        "images_start",
        {
            "tasks_total": len(phase1_tasks) + len(phase2_tasks),
            "phase1": len(phase1_tasks),
            "phase2": len(phase2_tasks),
            "concurrency": max_image_workers,
        },
    )

    def _run_one_v2(task: Dict[str, Any]) -> Dict[str, Any]:
        rel_inputs = task.get("input_images") or []
        abs_inputs = _to_abs_paths(base_dir=base_dir, rel_paths=[str(p) for p in rel_inputs])
        rel_out = str(task.get("output_image") or "")
        if not rel_out:
            raise ValueError(f"Task missing output_image: {task.get('name')}")
        abs_out = str((base_dir / rel_out).resolve())

        task_name = task.get("name") or task.get("type") or "image"
        task_type = task.get("type") or "unknown"
        labels = task.get("image_labels")

        # Validate labels match inputs length
        if labels and len(labels) != len(abs_inputs):
            logger.warning(
                "image_labels length (%d) != image_filenames length (%d) for %s; falling back to no labels",
                len(labels), len(abs_inputs), task_name,
            )
            labels = None

        task_start = time.time()
        logger.info(
            "image_task_start name=%s type=%s inputs=%d labels=%s",
            task_name, task_type, len(abs_inputs),
            "yes" if labels else "no",
        )
        res = _call_image_with_retry_v2(
            prompt=str(task.get("prompt") or ""),
            image_filenames=abs_inputs,
            output_filename=abs_out,
            task_name=task_name,
            image_labels=labels,
            task_type=task_type,
        )
        saved = (res.get("images") or [None])[0]
        elapsed = time.time() - task_start
        logger.info(
            "image_task_done name=%s type=%s elapsed_s=%.2f output=%s",
            task_name, task_type, elapsed, rel_out,
        )
        return {
            "name": task.get("name"),
            "type": task.get("type"),
            "page_number": task.get("page_number"),
            "output_image": rel_out,
            "saved_path": saved,
            "elapsed_s": elapsed,
            "model": res.get("model"),
            "usage": res.get("usage"),
            "cost": res.get("cost"),
            "api_base": res.get("api_base"),
        }

    def _emit_image_ready(item: Dict[str, Any]) -> None:
        images_done_counter["n"] += 1
        _progress(
            "image_ready",
            {
                "type": item.get("type"),
                "name": item.get("name"),
                "page_number": item.get("page_number"),
                "output_image": item.get("output_image"),
                "saved_path": item.get("saved_path"),
                "elapsed_s": item.get("elapsed_s"),
                "model": item.get("model"),
                "usage": item.get("usage"),
                "done": images_done_counter["n"],
                "total": total_image_tasks,
            },
        )

    def _run_phase_v2(tasks: List[Dict[str, Any]], *, phase_name: str) -> List[Dict[str, Any]]:
        if not tasks:
            return []
        phase_start = time.time()
        _progress("images_phase_start", {"phase": phase_name, "count": len(tasks)})
        results: List[Dict[str, Any]] = []
        failed: List[Tuple[Dict[str, Any], Exception]] = []
        with ThreadPoolExecutor(max_workers=max_image_workers) as ex:
            fut_to_task = {ex.submit(_run_one_v2, task): task for task in tasks}
            for fut in as_completed(fut_to_task):
                task = fut_to_task[fut]
                try:
                    item = fut.result()
                    results.append(item)
                    _emit_image_ready(item)
                except Exception as e:
                    failed.append((task, e))
        retry_rounds = int(os.getenv("IMAGE_FAILED_TASK_RETRIES") or "2")
        for round_idx in range(1, retry_rounds + 1):
            if not failed:
                break
            logger.warning(
                "Retrying %d failed V2 image tasks (round %d/%d)",
                len(failed), round_idx, retry_rounds,
            )
            next_failed: List[Tuple[Dict[str, Any], Exception]] = []
            for task, _err in failed:
                try:
                    item = _run_one_v2(task)
                    results.append(item)
                    _emit_image_ready(item)
                except Exception as e:
                    next_failed.append((task, e))
            failed = next_failed
        if failed:
            errors = [f"{task.get('name') or task.get('type')}: {err}" for task, err in failed]
            raise RuntimeError("One or more V2 image generations failed: " + " | ".join(errors[:5]))
        _progress(
            "images_phase_done",
            {"phase": phase_name, "count": len(results), "elapsed_s": time.time() - phase_start},
        )
        return results

    generated: List[Dict[str, Any]] = []
    generated.extend(_run_phase_v2(phase1_tasks, phase_name="characters"))
    generated.extend(_run_phase_v2(phase2_tasks, phase_name="pages_and_cover"))
    t_images = time.time() - t1
    _progress("images_done", {"generated_count": len(generated), "images_s": t_images})

    # --- Step 3: PDF + HTML generation ---
    _progress("pdf_generation_start", {"output_type": output_type})
    t2 = time.time()
    images_dir = str(base_dir / "generated")
    output_dir = str(base_dir / "book_outputs")

    pdf_result = generate_lulu_pdfs(
        story_data_path=story_json_path,
        images_dir=images_dir,
        output_dir=output_dir,
        output_type=output_type,
        upload_outputs=False,
    )

    t_pdf = time.time() - t2
    _progress("pdf_generation_done", {"pdf_s": t_pdf})

    result: Dict[str, Any] = {
        "job_dir": str(base_dir),
        "story_json_path": story_json_path,
        "output_type": output_type,
        "generated_count": len(generated),
        "generated": generated,
        "cost": build_book_ai_cost(
            story_model=model,
            story_usage=usage,
            story_cost=estimate_story_cost_usd(usage, model=model, pricing=pricing),
            image_items=generated,
        ),
        "pipeline_version": "v2",
        "num_characters": num_chars,
    }

    if output_type == "DIGI_BOOK":
        pdf_path, html_path = pdf_result
        result["pdf_path"] = str(pdf_path) if pdf_path else None
        result["html_path"] = str(html_path) if html_path else None
        result["artifacts"] = {
            "pdf": str(pdf_path) if pdf_path else None,
            "flipbook_html": str(html_path) if html_path else None,
        }
    else:
        interior_path, cover_path = pdf_result
        result["interior_pdf_path"] = str(interior_path) if interior_path else None
        result["cover_pdf_path"] = str(cover_path) if cover_path else None
        result["artifacts"] = {
            "interior_pdf": str(interior_path) if interior_path else None,
            "cover_pdf": str(cover_path) if cover_path else None,
        }
        result["html_path"] = None

    result["timing"] = {
        "story_s": t_story,
        "images_s": t_images,
        "pdf_s": t_pdf,
        "total_s": time.time() - t0,
    }
    _write_image_manifest(
        base_dir,
        output_type=output_type,
        tasks=phase1_tasks + phase2_tasks,
        generated=generated,
        image_params=_img,
    )
    _persist_ai_cost(base_dir, result["cost"], _progress)
    _progress("pipeline_done", {"timing": result["timing"], "cost": result["cost"]})

    return result


def generate_print_edition_v2(
    job_dir: str,
    *,
    progress_cb: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    image_params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Re-render cover + pages at print size and build Lulu PDFs.

    Digital books stay at 1024. Do not send those files to the printer — this
    regenerates the same saved prompts at ``IMAGE_SIZE_PRINT`` (2048) / high.
    Character sheets are reused as identity refs and are not re-billed.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from imggen import image_generator, resolve_image_model, resolve_image_quality, resolve_image_size
    from lulu_digi_book_maker import generate_lulu_pdfs

    def _progress(stage: str, extra: Optional[Dict[str, Any]] = None) -> None:
        payload = extra or {}
        if progress_cb:
            try:
                progress_cb(stage, payload)
            except Exception:
                logger.exception("progress_cb failed for stage=%s", stage)

    base_dir = Path(job_dir)
    manifest_path = base_dir / "image_manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Missing image_manifest.json in {base_dir}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    params = dict(manifest)
    params.update(image_params or {})
    print_size = resolve_image_size("LULU_BOOK", (image_params or {}).get("size"))
    model = resolve_image_model("cover", params.get("model"), "LULU_BOOK")
    quality = resolve_image_quality("cover", params.get("quality") or "high", "LULU_BOOK")
    print_dir = base_dir / "generated_print"
    print_dir.mkdir(parents=True, exist_ok=True)

    tasks = [
        t for t in (manifest.get("tasks") or [])
        if isinstance(t, dict) and (t.get("type") or "") in ("cover", "page")
    ]
    if not tasks:
        raise RuntimeError("image_manifest.json has no cover/page tasks to print")

    _progress("print_images_start", {"count": len(tasks), "size": print_size, "model": model})
    generated: List[Dict[str, Any]] = []
    max_workers = int(os.getenv("IMAGE_CONCURRENCY") or "10")

    def _run_one(task: Dict[str, Any]) -> Dict[str, Any]:
        rel_inputs = [str(p) for p in (task.get("input_images") or [])]
        abs_inputs = _to_abs_paths(base_dir=base_dir, rel_paths=rel_inputs)
        rel_out = str(task.get("output_image") or "")
        out_name = Path(rel_out).name or "page.png"
        abs_out = str((print_dir / out_name).resolve())
        existing = Path(abs_out)
        if existing.exists():
            try:
                from PIL import Image
                with Image.open(existing) as im:
                    if min(im.size) >= 1800:
                        return {
                            "name": task.get("name"),
                            "type": task.get("type"),
                            "page_number": task.get("page_number"),
                            "output_image": f"generated_print/{out_name}",
                            "saved_path": abs_out,
                            "skipped": True,
                            "model": model,
                        }
            except Exception:
                pass
        res = image_generator(
            prompt=str(task.get("prompt") or ""),
            image_filenames=abs_inputs,
            output_filename=abs_out,
            image_labels=task.get("image_labels"),
            image_model=model,
            image_quality=quality,
            image_size=print_size,
            task_type=task.get("type"),
            output_type="LULU_BOOK",
        )
        return {
            "name": task.get("name"),
            "type": task.get("type"),
            "page_number": task.get("page_number"),
            "output_image": f"generated_print/{out_name}",
            "saved_path": (res.get("images") or [abs_out])[0],
            "model": res.get("model") or model,
            "usage": res.get("usage"),
            "cost": res.get("cost"),
            "api_base": res.get("api_base"),
        }

    errors: List[str] = []
    failed_tasks: List[Dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        futs = {ex.submit(_run_one, task): task for task in tasks}
        for fut in as_completed(futs):
            task = futs[fut]
            try:
                item = fut.result()
                generated.append(item)
                _progress("print_image_ready", {"name": item.get("name"), "page_number": item.get("page_number")})
            except Exception as e:
                failed_tasks.append(task)
                errors.append(f"{task.get('name')}: {e}")
    if failed_tasks:
        logger.warning("Retrying %d failed print images serially", len(failed_tasks))
        still_failed: List[str] = []
        for task in failed_tasks:
            try:
                time.sleep(3)
                item = _run_one(task)
                generated.append(item)
                _progress("print_image_ready", {"name": item.get("name"), "page_number": item.get("page_number")})
            except Exception as e:
                still_failed.append(f"{task.get('name')}: {e}")
        errors = still_failed
    if errors:
        raise RuntimeError("Print image generation failed: " + " | ".join(errors[:5]))

    story_json_path = str(base_dir / "story_data.json")
    pdf_result = generate_lulu_pdfs(
        story_data_path=story_json_path,
        images_dir=str(print_dir),
        output_dir=str(base_dir / "book_outputs"),
        output_type="LULU_BOOK",
        upload_outputs=False,
    )
    interior_path, cover_path = pdf_result
    result = {
        "job_dir": str(base_dir),
        "output_type": "LULU_BOOK",
        "print_size": print_size,
        "model": model,
        "quality": quality,
        "generated_count": len(generated),
        "generated": generated,
        "interior_pdf_path": str(interior_path) if interior_path else None,
        "cover_pdf_path": str(cover_path) if cover_path else None,
        "images_dir": str(print_dir),
    }
    (base_dir / "print_result.json").write_text(json.dumps({
        k: v for k, v in result.items() if k != "generated"
    }, indent=2), encoding="utf-8")
    _progress("print_edition_done", {
        "interior_pdf_path": result["interior_pdf_path"],
        "cover_pdf_path": result["cover_pdf_path"],
        "count": len(generated),
    })
    return result


