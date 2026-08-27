# img2x Web App

Next.js (App Router) frontend for img2x — a personalized storybook generator that calls a Cloud Run story service and emails results to users.

## Tech Stack

- Next.js 16 (App Router) + React 19
- Tailwind CSS v4
- React Hook Form + Zod
- React Query
- Three.js / @react-three/fiber for 3D previews
- Stripe Checkout for international payments (hosted checkout, webhooks, Stripe Tax)
- Nodemailer for transactional emails (SMTP)

## Project Structure

```
web/
  src/
    app/                 # App Router pages + API routes
    components/          # Reusable UI + feature components
    lib/                 # API clients, auth helpers, utils
    types/               # Shared types
  public/                # Static assets (images, guidelines)
  infra/                 # Terraform for Cloud Run deployment
  cloudbuild.yaml        # Cloud Build pipeline
  Dockerfile             # Cloud Run container build
```

Key entry points:
- `src/app/page.tsx` — Home page
- `src/app/order/[orderId]/page.tsx` — Order confirmation (with receipt download)
- `src/app/api/storybook/*` — Server routes that call the story service
- `src/app/api/checkout/route.ts` — Stripe Checkout session creation + verification
- `src/app/api/webhooks/stripe/route.ts` — Stripe webhook handler
- `src/app/api/payments/[paymentId]/invoice/route.ts` — Stripe receipt redirect
- `src/app/api/contact/route.ts` — Contact form email

## Local Development

### 1) Install dependencies

```
npm install
```

### 2) Configure environment

Copy and fill `.env` from the template:

```
cp .env.example .env
```

Required variables:
- `STORY_SERVICE_URL` — Cloud Run story service URL (no trailing slash)
- `STORY_SERVICE_AUDIENCE` — usually the same as `STORY_SERVICE_URL`
- **Auth (choose one)**:
  - `GOOGLE_APPLICATION_CREDENTIALS` or `STORY_INVOKER_CREDENTIALS_PATH`
  - OR `STORY_INVOKER_CREDENTIALS_JSON`
- SMTP credentials for transactional emails:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- **Stripe Payments**:
  - `STRIPE_SECRET_KEY` — Server-side secret key (`sk_test_...` / `sk_live_...`)
  - `STRIPE_WEBHOOK_SECRET` — Webhook signing secret
  - Optional `STRIPE_PRICE_DIGITAL_ID` / `STRIPE_PRICE_HARDCOVER_ID`
  - Fallback amounts: `STRIPE_AMOUNT_DIGITAL_CENTS=999`, `STRIPE_AMOUNT_HARDCOVER_CENTS=3999`
  - `STRIPE_AUTOMATIC_TAX=true` (requires Stripe Tax enabled in Dashboard)

Current pricing:
- Digital ebook retail: `$9.99`
- Hardcover: `$39.99`
- Shipping is quoted from Lulu and billed as a dynamic Stripe Checkout line item
- Tax/VAT/GST calculated by Stripe Tax at checkout for the customer’s country

### Local Testing Before Push

Use a local `.env` (do not commit):

```bash
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_AMOUNT_DIGITAL_CENTS=999
STRIPE_AMOUNT_HARDCOVER_CENTS=3999
STRIPE_AUTOMATIC_TAX=true
```

Forward webhooks locally with Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### 3) Run dev server

```
npm run dev
```

Open http://localhost:3000

## Production Build

```
npm run build
npm run start
```

## Cloud Run Deployment (GCP)

This repo ships with Infrastructure as Code in `web/infra/` and a Docker build for Cloud Run.

### Infrastructure Setup (Terraform)

```bash
cd web/infra
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

Terraform creates:
- Artifact Registry repo (`img2x-repo`)
- Secret Manager secrets
- Cloud Run service (`img2x-web`)
- IAM roles

### Required GCP Secrets

Before deploying, ensure these secrets exist in Secret Manager:

```bash
# Create Stripe secrets (one-time setup)
gcloud secrets create stripe-secret-key --replication-policy="automatic" --project=imgstr
gcloud secrets create stripe-webhook-secret --replication-policy="automatic" --project=imgstr

# Add secret values
echo -n "YOUR_STRIPE_SECRET_KEY" | gcloud secrets versions add stripe-secret-key --data-file=- --project=imgstr
echo -n "YOUR_STRIPE_WEBHOOK_SECRET" | gcloud secrets versions add stripe-webhook-secret --data-file=- --project=imgstr
```

**Required secrets:**
| Secret Name | Description |
|-------------|-------------|
| `smtp-host` | SMTP server hostname |
| `smtp-port` | SMTP port (587) |
| `smtp-user` | SMTP username (team@img2x.com) |
| `smtp-pass` | SMTP password |
| `story-service-url` | Story service Cloud Run URL |
| `story-invoker-credentials` | Service account JSON for story service |
| `stripe-secret-key` | Stripe secret API key |
| `stripe-webhook-secret` | Stripe webhook signing secret |

### CI/CD Pipeline

**Automatic Deployment (GitHub Integration):**
- Push to `main` branch triggers Cloud Build automatically
- GitHub App integration must be configured in Cloud Build UI
- Trigger points to `web/cloudbuild.yaml`

**Manual Deployment:**

> **IMPORTANT:** Always run `gcloud builds submit` from the **repo root**, not from `web/`.
> The `cloudbuild.yaml` uses `dir: 'web'` which expects the workspace to contain a `web/` folder.

```bash
# From repo root (ai_app/), NOT from web/
cd /path/to/ai_app

# Submit build with commit SHA
gcloud builds submit --config=web/cloudbuild.yaml --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD) web/
```

**What the build does:**
1. Builds Docker image from `web/Dockerfile`
2. Pushes to Artifact Registry (`us-central1-docker.pkg.dev/<PROJECT_ID>/img2x-repo/img2x-web`)
3. Deploys to Cloud Run (`img2x-web` service)

### Build Configuration

**cloudbuild.yaml substitutions:**
- `_REGION`: `us-central1` (default)
- `_REPO`: `img2x-repo` (Artifact Registry repo name)
- `_SERVICE_NAME`: `img2x-web` (Cloud Run service name)
- `COMMIT_SHA`: Git commit hash (required for manual builds)

**Build specs:**
- Machine type: `E2_HIGHCPU_8`
- Timeout: 10 minutes
- Memory: 512Mi (Cloud Run)
- Min instances: 0, Max instances: 10

### Quick Deploy Checklist

1. Commit and push changes to `main`
2. If auto-trigger is set up, deployment happens automatically
3. For manual deploy:
   ```bash
   # From repo root
   git add . && git commit -m "your message" && git push origin main
   gcloud builds submit --config=web/cloudbuild.yaml --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD) web/
   ```
4. Monitor build: https://console.cloud.google.com/cloud-build/builds
5. Verify deployment: https://img2x.com

## API Flow (High Level)

1. User uploads photo + enters details (name, theme, email)
2. User selects book type (Digital $9.99 / Hardcover $39.99)
3. For hardcover: user enters shipping address, selects shipping option (Lulu API calculates costs)
4. User confirms 18+, photo permission, and Terms
5. Click "Pay with Stripe" → `/api/checkout` creates a Stripe Checkout Session
6. User completes international payment on Stripe (tax calculated for their country)
7. Return to `/checkout?payment_return=1&session_id=...` → payment verified → job created
8. Webhook `/api/webhooks/stripe` sends order confirmation email
9. Story service generates book (async)
10. Book-ready email sent with download link or shipping info

## Troubleshooting

### Stripe checkout return flow

Stripe Checkout is hosted, so the app stores uploaded photos in IndexedDB before redirecting away
from `/checkout`. When the customer returns, `/checkout` restores the files, verifies the Stripe
session via `/api/checkout`, and only then starts story generation.

### Shipping charges

Shipping costs from Lulu are billed as a dynamic Stripe Checkout `price_data` line item
(amount in cents from the selected Lulu shipping option).

### Build Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `lstat /workspace/web/Dockerfile: no such file or directory` | Ran `gcloud builds submit` from wrong directory | Run from repo root: `gcloud builds submit --config=web/cloudbuild.yaml web/` |
| TypeScript errors | Code doesn't compile | Run `npm run build` locally first |
| `Module not found` | Missing dependency | Run `npm install` and commit `package-lock.json` |

### Runtime Errors

| Error | Cause | Fix |
|-------|-------|-----|
| API calls fail | Invalid service URL or credentials | Verify `STORY_SERVICE_URL` and service account |
| Contact form fails | SMTP misconfiguration | Check `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` |
| 500 errors | Check Cloud Run logs | `gcloud run services logs read img2x-web --region us-central1` |

### Stripe Payments Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Checkout session fails | Missing `STRIPE_SECRET_KEY` or Tax not enabled | Set secret key; enable Stripe Tax or set `STRIPE_AUTOMATIC_TAX=false` for testing |
| Payment verification fails after return | Missing `session_id` / IndexedDB cleared | Do not clear browser storage mid-checkout; use `session_id` query param |
| Order email not sent | SMTP misconfiguration or webhook not configured | Check SMTP + Stripe webhook endpoint `/api/webhooks/stripe` |
| Receipt 404 | Charge receipt not ready yet | Retry after payment finalizes |

### Slow Builds

If `gcloud builds submit` is slow (uploading 300+ MiB), ensure `.gcloudignore` exists and excludes `node_modules/`.

### GCP Secrets Best Practices

**Avoid trailing newlines when creating secrets!**

PowerShell piping adds a trailing newline which breaks signature verification:

```powershell
# BAD - adds trailing newline
"secret_value" | gcloud secrets versions add SECRET_NAME --data-file=- --project=PROJECT

# GOOD - write to file without newline first
[System.IO.File]::WriteAllText("$env:TEMP\secret.txt", "secret_value")
gcloud secrets versions add SECRET_NAME --data-file="$env:TEMP\secret.txt" --project=PROJECT
```

On Linux/Mac, use `echo -n`:
```bash
echo -n "secret_value" | gcloud secrets versions add SECRET_NAME --data-file=- --project=PROJECT
```

**To check if a secret has a trailing newline:**
```powershell
gcloud secrets versions access latest --secret=SECRET_NAME --project=PROJECT | ForEach-Object { $_.Length }
# If you see two numbers (e.g., "70" and "0"), there's a trailing newline
```

**To fix an existing secret:**
```powershell
[System.IO.File]::WriteAllText("$env:TEMP\secret.txt", "correct_secret_value")
gcloud secrets versions add SECRET_NAME --data-file="$env:TEMP\secret.txt" --project=PROJECT
# Then redeploy Cloud Run to pick up the new version
```
