# Contributing to img2x

Thank you for helping improve img2x. This monorepo contains the Next.js storefront (`web/`) and FastAPI Story Service (`api/`).

## Before you start

1. Read [`AGENT_HANDOFF.md`](./AGENT_HANDOFF.md) for current status and go-live checklist.
2. Read [`AGENTS.md`](./AGENTS.md) for architecture and coding conventions.
3. Never commit secrets — see [`docs/SECRETS.md`](./docs/SECRETS.md).

## Branch and PR workflow

**Do not push directly to `main`.** All changes go through a pull request.

```bash
git checkout main
git pull origin main
git checkout -b feature/short-description

# make changes, then validate locally (see below)
git add <files>
git commit -m "Clear description of why"
git push -u origin feature/short-description
```

Open a PR on GitHub. CI must pass before merge. Merging to `main` triggers production deploy for changed services (with `production` environment approval if enabled).

## Local validation

### Web (`web/`)

```bash
cd web
npm ci
npm run lint
npm run typecheck
npm run build
```

### API (`api/`)

```bash
cd api
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m compileall -q .
python -c "import story_fastapi; import story_api"
```

### Secret scan (optional)

```bash
# If gitleaks is installed locally
gitleaks detect --config .gitleaks.toml
```

## When to update docs / env templates

| Change | Update |
|--------|--------|
| New env var for web | `web/.env.example`, `docs/SECRETS.md`, `deploy/config/web.json` |
| New env var for API | `api/.env.example`, `docs/SECRETS.md`, `deploy/config/api.json` |
| Deploy / infra change | `docs/DEPLOYMENT_SETUP.md`, `AGENT_HANDOFF.md` |
| User-facing behavior | Relevant README / AGENTS section |

## CI/CD overview

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `CI` | PR + push to `main` | Lint, typecheck, build, API smoke, gitleaks |
| `Deploy Web` | After CI succeeds on `main` (web paths changed) | Build + deploy `img2x-web` |
| `Deploy API` | After CI succeeds on `main` (api paths changed) | Build + deploy `story-api` |

Deploy uses GitHub OIDC → GCP (no JSON keys in GitHub). See [`docs/DEPLOYMENT_SETUP.md`](./docs/DEPLOYMENT_SETUP.md).

## Rollback

If a deploy causes issues, see rollback commands in [`docs/DEPLOYMENT_SETUP.md`](./docs/DEPLOYMENT_SETUP.md#10-rollback).

## AI agents

Agents must:

- Start from `AGENT_HANDOFF.md`
- Keep changes scoped to the task
- Run affected validation commands before opening a PR
- Confirm no secrets in the diff
- Not deploy manually unless explicitly asked — CI/CD handles production
