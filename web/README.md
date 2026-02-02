# img2x Web App

Next.js (App Router) frontend for img2x — a personalized storybook generator that calls a Cloud Run story service and emails results to users.

## Tech Stack

- Next.js 16 (App Router) + React 19
- Tailwind CSS v4
- React Hook Form + Zod
- React Query
- Three.js / @react-three/fiber for 3D previews
- Paddle Billing for payments (checkout overlay, webhooks, tax)
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
- `src/app/api/checkout/route.ts` — Paddle checkout initiation
- `src/app/api/webhooks/paddle/route.ts` — Paddle webhook handler
- `src/app/api/paddle/transactions/[transactionId]/invoice/route.ts` — Invoice PDF redirect
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
- **Paddle payment** (sandbox or production):
  - `NEXT_PUBLIC_PADDLE_ENVIRONMENT` — `sandbox` or `production`
  - `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` — Client-side token
  - `NEXT_PUBLIC_PADDLE_PRICE_DIGITAL` — Digital book price ID
  - `NEXT_PUBLIC_PADDLE_PRICE_HARDCOVER` — Hardcover price ID
  - `PADDLE_API_KEY` — Server-side API key
  - `PADDLE_WEBHOOK_SECRET` — Webhook signature verification

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
# Create Paddle secrets (one-time setup)
gcloud secrets create paddle-api-key --replication-policy="automatic" --project=imgstr
gcloud secrets create paddle-webhook-secret --replication-policy="automatic" --project=imgstr

# Add secret values
echo -n "YOUR_PADDLE_API_KEY" | gcloud secrets versions add paddle-api-key --data-file=- --project=imgstr
echo -n "YOUR_PADDLE_WEBHOOK_SECRET" | gcloud secrets versions add paddle-webhook-secret --data-file=- --project=imgstr
```

**All required secrets:**
| Secret Name | Description |
|-------------|-------------|
| `smtp-host` | SMTP server hostname |
| `smtp-port` | SMTP port (587) |
| `smtp-user` | SMTP username (team@img2x.com) |
| `smtp-pass` | SMTP password |
| `story-service-url` | Story service Cloud Run URL |
| `story-invoker-credentials` | Service account JSON for story service |
| `paddle-client-token` | Paddle client-side token |
| `paddle-api-key` | Paddle server-side API key |
| `paddle-webhook-secret` | Paddle webhook signature verification |

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
2. User selects book type (Digital $14.99 / Hardcover $39.99)
3. For hardcover: user enters shipping address, selects shipping option (Lulu API calculates costs)
4. Click "Create My Book" → `/api/checkout` creates Paddle transaction server-side
   - For hardcover: transaction includes catalog product + non-catalog shipping line item
   - For digital: transaction includes only catalog product
5. Paddle checkout overlay opens with `transactionId` (shows product + shipping as separate lines)
6. User completes payment (Paddle handles tax calculation)
7. On success → `/api/storybook/generate` creates job in story service
8. Redirect to order confirmation page (with transaction ID)
9. Paddle webhook (`transaction.completed`) triggers order confirmation email
10. Story service generates book (async)
11. Book-ready email sent with download link or shipping info

## Troubleshooting

### Paddle checkout validation error

If Paddle returns `validation.no_validation_set` for `customer.address.line1`, it means prefilled
address data is being validated without a configured validation set. The checkout flow should
only prefill the customer email and allow Paddle to collect address details in the overlay.

### Shipping charges in Paddle

Shipping costs from Lulu are now billed through Paddle using server-side transactions. The 
`/api/checkout` route creates a Paddle transaction via `POST /transactions` with:
- Catalog item: the product price (e.g., `pri_01kgbfsgjxhsgab6kp453mqh0n` for hardcover)
- Non-catalog item: shipping with dynamic price from Lulu

The frontend receives the `transactionId` and passes it to `Paddle.Checkout.open()` instead of 
passing `items` directly. This displays shipping as a separate billable line in Paddle checkout.

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

### Paddle Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Checkout 403 Forbidden | Domain not approved | Add domain in Paddle Dashboard → Checkout Settings |
| Checkout 400 `transaction_default_checkout_url_not_set` | Missing default URL | Set in Paddle Dashboard → Checkout Settings → Default Payment Link |
| `$PADDLE_CLIENT_TOKEN` literal in headers | Build arg not passed | Check `cloudbuild.yaml` secretEnv and build-arg format |
| Webhook signature invalid | Wrong secret | Verify `PADDLE_WEBHOOK_SECRET` matches Paddle notification setting |
| Webhook 401 after secret update | Trailing newline in secret | See "GCP Secrets Best Practices" below |
| Order email not sent | Webhook lacks customer email | Handler fetches email via Paddle API using `customer_id` |
| Invoice PDF 404 | Wrong API URL | Use `sandbox-api.paddle.com` for sandbox, `api.paddle.com` for production |

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
