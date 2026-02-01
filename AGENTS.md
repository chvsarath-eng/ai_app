# img2x - AI Agent Onboarding Guide

This document provides everything an AI agent needs to understand and work on the img2x project.

## What is img2x?

**img2x** is a personalized storybook generator that creates photorealistic 4K illustrated children's books using AI face-lock technology.

**Value Proposition:**
- Upload a child's photo → Get a personalized storybook where they're the hero
- 4K photorealistic illustrations (not cartoon-style)
- Face-lock technology keeps the child's face consistent across all pages
- Digital flipbook ($14.99) or Hardcover via Lulu ($39.99)
- Worldwide shipping through Lulu print-on-demand

**Target Users:**
- Parents/grandparents buying gifts for children (ages 0-10)
- Gift occasions: birthdays, Christmas, new baby, first day of school

**Live Site:** https://img2x.com

---

## Domain & Hosting

| Domain | Maps To | Region |
|--------|---------|--------|
| `img2x.com` | img2x-web (Cloud Run) | us-central1 |
| `www.img2x.com` | img2x-web (Cloud Run) | us-central1 |

**DNS:** Managed in GCP Cloud Run domain mappings

**SSL:** Automatic via Google-managed certificates

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                            │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    img2x-web (Next.js)                          │
│                    Cloud Run - us-central1                      │
│                                                                 │
│  • App Router (pages, API routes)                               │
│  • Photo upload + validation                                    │
│  • Order management                                             │
│  • 3D book preview (Three.js)                                   │
└─────────────────────────────────┬───────────────────────────────┘
                                  │ ID Token Auth
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Story Service (Python)                       │
│                    Cloud Run - us-central1                      │
│                                                                 │
│  • AI image generation (face-lock)                              │
│  • Story composition                                            │
│  • PDF/flipbook generation                                      │
│  • Email delivery                                               │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Lulu Direct API                              │
│                    (Print-on-Demand)                            │
│                                                                 │
│  • Hardcover printing                                           │
│  • Worldwide shipping                                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Repository Structure

```
ai_app/
├── AGENTS.md              # This file - AI agent onboarding
├── .cursor/
│   └── rules/             # Cursor AI project rules
│       ├── coding-standards.mdc
│       ├── deployment.mdc
│       ├── documentation-sync.mdc
│       └── project-architecture.mdc
│
└── web/                   # Next.js web application
    ├── src/
    │   ├── app/           # App Router pages + API routes
    │   │   ├── page.tsx           # Homepage
    │   │   ├── layout.tsx         # Root layout (SEO metadata)
    │   │   ├── api/
    │   │   │   ├── storybook/generate/    # Create storybook job
    │   │   │   ├── storybook/jobs/[id]/   # Job status
    │   │   │   └── contact/               # Contact form (SMTP)
    │   │   ├── order/[orderId]/   # Order confirmation
    │   │   ├── gallery/           # Example storybooks
    │   │   ├── pricing/           # Pricing page
    │   │   ├── privacy/           # Privacy policy
    │   │   └── terms/             # Terms of service
    │   │
    │   ├── components/    # UI components
    │   │   ├── ui/                # Shadcn UI base components
    │   │   ├── generator-card/    # Photo upload + generation flow
    │   │   ├── photo-guidelines-dialog.tsx  # Photo tips carousel
    │   │   ├── cookie-consent.tsx # GDPR cookie consent banner
    │   │   ├── r3f-book-preview/  # 3D book viewer (Three.js)
    │   │   └── ...
    │   │
    │   ├── lib/           # Utilities
    │   │   ├── storyApiServer.ts  # Story service client
    │   │   ├── storybookApi.ts    # API helpers
    │   │   └── utils.ts           # General utilities
    │   │
    │   └── types/         # TypeScript types
    │
    ├── public/            # Static assets
    ├── infra/             # Terraform (GCP infrastructure)
    ├── Dockerfile         # Cloud Run container
    ├── cloudbuild.yaml    # CI/CD pipeline
    ├── README.md          # Technical documentation
    └── SEO_CHECKLIST.md   # SEO implementation tracking
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router) + React 19 |
| Styling | Tailwind CSS v4 + Shadcn UI + Radix UI |
| 3D | Three.js / @react-three/fiber |
| Forms | React Hook Form + Zod |
| State | React Query (server) + Zustand (client) |
| Email | Nodemailer (SMTP) |
| Hosting | Google Cloud Run |
| CI/CD | Cloud Build + GitHub triggers |
| Infra | Terraform |

---

## Key User Flows

### 1. Create Storybook (Main Flow)
1. User visits homepage
2. Photo guidelines dialog appears (first-time, dismissable)
3. User uploads child's photo
4. User selects theme (dinosaur, space, etc.)
5. User enters child's name + optional storyline
6. User enters email
7. Click "Generate" → `/api/storybook/generate` creates job
8. Redirect to order confirmation page
9. Story service generates book (async)
10. Email sent with digital flipbook link
11. User can order hardcover (Lulu)

### 2. Order Hardcover
1. User clicks "Order Hardcover" on confirmation page
2. Redirect to Lulu checkout with book data
3. Lulu handles payment + printing + shipping

---

## Environment Variables

**Required for web app:**
```
STORY_SERVICE_URL=https://story-service-xxx.run.app
STORY_SERVICE_AUDIENCE=https://story-service-xxx.run.app
STORY_INVOKER_CREDENTIALS_JSON={"type":"service_account",...}
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@img2x.com
SMTP_PASS=xxx
```

---

## Deployment

### Automatic (Recommended)
Push to `main` → GitHub trigger → Cloud Build → Cloud Run

### Manual
```bash
# MUST run from repo root (ai_app/), NOT from web/
cd /path/to/ai_app
gcloud builds submit --config=web/cloudbuild.yaml --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD) .
```

### Monitor
- Build: https://console.cloud.google.com/cloud-build/builds
- Logs: `gcloud run services logs read img2x-web --region us-central1`
- Production: https://img2x.com

---

## Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| `lstat /workspace/web/Dockerfile: no such file` | Running `gcloud builds submit` from wrong directory | Run from repo root, not `web/` |
| Build uploading 300+ MiB | Missing `.gcloudignore` | Ensure `web/.gcloudignore` exists and excludes `node_modules/` |
| `DialogContent requires DialogTitle` | Radix UI accessibility | Add `<DialogTitle className="sr-only">` |
| API calls fail | Invalid service URL or credentials | Check `STORY_SERVICE_URL` and service account |

---

## Coding Standards

- **Style:** Standard.js (2 spaces, no semicolons, single quotes)
- **Components:** Functional with hooks, PascalCase
- **Files:** kebab-case (`photo-guidelines-dialog.tsx`)
- **Directories:** kebab-case (`generator-card/`)

See `.cursor/rules/coding-standards.mdc` for details.

---

## Current Status (as of Feb 2026)

### ✅ Completed
- Core storybook generation flow
- 3D book preview
- Digital + hardcover ordering
- Photo guidelines UI (step-by-step carousel)
- SEO metadata + structured data
- CI/CD pipeline
- Google Search Console (verified, sitemap submitted - 9 pages indexed)
- Domain mapping (img2x.com + www.img2x.com)
- Google Analytics 4 (Measurement ID: G-Q12Z62SK1Q)
- Cookie Consent Banner (GDPR compliant, react-cookie-consent + GA Consent Mode)

### 🔄 In Progress
- (None currently)

### 📋 Backlog
- Blog section for SEO content
- Theme/occasion landing pages
- Social media integration
- Customer reviews section

See `web/SEO_CHECKLIST.md` for detailed SEO roadmap.

---

## Key Decisions & Learnings

1. **Photo Guidelines as Carousel:** Changed from grid showing all images to step-by-step carousel for mobile responsiveness. Includes "Don't show again" option.

2. **sr-only vs VisuallyHidden:** Use Tailwind's `sr-only` class instead of importing `@radix-ui/react-visually-hidden` to avoid adding dependencies.

3. **Cloud Build Directory:** The `cloudbuild.yaml` uses `dir: 'web'`, so manual builds must submit from repo root with `.` as source.

4. **Face-lock Technology:** The key differentiator - AI keeps the child's face consistent across all illustrations (not just pasting).

---

## Useful Commands

```bash
# Local development
cd web && npm run dev

# Build locally (catch errors before deploy)
npm run build

# Deploy manually
cd /path/to/ai_app
gcloud builds submit --config=web/cloudbuild.yaml --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD) .

# View Cloud Run logs
gcloud run services logs read img2x-web --region us-central1

# Check service status
gcloud run services describe img2x-web --region us-central1
```

---

## Links

- **Production:** https://img2x.com
- **GitHub:** https://github.com/chvsarath-eng/ai_app
- **Cloud Console:** https://console.cloud.google.com/run?project=imgstr
- **Cloud Build:** https://console.cloud.google.com/cloud-build/builds?project=imgstr

---

*Last updated: February 1, 2026*
