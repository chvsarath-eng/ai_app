# Quick Book: print-first delivery

## Objective and invariants
Measure seconds from accepted generation request to a working A3 download link; target 300 seconds, not a guarantee of provider latency. Record HTML readiness separately. Preserve the original decorated renderer, vector text, 24 A4 logical pages / 12 A3 sides / six sheets, native 2400x3392 high-quality images, frontal identity constraints, and LaoZhang VIP only. No deployment in this task.

## Implementation sequence
1. Reuse the original renderer to compose logical pages in memory. Impose them into A3 without saving/reopening a large A4 intermediate. Do not rewrite the layout or rasterize text. Keep HTML rendering separate, reconstructing reader order from A3 if needed.
2. Publish A3 immediately through a print-ready progress event. Persist its signed URL and artifact state while the main job remains running. Show a download action in the generation workspace; keep polling for HTML.
3. Build/upload HTML afterward. An HTML failure must retain the published PDF and successful print outcome. Preserve retryability using saved A3 and job state, without regenerating images or requesting payment.
4. Overlap image checkpoint/preview work with rendering using a bounded job-scoped executor. Keep one durable full-resolution checkpoint and publish small preview thumbnails. Synchronize state updates; join outstanding work before worker exit. Never abandon required recovery uploads.
5. Record UTC timestamps and monotonic durations for rendering, individual uploads, print availability, and HTML delivery. Avoid copying signed URLs or customer data into diagnostic reports.
6. Optimize losslessly only. No JPEG conversion of print artwork or resolution reduction without a separate reviewed quality comparison. Retain checks for complete pages, dimensions, booklet order and missing files.

## Validation and rollout gates
- Regression: A3 dimensions/page count/order; exact text and rendered appearance against original output; high-resolution artwork preserved; no intermediate A4 file.
- Lifecycle: A3 link exposed before HTML; HTML failure preserves print; upload failure cannot claim print readiness; fresh and resumed jobs retain correct status.
- UI: desktop and mobile visible print action while HTML is pending; existing authorization and payment rules preserved.
- Offline real-assets benchmark first, then a fresh local UI/API end-to-end run using GPT-6 Luna and real LaoZhang images. Record observed timings, not predicted savings. Validate the downloadable PDF and inspect A3 renderings.
- Restart local services only when no generation is active. No production deployment.

## Architectural limits
The existing service uses an in-process background worker and GCS checkpoints. This change does not pretend a second daemon thread is a durable task queue. HTML stays within the managed job lifecycle; a future independent worker should use a durable queue plus artifact-specific leases/retries. Disk-free composition trades disk I/O for memory; benchmark peak memory before cloud rollout.


## Implemented and measured (2026-09-24 local)
- Logical A4 pages now remain in memory; only the final imposed A3 PDF is written. Existing decorated page methods are reused. This is not a new layout engine.
- A3 uploads and its signed URL become visible before HTML generation. The frontend keeps polling and displays a print download action. HTML failure, including worker interruption, preserves the published PDF; retry uses the existing A3 when available.
- One bounded preview worker uploads durable original checkpoints plus small JPEG previews. It is joined before job exit. These tasks no longer block collection of generated images. Large print images are not JPEG-transcoded.
- Lossless PNG row prediction and existing PNG compressed streams reduce embedded RGB image storage. Every altered stream is decoded and compared pixel-for-pixel. No resolution reduction. Reuse of unchanged resources is retained by PyMuPDF.
- Stage timestamps and per-artifact upload sizes/durations are persisted. Low story reasoning is an explicit local `QUICK_BOOK_STORY_REASONING=low` trial; other book formats retain their setting.

### Real provider tests
Both use fresh stories, one identity sheet, cover plus ten native A4 images, GPT-6 Luna, and LaoZhang VIP only. No new payment. These are different generated outputs, so timing differences are observational, not a controlled provider-speed claim.

| Measurement | First fresh run (high reasoning) | Final fresh run (low reasoning + lossless PDF) |
|---|---:|---:|
| Story stage | 179.98 s | 82.41 s |
| Images stage | 158.57 s | 161.43 s |
| Print upload/publish interval | 78.46 s | 44.54 s |
| A3 published from worker start | 461.43 s | 325.89 s |
| A3 cloud download verified from submission | not separately measured | 339.87 s, job still running |
| HTML/final completion observed from submission | not separately measured | 361.34 s |
| A3 size | 223,668,987 bytes | 148,212,216 bytes |

Final job: `8a4f4f7c1f904b49a5a5974899c064bd`. Report: `tmp/quick-e2e/optimized-benchmark.json`. Repeat with `api/scripts/benchmark_quick_delivery.py --photo <authorized photo> --report <report.json>` (billable real provider run).

The five-minute target is NOT met. Remaining contributors include request admission, story drafting, serial identity-sheet dependency, provider latency, PDF composition, and local network upload. Do not advertise a five-minute guarantee. Low-reasoning prose passes structural/layout checks but still needs editorial acceptance; pixel identity guarantees apply to PDF compression, not comparative story quality.

### Validation scope and remaining rollout work
- Original real-artwork A3: all 12 sides retain dimensions, text and matching 36-DPI rendered pixels before compression; separate lossless comparison passes 72-DPI output and full decoded image samples.
- Final fresh book: 12 A3 sides, high-resolution artwork, A3 cover/interior visual inspection, cloud PDF header/range request while running, HTML completed afterward.
- Desktop 1440x900 and mobile 390x844 / 360x640 print button fits without scrolling. Browser tests use a development layout fixture; real Google login/payment checkout was not repeated. The live generation/download benchmark uses the actual backend API.
- Python renderer/delivery/compression regressions and source-only TypeScript check. The repository's ordinary TypeScript check includes pre-existing malformed `.next/dev/types` generated files; no generated-cache deletion was used to hide that condition.
- No deployment. Cloud memory/CPU/network benchmark and a durable worker queue remain rollout work. Compression and keeping logical pages in memory do not remove that requirement.


## Frontal anatomy prompt correction
User confirmed camera-facing faces and both visible eyes are mandatory. Scene/system prompts now stage torso, camera height and action together, preserving natural neck alignment and shoulder slope. Character sheets include the neck base and upper chest. No side views, identity relaxation, image downsampling, or model change. One LaoZhang high-quality 2400x3392 scene with the existing face and sheet references returned in 61.84 s: `tmp/quick-e2e/neck-staging-proof.png`. Neck connection appears improved, but expression remains somewhat posed; this single sample is not a whole-book quality guarantee. Existing delivered books were not overwritten.

## September 25 release acceptance
Fresh real-provider job `ba813cecda6f4f63bd781294150f6af1`: GPT-6 Luna low reasoning, LaoZhang VIP only, native 2400x3392 high artwork. Story 67.03s; image phase 139.13s (identity sheet precedes parallel cover/scenes); A3 publishing 47.53s. A3 download verified at 302.63s from submission while HTML was still running; final HTML at 321.42s. PDF 143,332,886 bytes, 12 A3 sides; all extracted text within page bounds, full-resolution images retained. All sides visually reviewed; neck connection is improved, while frontal expressions still look posed in some scenes. Meet-the-Star sheet remains 1024 square and softer than scene artwork.

Web production build and ordinary typecheck passed after moving a stale generated `.next/dev` cache aside. Lint has zero errors (75 existing warnings). Create-to-checkout and hardcover selection passed on desktop/mobile (4 browser tests); progress/download viewport tests passed at three sizes; the fresh real reader passed 24-page, navigation and responsive tests. Regression coverage includes print-first publication/failure handling, lossless image samples, V2 pipeline, import safety and provider routing. Fresh test exercises generation and cloud downloads, not a new payment charge or physical printer. Production config now explicitly sets Luna and Quick Book low reasoning. Fixed missing cloud-platform OAuth scope for signing credentials. Deploy via PR/CI only.
