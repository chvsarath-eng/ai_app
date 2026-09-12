# Image generation — product rules (Sep 11, 2026)

Read this before changing models, quality, size, or LaoZhang vs OpenAI.

## Two SKUs, two cost profiles

| | Digital (`DIGI_BOOK`) | Hardcover (`LULU_BOOK`) |
|---|---|---|
| Customer price | Lower | Higher |
| Outputs | HTML flipbook + PDF | Lulu interior + cover PDFs |
| Size | `1024x1024` | `2048x2048` (~240 DPI on 8.5") |
| Identity sheet | Sunburst **high** (one call — likeness) | Sunburst **high** |
| Cover + pages | Flare **medium** | Sunburst **high** |
| Why | Cheap SKU must stay cheap | Print files cannot be 1024 upscales |

**Do not** send digital 1024 files to Lulu. If the customer buys digital first, then a hardcover later, re-render cover + pages at 2048 via `POST /jobs/{job_id}/render-print` (`generate_print_edition_v2`). Character sheets are reused as identity refs.

Web hooks:

- `startProjectGeneration` — first generate; size/quality follow `outputType`
- `POST /api/user/projects/{id}/print` → story-api `render-print`
- `POST /api/user/projects/{id}/start` on a **ready digital** project that is now `LULU_BOOK` also triggers print upgrade

## Hosts (LaoZhang VIP primary, OpenAI backup)

LaoZhang **GPT Image 2.5 VIP** (`*-vip`, ~$0.03/call on Default-group) is the production primary. Official-forward LaoZhang names (`gpt-image-2.5-sunburst` without `-vip`) **cannot** run on a Default-group token — they need a LaoZhang token with group **Sora2Official**.

**Production primary:** `https://api2.laozhang.ai/v1`  
**Backup:** official OpenAI `https://api.openai.com/v1` (`IMAGE_API_FALLBACK=1`)  
Use **api2**, not `api.laozhang.ai` (their DNS-pollution notice).

```
IMAGE_API_BASE=https://api2.laozhang.ai/v1
IMAGE_MODEL=gpt-image-2.5-sunburst-vip
IMAGE_MODEL_PAGES=gpt-image-2.5-flare-vip
IMAGE_MODEL_PRINT=gpt-image-2.5-sunburst-vip
IMAGE_API_FALLBACK=1
```

Keep OpenAI as backup. Each host must use **its own key** (`OPENAI_API_KEY` vs `LAOZHANG_API_KEY` / `API_KEY_LAOZHANG`). A LaoZhang key on `api.openai.com` returns 401.

Do **not** fall back to `gpt-image-2-vip` (older Image 2, not 2.5).

## Model name aliases

| Host | Sunburst | Flare |
|------|----------|--------|
| LaoZhang | `gpt-image-2.5-sunburst-vip` then unsuffixed | `gpt-image-2.5-flare-vip` then unsuffixed |
| api.openai.com | `gpt-image-2.5-sunburst-2026-09-08` | `gpt-image-2.5-flare-2026-09-08` |

Dated snapshots 503 on LaoZhang Default. `-vip` 401s on official OpenAI.

## Cost notes (official OpenAI, token-billed)

Measured locally Sep 11 2026 (1 adult, 10 pages):

- Digital Flare medium 1024: ~$0.03–0.04 / page, ~$0.36–0.50 / book
- Sunburst high 1024: ~$0.077 / image
- Sunburst high 2048 print: similar per-call time ~45–75s; more output tokens
- Story `gpt-5.6-terra`: ~$0.08 / book

LaoZhang VIP (when up): **$0.03 per successful call** regardless of size/quality. Failed 503s are not billed.

10-wide bursts hit OpenAI 429. Production `IMAGE_CONCURRENCY=5`. Print retry is serial after a failed wave.

## Prompt / likeness decisions (keep)

- Uploaded photo = **face identity only**, not body scale. Sheet defines height/shoulders/arms.
- Adult head ~1/7 of height. Ban window/hole crops (giant-head bug on climb shots).
- Frontal, camera-facing faces only. Do not invent profile / 3/4 / back from one front photo.
- Closed-mouth micro-expressions. No social smile unless the beat is warm/proud.

## Local test artifacts (gitignored `api/quality_jobs/`)

- Digital + print proof: `api/quality_jobs/openai_direct_1789166951/`
  - HTML: `book_outputs/digi-book/digi_book_8.5x8.5_20260911_191203.html`
  - Print: `book_outputs/lulu-book/interior_*` and `cover_*`
  - Times: digital **128s**; print ~**200s** wall (page 9 retried after 429/503)
- Each v2 job writes `image_manifest.json` (prompts + refs) so print upgrade can re-render.

## Code map

| File | Role |
|------|------|
| `api/imggen.py` | Endpoints, key-per-host, aliases, size/quality/model by `output_type`, cost estimate |
| `api/story_api.py` | V2 pipeline, `image_manifest.json`, `generate_print_edition_v2` |
| `api/story_fastapi.py` | `/generate-ebook-async`, `POST /jobs/{id}/render-print`, `/admin/config` |
| `api/storygen_v2.py` | Anatomy lock, no hole-crops, frontal face rules |
| `web/src/lib/start-generation.ts` | Digital vs hardcover form params |
| `web/src/app/api/user/projects/[projectId]/print/route.ts` | Hardcover upgrade |
| `deploy/config/api.json` | Cloud Run image env (no secrets) |

## Do not

- Restyle the img2x home page unless asked.
- Commit `.env`, `graphify-out/`, or `quality_jobs/`.
- Point production at `api.laozhang.ai` (use `api2`).
- Use Image 2 VIP as a “cheap 2.5”.
