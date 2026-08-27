# img2x - AI Agent Onboarding Guide

> **Current status & next steps:** see [`AGENT_HANDOFF.md`](./AGENT_HANDOFF.md) (Stripe go-live, monorepo `web/` + `api/`).

This document provides everything an AI agent needs to understand and work on the img2x project.

## What is img2x?

**img2x** is a personalized storybook generator that creates photorealistic 4K illustrated children's books using AI face-lock technology.

**Value Proposition:**
- Upload a child's photo → Get a personalized storybook where they're the hero
- 4K photorealistic illustrations (not cartoon-style)
- Face-lock technology keeps the child's face consistent across all pages
- Digital flipbook ($14.99) or Hardcover via Lulu ($39.99)
- Worldwide shipping through Lulu print-on-demand

**Target Users:**
- Parents/grandparents buying gifts for children (ages 0-10)
- Gift occasions: birthdays, Christmas, new baby, first day of school

**Live Site:** https://img2x.com

---

## Domain & Hosting

| Domain | Maps To | Region |
|--------|---------|--------|
| `img2x.com` | img2x-web (Cloud Run) | us-central1 |
| `www.img2x.com` | img2x-web (Cloud Run) | us-central1 |

**DNS:** Managed in GCP Cloud Run domain mappings

**SSL:** Automatic via Google-managed certificates

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                            │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    img2x-web (Next.js)                          │
│                    Cloud Run - us-central1                      │
│                                                                 │
│  • App Router (pages, API routes)                               │
│  • Photo upload + validation                                    │
│  • Order management + Stripe checkout                    │
│  • 3D book preview (Three.js)                                   │
└──────────────┬──────────────────────────────┬───────────────────┘
               │ ID Token Auth                │ Webhooks
               ▼                              ▼
┌──────────────────────────────┐  ┌───────────────────────────────┐
│    Story Service (Python)    │  │        Stripe          │
│    Cloud Run - us-central1   │  │        (Payment Gateway)      │
│                              │  │                               │
│  • AI image generation       │  │  • Hosted checkout            │
│  • Story composition         │  │  • Tax calculation            │
│  • PDF/flipbook generation   │  │  • checkout.session.completed         │
│  • Book-ready email          │  │  • Invoices/receipts          │
└──────────────────────────────┘  └───────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Lulu Direct API                              │
│                    (Print-on-Demand)                            │
│                                                                 │
│  • Hardcover printing                                           │
│  • Worldwide shipping                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
ai_app/
├── AGENTS.md              # This file - AI agent onboarding
├── .cursor/
│   └── rules/             # Cursor AI project rules
│       ├── coding-standards.mdc
│       ├── deployment.mdc
│       ├── documentation-sync.mdc
│       └── project-architecture.mdc
│
└── web/                   # Next.js web application
    ├── src/
    │   ├── app/           # App Router pages + API routes
    │   │   ├── page.tsx           # Homepage
    │   │   ├── layout.tsx         # Root layout (SEO metadata)
    │   │   ├── api/
    │   │   │   ├── storybook/generate/    # Create storybook job
    │   │   │   ├── storybook/jobs/[id]/   # Job status
│   │   │   ├── checkout/              # Stripe checkout session flow
    │   │   │   ├── webhooks/stripe/       # Stripe webhook handler
    │   │   │   ├── payments/[paymentId]/  # Receipt redirect
    │   │   │   └── contact/               # Contact form (SMTP)
    │   │   ├── order/[orderId]/   # Order confirmation (+ receipt link)
    │   │   ├── gallery/           # Example storybooks
    │   │   ├── pricing/           # Pricing page
    │   │   ├── privacy/           # Privacy policy
    │   │   ├── terms/             # Terms of service
    │   │   └── refund/            # Refund policy
    │   │
    │   ├── components/    # UI components
    │   │   ├── ui/                # Shadcn UI base components
    │   │   ├── generator-card/    # Photo upload + generation flow
    │   │   ├── photo-guidelines-dialog.tsx  # Photo tips carousel
    │   │   ├── cookie-consent.tsx # GDPR cookie consent banner
    │   │   ├── r3f-book-preview/  # 3D book viewer (Three.js)
    │   │   └── ...
    │   │
    │   ├── lib/           # Utilities
    │   │   ├── storyApiServer.ts  # Story service client
    │   │   ├── storybookApi.ts    # API helpers
    │   │   ├── stripe.ts          # Stripe server helpers
    │   │   ├── order-emails.ts    # Order confirmation emails
    │   │   ├── analytics.ts       # GA event tracking helper
    │   │   └── utils.ts           # General utilities
    │   │
    │   └── types/         # TypeScript types
    │
    ├── public/            # Static assets
    ├── infra/             # Terraform (GCP infrastructure)
    ├── Dockerfile         # Cloud Run container
    ├── cloudbuild.yaml    # CI/CD pipeline
    ├── README.md          # Technical documentation
    └── SEO_CHECKLIST.md   # SEO implementation tracking
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) + React 19 |
| Styling | Tailwind CSS v4 + Shadcn UI + Radix UI |
| 3D | Three.js / @react-three/fiber |
| Forms | React Hook Form + Zod |
| State | React Query (server) + Zustand (client) |
| Payments | Stripe (hosted checkout, webhooks, tax) |
| Email | Nodemailer (SMTP via Hostinger) |
| Hosting | Google Cloud Run |
| CI/CD | GitHub Actions (OIDC) → Artifact Registry → Cloud Run |
| Infra | Terraform |

---

## Key User Flows

### 1. Create Storybook (Digital - $14.99)
1. User visits homepage
2. Photo guidelines dialog appears (first-time, dismissable)
3. User uploads child's photo
4. User selects theme (dinosaur, space, etc.)
5. User enters child's name + optional storyline
6. User enters email
7. User selects "Digital PDF" book type
8. Click "Create My Book" → Stripe checkout session is created and the user is redirected to hosted checkout
9. User completes payment (Stripe handles tax calculation)
10. User returns to `/checkout`, payment is verified, and then `/api/storybook/generate` creates job
11. Redirect to order confirmation page (with payment ID)
12. Stripe webhook (`checkout.session.completed`) → Order confirmation email sent from `team@img2x.com`
13. Story service generates book (async)
14. Book-ready email sent with download link

### 2. Order Hardcover ($39.99)
1. User selects "Hardcover" book type
2. User fills shipping address form (name, address, city, country, etc.)
3. Click "Create My Book" → Stripe checkout session is created and the user is redirected to hosted checkout
4. User completes payment
5. On success → Job created with shipping details
6. Order confirmation email sent (includes shipping address)
7. Story service generates book
8. PDF sent to Lulu for printing + shipping
9. User receives tracking email when shipped

### Email Flow (from team@img2x.com)
| Trigger | Email Type | Content |
|---------|------------|---------|
| `checkout.session.completed` webhook | Order Confirmation | Receipt, order details, "what's next" |
| Story job finished | Book Ready | Download link (digital) or shipping info (hardcover) |

---

## Environment Variables

**Required for web app:**
```
# Story Service
STORY_SERVICE_URL=https://story-service-xxx.run.app
STORY_SERVICE_AUDIENCE=https://story-service-xxx.run.app
STORY_INVOKER_CREDENTIALS_JSON={"type":"service_account",...}

# SMTP (for sending emails from team@img2x.com)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=team@img2x.com
SMTP_PASS=xxx

# Stripe (international payments)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_AMOUNT_DIGITAL_CENTS=999
STRIPE_AMOUNT_HARDCOVER_CENTS=3999
STRIPE_AUTOMATIC_TAX=true
# Optional Dashboard Price IDs:
# STRIPE_PRICE_DIGITAL_ID=price_xxx
# STRIPE_PRICE_HARDCOVER_ID=price_xxx

# Lulu Print-on-Demand
LULU_CLIENT_KEY=xxx
LULU_CLIENT_SECRET=xxx
LULU_API_BASE=https://api.sandbox.lulu.com  # or api.lulu.com for production
```

**GCP Secret Manager secrets (for Cloud Run):**

| Secret Name | Environment Variable | Description |
|-------------|---------------------|-------------|
| `smtp-host` | SMTP_HOST | SMTP server hostname |
| `smtp-port` | SMTP_PORT | SMTP port (587) |
| `smtp-user` | SMTP_USER | team@img2x.com |
| `smtp-pass` | SMTP_PASS | SMTP password |
| `story-service-url` | STORY_SERVICE_URL | Story service Cloud Run URL |
| `story-invoker-credentials` | STORY_INVOKER_CREDENTIALS_JSON | Service account JSON |
| `stripe-secret-key` | STRIPE_SECRET_KEY | Stripe secret API key |
| `stripe-webhook-secret` | STRIPE_WEBHOOK_SECRET | Stripe webhook signing secret |

**Create secrets (one-time):**
```bash
gcloud secrets create stripe-secret-key --replication-policy="automatic" --project=imgstr
gcloud secrets create stripe-webhook-secret --replication-policy="automatic" --project=imgstr
```

---

## Deployment

### Automatic (required)
Open a PR → **CI** passes → merge to `main` → **Deploy Web** / **Deploy API** (path-aware, after CI).

Workflows: `.github/workflows/ci.yml`, `deploy-web.yml`, `deploy-api.yml`  
Bootstrap: [`docs/DEPLOYMENT_SETUP.md`](./docs/DEPLOYMENT_SETUP.md)

### Manual (emergency only)
```bash
export GCP_PROJECT_ID=imgstr
./scripts/deploy-cloud-run.sh web us-central1-docker.pkg.dev/imgstr/img2x-repo/img2x-web:TAG
```

Legacy `web/cloudbuild.yaml` is deprecated — do not re-enable Cloud Build triggers on `main`.

### Monitor
- Actions: https://github.com/chvsarath-eng/ai_app/actions
- Logs: `gcloud run services logs read img2x-web --region us-central1`
- Production: https://img2x.com

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| `lstat /workspace/web/Dockerfile: no such file` | Running `gcloud builds submit` from wrong directory | Run from repo root, not `web/` |
| Build uploading 300+ MiB | Missing `.gcloudignore` | Ensure `web/.gcloudignore` exists and excludes `node_modules/` |
| `DialogContent requires DialogTitle` | Radix UI accessibility | Add `<DialogTitle className="sr-only">` |
| API calls fail | Invalid service URL or credentials | Check `STORY_SERVICE_URL` and service account |
| Stripe checkout session fails | Missing product IDs or invalid checkout config | Check `Stripe_PRODUCT_DIGITAL_ID`, `Stripe_PRODUCT_HARDCOVER_ID`, and `Stripe_PRODUCT_SHIPPING_ID` |
| Invoice PDF 404 | Payment has no invoice yet | Retry after payment finalization in Stripe |
| Webhook signature invalid | Wrong secret or verification logic | Check `Stripe_PAYMENTS_WEBHOOK_KEY` |
| Webhook 401 after deploying | Secret has trailing newline | See "GCP Secret Trailing Newline" fix below |
| Order confirmation email not sent | Webhook misconfigured or SMTP issue | Check `/api/webhooks/Stripe` and SMTP credentials |

---

## Coding Standards

- **Style:** Standard.js (2 spaces, no semicolons, single quotes)
- **Components:** Functional with hooks, PascalCase
- **Files:** kebab-case (`photo-guidelines-dialog.tsx`)
- **Directories:** kebab-case (`generator-card/`)

See `.cursor/rules/coding-standards.mdc` for details.

---

## Current Status (as of Feb 2026)

### ✅ Completed
- Core storybook generation flow
- 3D book preview
- Digital ($14.99) + Hardcover ($39.99) ordering
- Photo guidelines UI (step-by-step carousel)
- SEO metadata + structured data
- CI/CD pipeline
- Google Search Console (verified, sitemap submitted - 9 pages indexed)
- Domain mapping (img2x.com + www.img2x.com)
- Google Analytics 4 (Measurement ID: G-Q12Z62SK1Q)
- Cookie Consent Banner (GDPR compliant, react-cookie-consent + GA Consent Mode)
- **Stripe Integration:**
  - Hosted checkout flow with return verification
  - Tax calculation handled by Stripe
  - Shipping address collection (hardcover orders)
  - Server-side session creation for both digital and hardcover orders
  - Shipping costs from Lulu billed via a pay-what-you-want shipping product
  - Webhook handling (`checkout.session.completed`, `payment.failed`)
  - Order confirmation emails from `team@img2x.com`
  - Invoice/receipt download via Stripe payment invoices
  - Analytics events (`checkout_opened`, `checkout_completed`, etc.)
- **Checkout Page UI:**
  - Clean, centered header with animated gradient title (ultraGlowText)
  - Responsive design for mobile, tablet, and desktop
  - Collapsible accordion for delivery options
  - Violet-fuchsia gradient theme matching homepage branding
  - Subtle button styling with soft shadows

- **Multi-Character Support (v2):**
  - 1-4 character photos per storybook (couples, families, siblings, friends)
  - Dynamic "Add Character" UI with per-character name, age, gender, relationship
  - Character metadata sent as JSON array alongside images
  - Order summary shows all character thumbnails and names
  - Email confirmations list all character names

### 🔄 In Progress
- Production Stripe setup

### 📋 Backlog
- Blog section for SEO content
- Theme/occasion landing pages
- Social media integration
- Customer reviews section

See `web/SEO_CHECKLIST.md` for detailed SEO roadmap.

---

## Key Decisions & Learnings

1. **Photo Guidelines as Carousel:** Changed from grid showing all images to step-by-step carousel for mobile responsiveness. Includes "Don't show again" option.

2. **sr-only vs VisuallyHidden:** Use Tailwind's `sr-only` class instead of importing `@radix-ui/react-visually-hidden` to avoid adding dependencies.

3. **Cloud Build Directory:** The `cloudbuild.yaml` uses `dir: 'web'`, so manual builds must submit from repo root with `.` as source.

4. **Face-lock Technology:** The key differentiator - AI keeps the child's face consistent across all illustrations (not just pasting).

5. **Stripe:** Checkout is now created server-side via Stripe, with receipts/invoices coming from the payment provider and tax calculated during hosted checkout.

6. **Payment Flow:** Stripe checkout redirects away from the app, so uploaded image files are cached in IndexedDB before redirect. On return, `/checkout` verifies the Stripe session/payment and only then creates the storybook job.

7. **Two-Email System:** 
   - Email 1: Order confirmation (immediately after payment via webhook)
   - Email 2: Book ready (after AI generation completes)
   - Both sent from `team@img2x.com` via SMTP.

8. **Stripe Shipping Product:** Hardcover checkout uses a dedicated pay-what-you-want Stripe product so Lulu shipping can be billed as a dynamic line item.

9. **Hosted Return Verification:** The `/api/checkout` route both creates Stripe sessions and verifies returned session IDs so book generation only starts after confirmed payment success.

10. **GCP Secret Trailing Newline:** When creating GCP secrets via PowerShell piping (e.g., `"value" | gcloud secrets versions add`), PowerShell adds a trailing newline. This breaks signature verification. **Fix:** Write secret to a file without newline first:
    ```powershell
    [System.IO.File]::WriteAllText("$env:TEMP\secret.txt", "your_secret_value")
    gcloud secrets versions add SECRET_NAME --data-file="$env:TEMP\secret.txt" --project=PROJECT
    ```
    Or use `echo -n` on Linux/Mac.

11. **Payment Success UX:** The success state remains branded and inline after returning from Stripe, with receipt download and "Create Another Book" actions.

12. **Webhook Email Payload:** Stripe webhook events already include the customer on successful payments, so the webhook route can send order confirmations directly from `checkout.session.completed`.

13. **Checkout Redirect Tradeoff:** Because Stripe checkout is hosted, the app no longer depends on a browser overlay callback. Verification happens through a return-to-app step plus webhook delivery.

14. **Dynamic Shipping Billing:** Shipping costs from Lulu are dynamic and are billed via the configured Stripe shipping product using a per-session `amount`.

15. **Pricing Preview:** Localized price display now uses Stripe checkout preview with a graceful USD fallback when no country signal is available.

16. **Invoice Access:** Receipt links now resolve through `/api/payments/[paymentId]/invoice` instead of old provider-specific transaction URLs.

18. **Checkout Page Styling:** Use consistent violet-fuchsia gradient (from-violet-500 to-fuchsia-500) for buttons and accents. The checkout title uses `ultraGlowText` class for animated gradient effect matching homepage. Removed progress step indicators for cleaner look.

19. **Responsive Checkout:** Added responsive padding (`px-4 sm:px-6`), conditional sticky sidebar (`lg:sticky lg:top-24`), and stacking grids for mobile (`grid-cols-1 sm:grid-cols-3`).

20. **Compact UI Design:** Generator card and checkout page optimized to fit on screen without scrolling. Key changes:
    - Generator card: Reduced padding (`p-3`), smaller book type boxes, shortened labels ("Hardcover" vs "Premium Hardcover")
    - Checkout page: Reduced padding (`py-4 sm:py-6`), smaller cards (`p-4`), compact order summary
    - Removed redundant text ("Tax calculated at checkout" from generator card)
    - Email collection moved from generator card to checkout page for cleaner flow

21. **Email Collection Flow:** Email is now collected only on the checkout page (not on the generator card). This simplifies the homepage form and ensures email is captured at the point of purchase.

22. **Multi-Character API Migration (v2):** The story service field name changed from `"image"` (singular) to `"images"` (plural). Using the old name silently drops all but the last file. Character metadata (name, age, gender, relationship) is sent as a JSON array in `character_metadata` field. For single characters, gender/relationship fields are hidden to keep the form simple.

---

## Payment & Book Generation Flow

### Complete Flow

1. **User fills checkout form** → 1-4 character photos with metadata (name, age, gender, relationship), storyline, email (+ shipping for hardcover)
2. **Browser calls `/api/checkout`** → Creates a Stripe checkout session with metadata
3. **Hosted Stripe checkout opens** → User completes payment
4. **Payment succeeds** → Two things happen in parallel:
   - **Webhook** (`/api/webhooks/Stripe`) → Sends Order Confirmation Email
   - **Browser return to `/checkout`** → Verifies payment and then calls Story Service API to generate book
5. **Browser redirects** → `/order/[jobId]` shows order confirmation
6. **Story Service generates book** (async, 15-30 min)
7. **Story Service sends "Book Ready" email** with download link (digital) or tracking (hardcover)

### Email Flow

| Email | Sent By | When | Contains |
|-------|---------|------|----------|
| Order Confirmation | Webhook (`/api/webhooks/Stripe`) | Immediately after payment | Order ID, price, receipt link |
| Book Ready | Story Service | After generation complete | Download link or tracking info |

### Email Template Styling

The order confirmation email uses branded styling consistent with the website:

- **Logo**: `https://img2x.com/brand/img2x-logo-transparent.png` (140px width)
- **Checkmark Icon**: Green gradient (`#10b981` → `#34d399`) circle with white checkmark
- **Button Gradient**: Violet to fuchsia (`#7c3aed` → `#c026d3`) with solid fallback
- **Accent Color**: Violet-600 (`#7c3aed`) for links and totals
- **Template Location**: `web/src/app/api/webhooks/Stripe/route.ts` (`sendCustomerOrderConfirmation` function)

### Story Service API Contract (v2 - Multi-Character)

**Endpoint:** `POST /generate-ebook-async`

**Request (multipart/form-data):**
- `images` (File[]) - 1-4 character face photos (use same field name for all). **MUST be `"images"` (plural), not `"image"`.**
- `story_prompt` (string) - Story theme/description
- `character_metadata` (string) - JSON array: `[{"name":"Ben","age":6,"gender":"male","relationship":"son"}, ...]`. Array order MUST match image upload order.
- `email` (string) - Customer email
- `output_type` (string) - "DIGI_BOOK" or "LULU_BOOK"
- `keep_job_dir` (string) - "false"
- Shipping fields (if LULU_BOOK): `shipping_name`, `shipping_phone` (optional), `shipping_address1`, `shipping_address2`, `shipping_city`, `shipping_region`, `shipping_postal_code`, `shipping_country`

**Response:**
```json
{ "job_id": "uuid", "status": "queued", "num_characters": 4 }
```

**Story Service Responsibilities:**
1. Return `job_id` immediately
2. Process book generation asynchronously (1 char ~2-3 min, 4 chars ~5-6 min)
3. For DIGI_BOOK: Email download link when ready
4. For LULU_BOOK: Submit to Lulu API, email tracking when shipped

---

## Useful Commands

```bash
# Local development
cd web && npm run dev

# Build locally (catch errors before deploy)
npm run build

# Deploy manually
cd /path/to/ai_app
gcloud builds submit --config=web/cloudbuild.yaml --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD) .

# View Cloud Run logs
gcloud run services logs read img2x-web --region us-central1

# Check service status
gcloud run services describe img2x-web --region us-central1
```

---

## Links

- **Production:** https://img2x.com
- **GitHub:** https://github.com/chvsarath-eng/ai_app
- **Cloud Console:** https://console.cloud.google.com/run?project=imgstr
- **Cloud Build:** https://console.cloud.google.com/cloud-build/builds?project=imgstr

---

*Last updated: February 22, 2026 (Multi-character support - 1-4 characters per storybook with metadata)*
