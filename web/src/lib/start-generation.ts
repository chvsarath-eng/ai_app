import 'server-only'

import { getAppSettings } from '@/lib/app-settings'
import { getStoryAuthHeaders, getStoryServiceUrl } from '@/lib/storyApiServer'
import { getProject, upsertProject } from '@/lib/projects-server'
import type { Project } from '@/types/project'

const ACTIVE_STATUSES = new Set(['starting', 'generating', 'ready'])

export type StartGenerationResult = {
  ok: boolean
  jobId?: string
  alreadyStarted?: boolean
  error?: string
}

function uploadUris (project: Project): string[] {
  return (project.uploads || [])
    .map((u) => u.gcsUri)
    .filter((uri): uri is string => Boolean(uri && uri.startsWith('gs://')))
}

/**
 * Kick off story-api generation from photos already stored on the project.
 * Safe to call more than once: an in-flight or finished job is returned as-is.
 */
export async function startProjectGeneration (projectId: string): Promise<StartGenerationResult> {
  const project = await getProject(projectId)
  if (!project) return { ok: false, error: 'Project not found' }

  if (project.jobId && ACTIVE_STATUSES.has(project.status)) {
    return { ok: true, jobId: project.jobId, alreadyStarted: true }
  }

  const uris = uploadUris(project)
  if (uris.length === 0) {
    const message = 'Photos were not saved before payment. Re-upload them to start generation.'
    await upsertProject(projectId, { startError: message })
    return { ok: false, error: message }
  }

  try {
    const settings = await getAppSettings()
    if (settings.maintenance.enabled) {
      return {
        ok: false,
        error: settings.maintenance.message || 'Book generation is paused. Please try again shortly.'
      }
    }

    const form = new FormData()
    form.append('story_prompt', project.storyline || '')
    form.append('character_metadata', JSON.stringify(project.characters || []))
    form.append('email', project.email || '')
    form.append('output_type', project.outputType || 'DIGI_BOOK')
    form.append('keep_job_dir', 'false')
    form.append('project_id', project.id)
    for (const uri of uris) form.append('image_gcs_uris', uri)
    if (settings.images.model) form.append('image_model', settings.images.model)
    if (settings.images.modelPages) form.append('image_model_pages', settings.images.modelPages)

    const headers = await getStoryAuthHeaders()
    const res = await fetch(`${getStoryServiceUrl()}/generate-ebook-async`, {
      method: 'POST',
      headers,
      body: form
    })
    const text = await res.text()
    if (!res.ok) {
      const message = text.slice(0, 400) || `Story service returned ${res.status}`
      console.error('startProjectGeneration failed', projectId, res.status, message)
      await upsertProject(projectId, { startError: message, status: project.status === 'paid' ? 'paid' : project.status })
      return { ok: false, error: message }
    }

    const data = JSON.parse(text) as { job_id?: string; jobId?: string; error?: { message?: string } }
    const jobId = data.job_id || data.jobId
    if (!jobId) {
      const message = data.error?.message || 'Story service did not return a job id'
      await upsertProject(projectId, { startError: message })
      return { ok: false, error: message }
    }

    await upsertProject(projectId, {
      jobId,
      status: 'starting',
      stage: 'queued',
      startedAt: Date.now(),
      startError: null
    })
    return { ok: true, jobId }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start generation'
    console.error('startProjectGeneration error', projectId, err)
    await upsertProject(projectId, { startError: message })
    return { ok: false, error: message }
  }
}
