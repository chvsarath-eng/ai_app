# Quick Book

Quick Book (`QUICK_BOOK`) replaces the digital choice for new purchases. Existing
`DIGI_BOOK` orders and `LULU_BOOK` hardcover orders retain their own pipelines.
Quick Book uses the existing V2 story and identity pipeline, with the existing decorated renderer adapted to A4. It uses the existing digital price configuration.

## Book and printer contract

- 24 A4 portrait pages: front cover; ten illustration-left/story-right spreads;
  original Meet the Star page; a personalized ending without a QR code; a blurred
  cover-derived back cover with img2x branding and the existing QR code.
- Story length is guided by the prompt and validated for layout fit, without a strict word quota. The existing renderer uses 18pt or 17pt body text, with embedded fonts,
  centred paragraphs, cream paper and the original decorative borders. Text overflow fails
  preflight rather than shrinking text indefinitely or silently dropping it.
- Every image uses `gpt-image-2.5-sunburst-vip`, quality `high`. Cover and scene
  artwork must be native 2400×3392 portrait or larger at the A4 ratio. Identity
  references use 1024×1024. Smaller generated artwork is rejected, not upscaled.
- The delivered PDF has 12 A3 landscape sides, already imposed for six sheets.
  First sheet: front 24/1, reverse 2/23. Last sheet: front 14/11, reverse 12/13.
- Print A3 landscape, actual size (100%), duplex short-edge flip. Disable the
  printer's booklet and multiple-pages settings. Test orientation and output
  stacking on the actual printer, nest sheets, fold, and staple along the fold.
  A4 pages occupy each half of the A3 sheet at full size, without added white
  insets or a centre strip. Non-borderless office printers may leave narrow outer
  edges; use actual size, not fit-to-printable-area. Physical edge-to-edge output
  requires a capable printer or larger paper and trimming.
- The existing 3D HTML flipbook derives its page images from the same A4 PDF,
  preserving page turns, shadows, ambient backgrounds and fullscreen. Its sizing
  now respects the PDF aspect ratio; mobile retains the original landscape hint.

## Implementation

- `api/storygen_v2.py`: longer story and portrait composition instructions.
- `api/story_api.py`: preflight, image profile, cache and renderer selection.
- `api/lulu_digi_book_maker.py`: existing decorated renderer, now with per-book A4 dimensions.
- `api/build_cssflip_flipbook.py`: existing flipbook, with PDF aspect ratio sizing.
- `api/quick_book.py`: preflight and vector-preserving A3 imposition only.
- `api/quick_book_jobs.py`: private GCS checkpoints and execution leases.
- `api/story_fastapi.py`: artifact delivery and authenticated resume endpoint.
- `web/src/lib/start-generation.ts`: product routing and project start lease.

## Recovery and capacity

With `JOBS_BUCKET` configured and GCS enabled, input photos, request data, approved
story and completed images are checkpointed privately. A failed Quick Book can
resume through the existing project start flow using `/jobs/{id}/resume`.
Completed images are reused only when prompt, references and image profile match.
An explicit admin force regeneration starts a new job instead.

Cloud job leases expire after 20 minutes; a crashed worker may require that wait
before resuming. This is explicit recovery, not a durable automatic task queue.
If a project remains marked generating after a crash, an operator must reconcile
its status before the normal project retry flow can resume it. Local job folders
are retained for recovery; operators must manage retention. Private checkpoint
objects also need the deployment's retention policy. Without GCS, recovery is
limited to files surviving on the same worker.

Each worker process shares 16 Quick Book image slots. Image work has a five-minute
attempt budget with bounded retries; story writing, downloads, artifact upload
and physical printing also take time. Ten minutes is a target, not a guaranteed
completion time. Validate provider size support, actual generated resolution,
concurrency and printer throughput in a paid end-to-end trial before launch.

## Verification

From `api`: `python -m unittest test_quick_book test_quick_book_pipeline -v`.
Tests cover page geometry and ordering, text bounds, image resolution rejection,
the forced model profile, story repair, image reuse and missing-image recovery.
They use synthetic artwork and mocked model calls, with no API charges.

From the repository root:
`node web/tests/quick-book-reader.mjs <absolute-path-to-quick-book.html>` checks
desktop/mobile page turns, A4 proportions, final-page access and horizontal overflow in Chromium.
The web production build and lint checks apply as usual. A physical duplex proof
and a live provider/payment/checkpoint trial remain release acceptance checks.

## Design restoration

Quick Book calls the original renderer and flipbook code; the separate plain
ReportLab layout and basic HTML reader were removed. The cover prompt retains
the original integrated title treatment. Existing digital/hardcover dimensions
remain their defaults, with instance-specific A4 dimensions for Quick Book.

## Autonomous back matter

The V2 story prompt requests a story-specific back-cover hook and blurb. The
normal pipeline repairs missing or oversized copy once through the story model,
validates it before image work, and persists it for retries. The shared renderer
automatically builds the personal ending (no promotion or QR), blurred back cover
and single branded QR. No production dependency on the manual preview scripts.
Provider failures can still require job resume; this is not a durable automatic
retry queue. Current preview main illustrations are about 290 PPI at A4; the
1024-square Meet the Star reference sheet is about 173 PPI at its printed size.

Preview preference: Always present typography and layout previews on A3 sheets. Label reading-spread previews separately from imposed duplex print files. Current typography under review: Georgia 16pt, 24pt leading, vertically balanced within the existing border.
