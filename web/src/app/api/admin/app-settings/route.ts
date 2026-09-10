import { NextRequest, NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/session'
import { getAppSettings, saveAppSettings, type AppSettings } from '@/lib/app-settings'

export const runtime = 'nodejs'

const ALLOWED_IMAGE_MODELS = new Set([
  '',
  'gpt-image-2.5-sunburst-2026-09-08',
  'gpt-image-2.5-sunburst',
  'gpt-image-2.5-flare-2026-09-08',
  'gpt-image-2.5-flare',
  'gemini-3-pro-image-preview'
])

async function assertAdmin () {
  const user = await getSessionUser()
  return user?.isAdmin ? user : null
}

/** GET: persisted app settings (image model overrides, maintenance, pricing). */
export async function GET () {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  const settings = await getAppSettings(true)
  return NextResponse.json({ settings })
}

/** PUT { images?: { model?, modelPages? }, maintenance?: { enabled?, message? } } */
export async function PUT (request: NextRequest) {
  const user = await assertAdmin()
  if (!user) return NextResponse.json({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as Partial<AppSettings>
  const patch: Partial<AppSettings> = {}

  if (body.images) {
    const model = typeof body.images.model === 'string' ? body.images.model.trim() : undefined
    const modelPages = typeof body.images.modelPages === 'string' ? body.images.modelPages.trim() : undefined
    if (model !== undefined && !ALLOWED_IMAGE_MODELS.has(model)) {
      return NextResponse.json({ error: `Unsupported image model: ${model}` }, { status: 400 })
    }
    if (modelPages !== undefined && !ALLOWED_IMAGE_MODELS.has(modelPages)) {
      return NextResponse.json({ error: `Unsupported pages model: ${modelPages}` }, { status: 400 })
    }
    patch.images = {
      ...(model !== undefined ? { model } : {}),
      ...(modelPages !== undefined ? { modelPages } : {})
    } as AppSettings['images']
  }

  if (body.maintenance) {
    patch.maintenance = {
      enabled: Boolean(body.maintenance.enabled),
      message: typeof body.maintenance.message === 'string' ? body.maintenance.message.slice(0, 300) : ''
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  await saveAppSettings(patch, user.email)
  const settings = await getAppSettings(true)
  return NextResponse.json({ settings })
}
