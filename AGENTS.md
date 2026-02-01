# img2x - AI Agent Onboarding Guide

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
│  • Order management + Paddle checkout                           │
│  • 3D book preview (Three.js)                                   │
└──────────────┬──────────────────────────────┬───────────────────┘
               │ ID Token Auth                │ Webhooks
               ▼                              ▼
┌──────────────────────────────┐  ┌───────────────────────────────┐
│    Story Service (Python)    │  │        Paddle Billing         │
│    Cloud Run - us-central1   │  │        (Payment Gateway)      │
│                              │  │                               │
│  • AI image generation       │  │  • Checkout overlay           │
│  • Story composition         │  │  • Tax calculation            │
│  • PDF/flipbook generation   │  │  • transaction.completed      │
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
    │   │   │   ├── checkout/              # Paddle checkout initiation
    │   │   │   ├── webhooks/paddle/       # Paddle webhook handler
    │   │   │   ├── paddle/transactions/   # Invoice PDF redirect
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
    │   │   ├── paddle.ts          # Paddle.js checkout integration
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
| Payments | Paddle Billing (checkout overlay, webhooks, tax) |
| Email | Nodemailer (SMTP via Hostinger) |
| Hosting | Google Cloud Run |
| CI/CD | Cloud Build + GitHub triggers |
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
8. Click "Create My Book" → Paddle checkout overlay opens
9. User completes payment (Paddle handles tax calculation)
10. On success → `/api/storybook/generate` creates job
11. Redirect to order confirmation page (with transaction ID)
12. Paddle webhook (`transaction.completed`) → Order confirmation email sent from `team@img2x.com`
13. Story service generates book (async)
14. Book-ready email sent with download link

### 2. Order Hardcover ($39.99)
1. User selects "Hardcover" book type
2. User fills shipping address form (name, address, city, country, etc.)
3. Click "Create My Book" → Paddle checkout overlay opens
4. User completes payment
5. On success → Job created with shipping details
6. Order confirmation email sent (includes shipping address)
7. Story service generates book
8. PDF sent to Lulu for printing + shipping
9. User receives tracking email when shipped

### Email Flow (from team@img2x.com)
| Trigger | Email Type | Content |
|---------|------------|---------|
| `transaction.completed` webhook | Order Confirmation | Receipt, order details, "what's next" |
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

# Paddle Payment (sandbox or production)
NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox  # or "production"
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=test_xxx  # Client-side token
NEXT_PUBLIC_PADDLE_PRICE_DIGITAL=pri_xxx  # Digital book price ID
NEXT_PUBLIC_PADDLE_PRICE_HARDCOVER=pri_xxx  # Hardcover price ID
PADDLE_API_KEY=pdl_xxx  # Server-side API key (for invoices)
PADDLE_WEBHOOK_SECRET=pdl_ntfset_xxx  # Webhook signature verification

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
| `paddle-client-token` | NEXT_PUBLIC_PADDLE_CLIENT_TOKEN | Paddle client-side token |
| `paddle-api-key` | PADDLE_API_KEY | Paddle server-side API key |
| `paddle-webhook-secret` | PADDLE_WEBHOOK_SECRET | Webhook signature secret |

**Create secrets (one-time):**
```bash
gcloud secrets create paddle-api-key --replication-policy="automatic" --project=imgstr
gcloud secrets create paddle-webhook-secret --replication-policy="automatic" --project=imgstr
```

---

## Deployment

### Automatic (Recommended)
Push to `main` → GitHub trigger → Cloud Build → Cloud Run

### Manual
```bash
# MUST run from repo root (ai_app/), NOT from web/
cd /path/to/ai_app
gcloud builds submit --config=web/cloudbuild.yaml --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD) .
```

### Monitor
- Build: https://console.cloud.google.com/cloud-build/builds
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
| Paddle checkout 403 Forbidden | Domain not approved in Paddle | Add domain in Paddle Dashboard → Checkout Settings |
| Paddle checkout 400 `transaction_default_checkout_url_not_set` | Missing default checkout URL | Set in Paddle Dashboard → Checkout Settings → Default Payment Link |
| Paddle `$PADDLE_CLIENT_TOKEN` literal in headers | Build arg not passed correctly | Ensure `cloudbuild.yaml` has `secretEnv` and proper `--build-arg` format |
| Invoice PDF 404 | Wrong Paddle API URL | Use `sandbox-api.paddle.com` for sandbox, `api.paddle.com` for production |
| Webhook signature invalid | Wrong secret or verification logic | Check `PADDLE_WEBHOOK_SECRET` matches Paddle notification setting's `endpointSecretKey` |
| Webhook 401 after deploying | Secret has trailing newline | See "GCP Secret Trailing Newline" fix below |
| Order confirmation email not sent | Webhook doesn't include customer email | Webhook handler fetches email from Paddle API using `customer_id` |

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
- **Paddle Payment Integration:**
  - Checkout overlay (sandbox mode)
  - Tax calculation (tax-exclusive display)
  - Shipping address collection (hardcover orders)
  - Webhook handling (`transaction.completed`, `transaction.payment_failed`)
  - Order confirmation emails from `team@img2x.com`
  - Invoice/receipt download via Paddle API
  - Analytics events (`checkout_opened`, `checkout_completed`, etc.)

### 🔄 In Progress
- Production Paddle setup (switch from sandbox to live)

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

5. **Paddle vs Stripe:** Chose Paddle for Merchant of Record model - handles global tax compliance, VAT, invoices automatically. No need to manage tax registrations ourselves.

6. **Payment Flow:** Paddle checkout opens as overlay, job is only created AFTER successful payment (not before). This prevents abandoned orders from creating jobs.

7. **Two-Email System:** 
   - Email 1: Order confirmation (immediately after payment via webhook)
   - Email 2: Book ready (after AI generation completes)
   - Both sent from `team@img2x.com` via SMTP.

8. **Paddle Domain Approval:** Paddle requires explicit domain approval. Add `img2x.com` (not `www.` or with protocol) in Paddle dashboard under Checkout Settings.

9. **Default Checkout URL:** Paddle requires setting "Default checkout URL" in dashboard, otherwise checkout returns `transaction_default_checkout_url_not_set` error.

10. **GCP Secret Trailing Newline:** When creating GCP secrets via PowerShell piping (e.g., `"value" | gcloud secrets versions add`), PowerShell adds a trailing newline. This breaks signature verification. **Fix:** Write secret to a file without newline first:
    ```powershell
    [System.IO.File]::WriteAllText("$env:TEMP\secret.txt", "your_secret_value")
    gcloud secrets versions add SECRET_NAME --data-file="$env:TEMP\secret.txt" --project=PROJECT
    ```
    Or use `echo -n` on Linux/Mac.

11. **Payment Success UX:** Replaced generic Paddle success modal with inline branded success state showing order details, receipt download, and "Create Another Book" button for better UX.

12. **Paddle Webhook Customer Email:** The `transaction.completed` webhook only includes `customer_id`, NOT the customer's email. Must call Paddle API (`GET /customers/{id}`) to fetch customer details including email before sending order confirmation emails.

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

*Last updated: February 1, 2026 (Paddle webhook customer email fix)*
