"""Generate 1-4 character quality-test books using local face photos."""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FACES = Path(r"F:\Users\sarat\Documents\ai_api\input_images")
OUT = ROOT / "quality_jobs"

sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")
os.environ.setdefault("STORY_JOBS_DIR", str(OUT))
os.environ.setdefault("BOOK_FONTS_DIR", str(ROOT / "fonts"))
os.environ.setdefault("BOOK_FONT_REGULAR", str(ROOT / "fonts" / "DejaVuSerif.ttf"))
os.environ.setdefault("BOOK_FONT_BOLD", str(ROOT / "fonts" / "DejaVuSerif-Bold.ttf"))
os.environ.setdefault("BOOK_FONT_ITALIC", str(ROOT / "fonts" / "DejaVuSerif-Italic.ttf"))

from story_api import generate_ebook_html_bundle_v2  # noqa: E402

BOOKS = [
    {
        "id": "1char",
        "prompt": (
            "A warm children's adventure: Aarav and his loyal dog Rusty find a hidden moon garden "
            "behind their house. Rusty is the same medium tan dog with darker ears and a white chest "
            "on every page. Keep it joyful and safe."
        ),
        "faces": [FACES / "indian_kidmodel.jpg"],
        "meta": [{"name": "Aarav", "age": 8, "gender": "male", "relationship": "main"}],
    },
    {
        "id": "2char",
        "prompt": (
            "A father and son walk through a glowing night market and follow a paper lantern "
            "to a quiet riverside. Warm, safe, photographic. Same two people on every page."
        ),
        "faces": [FACES / "indian_kidmodel.jpg", FACES / "vamsi.jpeg"],
        "meta": [
            {"name": "Aarav", "age": 8, "gender": "male", "relationship": "son"},
            {"name": "Vamsi", "age": 36, "gender": "male", "relationship": "father"},
        ],
    },
    {
        "id": "3char",
        "prompt": (
            "Three friends find an old lighthouse and help the lamp shine again. "
            "Safe, bright, photographic. Same three people on every page."
        ),
        "faces": [FACES / "Elijah.png", FACES / "Nia.png", FACES / "Marcus.png"],
        "meta": [
            {"name": "Elijah", "age": 9, "gender": "male", "relationship": "friend"},
            {"name": "Nia", "age": 8, "gender": "female", "relationship": "friend"},
            {"name": "Marcus", "age": 10, "gender": "male", "relationship": "friend"},
        ],
    },
    {
        "id": "4char",
        "prompt": (
            "A family picnic by a river turns into a gentle treasure walk. "
            "Safe, sunny, photographic. Same four people; at most three in any one scene."
        ),
        "faces": [
            FACES / "Elijah.png",
            FACES / "Nia.png",
            FACES / "Marcus.png",
            FACES / "japanese_teen_girl.png",
        ],
        "meta": [
            {"name": "Elijah", "age": 9, "gender": "male", "relationship": "brother"},
            {"name": "Nia", "age": 8, "gender": "female", "relationship": "sister"},
            {"name": "Marcus", "age": 10, "gender": "male", "relationship": "brother"},
            {"name": "Hana", "age": 16, "gender": "female", "relationship": "cousin"},
        ],
    },
]


def _progress(stage: str, extra: dict | None = None) -> None:
    extra = extra or {}
    bits = " ".join(f"{k}={v}" for k, v in extra.items() if k in (
        "done", "total", "name", "type", "page_number", "elapsed_s", "title"
    ))
    print(f"  [{stage}] {bits}", flush=True)


def run_one(book: dict) -> dict:
    job_dir = OUT / f"{book['id']}_{int(time.time())}"
    job_dir.mkdir(parents=True, exist_ok=True)
    faces = [str(p) for p in book["faces"]]
    missing = [p for p in faces if not Path(p).exists()]
    if missing:
        raise FileNotFoundError(f"Missing faces: {missing}")
    print(f"\n=== {book['id']} -> {job_dir} ===", flush=True)
    t0 = time.time()
    result = generate_ebook_html_bundle_v2(
        job_dir=str(job_dir),
        story_prompt=book["prompt"],
        face_image_paths=faces,
        character_metadata=book["meta"],
        output_type="DIGI_BOOK",
        model_provider=os.getenv("STORY_MODEL_PROVIDER") or "openai",
        progress_cb=_progress,
    )
    result["elapsed_s"] = time.time() - t0
    result["book_id"] = book["id"]
    print(f"=== {book['id']} done in {result['elapsed_s']:.0f}s html={result.get('html_path')} ===", flush=True)
    return result


def main() -> None:
    wanted = sys.argv[1:] or ["1char", "2char", "3char", "4char"]
    selected = [b for b in BOOKS if b["id"] in wanted]
    if not selected:
        raise SystemExit(f"Unknown book id. Choose from: {[b['id'] for b in BOOKS]}")
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    for book in selected:
        results.append(run_one(book))
    print("\nSUMMARY")
    for r in results:
        print(f"  {r.get('book_id')}: html={r.get('html_path')} job={r.get('job_dir')}")


if __name__ == "__main__":
    main()
