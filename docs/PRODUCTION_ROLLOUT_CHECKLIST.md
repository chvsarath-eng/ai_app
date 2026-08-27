# Production rollout checklist

Use this after merging the CI/CD setup and before announcing Stripe go-live.

## One-time GCP / GitHub bootstrap

- [ ] `infra/github-actions` Terraform applied
- [ ] GitHub Variables set: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_ARTIFACT_REPOSITORY`, `GCP_DEPLOYER_SERVICE_ACCOUNT`, `GCP_WORKLOAD_IDENTITY_PROVIDER`
- [ ] GitHub `production` environment created (approval gate optional)
- [ ] Artifact Registry repo `img2x-repo` exists
- [ ] All secrets in Secret Manager per [`SECRETS.md`](./SECRETS.md)
- [ ] GCS jobs bucket exists and `story-api` SA has `storage.objectAdmin`
- [ ] Legacy Cloud Build triggers on `main` disabled

## First deploy verification

- [ ] Open PR → **CI** workflow passes (secret scan, web build, API smoke)
- [ ] Merge to `main`
- [ ] **Deploy Web** completes (approve `production` if required)
- [ ] **Deploy API** completes (if api changed)
- [ ] `curl -fsS https://img2x.com/` succeeds
- [ ] API health: authenticated `GET /health` returns `{"status":"ok"}`

## Stripe go-live

- [ ] Stripe account activated for live payments
- [ ] `stripe-secret-key` and `stripe-webhook-secret` in Secret Manager (live values)
- [ ] Webhook endpoint `https://img2x.com/api/webhooks/stripe` registered
- [ ] Test checkout with `sk_test_` on staging/review app OR small live test
- [ ] Order confirmation email received
- [ ] Story job created after payment return

## Rollback ready

- [ ] Know previous good revision: `gcloud run revisions list --service img2x-web --region us-central1`
- [ ] Rollback command tested in non-emergency dry run (optional)

## Post-launch

- [ ] Update `AGENT_HANDOFF.md` with deploy date and any GCP resource names that differ from defaults
- [ ] Monitor GitHub Actions + Cloud Run logs for 24h
