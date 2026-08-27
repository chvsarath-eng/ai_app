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
from storygen_v2 import Story_content_generator_v2

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
        "cost": estimate_gemini_cost_usd(usage, pricing=pricing),
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
        model = model or "gpt-5.5-2026-04-23"
    else:
        model = model or "gemini-3-pro-preview"

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
        "cost": story_out.get("cost"),
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
    _progress("pipeline_done", {"timing": result["timing"]})

    return result


# ═══════════════════════════════════════════════════════════════════════════
# V2 -- Multi-character orchestration
# ═══════════════════════════════════════════════════════════════════════════


def _ensure_story_paths_consistent_v2(
    story: Dict[str, Any],
    num_characters: int,
) -> Dict[str, Any]:
    """
    Enforce V2 path conventions:
      - Face photos at: input_images/char_N_face.jpeg (for character sheet gen)
      - Character sheets at: generated/char_N_sheet.png
      - Cover/page input_images contain costume sheets ONLY (not face+sheet pairs)
        because sheets already embed the character's face, reducing image count
        and cross-attention dilution.
    """
    # Fix character paths
    characters = story.get("characters")
    if isinstance(characters, list):
        for i, char in enumerate(characters, 1):
            if not isinstance(char, dict):
                continue
            char["input_images"] = [f"input_images/char_{i}_face.jpeg"]
            char["output_image"] = f"generated/char_{i}_sheet.png"
            if "index" not in char:
                char["index"] = i
            if "role" not in char:
                char["role"] = "main" if i == 1 else "supporting"

    def _build_input_images_for_scene(chars_in_scene: List[int]) -> List[str]:
        """Build costume-sheet-only image list for a scene.

        Per research on cross-attention dilution (Jan 2026), we pass only
        costume sheets (which already contain the character's face) instead
        of separate face+costume pairs.  This reduces images from 4 to 2
        for a 2-character scene, cutting model confusion in half.
        """
        imgs: List[str] = []
        for idx in chars_in_scene:
            imgs.append(f"generated/char_{idx}_sheet.png")
        return imgs

    # Fix book paths
    book = story.get("book")
    if isinstance(book, dict):
        cis = book.get("characters_in_scene")
        if isinstance(cis, list) and cis:
            book["input_images"] = _build_input_images_for_scene(cis)
        elif not book.get("input_images"):
            # Default: all characters
            all_idxs = list(range(1, num_characters + 1))
            book["characters_in_scene"] = all_idxs
            book["input_images"] = _build_input_images_for_scene(all_idxs)

    # Fix page paths
    pages = story.get("pages")
    if isinstance(pages, list):
        for page in pages:
            if not isinstance(page, dict):
                continue
            cis = page.get("characters_in_scene")
            if isinstance(cis, list) and cis:
                page["input_images"] = _build_input_images_for_scene(cis)
            elif not page.get("input_images"):
                # Default: just the main character
                page["characters_in_scene"] = [1]
                page["input_images"] = _build_input_images_for_scene([1])

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
    """
    from imggen import image_generator
    from create_storybook_html import create_storybook_html
    from lulu_digi_book_maker import generate_lulu_pdfs
    from concurrent.futures import ThreadPoolExecutor, as_completed

    # #region agent log
    import json as _json; open(r'f:\Users\sarat\Documents\ai_api\.cursor\debug.log','a').write(_json.dumps({"location":"story_api.py:952","message":"GENERATE_EBOOK_HTML_BUNDLE_V2_ENTRY","data":{"job_dir":job_dir,"num_faces":len(face_image_paths),"model":model,"provider":model_provider},"hypothesisId":"D","timestamp":__import__('time').time()})+'\n')
    # #endregion

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
        model = model or "gpt-5.5-2026-04-23"
    else:
        model = model or "gemini-3-pro-preview"

    base_dir = Path(job_dir).resolve()
    base_dir.mkdir(parents=True, exist_ok=True)
    (base_dir / "input_images").mkdir(parents=True, exist_ok=True)
    (base_dir / "generated").mkdir(parents=True, exist_ok=True)

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

    # #region agent log
    import json as _json; open(r'f:\Users\sarat\Documents\ai_api\.cursor\debug.log','a').write(_json.dumps({"location":"story_api.py:1008","message":"CALLING_STORY_CONTENT_GENERATOR_V2","data":{"model":model,"provider":model_provider,"num_chars":num_chars},"hypothesisId":"B","timestamp":__import__('time').time()})+'\n')
    # #endregion
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
    # #region agent log
    import json as _json; open(r'f:\Users\sarat\Documents\ai_api\.cursor\debug.log','a').write(_json.dumps({"location":"story_api.py:1020","message":"STORY_CONTENT_GENERATOR_V2_RETURNED","data":{"has_text":bool(story_result.get("text")),"usage":str(story_result.get("usage",""))[:100]},"hypothesisId":"B","timestamp":__import__('time').time()})+'\n')
    # #endregion

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
    story = _ensure_story_paths_consistent_v2(story, num_chars)

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

    # --- Concurrency setup ---
    max_image_workers = int(os.getenv("IMAGE_CONCURRENCY") or "5")

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
        )

    def _call_image_with_retry_v2(
        *,
        prompt: str,
        image_filenames: List[str],
        output_filename: str,
        task_name: str,
        image_labels: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        max_attempts = int(os.getenv("IMAGE_MAX_ATTEMPTS") or "6")
        base_sleep_s = float(os.getenv("IMAGE_RETRY_BASE_SLEEP_S") or "2.0")
        for attempt in range(1, max_attempts + 1):
            try:
                logger.info(
                    "image_call_start task=%s attempt=%d/%d prompt_len=%d inputs=%d",
                    task_name, attempt, max_attempts, len(prompt or ""), len(image_filenames),
                )
                t_call = time.time()
                result = image_generator(
                    prompt=prompt,
                    image_filenames=image_filenames,
                    output_filename=output_filename,
                    image_labels=image_labels,
                )
                logger.info(
                    "image_call_done task=%s attempt=%d elapsed_s=%.2f",
                    task_name, attempt, time.time() - t_call,
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
        phase1_tasks.append({
            "type": "character",
            "name": f"Character {idx} ({name})",
            "prompt": char.get("prompt", ""),
            "input_images": char.get("input_images", []),
            "output_image": char.get("output_image", f"generated/char_{idx}_sheet.png"),
            "image_labels": [f"{name}'s face reference (use this exact face):"],
        })

    # Phase 2: Cover + pages (multi-character with interleaved labeling)
    phase2_tasks: List[Dict[str, Any]] = []

    # Build character name lookup
    char_name_map: Dict[int, str] = {}
    for char in characters:
        if isinstance(char, dict):
            char_name_map[char.get("index", 0)] = char.get("name", "Unknown")

    # Cover (costume sheets only -- face is embedded in the sheet)
    book = story.get("book")
    if isinstance(book, dict):
        cis = book.get("characters_in_scene") or list(range(1, num_chars + 1))
        cover_imgs = book.get("input_images") or []
        # Build labels: natural-language description per character reference
        cover_labels: List[str] = []
        for i, char_idx in enumerate(cis, 1):
            cname = char_name_map.get(char_idx, f"Character {char_idx}")
            cover_labels.append(f"{cname}'s character reference (use this exact face, build, and outfit):")

        phase2_tasks.append({
            "type": "cover",
            "name": f"Book Cover ({book.get('title', 'Untitled')})",
            "prompt": book.get("prompt", ""),
            "input_images": cover_imgs,
            "output_image": book.get("output_image", "generated/book_cover.png"),
            "image_labels": cover_labels,
        })

    # Pages (costume sheets only -- face is embedded in the sheet)
    for page in (story.get("pages") or []):
        if not isinstance(page, dict):
            continue
        cis = page.get("characters_in_scene") or [1]
        page_imgs = page.get("input_images") or []
        page_labels: List[str] = []
        for i, char_idx in enumerate(cis, 1):
            cname = char_name_map.get(char_idx, f"Character {char_idx}")
            page_labels.append(f"{cname}'s character reference (use this exact face, build, and outfit):")

        phase2_tasks.append({
            "type": "page",
            "name": f"Page {page.get('page_number', '?')}",
            "prompt": page.get("prompt", ""),
            "input_images": page_imgs,
            "output_image": page.get("output_image", "generated/page.png"),
            "image_labels": page_labels,
        })

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
        )
        saved = (res.get("images") or [None])[0]
        logger.info(
            "image_task_done name=%s type=%s elapsed_s=%.2f output=%s",
            task_name, task_type, time.time() - task_start, rel_out,
        )
        return {
            "name": task.get("name"),
            "type": task.get("type"),
            "output_image": rel_out,
            "saved_path": saved,
        }

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
                    results.append(fut.result())
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
                    results.append(_run_one_v2(task))
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
        "cost": estimate_gemini_cost_usd(usage, pricing=pricing),
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
    _progress("pipeline_done", {"timing": result["timing"]})

    return result


