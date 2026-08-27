# Agent Handoff — img2x (Aug 27, 2026)

> **Purpose:** Next agent / developer can continue without re-discovering context.  
> **Product:** [img2x.com](https://img2x.com) — AI personalized storybooks (digital flipbook + Lulu hardcover).  
> **Canonical GitHub (private):** https://github.com/chvsarath-eng/ai_app — clone this on any laptop.  
> **Status:** Stripe payment code complete (secrets/deploy still needed). Monorepo = `web/` + `api/`.

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
| Deploy | `web/cloudbuild.yaml` |

**Removed:** Dodo SDK, partner code `1345`, unpaid test checkout.

**Flow:** IndexedDB photos → Stripe Checkout → return verify → `createStorybookJob` → Story Service. Webhook = emails only.

### 2.3 Monorepo
- `api/` added as a **clean snapshot** of Story Service (no secret-laden git history).
- Do **not** `git subtree` from old `ai_api` — GitHub push protection blocked service-account / LangSmith secrets in that history.

---

## 3. Next agent TODO

### P0 — Stripe go-live
1. Stripe account + international cards + Stripe Tax (or `STRIPE_AUTOMATIC_TAX=false` while testing).
2. GCP secrets: `stripe-secret-key`, `stripe-webhook-secret` (no trailing newline).
3. Webhook URL: `https://img2x.com/api/webhooks/stripe`  
   Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.payment_failed`
4. Deploy `web`; test with `sk_test_` then `sk_live_`.

### P1 — Multi-laptop / ops
- Keep developing only in **ai_app** monorepo.
- Optionally rename GitHub repo `ai_app` → `img2x`.
- Archive legacy `ai_api` on GitHub UI.
- Point Cloud Build Story API trigger at `api/` path in monorepo (or keep building from legacy until cutover).

### P2 — Compliance polish
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

- `POST /generate-ebook-async` in `story_fastapi.py`
- Prod images: LaoZhang (`IMAGE_PROVIDER=laozhang`)
- Jobs: background thread + GCS `JOBS_BUCKET`
- Never commit `invoker.json` / `.env`

---

## 6. Stripe onboarding blurb

> img2x sells personalized AI-illustrated storybooks to adult customers (18+). Buyers upload photos they own or have permission to use (including parental permission for minors). Products: digital flipbook and optional Lulu hardcover. No sexual/exploitative content. Checkout requires age, likeness, and Terms consent. Merchant of record via Stripe; tax via Stripe Tax.

---

**Do not** reintroduce Dodo or partner free checkout without an explicit decision.
