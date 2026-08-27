# img2x monorepo

Single GitHub repository for the img2x product.

| Path | App | Stack | Deploy |
|------|-----|-------|--------|
| `web/` | Storefront, checkout, Stripe | Next.js 16 | Cloud Run `img2x-web` via GitHub Actions |
| `api/` | Story / ebook generation | FastAPI / Python | Cloud Run `story-api` via GitHub Actions |

## Clone on any laptop

```bash
git clone https://github.com/chvsarath-eng/ai_app.git
cd ai_app
```

Private repo — use a machine logged into GitHub (HTTPS or SSH). Put secrets only in local `.env` files (see `web/.env.example` and `AGENT_HANDOFF.md`).

## Quick start

```bash
# Web
cd web && npm install && cp .env.example .env && npm run dev

# API (separate venv)
cd api && python -m venv .venv && .venv/Scripts/activate  # Windows
pip install -r requirements.txt
uvicorn story_fastapi:app --reload --port 8000
```

## Docs

- **`AGENT_HANDOFF.md`** — current status, Stripe go-live checklist, compliance notes (start here)
- **`CONTRIBUTING.md`** — PR workflow, local validation, CI/CD overview
- **`docs/DEPLOYMENT_SETUP.md`** — one-time GCP OIDC bootstrap + production rollout
- **`docs/PRODUCTION_ROLLOUT_CHECKLIST.md`** — go-live verification checklist
- **`docs/SECRETS.md`** — Secret Manager mapping and rotation
- **`AGENTS.md`** — product architecture for coding agents
- **`web/README.md`** — web env details
- **`api/README.md`** — Story Service API

## GitHub

- Primary remote: `https://github.com/chvsarath-eng/ai_app.git`
- Legacy Story API-only remote: `https://github.com/chvsarath-eng/ai_api.git` (archive after merge)

## Related

GCP project `imgstr` · Live site https://img2x.com
