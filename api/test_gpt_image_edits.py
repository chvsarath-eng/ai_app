"""Smoke test: OpenAI-compatible /v1/images/edits through the LaoZhang proxy.

Usage (from api/):
    python test_gpt_image_edits.py [ref_image_1] [ref_image_2 ...]

Env (loaded from api/.env, then ../../ai_api/.env as a fallback):
    API_KEY_LAOZHANG / LAOZHANG_API_KEY   proxy key
    IMAGE_API_BASE                        default https://api.laozhang.ai/v1
    IMAGE_MODEL                           default gpt-image-2.5-sunburst-vip (LaoZhang default group);
                                          use gpt-image-2.5-sunburst-2026-09-08 on api.openai.com / enterprise groups
    IMAGE_QUALITY                         default high
    IMAGE_SIZE                            default 1024x1024
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path


def _load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


HERE = Path(__file__).parent
_load_env(HERE / ".env")
_load_env(HERE.parent.parent / "ai_api" / ".env")

from imggen import _image_generator_openai_images  # noqa: E402


def _default_refs() -> list[str]:
    candidates = [
        HERE / "input_images" / "indian_kidmodel.jpg",
        HERE.parent.parent / "ai_api" / "input_images" / "indian_kidmodel.jpg",
        HERE.parent.parent / "ai_api" / "input_images" / "normal_man.png",
    ]
    return [str(p) for p in candidates if p.exists()][:2]


def main() -> int:
    refs = sys.argv[1:] or _default_refs()
    if not refs:
        print("No reference images found; pass paths as arguments.")
        return 1

    from imggen import DEFAULT_IMAGE_MODEL

    model = os.getenv("IMAGE_MODEL") or DEFAULT_IMAGE_MODEL
    print("=" * 60)
    print("GPT-IMAGE /images/edits SMOKE TEST")
    print("=" * 60)
    print(f"base    : {os.getenv('IMAGE_API_BASE') or 'https://api.laozhang.ai/v1'}")
    print(f"model   : {model}")
    print(f"quality : {os.getenv('IMAGE_QUALITY') or 'high'}")
    print(f"size    : {os.getenv('IMAGE_SIZE') or '1024x1024'}")
    print(f"refs    : {len(refs)}")
    for r in refs:
        print(f"          - {r}")

    labels = [f"Input image {i} is the exact face reference for the person; keep identity unchanged." for i, _ in enumerate(refs, 1)]
    prompt = (
        "Photorealistic medium close-up of the person from the reference image as a young astronaut inside a "
        "spaceship cockpit, soft warm cabin light, looking toward the camera with a gentle smile, "
        "wearing a white and orange flight suit, sharp facial detail, natural skin texture."
    )

    out = HERE / "generated_images" / f"smoke_gpt_image_{int(time.time())}.png"
    t0 = time.time()
    try:
        result = _image_generator_openai_images(
            prompt=prompt,
            image_filenames=refs,
            output_filename=str(out),
            image_labels=labels,
            model=model,
            size=os.getenv("IMAGE_SIZE") or "1024x1024",
            quality=os.getenv("IMAGE_QUALITY") or "high",
        )
    except Exception as e:  # noqa: BLE001
        print(f"\nFAILED after {time.time() - t0:.1f}s: {type(e).__name__}: {e}")
        return 1

    elapsed = time.time() - t0
    print(f"\nOK in {elapsed:.1f}s")
    for p in result.get("images", []):
        print(f"  saved: {p}")
        try:
            from PIL import Image

            with Image.open(p) as im:
                print(f"  size : {im.size[0]}x{im.size[1]}")
        except Exception:  # noqa: BLE001
            pass
    usage = result.get("usage")
    if usage:
        print(f"  usage: {usage}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
