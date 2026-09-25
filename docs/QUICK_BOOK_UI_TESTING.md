# Local Quick Book UI testing

Start the isolated web + real API environment from the repository root:

```powershell
python scripts/run-quick-book-local.py
```

Open http://127.0.0.1:3011/create. The API uses port 8011. Keep the launcher running.
For manual testing with Google sign-in, start with
`python scripts/run-quick-book-local.py --firebase-auth` instead. The default local
auth mode is for automated tests and intentionally disables Google sign-in.
It reads the existing API/web environment files, uses local development sign-in and
stores projects under `tmp/quick-e2e/data`, not the production database. Customer
emails are disabled. Cloud photo storage and model calls are real. Razorpay keys
must be test keys.

Fast desktop/mobile checks (no model calls or payments):

```powershell
cd web
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3011'
npx playwright test e2e/quick-book.spec.ts
```

Test your own photo through the UI:

```powershell
$env:QUICK_BOOK_TEST_PHOTO = 'C:\path\to\photo.jpg'
$env:QUICK_BOOK_TEST_NAME = 'Arun'
$env:QUICK_BOOK_TEST_AGE = '38'
node tests/quick-book-ui.mjs --headed
```

This uploads the photo into the form, selects Quick Book, fills the story, clicks
Generate and verifies checkout. Screenshots are saved under `tmp/quick-e2e`.
Set `QUICK_BOOK_TEST_STORY` to use your own brief.

To also generate a real book, append `--generate`. **This spends model credits.**
It deliberately excludes payment: a paid fixture is written only to the isolated
local project store, then the real upload/start/progress/download routes run.
It waits up to 30 minutes, reports a failed agent rather than silently retrying,
and saves the downloaded A3 PDF plus a ready-screen screenshot. Run one live
acceptance test at a time. This mode requires the isolated launcher above and
does not verify payment or email delivery.

The frontend regression checks verify Quick Book and Hardcover selection,
checkout deliverables, and mobile overflow. PDF geometry and print ordering are
covered separately by the API Quick Book tests. A physical duplex test print is
still needed to verify your printer's orientation and printable margins.

Generation workspace checks against the local server:

```powershell
node tests/generation-layout.mjs
```

Uses a development-only sample layout (not a generated customer book), checks
1440×900, 390×844 and 360×640, and saves screenshots under `tmp/quick-e2e`.
Pass `small-mobile`, `mobile` or `desktop` to check just that viewport.
