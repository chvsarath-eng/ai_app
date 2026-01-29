import { NextResponse } from 'next/server'

import { getStoryAuthHeaders, getStoryServiceUrl } from '@/lib/storyApiServer'

export const runtime = 'nodejs'

export async function POST (request: Request) {
  try {
    const incoming = await request.formData()
    const form = new FormData()

    for (const [key, value] of incoming.entries()) {
      if (typeof value === 'string') {
        form.append(key, value)
        continue
      }

      // value is File (Blob) in Next route handlers
      form.append(key, value, value.name)
    }

    const headers = await getStoryAuthHeaders()
    const res = await fetch(`${getStoryServiceUrl()}/generate-ebook-async`, {
      method: 'POST',
      headers,
      body: form
    })

    const text = await res.text()
    const contentType = res.headers.get('content-type') || 'application/json; charset=utf-8'

    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': contentType }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}

