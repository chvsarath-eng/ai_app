# Agent Handoff — img2x (Aug 26, 2026)

> **Purpose:** Next agent / developer can continue without re-discovering context.  
> **Product:** [img2x.com](https://img2x.com) — AI personalized storybooks (digital flipbook + Lulu hardcover).  
> **Status:** Payments migrated from Dodo → **Stripe** (code done, secrets/deploy still needed). Monorepo consolidation in progress under `ai_app`.

---

## 1. Repos & layout

| Before | Remote | Role |
|--------|--------|------|
| `F:/Users/sarat/Documents/ai_app` | https://github.com/chvsarath-eng/ai_app | Next.js storefront (`web/`) |
| `F:/Users/sarat/Documents/ai_api` | https://github.com/chvsarath-eng/ai_api | FastAPI Story Service |

**Target monorepo (preferred):** keep GitHub `chvsarath-eng/ai_app` as the single repo:

```text
ai_app/   (optionally rename repo to img2x later)
  web/          # Next.js 16 App Router — checkout, Stripe, UI
  api/          # FastAPI Story Service (from former ai_api)
  AGENTS.md
  AGENT_HANDOFF.md   # this file
  README.md
```

GCP project: **`imgstr`**  
Cloud Run:
- Web: `img2x-web` → https://img2x.com  
- Story API: `story-api` → `https://story-api-502566942325.us-central1.run.app`

---

## 2. What was done this session

### 2.1 Payment-gateway compliance research
- MoRs (**Dodo / Paddle / Lemon Squeezy**) **ban physical goods** → hardcover blocked.
- **Paddle** restricts AI human-face / face-swap content generation.
- **Stripe** chosen for worldwide digital + hardcover.
- Audit canvas (local Cursor): `payment-gateway-compliance.canvas.tsx` under the ai_api Cursor project canvases folder.

### 2.2 Stripe migration (in `web/`) — CODE COMPLETE
| Area | Path | Notes |
|------|------|--------|
| Stripe client | `web/src/lib/stripe.ts` | Price IDs or `price_data` fallbacks; Tax toggle |
| Order emails | `web/src/lib/order-emails.ts` | Shared SMTP templates |
| Checkout API | `web/src/app/api/checkout/route.ts` | Create + verify Checkout Session |
| Webhook | `web/src/app/api/webhooks/stripe/route.ts` | `checkout.session.completed` → emails |
| Invoice/receipt | `web/src/app/api/payments/[paymentId]/invoice/route.ts` | Stripe charge receipt redirect |
| Prices | `web/src/app/api/localize-prices/route.ts` | USD display + tax note |
| Checkout UI | `web/src/app/checkout/page.tsx` | Stripe redirect; consent checkboxes |
| Env template | `web/.env.example` | Stripe vars |
| Deploy | `web/cloudbuild.yaml` | Mounts `stripe-secret-key`, `stripe-webhook-secret` |

**Removed:** Dodo SDK, overlay, `/api/webhooks/dodo`, partner access code `1345`, unpaid “partner-test” orders.

**Flow (unchanged architecture):**
1. Client caches photos in IndexedDB → `POST /api/checkout` → redirect to Stripe.
2. Return `?payment_return=1&session_id=...` → verify paid → `createStorybookJob` → Story Service.
3. Webhook sends confirmation email (does **not** create jobs).

### 2.3 Compliance UX added at checkout
Required checkboxes before Pay:
- 18+
- Likeness / parental permission for minors in photos
- Agree to Terms + Refund Policy

---

## 3. NOT done yet (next agent TODO)

### P0 — Make Stripe live
1. Create/activate Stripe account for the business country; enable **international** cards.
2. Enable **Stripe Tax** in Dashboard (or set `STRIPE_AUTOMATIC_TAX=false` until Tax is ready).
3. Create GCP secrets and versions (no trailing newline — breaks webhooks):
   ```bash
   gcloud secrets create stripe-secret-key --replication-policy=automatic --project=imgstr
   gcloud secrets create stripe-webhook-secret --replication-policy=automatic --project=imgstr
   # Add sk_live_... and whsec_... as secret versions
   ```
4. Stripe Dashboard → Webhooks → endpoint:
   - URL: `https://img2x.com/api/webhooks/stripe`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.payment_failed`
5. Deploy `web` via Cloud Build; smoke-test test-mode then live.
6. Optional: create Products/Prices in Stripe; set `STRIPE_PRICE_DIGITAL_ID` / `STRIPE_PRICE_HARDCOVER_ID`.

### P1 — Monorepo hygiene
- After `api/` is in the same repo: update Cloud Build triggers so Story API builds from `api/` (or keep separate trigger on `api/cloudbuild.yaml`).
- Optionally rename GitHub repo `ai_app` → `img2x`.
- Archive or mark read-only `chvsarath-eng/ai_api` with README pointing to monorepo `api/`.
- Point Cursor workspace root at the monorepo.

### P2 — Further compliance (improves Stripe risk review)
- Public **Safety / Content Policy** page (moderation, prohibited prompts, retention).
- Align marketing price ($9.99 vs leftover $14.99 SEO copy).
- Story API: stronger prompt blocklist for sexualized minors; avoid “face-swap” marketing language.
- Do not re-enable unpaid partner checkout in production.

### P3 — Story Service (api) notes for context
- Endpoint: `POST /generate-ebook-async` in `story_fastapi.py`
- Images: production Cloud Run uses **LaoZhang** (`IMAGE_PROVIDER=laozhang`, `API_KEY_LAOZHANG`)
- Jobs: in-process background thread + GCS `JOBS_BUCKET=lulubook`
- Scaling (approx): max 4, concurrency 1, 2 CPU, 1Gi, timeout 300s, CPU always allocated

---

## 4. Env vars (web)

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | `sk_test_` / `sk_live_` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_` |
| `STRIPE_AMOUNT_DIGITAL_CENTS` | Default `999` ($9.99) |
| `STRIPE_AMOUNT_HARDCOVER_CENTS` | Default `3999` ($39.99) |
| `STRIPE_PRICE_DIGITAL_ID` | Optional Dashboard price |
| `STRIPE_PRICE_HARDCOVER_ID` | Optional Dashboard price |
| `STRIPE_AUTOMATIC_TAX` | `true` / `false` |
| `STORY_SERVICE_URL` | Cloud Run Story API |
| `STORY_INVOKER_CREDENTIALS_JSON` | IAM invoker SA JSON |
| `SMTP_*` | Order/contact email |

Local webhook forward:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## 5. Stripe onboarding blurb (honest)

> img2x sells personalized AI-illustrated storybooks to adult customers (18+). Buyers upload photos they own or have permission to use (including parental permission for minors). Products: digital flipbook (email delivery) and optional print-on-demand hardcover via Lulu. We prohibit sexual / exploitative content. Checkout requires age, likeness, and Terms consent. We are the merchant of record via Stripe; tax via Stripe Tax.

---

## 6. Key contacts / brands

- Support: `team@img2x.com`
- GCP project: `imgstr`
- Governing law in ToS: India

---

## 7. Conversation / research trail

- Compliance audit discussion + Stripe decision: this chat thread.
- Prior Story Service detail: `/generate-ebook-async` lives in former `ai_api` (`story_fastapi.py`); image API LaoZhang in prod.
- Do **not** use Paddle for this product (face AI + physical goods).
- Do **not** put hardcover on Dodo/Lemon MoR accounts.

---

## 8. How next agent should start

1. Open monorepo workspace (`ai_app` with `web/` + `api/`).
2. Read this file + `AGENTS.md` + `web/README.md`.
3. Confirm Stripe secrets exist and webhook is registered.
4. Run `web` locally with `sk_test_` + Stripe CLI.
5. Only then deploy live and flip `sk_live_`.

**Do not** reintroduce Dodo or partner free checkout without an explicit product decision.
