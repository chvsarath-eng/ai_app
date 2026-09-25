> September 25 release validation: Fresh Quick Book `ba813cecda6f4f63bd781294150f6af1` verified its cloud A3 download at 302.63 seconds from submission; HTML completed at 321.42 seconds. Native high-quality artwork, original borders, and frontal neck/shoulder prompt corrections retained. Full API regressions, production web build/typecheck, desktop/mobile create-to-checkout and reader tests passed. A3-first delivery and lossless compression are ready for PR/CI deployment; no five-minute guarantee or physical print proof. See [efficiency plan](docs/QUICK_BOOK_EFFICIENCY_PLAN.md). Earlier notes below are historical; strict word quotas and image fallback no longer apply.

# Agent Handoff — img2x (Sep 11, 2026)

> **Purpose:** Next agent / developer can continue without re-discovering context.  
> **Product:** [img2x.com](https://img2x.com) — AI personalized storybooks (digital flipbook + Lulu hardcover).  
> **Canonical GitHub (private):** https://github.com/chvsarath-eng/ai_app — clone this on any laptop.  
> **Status:** GitHub Actions CI/CD live. **Image pipeline:** LaoZhang 2.5 VIP is primary (`api2`, `$0.03/call`); no image fallback is permitted. Full rules: [`docs/IMAGE_GENERATION.md`](./docs/IMAGE_GENERATION.md).

---

## 0. Current work (Sep 11, 2026) — read first

### Quick Book implementation (Sep 24, 2026, local branch)

LaoZhang-only routing is enforced at the image request boundary, including stale
saved provider/model overrides. Removed model aliases, official OpenAI routing,
and the V2 Gemini fallback. Four routing/output-preservation tests passed.
Two real A4 high-quality VIP calls failed upstream with HTTP 502 after 115.98s
and 61.80s; neither fell back. New live visual-quality verification is therefore
blocked by the provider. Local API was restarted with these changes; not deployed.
The broader five-minute model/orchestration/PDF optimization remains unimplemented.

Generation recovery/layout repair: the live local Quick Book failed before images
because the bulk story rewrite left scenes outside 240–280 words. Invalid scenes
now receive bounded individual repairs; raw drafts are checkpointed for resume.
The resume endpoint accepts the actual 32-character job IDs as well as UUIDs.
The generating/failed project view uses a compact viewport-sized workspace,
desktop scene sidebar and mobile horizontal scene strip. Responsive checks are
in `web/tests/generation-layout.mjs` (1440×900, 390×844, 360×640).
The local paid job `61c10b1067a1421398b874fe6288103f` was resumed after this repair
and generated all 12 image assets, the A3 PDF and original HTML reader. Pipeline
time was 598.56s before artifact uploads (story 224.07s, images 266.77s, PDF 105.43s).
Seven offline pipeline tests and all three viewport checks passed; source
TypeScript check passed using the isolated dev build types. No deployment performed.

New UI purchases now select `QUICK_BOOK`, using V2 with 240–280 words per story
page, native A4 high-quality Sunburst artwork, 24 pages, a pre-imposed six-sheet
A3 PDF and matching HTML reader. Legacy digital and Lulu paths remain available.
See [Quick Book implementation and acceptance checks](docs/QUICK_BOOK.md).
Real Quick Book generation completed with Sunburst VIP, including three resumed
images; it did not meet the ten-minute target. The original V2 digital agent also
completed a comparison book in 332.66 seconds. Quick Book now reuses the original
decorated renderer and 3D flipbook; see docs/QUICK_BOOK.md. Not deployed; a physical
duplex print trial is still required.

### Decisions (do not undo without asking)

1. **Digital vs hardcover cost** — Use **Sunburst VIP for all images**. Digital uses **1024 + medium** for cover/pages and high for identity sheets. Hardcover uses **2048 + high** for every image. Never upscale 1024 for print; re-render via `render-print`.
2. **LaoZhang 2.5 VIP** (`gpt-image-2.5-*-vip`, $0.03/call on Default-group) is the production primary on `https://api2.laozhang.ai/v1`. Official-forward LaoZhang 2.5 (no `-vip`) still needs a **Sora2Official** token group — do not use those names on the Default-group key.
3. **No image fallback** (September 24 user decision). All images are pinned to LaoZhang api2 Sunburst VIP; stale alternate model/provider settings cannot override this. Keep same-model bounded retries and print quality.
4. Bind keys **per host**. A LaoZhang key on OpenAI is 401. Never drop to `gpt-image-2-vip` (older model).
5. Likeness: frontal faces only; uploaded crop is identity not scale; ban window/hole crops (giant-head bug). Reference locks WHO, not mood -- small living emotion per page.
6. Do not restyle the home page. Do not commit `.env` or `graphify-out/`.

### Production image hosts (Sep 11 evening)

Set in Cloud Run / `deploy/config/api.json`:

```
IMAGE_API_BASE=https://api2.laozhang.ai/v1
IMAGE_MODEL=gpt-image-2.5-sunburst-vip
IMAGE_MODEL_PAGES=gpt-image-2.5-sunburst-vip
IMAGE_MODEL_PRINT=gpt-image-2.5-sunburst-vip
IMAGE_API_FALLBACK=0
IMAGE_CONCURRENCY=16
```

### Timed local proof (gitignored)

`api/quality_jobs/openai_direct_1789166951/` — digital **128s**, print ~**200s** (page 9 retried). See `docs/IMAGE_GENERATION.md`.

---

## 1. Monorepo layout (clone this)

```text
ai_app/                         # https://github.com/chvsarath-eng/ai_app
  web/                          # Next.js storefront + Stripe checkout
  api/                          # FastAPI Story Service (from former ai_api)
  AGENTS.md                     # Product / architecture guide
  AGENT_HANDOFF.md              # THIS FILE — start here
  README.md                     # Monorepo overview
```

| Path | Role | Cloud Run |
|------|------|-----------|
| `web/` | Storefront, checkout, Stripe | `img2x-web` → https://img2x.com |
| `api/` | Story / ebook generation | `story-api` → `https://story-api-502566942325.us-central1.run.app` |

**Legacy:** https://github.com/chvsarath-eng/ai_api — marked archived; do not develop there. Prefer monorepo `api/`.

**GCP project:** `imgstr`

### Clone on a new laptop

```bash
git clone https://github.com/chvsarath-eng/ai_app.git
cd ai_app

# Web
cd web && cp .env.example .env   # fill secrets locally — never commit .env
npm install && npm run dev

# API (separate terminal)
cd api && python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
# copy local .env with API keys (not in git)
uvicorn story_fastapi:app --reload --port 8000
```

Secrets live in **local `.env`** and **GCP Secret Manager**, not in git.

---

## 2. What was done

### 2.1 Payment compliance
- MoRs (Dodo / Paddle / Lemon) ban **physical goods** → hardcover blocked there.
- Paddle restricts AI human-face / face-swap generation.
- Chose **Stripe** for worldwide digital + hardcover.

### 2.2 Stripe migration (`web/`) — CODE COMPLETE
| Area | Path |
|------|------|
| Stripe helper | `web/src/lib/stripe.ts` |
| Order emails | `web/src/lib/order-emails.ts` |
| Checkout API | `web/src/app/api/checkout/route.ts` |
| Webhook | `web/src/app/api/webhooks/stripe/route.ts` |
| Receipt | `web/src/app/api/payments/[paymentId]/invoice/route.ts` |
| Prices | `web/src/app/api/localize-prices/route.ts` |
| Checkout UI | `web/src/app/checkout/page.tsx` (consent gates; no partner bypass) |
| Env | `web/.env.example` |
| Deploy | GitHub Actions → Cloud Run (see `docs/DEPLOYMENT_SETUP.md`) |

**Removed:** Dodo SDK, partner code `1345`, unpaid test checkout.

**Flow:** IndexedDB photos → Stripe Checkout → return verify → `createStorybookJob` → Story Service. Webhook = emails only.

### 2.3 Monorepo
- `api/` added as a **clean snapshot** of Story Service (no secret-laden git history).
- Do **not** `git subtree` from old `ai_api` — GitHub push protection blocked service-account / LangSmith secrets in that history.

---

## 3. Next agent TODO

### P0 — CI/CD bootstrap (one-time, repo owner)
1. ~~Apply `infra/github-actions` Terraform → set GitHub Variables (`GCP_*`).~~ **Done**
2. ~~Create `production` GitHub Environment.~~ **Done**
3. ~~Disable legacy Cloud Build trigger `ai-api-main`.~~ **Done**
4. **Replace** `stripe-secret-key` / `stripe-webhook-secret` in Secret Manager (`CONFIGURE_ME` placeholders were created).
5. Re-run or push to `main` after Stripe secrets are set to validate full checkout flow.

### P1 — Stripe go-live
1. Stripe account + international cards + Stripe Tax (or `STRIPE_AUTOMATIC_TAX=false` while testing).
2. GCP secrets: `stripe-secret-key`, `stripe-webhook-secret` (no trailing newline).
3. Webhook URL: `https://img2x.com/api/webhooks/stripe`  
   Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.payment_failed`
4. Deploy `web`; test with `sk_test_` then `sk_live_`.

### P2 — Multi-laptop / ops
- Keep developing only in **ai_app** monorepo.
- Use PR workflow (`CONTRIBUTING.md`) — no direct pushes to `main`.
- Optionally rename GitHub repo `ai_app` → `img2x`.
- Archive legacy `ai_api` on GitHub UI.
- Point Cloud Build Story API trigger at `api/` path in monorepo (or keep building from legacy until cutover).

### P3 — Compliance polish
- Public Safety page; align $9.99 vs $14.99 SEO; prompt blocklists; no “face-swap” marketing language.

---

## 4. Env (web)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | `sk_test_` / `sk_live_` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_` |
| `STRIPE_AMOUNT_DIGITAL_CENTS` | Default `999` |
| `STRIPE_AMOUNT_HARDCOVER_CENTS` | Default `3999` |
| `STRIPE_PRICE_*_ID` | Optional Dashboard prices |
| `STRIPE_AUTOMATIC_TAX` | `true` / `false` |
| `STORY_SERVICE_URL` | Story API Cloud Run URL |
| `STORY_INVOKER_CREDENTIALS_JSON` | Invoker SA JSON |
| `SMTP_*` | Email |

Local: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

---

## 5. Story Service (`api/`) quick facts

- `POST /generate-ebook-async` in `story_fastapi.py` (v2 multi-character)
- `POST /jobs/{job_id}/render-print` — hardcover upgrade from a finished digital job
- Images: `IMAGE_PROVIDER=openai_images` (OpenAI-compatible). See `docs/IMAGE_GENERATION.md`
- Primary: LaoZhang `api2` VIP. Backup: `api.openai.com`. Keys per host.
- Digital: 1024 / Sunburst medium pages. Hardcover: 2048 / Sunburst high
- Jobs: background thread + GCS `JOBS_BUCKET`; v2 writes `image_manifest.json`
- Never commit `invoker.json` / `.env`

---

## 6. Stripe onboarding blurb

> img2x sells personalized AI-illustrated storybooks to adult customers (18+). Buyers upload photos they own or have permission to use (including parental permission for minors). Products: digital flipbook and optional Lulu hardcover. No sexual/exploitative content. Checkout requires age, likeness, and Terms consent. Merchant of record via Stripe; tax via Stripe Tax.

---

## 7. CI/CD reference

| Workflow | File | Trigger |
|----------|------|---------|
| CI | `.github/workflows/ci.yml` | PR + push to `main` |
| Deploy Web | `.github/workflows/deploy-web.yml` | After CI on `main` (web paths) |
| Deploy API | `.github/workflows/deploy-api.yml` | After CI on `main` (api paths) |

Config: `deploy/config/web.json`, `deploy/config/api.json`, `scripts/deploy-cloud-run.sh`  
Docs: `docs/DEPLOYMENT_SETUP.md`, `docs/SECRETS.md`, `CONTRIBUTING.md`

Rollback: `gcloud run services update-traffic <service> --to-revisions <revision>=100`

---

**Do not** reintroduce Dodo or partner free checkout without an explicit decision.
