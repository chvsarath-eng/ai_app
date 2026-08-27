# Deployment setup (GitHub Actions → Cloud Run)

One-time bootstrap for the **img2x monorepo** (`chvsarath-eng/ai_app`). After this, deploys run from GitHub Actions on merge to `main` — no long-lived GCP keys in GitHub.

## Architecture

| Component | Value |
|-----------|-------|
| GCP project | `imgstr` |
| Region | `us-central1` |
| Artifact Registry | `img2x-repo` |
| Web service | `img2x-web` → https://img2x.com |
| API service | `story-api` |
| CI workflow | `.github/workflows/ci.yml` |
| Deploy workflows | `deploy-web.yml`, `deploy-api.yml` |

## 1. Enable APIs

```bash
gcloud config set project imgstr

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com
```

## 2. Bootstrap GitHub OIDC (Workload Identity Federation)

```bash
cd infra/github-actions
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars if needed

terraform init
terraform apply
```

Copy outputs into **GitHub → Settings → Secrets and variables → Actions → Variables**:

| Variable | Source |
|----------|--------|
| `GCP_PROJECT_ID` | `imgstr` |
| `GCP_REGION` | `us-central1` |
| `GCP_ARTIFACT_REPOSITORY` | `img2x-repo` |
| `GCP_DEPLOYER_SERVICE_ACCOUNT` | terraform output `deployer_service_account_email` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | terraform output `workload_identity_provider` |

**Do not** store Stripe, SMTP, or API keys as GitHub Secrets under this design.

## 3. GitHub Environment protection

1. Create environment **`production`** (Settings → Environments).
2. Enable **Required reviewers** for first rollouts (recommended).
3. Restrict deployment branches to **`main`**.
4. After stable testing, you may disable manual approval for automatic deploys.

## 4. Artifact Registry (if not already created)

```bash
gcloud artifacts repositories create img2x-repo \
  --repository-format=docker \
  --location=us-central1 \
  --description="img2x monorepo images"
```

## 5. Secret Manager — runtime secrets

Write secrets **without echoing values** (use `-n` to avoid trailing newlines):

```bash
# Web + API shared SMTP
printf '%s' 'smtp.hostinger.com' | gcloud secrets create smtp-host --data-file=- 2>/dev/null \
  || printf '%s' 'smtp.hostinger.com' | gcloud secrets versions add smtp-host --data-file=-
printf '%s' '587' | gcloud secrets create smtp-port --data-file=- 2>/dev/null \
  || printf '%s' '587' | gcloud secrets versions add smtp-port --data-file=-
# Repeat for smtp-user, smtp-pass

# Story service URL + invoker JSON (web → api auth)
printf '%s' 'https://story-api-XXXX.us-central1.run.app' | gcloud secrets create story-service-url --data-file=- 2>/dev/null \
  || printf '%s' 'https://story-api-XXXX.us-central1.run.app' | gcloud secrets versions add story-service-url --data-file=-
gcloud secrets create story-invoker-credentials --data-file=/path/to/invoker.json 2>/dev/null \
  || gcloud secrets versions add story-invoker-credentials --data-file=/path/to/invoker.json

# Stripe (web)
printf '%s' 'sk_live_...' | gcloud secrets create stripe-secret-key --data-file=- 2>/dev/null \
  || printf '%s' 'sk_live_...' | gcloud secrets versions add stripe-secret-key --data-file=-
printf '%s' 'whsec_...' | gcloud secrets create stripe-webhook-secret --data-file=- 2>/dev/null \
  || printf '%s' 'whsec_...' | gcloud secrets versions add stripe-webhook-secret --data-file=-

# Story API
printf '%s' 'your-gemini-key' | gcloud secrets create gemini-api-key --data-file=- 2>/dev/null \
  || printf '%s' 'your-gemini-key' | gcloud secrets versions add gemini-api-key --data-file=-
printf '%s' 'your-laozhang-key' | gcloud secrets create laozhang-api-key --data-file=- 2>/dev/null \
  || printf '%s' 'your-laozhang-key' | gcloud secrets versions add laozhang-api-key --data-file=-
```

See [`SECRETS.md`](./SECRETS.md) for the full env ↔ secret mapping.

## 6. GCS jobs bucket (Story API)

```bash
gsutil mb -l us-central1 gs://imgstr-story-jobs-us-central1
# Grant the story-api runtime service account roles/storage.objectAdmin on the bucket
```

Update `deploy/config/api.json` if your bucket name differs.

## 7. Stripe webhook

Dashboard → Webhooks → Add endpoint:

- URL: `https://img2x.com/api/webhooks/stripe`
- Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `payment_intent.payment_failed`

## 8. Disable legacy Cloud Build auto-deploy

If a Cloud Build trigger still deploys on push to `main`, disable it:

```bash
gcloud builds triggers list
gcloud builds triggers delete TRIGGER_NAME   # only legacy triggers
```

Terraform: keep `enable_cloudbuild_trigger = false` in `web/infra`.

## 9. First production deploy

1. Open a PR with a trivial change (or merge CI/CD setup).
2. Wait for **CI** to pass on the PR.
3. Merge to `main` → **CI** runs → **Deploy Web** / **Deploy API** trigger after CI success.
4. Approve the `production` environment deployment if required.
5. Verify:
   - Web: https://img2x.com
   - API: `curl -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=SERVICE_URL)" SERVICE_URL/health`

## 10. Rollback

```bash
# List revisions
gcloud run revisions list --service img2x-web --region us-central1

# Route 100% traffic to a previous revision
gcloud run services update-traffic img2x-web \
  --region us-central1 \
  --to-revisions REVISION_NAME=100
```

Repeat for `story-api`.

## Service configuration source of truth

Deploy parameters live in:

- `deploy/config/web.json` — web Cloud Run settings + secret bindings
- `deploy/config/api.json` — API Cloud Run settings + secret bindings
- `scripts/deploy-cloud-run.sh` — shared deploy script used by GitHub Actions

After changing JSON config, merge to `main` to redeploy the affected service.
