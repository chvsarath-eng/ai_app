# CI/CD Architecture (GitHub Actions → Cloud Run)

> **Updated:** Aug 2026 — monorepo `chvsarath-eng/ai_app`  
> **Authoritative docs:** [`docs/DEPLOYMENT_SETUP.md`](../docs/DEPLOYMENT_SETUP.md), [`docs/SECRETS.md`](../docs/SECRETS.md)

## High-level flow

```text
Developer / AI agent ──PR──> GitHub (chvsarath-eng/ai_app)
                           |
                           v
                   GitHub Actions: CI
                   (lint, build, gitleaks, API smoke)
                           |
                     merge to main
                           |
              +------------+------------+
              v                         v
      Deploy Web (if web/**)    Deploy API (if api/**)
              |                         |
              v                         v
   img2x-web (us-central1)     story-api (us-central1)
              |                         |
              v                         v
         https://img2x.com        IAM-protected /health, /generate-ebook-async
```

## Components

- **Source control:** GitHub `chvsarath-eng/ai_app` (`web/` + `api/`)
- **CI:** `.github/workflows/ci.yml` — path-aware checks, no deploys from PRs
- **Deploy:** `.github/workflows/deploy-web.yml`, `deploy-api.yml`
  - GitHub OIDC → GCP Workload Identity Federation (no JSON keys in GitHub)
  - Build Docker images → Artifact Registry `img2x-repo`
  - Deploy via `scripts/deploy-cloud-run.sh` + `deploy/config/*.json`
- **Runtime secrets:** GCP Secret Manager (see `docs/SECRETS.md`)

## Legacy (deprecated)

- Cloud Build trigger `ai-api-main` on old `ai_api` repo
- `web/cloudbuild.yaml` / `api/cloudbuild.yaml` — manual emergency only
- Container Registry `gcr.io/imgstr/story-api` — migrate to Artifact Registry

## Operational notes

See [`api/README.md`](./README.md) for endpoints, Cloud Run tuning, and GCS job persistence.
