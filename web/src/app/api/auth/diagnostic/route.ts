import { NextResponse } from 'next/server'

// Local troubleshooting only. Never accept tokens, email addresses or raw errors.
export async function POST (request: Request) {
  if (process.env.NODE_ENV !== 'development') return new NextResponse(null, { status: 404 })
  const origin = new URL(request.url).origin
  if (request.headers.get('origin') !== origin) return new NextResponse(null, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const code = typeof body.code === 'string' && /^auth\/[a-z-]{1,80}$/.test(body.code) ? body.code : 'unknown'
  const elapsedMs = typeof body.elapsedMs === 'number' && Number.isFinite(body.elapsedMs)
    ? Math.min(600000, Math.max(0, Math.round(body.elapsedMs))) : null
  console.warn('[Google sign-in diagnostic]', { code, elapsedMs })
  return NextResponse.json({ ok: true })
}
