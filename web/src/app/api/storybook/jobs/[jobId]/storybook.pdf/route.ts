import { NextResponse } from 'next/server'

import { getStoryAuthHeaders, getStoryServiceUrl } from '@/lib/storyApiServer'

export const runtime = 'nodejs'

/** Proxies the finished PDF served from the story service's local job dir. */
export async function GET (
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params
    const headers = await getStoryAuthHeaders()

    const res = await fetch(`${getStoryServiceUrl()}/jobs/${encodeURIComponent(jobId)}/storybook.pdf`, {
      headers,
      cache: 'no-store'
    })
    if (!res.ok) {
      return NextResponse.json({ error: { message: 'PDF not ready' } }, { status: res.status })
    }

    const body = await res.arrayBuffer()
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': res.headers.get('content-disposition') || 'attachment; filename="storybook.pdf"'
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
