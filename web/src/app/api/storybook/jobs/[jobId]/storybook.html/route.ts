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

    const res = await fetch(`${getStoryServiceUrl()}/jobs/${encodeURIComponent(jobId)}/storybook.html`, {
      method: 'GET',
      headers,
      cache: 'no-store'
    })

    const body = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') || 'text/html; charset=utf-8'
    const contentDisposition = res.headers.get('content-disposition') || 'inline; filename="storybook.html"'

    return new NextResponse(body, {
      status: res.status,
      headers: {
        'content-type': contentType,
        'content-disposition': contentDisposition
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}

