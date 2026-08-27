# Story Generator API

A FastAPI-powered service that generates personalized storybooks from a single face photo and a story prompt. The API uses AI (Gemini or OpenAI) to create story content and generate illustrations, then produces both digital flipbooks (HTML) and print-ready PDFs.

## Features

- **AI Story Generation**: Creates personalized stories with the uploaded face as the main character
- **AI Image Generation**: Generates character portraits, book covers, and page illustrations
- **Multiple Output Formats**:
  - `DIGI_BOOK`: Interactive HTML flipbook + PDF for digital viewing
  - `LULU_BOOK`: Print-ready interior + cover PDFs (8.5" x 8.5" hardcover format)
- **Multi-Provider Support**: Works with Google Gemini (default) or OpenAI models
- **Async Job Processing**: Long-running jobs with polling support
- **GCS Integration**: Persistent storage for Cloud Run scalability
- **Email Delivery**: Optional SMTP integration to email download links

---

## Quick Start

### Prerequisites

- Python 3.11+
- Google Gemini API key (or OpenAI API key)

### Installation

```bash
pip install -r requirements.txt
```

### Run Locally

```bash
# Set your API key
set GOOGLE_API_KEY=your-gemini-api-key   # Windows
export GOOGLE_API_KEY=your-gemini-api-key # Linux/Mac

# Start the server
uvicorn story_fastapi:app --reload --host 0.0.0.0 --port 8000
```

### Health Check

```
GET http://localhost:8000/health
```

Response: `{"status": "ok"}`

---

## API Endpoints

### 1. Generate eBook (Recommended)

**`POST /generate-ebook-async`**

The main endpoint for generating complete storybooks. Returns immediately with a job ID for polling.

#### Request (multipart/form-data)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `story_prompt` | string | Yes | The story theme/prompt (e.g., "A brave astronaut exploring Mars") |
| `image` | file | Yes | Face photo of the main character (JPEG/PNG) |
| `email` | string | No | Email address to send download links |
| `output_type` | string | No | `DIGI_BOOK` (default) or `LULU_BOOK` |
| `model_provider` | string | No | `openai` (default if `OPENAI_API_KEY` is set) or `gemini` |
| `model` | string | No | Specific model name (e.g., `gemini-3-pro-preview`, `gpt-5.5-2026-04-23`) |
| `keep_job_dir` | boolean | No | Keep job files for debugging (default: false) |
| `google_api_key` | string | No | Override Gemini API key per-request |
| `openai_api_key` | string | No | Override OpenAI API key per-request |
| `input_usd_per_1m` | float | No | Custom pricing for cost estimation |
| `output_usd_per_1m` | float | No | Custom pricing for cost estimation |

#### Response

```json
{
  "job_id": "abc123def456",
  "status": "queued",
  "status_url": "/jobs/abc123def456",
  "html_url": "/jobs/abc123def456/storybook.html"
}
```

#### Example (cURL)

```bash
curl -X POST http://localhost:8000/generate-ebook-async \
  -F "story_prompt=A magical adventure in an enchanted forest" \
  -F "image=@photo.jpg" \
  -F "email=user@example.com" \
  -F "output_type=DIGI_BOOK"
```

---

### 2. Check Job Status

**`GET /jobs/{job_id}`**

Poll this endpoint until `status` is `succeeded` or `failed`.

#### Response (Running)

```json
{
  "job_id": "abc123def456",
  "status": "running",
  "created_at": 1706300000.0,
  "started_at": 1706300001.0
}
```

#### Response (Succeeded)

```json
{
  "job_id": "abc123def456",
  "status": "succeeded",
  "output_type": "DIGI_BOOK",
  "html_path": "/tmp/story_jobs/abc123/book_outputs/storybook.html",
  "pdf_path": "/tmp/story_jobs/abc123/book_outputs/storybook.pdf",
  "signed_urls": {
    "html": "https://storage.googleapis.com/...",
    "pdf": "https://storage.googleapis.com/...",
    "expires_days": "7"
  },
  "timing": {
    "story_s": 45.2,
    "images_s": 180.5,
    "pdf_s": 12.3,
    "total_s": 238.0
  },
  "cost": {
    "currency": "USD",
    "total_cost_usd": 0.0234
  }
}
```

#### Response (Failed)

```json
{
  "job_id": "abc123def456",
  "status": "failed",
  "error": {
    "type": "ValueError",
    "message": "Failed to parse model output as JSON"
  }
}
```

---

### 3. Download HTML Flipbook

**`GET /jobs/{job_id}/storybook.html`**

Download the generated HTML flipbook directly.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `inline` | boolean | false | Serve inline for iframe preview |
| `download` | boolean | true | Force download (ignored when inline=true) |

---

### 4. Delete Job

**`DELETE /jobs/{job_id}`**

Remove a job from memory (does not delete GCS artifacts).

```json
{
  "deleted": true,
  "job_id": "abc123def456"
}
```

---

### 5. Generate Story JSON Only (Legacy)

**`POST /generate-story`**

Synchronous endpoint that returns only the story JSON (no images/PDF).

#### Request (multipart/form-data)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `story_prompt` | string | Yes | Story theme/prompt |
| `images` | files[] | Yes | One or more reference images |
| `output_dir` | string | No | Output directory (default: "generated") |
| `save_files` | boolean | No | Save story JSON to disk (default: true) |

---

### 6. Generate Story JSON Async

**`POST /generate-story-async`**

Same as `/generate-story` but returns immediately with a job ID.

---

## Output Types

### DIGI_BOOK (Digital Book)

Best for digital viewing and sharing.

**Outputs:**
- `storybook.pdf` - Standard PDF for viewing/printing
- `storybook.html` - Interactive flipbook with page-turn animations

### LULU_BOOK (Print Book)

Print-ready files for Lulu.com POD (Print-on-Demand).

**Outputs:**
- `interior.pdf` - Interior pages (8.75" x 8.75" with bleed)
- `cover.pdf` - Wrap-around cover

**Specifications:**
- Trim Size: 8.5" x 8.5" (Square Hardcover)
- Bleed: 0.125" on all sides
- Minimum 24 pages

---

## Environment Variables

### Required for API Access

| Variable | Description |
|----------|-------------|
| `GOOGLE_API_KEY` or `GEMINI_API_KEY` | Gemini Developer API key |
| `OPENAI_API_KEY` | OpenAI API key (if using OpenAI provider) |

### Required for Cloud Run

| Variable | Description |
|----------|-------------|
| `JOBS_BUCKET` or `STORY_JOBS_BUCKET` | GCS bucket for job persistence |

### Optional - Image Generation

| Variable | Default | Description |
|----------|---------|-------------|
| `IMAGE_CONCURRENCY` | 5 | Max concurrent image generations |
| `IMAGE_MAX_ATTEMPTS` | 6 | Retries on rate limit errors |
| `IMAGE_RETRY_BASE_SLEEP_S` | 2.0 | Exponential backoff base (seconds) |
| `IMAGE_PROVIDER` | `gemini` | Image provider (`gemini` or `laozhang`) |
| `LAOZHANG_API_KEY` or `API_KEY_LAOZHANG` | — | LaoZhang API key |
| `LAOZHANG_API_BASE` | `https://api.laozhang.ai` | LaoZhang API base |
| `LAOZHANG_IMAGE_MODEL` | `gemini-3-pro-image-preview` | LaoZhang image model |
| `IMAGE_RESOLUTION` | `4K` | LaoZhang image resolution (`1K`, `2K`, `4K`) |
| `IMAGE_ASPECT_RATIO` | `1:1` | LaoZhang aspect ratio (e.g., `1:1`, `16:9`) |

### Optional - Cost Estimation

| Variable | Description |
|----------|-------------|
| `GEMINI_INPUT_USD_PER_1M` | Input token price (USD per 1M tokens) |
| `GEMINI_OUTPUT_USD_PER_1M` | Output token price (USD per 1M tokens) |

### Optional - Email Delivery

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP port (default: 587) |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password (use App Password for Gmail) |
| `SMTP_FROM` | Sender email address |
| `SMTP_FROM_NAME` | Sender display name (default: "IMG2X") |
| `SMTP_TLS` | Enable TLS (default: true) |

### Optional - Fonts (PDF rendering)

| Variable | Description |
|----------|-------------|
| `BOOK_FONT_REGULAR` | Absolute path to the regular TTF font |
| `BOOK_FONT_BOLD` | Absolute path to the bold TTF font |
| `BOOK_FONT_ITALIC` | Absolute path to the italic TTF font |
| `BOOK_FONTS_DIR` | Directory to search for fonts |

### Optional - URLs

| Variable | Default | Description |
|----------|---------|-------------|
| `SIGNED_URL_EXPIRES_DAYS` | 7 | Signed URL expiration (1-7 days) |

---

## Docker Deployment

### Build

```bash
docker build -t story-api .
```

### Run

```bash
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e GOOGLE_API_KEY=your-key \
  story-api
```

---

## Google Cloud Run Deployment

### 1. Configure Project

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud config set run/region us-central1
```

### 2. Store API Key in Secret Manager

```bash
# Create secret
echo -n "your-gemini-api-key" | gcloud secrets create gemini-api-key --data-file=-

# Or update existing secret
echo -n "your-gemini-api-key" | gcloud secrets versions add gemini-api-key --data-file=-
```

### 3. Create GCS Bucket for Jobs

```bash
gsutil mb -l us-central1 gs://your-jobs-bucket
```

### 4. Build with Cloud Build

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/story-api
```

Or trigger automatically via GitHub using `cloudbuild.yaml`.

### 5. Deploy to Cloud Run

```bash
gcloud run deploy story-api \
  --image gcr.io/YOUR_PROJECT_ID/story-api \
  --allow-unauthenticated \
  --set-secrets GOOGLE_API_KEY=gemini-api-key:latest \
  --set-env-vars JOBS_BUCKET=your-jobs-bucket \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --concurrency 1 \
  --max-instances 5
```

### Recommended Cloud Run Settings

| Setting | Value | Notes |
|---------|-------|-------|
| CPU | 2 | Image generation is CPU-intensive |
| Memory | 2 GiB | PDF generation needs memory |
| Timeout | 900s | Full pipeline can take 5-10 minutes |
| Concurrency | 1 | One job per instance (Gemini rate limits) |
| Max Instances | 5 | Adjust based on load |

---

## Project Structure

```
ai_api/
├── story_fastapi.py         # FastAPI application (main entry point)
├── story_api.py             # Story generation orchestration
├── strgen.py                # LLM integration (Gemini/OpenAI)
├── storygen_v2.py           # V2 system prompt (cinematic single-sentence prompts)
├── imggen.py                # Image generation with Gemini/LaoZhang
├── lulu_digi_book_maker.py  # PDF generation (interior + cover)
├── create_storybook_html.py # HTML flipbook generator
├── build_cssflip_flipbook.py # CSS-based flipbook builder
├── requirements.txt         # Python dependencies
├── Dockerfile               # Container definition
├── cloudbuild.yaml          # Cloud Build configuration
├── .env                     # Local environment variables (not committed)
│
├── # Documentation
├── README.md                # This file
├── LAOZHANG_IMAGE_CONFIG.md # Image generation API configuration
├── IMAGE_GEN_FEEDBACK.md    # Image quality feedback and fixes
└── CICD_ARCHITECTURE.md     # CI/CD pipeline documentation
```

---

## Image Generation & Identity Preservation

The API generates multiple images per storybook (character sheets, cover, 10 story pages). Maintaining consistent character identity across all images is critical.

### How It Works

1. **Character Sheets**: Generated first from face photos -- produces full-body costume reference that includes the character's face
2. **Cover & Story Pages**: Use costume sheets as reference images (1 per character), with a concise bullet-point prompt format

### Prompt Architecture v5 (Feb 2026)

Based on Google's Nano Banana Pro best practices and proven cinematic prompt patterns, prompts are generated as **one single flowing comma-separated sentence** per cover/page:

- **Cover/page prompt format**: single sentence, ~150–250 words (no bullet points, no labeled sections)
- **Character sheets**: exception (bullet-point template) to force a consistent headshot inset + full-body reference
- **No labeled tags** like `Image 1:` / `Image 2:` in prompts (references are described naturally)
- **Strict frontal-face + neutral expression locks** to reduce drift
- **Face-fidelity locks**: faces unobstructed + sharpest area, no motion blur on faces

This addresses "cross-attention dilution" -- research proves that longer prompts cause each concept to receive less model attention, leading to identity loss.

### Key Configuration (`imggen.py`)

| Setting | Value | Purpose |
|---------|-------|---------|
| `personGeneration` | `"ALLOW_ALL"` | Enable child character generation |
| `aspectRatio` | `"1:1"` | Square images for storybooks |
| `imageSize` | `"4K"` | High resolution for print quality |

### Face fidelity / identity preservation knobs (reference image encoding)

When using the LaoZhang proxy + Nano Banana Pro (`gemini-3-pro-image-preview`), reference images are sent inline. Increasing reference image quality can materially improve facial feature retention.

Environment variables:

| Env var | Default | Purpose |
|---|---:|---|
| `IMAGE_REF_MAX_SIDE_PX` | `1536` | Max dimension for reference images (higher keeps more facial detail) |
| `IMAGE_REF_TARGET_BYTES` | `900000` | Target encoded size per reference image |
| `IMAGE_REF_MAX_TOTAL_B64_CHARS` | `14000000` | Safety limit for total inline base64 payload; auto-fallback if exceeded |

Local sanity-check (no API calls):

```bash
python check_ref_payload_size.py
```

### Shot Type Rules

| Shot Type | Identity Fidelity | Status |
|-----------|-------------------|--------|
| Close-up | Excellent | Allowed |
| MCU | Very Good | Recommended default |
| Medium | Good | Allowed |
| Wide / Establishing | Poor | **BANNED** - causes identity loss |

### Troubleshooting Identity Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Wrong people appear | Prompt too long, attention diluted | Ensure prompts are 200-400 words max |
| Child aged to adult | Identity phrase too far from core prompt | Check prompt structure follows bullet-point format |
| Skin tone shifted | Extreme lighting description | Use neutral lighting terms |
| Faces look different | Wide/establishing shot used | Verify shot arc has no "wide" or "establishing" |
| 4+ images confuse model | Too many reference images | Use 1 costume sheet per character (not face + costume) |

See `IMAGE_GEN_FEEDBACK.md` for detailed analysis and `LAOZHANG_IMAGE_CONFIG.md` for API configuration.

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `MissingCredentials` | No API key set | Set `GOOGLE_API_KEY` or pass in request |
| `429 / RESOURCE_EXHAUSTED` | Gemini rate limit | Automatic retry with backoff |
| `Failed to parse model output` | LLM returned invalid JSON | Check `last_story_raw.txt` in GCS |
| `IMAGE_SAFETY` | Content blocked by safety filter | Check `personGeneration` setting; use `"ALLOW_ALL"` for storybooks |

### Debugging

1. Set `keep_job_dir=true` to preserve job files
2. Check Cloud Run logs: `gcloud run services logs read story-api`
3. Failed jobs upload `last_story_raw.txt` to GCS for inspection
4. Check `IMAGE_GEN_FEEDBACK.md` for known image generation issues and fixes

---

## License

Proprietary - All rights reserved.
