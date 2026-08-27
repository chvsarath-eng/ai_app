---
# AGENTS.md
Project guidance for AI agents working in this repo.
---

# Purpose and scope
- Optimize for safe, incremental changes that keep the FastAPI Story Service **and** Next.js storefront stable.
- Prefer production readiness: clear logs, error handling, and minimal regressions.
- **Read `AGENT_HANDOFF.md` first** for current Stripe go-live status and monorepo layout (`web/` + `api/`).

# Context gathering
- Web/checkout/Stripe: `web/src/app/api/checkout`, `web/src/lib/stripe.ts`, `web/src/app/checkout/page.tsx`
- Story Service: `api/story_fastapi.py`, `api/story_api.py`, `api/imggen.py` (or legacy standalone `ai_api` repo until merge completes)
- Use targeted searches over broad scans; read only what’s needed to answer the task.

# Planning and execution
- For ambiguous changes, ask 1–2 clarifying questions before editing.
- For multi-step work, outline a short plan in the response before changes.

# Editing and safety
- Avoid destructive git commands (no `reset --hard`, no force pushes).
- Never commit secrets or `.env` files.
- Keep edits minimal and localized; avoid unrelated refactors.

# Testing expectations
- Run fast, relevant tests or sanity checks when changes affect runtime behavior.
- If you can’t run tests, state what to run and why.

# Documentation and communication
- Summaries should be concise and actionable.
- When changes are made, list the touched files and the reason.
