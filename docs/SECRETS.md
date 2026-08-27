# Secrets management

**Rule:** Application secrets never go in git. GitHub repository Variables hold only non-secret GCP identifiers. Runtime secrets live in **GCP Secret Manager** and are injected into Cloud Run at deploy time.

## Where secrets live

| Location | Use for | Never use for |
|----------|---------|---------------|
| Local `.env` | Developer machines only | Production deploys |
| GCP Secret Manager | Cloud Run runtime | Committed files |
| GitHub Actions Variables | `GCP_PROJECT_ID`, WIF provider, SA email | API keys, Stripe keys |
| GitHub Secrets | *Not used* in OIDC design | — |

## Web (`img2x-web`) — Secret Manager mapping

| Cloud Run env var | Secret Manager ID | Notes |
|-------------------|-------------------|-------|
| `SMTP_HOST` | `smtp-host` | |
| `SMTP_PORT` | `smtp-port` | |
| `SMTP_USER` | `smtp-user` | |
| `SMTP_PASS` | `smtp-pass` | |
| `STORY_SERVICE_URL` | `story-service-url` | Story API URL |
| `STORY_INVOKER_CREDENTIALS_JSON` | `story-invoker-credentials` | Full SA JSON |
| `STRIPE_SECRET_KEY` | `stripe-secret-key` | `sk_test_` / `sk_live_` |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook-secret` | `whsec_` — no trailing newline |

Non-secret env vars (set in `deploy/config/web.json`): `STRIPE_AMOUNT_*`, `STRIPE_AUTOMATIC_TAX`, optional `STRIPE_PRICE_*_ID`.

Local template: `web/.env.example`

## API (`story-api`) — Secret Manager mapping

| Cloud Run env var | Secret Manager ID | Notes |
|-------------------|-------------------|-------|
| `GOOGLE_API_KEY` | `gemini-api-key` | Gemini fallback |
| `API_KEY_LAOZHANG` | `API_KEY_LAOZHANG` | LaoZhang API key (production image provider) |
| `SMTP_HOST` | `smtp-host` | Shared with web |
| `SMTP_PORT` | `smtp-port` | |
| `SMTP_USER` | `smtp-user` | |
| `SMTP_PASSWORD` | `smtp-pass` | Note: API uses `SMTP_PASSWORD`, web uses `SMTP_PASS` |

Non-secret env vars: `JOBS_BUCKET`, `IMAGE_PROVIDER`, tuning vars.

Local template: `api/.env.example`

## Creating or rotating a secret

```bash
# Create (first time)
printf '%s' 'NEW_VALUE' | gcloud secrets create SECRET_ID --data-file=-

# Rotate (add new version)
printf '%s' 'NEW_VALUE' | gcloud secrets versions add SECRET_ID --data-file=-
```

Then redeploy the affected service (merge to `main` or run deploy workflow manually).

**Stripe webhook:** after rotating `stripe-webhook-secret`, update the endpoint signing secret in Stripe Dashboard to match.

## Files that must never be committed

- `invoker.json`, `*service-account*.json`, `credentials.json`
- `.env`, `terraform.tfvars`
- Jupyter notebooks with embedded API keys (sanitize before commit)
- Playwright screenshots / `test-results/`

CI runs **gitleaks** on every PR (`.gitleaks.toml`).

## Local development

```bash
# Web
cd web && cp .env.example .env

# API
cd api && cp .env.example .env

# Stripe webhooks locally
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## If a secret leaks

1. **Revoke immediately** in the provider (Stripe, Google, LaoZhang, SMTP).
2. Rotate in Secret Manager (`gcloud secrets versions add ...`).
3. Redeploy Cloud Run services.
4. If committed to git: remove from history or rotate regardless; GitHub push protection may block pushes containing keys.
5. Document incident and confirm gitleaks/CI caught or missed it.

## Production debug endpoints

`/api/env-check` is **disabled in production** (`NODE_ENV=production`). Use Cloud Run logs and local `.env` validation instead.
