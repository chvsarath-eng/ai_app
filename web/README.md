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

### Terraform

```
cd web/infra
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
```

Terraform creates:
- Artifact Registry repo
- Secret Manager secrets
- Cloud Run service
- IAM roles

### Build & Push Image

```
cd web
gcloud builds submit --tag us-central1-docker.pkg.dev/<PROJECT_ID>/img2x-repo/img2x-web:latest --project <PROJECT_ID>
```

### CI/CD

`web/cloudbuild.yaml` defines the build + deploy pipeline.
If using the GitHub App integration, create the trigger in Cloud Build UI and point it to `web/cloudbuild.yaml`.

## API Flow (High Level)

1. User submits photo + details
2. `/api/storybook/generate` requests a job from the Cloud Run story service (with ID token)
3. Job ID returned → order confirmation page
4. Results are emailed to the user

## Troubleshooting

- Cloud Build failures usually come from TypeScript errors — run `npm run build` locally.
- If API calls fail, verify Cloud Run URL and service account credentials.
- If contact form fails, verify SMTP values.
