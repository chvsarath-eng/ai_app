import type { CreateJobRequest, JobStatusResponse } from '@/types/storybook'

const MIN_CONTENT_TYPE = 'application/json; charset=utf-8'

type BackendError = {
  error?: { message?: string }
  detail?: string
  message?: string
}

type BackendJob = {
  status?: string
  error?: { message?: string }
}

function safeJsonParse<T> (text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function mapBackendStatus (status?: string): JobStatusResponse['status'] {
  if (status === 'queued') return 'PENDING'
  if (status === 'running') return 'RUNNING'
  if (status === 'succeeded') return 'DONE'
  if (status === 'failed') return 'FAILED'
  return 'RUNNING'
}

export async function createStorybookJob (req: CreateJobRequest): Promise<{ jobId: string }> {
  const form = new FormData()
  form.append('image', req.imageFile)
  form.append('story_prompt', req.storyline)
  form.append('email', req.email)
  form.append('output_type', req.outputType)
  form.append('keep_job_dir', 'false')

  const res = await fetch('/api/storybook/generate', {
    method: 'POST',
    body: form
  })

  const text = await res.text()
  if (!res.ok) throw new Error(text || 'Failed to create job')

  const data = JSON.parse(text) as { job_id?: string, jobId?: string }
  const jobId = data.job_id || data.jobId
  if (!jobId) throw new Error('Missing job_id from server')
  return { jobId }
}

export async function getStorybookJob (jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`/api/storybook/jobs/${encodeURIComponent(jobId)}`, {
    method: 'GET',
    headers: { accept: MIN_CONTENT_TYPE },
    cache: 'no-store'
  })

  const text = await res.text()

  if (res.status === 500) {
    const err = safeJsonParse<BackendError>(text)
    const message = err?.error?.message || err?.detail || err?.message || 'Job failed'
    return { jobId, status: 'FAILED', error: { message } }
  }

  if (!res.ok) throw new Error(text || 'Failed to fetch job')

  const j = safeJsonParse<BackendJob>(text)
  const mappedStatus = mapBackendStatus(j?.status)

  return {
    jobId,
    status: mappedStatus,
    result: mappedStatus === 'DONE'
      ? { storybookHtmlUrl: `/api/storybook/jobs/${encodeURIComponent(jobId)}/storybook.html` }
      : undefined,
    error: mappedStatus === 'FAILED'
      ? { message: j?.error?.message || 'Job failed' }
      : undefined
  }
}

