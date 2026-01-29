import { NextResponse } from 'next/server'

import { getStoryAuthHeaders, getStoryServiceUrl } from '@/lib/storyApiServer'

export const runtime = 'nodejs'

export async function GET (
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const headers = await getStoryAuthHeaders()

    const res = await fetch(`${getStoryServiceUrl()}/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers,
      cache: 'no-store'
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

