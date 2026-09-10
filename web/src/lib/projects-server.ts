import 'server-only'

import { deleteDocument, getDocument, listDocuments, setDocument } from '@/lib/data-store'
import { getStoryAuthHeaders, getStoryServiceUrl } from '@/lib/storyApiServer'
import type { Project, ProjectImage } from '@/types/project'
import type { SessionUser } from '@/lib/session'

const COLLECTION = 'projects'
const LIVE_STATUSES = new Set(['paid', 'starting', 'generating'])

type JobImage = {
  url?: string | null
  gcs_uri?: string | null
  type?: string | null
  page_number?: number | null
}

type JobPayload = {
  job_id?: string
  status?: string
  stage?: string | null
  story?: Record<string, unknown> | null
  images?: Record<string, JobImage>
  images_done?: number | null
  images_total?: number | null
  created_at?: number | null
  output_type?: string
  error?: { message?: string; type?: string; stage?: string } | null
  local_urls?: { html?: string; pdf?: string }
  signed_urls?: { html?: string; pdf?: string; interior?: string; cover?: string }
  timing?: Record<string, number>
  cost?: Record<string, unknown>
  email_status?: string | null
}

export function newProjectId () {
  const rand = Math.random().toString(36).slice(2, 8)
  return `proj_${Date.now().toString(36)}${rand}`
}

export async function getProject (id: string): Promise<Project | null> {
  const doc = await getDocument(COLLECTION, id)
  return (doc as unknown as Project) ?? null
}

export async function upsertProject (id: string, patch: Record<string, unknown>) {
  return setDocument(COLLECTION, id, { ...patch, updatedAt: Date.now() }, { merge: true })
}

export function deleteProject (id: string) {
  return deleteDocument(COLLECTION, id)
}

export async function listRecentProjects (limit = 100): Promise<Project[]> {
  const docs = await listDocuments(COLLECTION, { orderBy: 'createdAt', descending: true, limit })
  return docs as unknown as Project[]
}

export async function listProjectsForUser (user: SessionUser, limit = 50): Promise<Project[]> {
  const byUid = await listDocuments(COLLECTION, {
    where: [['uid', user.uid]],
    orderBy: 'createdAt',
    descending: true,
    limit
  })
  const seen = new Set(byUid.map((d) => d.id))
  const byEmail = user.email
    ? await listDocuments(COLLECTION, { where: [['email', user.email]], orderBy: 'createdAt', descending: true, limit })
    : []
  const merged = [...byUid, ...byEmail.filter((d) => !seen.has(d.id))]
  merged.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
  return merged as unknown as Project[]
}

export function canUserAccessProject (project: Project, user: SessionUser | null) {
  if (!user) return false
  if (user.isAdmin) return true
  if (project.uid && project.uid === user.uid) return true
  if (project.email && user.email && project.email.toLowerCase() === user.email.toLowerCase()) return true
  return false
}

// ---------------------------------------------------------------------------
// Live job enrichment (used when Firestore mirroring from the story API is unavailable)
// ---------------------------------------------------------------------------

function imageKey (name: string, image: JobImage): string | null {
  const type = (image.type || '').toLowerCase()
  const digits = name.replace(/\D/g, '')
  if (type === 'cover') return 'cover'
  if (type === 'page') {
    const pn = image.page_number ?? (digits ? Number(digits) : null)
    return pn === null ? null : `page_${pn}`
  }
  if (type === 'character') return `char_${digits || '1'}`
  if (/cover/i.test(name)) return 'cover'
  if (/page/i.test(name) && digits) return `page_${Number(digits)}`
  return null
}

/** Route story-service relative URLs through the Next.js proxy so the browser can load them. */
function toWebUrl (url: string | null | undefined, jobId: string) {
  if (!url) return null
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith(`/jobs/${jobId}/`)) return `/api/storybook${url}`
  return url
}

function mapJobToProjectPatch (job: JobPayload, jobId: string): Record<string, unknown> {
  const status = job.status
  const patch: Record<string, unknown> = {
    jobId,
    stage: job.stage ?? null
  }

  if (status === 'succeeded') patch.status = 'ready'
  else if (status === 'failed') patch.status = 'failed'
  else if (status === 'running') patch.status = 'generating'
  else if (status === 'queued') patch.status = 'starting'

  if (job.error) patch.error = job.error

  const story = job.story
  if (story && typeof story === 'object') {
    const pages = Array.isArray(story.pages) ? story.pages as Array<Record<string, unknown>> : []
    patch.story = {
      title: String(story.title || ''),
      coverText: String(story.cover_text || story.coverText || ''),
      pages: pages.map((p) => ({ pageNumber: p.page_number ?? p.pageNumber, story: String(p.story || '') })),
      characters: Array.isArray(story.characters) ? story.characters : []
    }
    if (story.title) patch.title = String(story.title)
  }

  const images: Record<string, ProjectImage> = {}
  for (const [name, image] of Object.entries(job.images || {})) {
    const key = imageKey(name, image)
    if (!key) continue
    const url = toWebUrl(image.url, jobId)
    images[key] = {
      url,
      gcsPath: image.gcs_uri ?? null,
      type: image.type ?? undefined,
      pageNumber: image.page_number ?? null
    }
    if (key === 'cover' && url) patch.coverUrl = url
  }
  if (Object.keys(images).length > 0) patch.images = images
  if (typeof job.images_done === 'number') patch.imagesDone = job.images_done
  if (typeof job.images_total === 'number') patch.imagesTotal = job.images_total

  const artifacts: Record<string, { url: string | null; gcsPath: string | null }> = {}
  const html = job.signed_urls?.html || toWebUrl(job.local_urls?.html, jobId)
  const pdf = job.signed_urls?.pdf || job.signed_urls?.interior || toWebUrl(job.local_urls?.pdf, jobId)
  if (html) artifacts.html = { url: html, gcsPath: null }
  if (pdf) artifacts.pdf = { url: pdf, gcsPath: null }
  if (Object.keys(artifacts).length > 0) patch.artifacts = artifacts

  if (status === 'succeeded') {
    patch.finishedAt = Date.now()
    if (job.timing) patch.timing = job.timing
    if (job.cost) patch.cost = job.cost
    if (job.email_status) patch.emailStatus = job.email_status
  }
  return patch
}

const JOB_MISSING = Symbol('job-missing')

async function fetchJob (jobId: string): Promise<JobPayload | null | typeof JOB_MISSING> {
  try {
    const headers = await getStoryAuthHeaders()
    const res = await fetch(`${getStoryServiceUrl()}/jobs/${encodeURIComponent(jobId)}`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(4000)
    })
    // The story service no longer knows this job (in-memory state lost on restart/redeploy).
    if (res.status === 404) return JOB_MISSING
    if (!res.ok) return null
    const data = (await res.json()) as JobPayload
    return data
  } catch (err) {
    console.warn(`projects-server: could not fetch job ${jobId}:`, err)
    return null
  }
}

/** Live projects whose job vanished are marked failed so users/admins are not stuck on "generating". */
async function markJobLost (project: Project): Promise<Project> {
  const ageMs = Date.now() - Number(project.updatedAt || project.createdAt || 0)
  // Give a just-created job a short grace period in case the service is still booting.
  if (ageMs < 60_000) return project
  const merged = await upsertProject(project.id, {
    status: 'failed',
    error: {
      type: 'job_lost',
      message: 'Generation was interrupted (story service restarted). Please create the book again; your payment is recorded.'
    }
  })
  return merged as unknown as Project
}

/**
 * Refresh a project from the story service when it has a job and is not terminal.
 * Persists the merged state so admin/analytics stay accurate.
 */
export async function refreshProjectFromJob (project: Project): Promise<Project> {
  if (!project.jobId) return project
  const needsRefresh =
    LIVE_STATUSES.has(project.status) ||
    (project.status === 'ready' && (!project.images || Object.keys(project.images).length === 0))
  if (!needsRefresh) return project

  const job = await fetchJob(project.jobId)
  if (job === JOB_MISSING) {
    return LIVE_STATUSES.has(project.status) ? markJobLost(project) : project
  }
  if (!job) return project

  const patch = mapJobToProjectPatch(job, project.jobId)
  const merged = await upsertProject(project.id, patch)
  return merged as unknown as Project
}

export async function refreshProjects (projects: Project[]): Promise<Project[]> {
  return Promise.all(projects.map((p) => refreshProjectFromJob(p)))
}
