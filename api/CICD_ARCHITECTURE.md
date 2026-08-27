# CI/CD Architecture (GitHub → Cloud Build → Cloud Run)

This document describes how the `ai_api` project is built and deployed on GCP.

## High-level flow

```text
Developer (local) ──push──> GitHub (chvsarath-eng/ai_api)
                           |
                           v
                   Cloud Build Trigger (ai-api-main)
                           |
                           v
                 Cloud Build (runs cloudbuild.yaml)
                           |
                           v
        Container Image (Container Registry): gcr.io/imgstr/story-api:<COMMIT_SHA>
                           |
                           v
                  Cloud Run Service: story-api (us-central1)
                           |
                           v
                Public URL (IAM protected): /health, /generate-story, /generate-ebook-async
```

## Components

- **Source control**: GitHub repo `chvsarath-eng/ai_api`
- **Build**: Cloud Build Trigger `ai-api-main`
  - Uses `cloudbuild.yaml`
  - Builds Docker image from the repo `Dockerfile`
  - Pushes the image to **Container Registry**: `gcr.io/$PROJECT_ID/story-api:$COMMIT_SHA`
  - Sets `options.logging: CLOUD_LOGGING_ONLY` (helps satisfy org policies when a build service account is specified)
- **Runtime**: Cloud Run service `story-api`
  - Starts `uvicorn story_fastapi:app` on `0.0.0.0:$PORT`
  - Uses **Secret Manager** for `GOOGLE_API_KEY` (Gemini Developer API)
  - Uses **IAM authentication** (Require authentication)
  - Persists job state + outputs to **Cloud Storage** (GCS) using `JOBS_BUCKET`

## Secret + IAM model

### Runtime secret injection (Cloud Run)

- Secret: `gemini-api-key` (Secret Manager)
- Injected into Cloud Run as env var: `GOOGLE_API_KEY`
- The **Cloud Run runtime service account** must have:
  - `roles/secretmanager.secretAccessor` on the secret (or project)

### Runtime storage (GCS)

Cloud Run filesystem is ephemeral. This service persists long-running job state + outputs to GCS to make polling reliable across instances/revisions.

- Bucket: `imgstr-story-jobs-us-central1` (example)
- Env var on Cloud Run: `JOBS_BUCKET=imgstr-story-jobs-us-central1`
- Objects written per job:
  - `jobs/<job_id>/status.json`
  - `jobs/<job_id>/storybook.html` (single-file ebook)
  - `jobs/<job_id>/last_story_raw.txt` (only when story JSON parsing fails; debugging)

The **Cloud Run runtime service account** must have bucket permissions:
- Recommended simplest role: `roles/storage.objectAdmin` on the bucket

### Invoking the service (IAM protected)

When Cloud Run is configured with **Require authentication**, callers need:

- IAM role: `roles/run.invoker` on the Cloud Run service
- An **OIDC ID token** with audience = the Cloud Run service URL

Common testing approaches:

- **Service account caller** (recommended): mint an ID token using a service account key (or workload identity).
- **Other services on GCP**: use their service account + `roles/run.invoker`.

## Build vs deploy responsibilities

Current setup:

- **Cloud Build Trigger** = builds + pushes image
- **Cloud Run deploy** = performed manually in the Cloud Run UI by selecting the new image tag

Optional improvement (future):

- Add a deploy step to `cloudbuild.yaml` (Cloud Build would both build and deploy), using a deployer service account with:
  - `roles/run.admin`
  - `roles/iam.serviceAccountUser`

## Operational notes

### Endpoints (production)

- `GET /health`: health check
- `POST /generate-ebook-async` (multipart form-data): starts the full pipeline (story JSON → images → HTML)
  - Returns: `{ job_id, status_url, html_url }`
- `GET /jobs/{job_id}`: poll status (works across instances due to GCS persistence)
- `GET /jobs/{job_id}/storybook.html`: download the final HTML (served from GCS if needed)

### Cloud Run settings (recommended baseline)

These settings keep cost under control while avoiding rate-limit spikes and keeping performance predictable:

- **CPU**: 2
- **Memory**: 1 GiB
- **Concurrency**: 1
- **Max instances**: 2 (start conservative; increase later based on Gemini RPM limits)
- **CPU allocation**:
  - Prefer **Instance-based** for background threads (jobs run after request returns)
  - If using Request-based, expect slower/flakier background execution

### Why GCS is required for scalability

Job state is tracked in-memory during execution. Cloud Run can:
- route `/jobs/{job_id}` polling requests to different instances
- restart instances during deployment rollouts

Persisting to GCS ensures polling + downloads continue to work across instances/revisions.

