import { NextResponse } from 'next/server'

import { getStoryAuthHeaders, getStoryServiceUrl } from '@/lib/storyApiServer'
import { getSessionUser } from '@/lib/session'
import { getProject, upsertProject } from '@/lib/projects-server'
import { getAppSettings } from '@/lib/app-settings'

export const runtime = 'nodejs'

export async function POST (request: Request) {
  try {
    const incoming = await request.formData()
    const form = new FormData()

    const projectId = String(incoming.get('project_id') || '').trim()
    const user = await getSessionUser()

    // A project can only be attached to a job by its owner (or an admin).
    let project = projectId ? await getProject(projectId) : null
    if (project && user && project.uid && project.uid !== user.uid && !user.isAdmin) {
      return NextResponse.json({ error: { message: 'This project belongs to another account' } }, { status: 403 })
    }
    if (projectId && !project && !user) {
      return NextResponse.json({ error: { message: 'Sign in required' } }, { status: 401 })
    }

    // Note: the story service keeps the job dir itself whenever it runs without a GCS
    // bucket (the dir is then the only copy of the book), so keep_job_dir passes through.
    for (const [key, value] of incoming.entries()) {
      if (typeof value === 'string') {
        form.append(key, value)
        continue
      }
      // value is File (Blob) in Next route handlers
      form.append(key, value, value.name)
    }
    // Admin-selected image models (Admin → AI Models) override the story service defaults.
    try {
      const settings = await getAppSettings()
      if (settings.maintenance.enabled) {
        return NextResponse.json(
          { error: { message: settings.maintenance.message || 'Book generation is paused for maintenance. Please try again shortly.' } },
          { status: 503 }
        )
      }
      if (settings.images.model && !incoming.has('image_model')) form.append('image_model', settings.images.model)
      if (settings.images.modelPages && !incoming.has('image_model_pages')) form.append('image_model_pages', settings.images.modelPages)
    } catch (settingsErr) {
      console.warn('Could not load app settings; using story service defaults:', settingsErr)
    }

    const headers = await getStoryAuthHeaders()
    const res = await fetch(`${getStoryServiceUrl()}/generate-ebook-async`, {
      method: 'POST',
      headers,
      body: form
    })

    const text = await res.text()
    const contentType = res.headers.get('content-type') || 'application/json; charset=utf-8'

    // Link the job to the project so "My Books" and the admin panel can track it.
    if (res.ok && projectId) {
      try {
        const data = JSON.parse(text) as { job_id?: string; jobId?: string }
        const jobId = data.job_id || data.jobId
        if (jobId) {
          project = project ?? null
          await upsertProject(projectId, {
            id: projectId,
            uid: project?.uid || user?.uid || null,
            email: project?.email || user?.email || String(incoming.get('email') || '') || null,
            jobId,
            status: 'starting',
            stage: 'queued',
            startedAt: Date.now(),
            outputType: project?.outputType || String(incoming.get('output_type') || 'DIGI_BOOK'),
            storyline: project?.storyline || String(incoming.get('story_prompt') || ''),
            createdAt: project?.createdAt || Date.now()
          })
        }
      } catch (linkErr) {
        console.warn('Could not link job to project:', linkErr)
      }
    }

    return new NextResponse(text, {
      status: res.status,
      headers: { 'content-type': contentType }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: { message } }, { status: 500 })
  }
}
