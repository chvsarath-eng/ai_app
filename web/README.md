# img2x Web App

Next.js (App Router) frontend for img2x — a personalized storybook generator that calls a Cloud Run story service and emails results to users.

## Tech Stack

- Next.js 16 (App Router) + React 19
- Tailwind CSS v4
- React Hook Form + Zod
- React Query
- Three.js / @react-three/fiber for 3D previews
- Nodemailer for contact form delivery

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
- `src/app/order/[orderId]/page.tsx` — Order confirmation
- `src/app/api/storybook/*` — Server routes that call the story service
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
- SMTP credentials for contact form:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`

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

1. User submits photo + details
2. `/api/storybook/generate` requests a job from the Cloud Run story service (with ID token)
3. Job ID returned → order confirmation page
4. Results are emailed to the user

## Troubleshooting

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

### Slow Builds

If `gcloud builds submit` is slow (uploading 300+ MiB), ensure `.gcloudignore` exists and excludes `node_modules/`.
