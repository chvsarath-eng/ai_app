import { NextResponse } from 'next/server'

import { downloadObject } from '@/lib/gcs'
import { getStoryAuthHeaders, getStoryServiceUrl } from '@/lib/storyApiServer'

export const runtime = 'nodejs'

function jobsBucket () {
  return process.env.JOBS_BUCKET || process.env.UPLOADS_BUCKET || 'imgstr-story-jobs-us-central1'
}

/** Proxies live-preview images from the story service, then from the jobs bucket. */
export async function GET (
  _request: Request,
  { params }: { params: Promise<{ jobId: string, name: string }> }
) {
  try {
    const { jobId, name } = await params
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '')
    if (!safeName) {
      return NextResponse.json({ error: { message: 'Image not found' } }, { status: 404 })
    }

    try {
      const headers = await getStoryAuthHeaders()
      const res = await fetch(
        `${getStoryServiceUrl()}/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(safeName)}`,
        { headers, cache: 'no-store' }
      )
      if (res.ok) {
        const body = await res.arrayBuffer()
        return new NextResponse(body, {
          status: 200,
          headers: {
            'content-type': res.headers.get('content-type') || 'image/png',
            'cache-control': 'private, max-age=3600'
          }
        })
      }
    } catch (proxyErr) {
      console.warn('story-api image proxy missed, trying GCS', jobId, safeName, proxyErr)
    }

    const fromGcs = await downloadObject(`gs://${jobsBucket()}/jobs/${jobId}/images/${safeName}`)
    if (!fromGcs) {
      return NextResponse.json({ error: { message: 'Image not found' } }, { status: 404 })
    }
    return new NextResponse(new Uint8Array(fromGcs.data), {
      status: 200,
      headers: {
        'content-type': fromGcs.contentType,
        'cache-control': 'private, max-age=3600'
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
