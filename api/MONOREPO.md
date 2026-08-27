# Story Service (`api/`)

FastAPI backend for img2x storybook generation.

Merged from https://github.com/chvsarath-eng/ai_api into this monorepo as a **clean snapshot** (history remains on the legacy remote).

## Key entrypoints

- `story_fastapi.py` — HTTP API (`POST /generate-ebook-async`, job polling)
- `story_api.py` — generation pipeline
- `imggen.py` — image generation (Gemini / LaoZhang)
- `cloudbuild.yaml` — image build for Cloud Run `story-api`

## Run locally

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn story_fastapi:app --reload --port 8000
```

See root [`AGENT_HANDOFF.md`](../AGENT_HANDOFF.md) and [`AGENTS.md`](../AGENTS.md).

**Never commit** `invoker.json`, `.env`, or API keys.
