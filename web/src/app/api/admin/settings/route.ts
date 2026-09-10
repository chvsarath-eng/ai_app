import { NextRequest, NextResponse } from 'next/server'

import { getAuthMode, getSessionUser } from '@/lib/session'
import { getDataBackend } from '@/lib/data-store'
import { getStoryAuthHeaders, getStoryServiceUrl } from '@/lib/storyApiServer'

export const runtime = 'nodejs'

function isAuthorizedAdminKey (request: NextRequest) {
  const adminKey = request.headers.get('x-admin-key')
  const expected = process.env.ADMIN_SECRET_KEY
  return Boolean(adminKey && expected && adminKey === expected)
}

type StoryServiceConfig = {
  status?: string
  image?: Record<string, unknown>
  story?: Record<string, unknown>
  keys?: Record<string, boolean>
  storage?: Record<string, unknown>
  jobs?: Record<string, number>
}

async function fetchStoryServiceConfig (): Promise<{ reachable: boolean; latencyMs: number | null; config: StoryServiceConfig | null; error?: string }> {
  const started = Date.now()
  try {
    const headers = await getStoryAuthHeaders()
    const res = await fetch(`${getStoryServiceUrl()}/admin/config`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    })
    const latencyMs = Date.now() - started
    if (!res.ok) return { reachable: true, latencyMs, config: null, error: `HTTP ${res.status}` }
    return { reachable: true, latencyMs, config: (await res.json()) as StoryServiceConfig }
  } catch (err) {
    return { reachable: false, latencyMs: null, config: null, error: err instanceof Error ? err.message : 'unreachable' }
  }
}

export async function GET (request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!isAuthorizedAdminKey(request) && !user?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const storyService = await fetchStoryServiceConfig()
    const image = storyService.config?.image || {}

    const razorpayKeyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ''
    const settings = {
      // Effective values reported by the story service (falls back to web env for display only)
      imageProvider: (image.provider as string) || process.env.IMAGE_PROVIDER || null,
      imageModel: (image.model as string) || process.env.IMAGE_MODEL || null,
      imageModelPages: (image.modelPages as string) || process.env.IMAGE_MODEL_PAGES || null,
      imageApiBase: (image.apiBase as string) || process.env.IMAGE_API_BASE || null,
      imageQuality: (image.quality as string) || null,
      imageSizeDigital: (image.sizeDigital as string) || null,
      imageSizePrint: (image.sizePrint as string) || null,
      imageResolution: (image.resolution as string) || null,
      imageAspectRatio: (image.aspectRatio as string) || null,
      imageConcurrency: (image.concurrency as string) || null,
      storyProvider: (storyService.config?.story?.provider as string) || null,
      storyModel: (storyService.config?.story?.model as string) || null,

      // Credential presence (booleans only)
      laozhangKeySet: Boolean(storyService.config?.keys?.laozhang),
      openaiKeySet: Boolean(storyService.config?.keys?.openai),
      geminiKeySet: Boolean(storyService.config?.keys?.gemini),
      smtpSet: Boolean(storyService.config?.keys?.smtp),
      razorpayKeyIdSet: Boolean(razorpayKeyId),
      razorpayKeyMode: razorpayKeyId.startsWith('rzp_live_') ? 'live' : razorpayKeyId.startsWith('rzp_test_') ? 'test' : null,
      razorpaySecretSet: Boolean(process.env.RAZORPAY_KEY_SECRET),
      razorpayWebhookSecretSet: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),

      // Platform wiring
      authMode: getAuthMode(),
      dataBackend: getDataBackend(),
      firebaseClientConfigured: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
      adminEmailsConfigured: Boolean(process.env.ADMIN_EMAILS),
      jobsBucket: (storyService.config?.storage?.jobsBucket as string) || null,
      storyFirestoreEnabled: Boolean(storyService.config?.storage?.firestoreEnabled),
      storyServiceUrl: getStoryServiceUrl(),
      storyServiceReachable: storyService.reachable,
      storyServiceLatencyMs: storyService.latencyMs,
      storyServiceError: storyService.error || null,
      storyServiceActiveJobs: storyService.config?.jobs?.active ?? null
    }

    return NextResponse.json({ settings })
  } catch (error: unknown) {
    console.error('Admin settings error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

/** POST { model } -> live connectivity test against the image API through the story service. */
export async function POST (request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!isAuthorizedAdminKey(request) && !user?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const model = typeof body?.model === 'string' ? body.model : ''

    const form = new FormData()
    if (model) form.append('model', model)
    const headers = await getStoryAuthHeaders()
    const res = await fetch(`${getStoryServiceUrl()}/admin/test-image-api`, {
      method: 'POST',
      headers,
      body: form,
      cache: 'no-store',
      signal: AbortSignal.timeout(25000)
    })
    const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
    return NextResponse.json(data, { status: res.ok ? 200 : 502 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Test failed'
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
