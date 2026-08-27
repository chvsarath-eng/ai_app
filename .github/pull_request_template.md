## Summary

<!-- What changed and why? -->

## Scope

- [ ] `web/` (storefront / checkout)
- [ ] `api/` (Story Service)
- [ ] Infra / CI / docs only

## Test evidence

<!-- Commands run and results -->

- [ ] `npm run lint` (web)
- [ ] `npm run typecheck` (web)
- [ ] `npm run build` (web)
- [ ] `python -m compileall` + import smoke (api)
- [ ] Manual UI test (if applicable)

## Deploy / rollback impact

<!-- Which Cloud Run service deploys on merge? Any rollback notes? -->

## Security checklist

- [ ] No `.env`, API keys, or service account JSON in this PR
- [ ] Updated `*.env.example` / `docs/SECRETS.md` if env vars changed
