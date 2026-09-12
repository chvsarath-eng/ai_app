import type { Project } from '@/types/project'

export type SupportIssue = {
  key: string
  label: string
  detail?: string | null
}

function startedAtMs (value?: number | null) {
  if (!value) return null
  return value < 1e12 ? value * 1000 : value
}

export function supportIssues (project: Project): SupportIssue[] {
  const issues: SupportIssue[] = []
  const errorText = project.error?.message || project.startError || null

  if (project.status === 'failed') {
    issues.push({ key: 'failed', label: 'Book failed', detail: errorText })
  }

  if (project.status === 'paid' && !project.jobId) {
    issues.push({
      key: 'paid_stuck',
      label: 'Paid, but the book never started',
      detail: project.startError || 'Photos may be missing, or generation did not kick off.'
    })
  }

  if (project.startError && project.status !== 'ready' && project.status !== 'failed') {
    issues.push({ key: 'start_error', label: 'Could not start generation', detail: project.startError })
  }

  const started = startedAtMs(project.startedAt)
  if ((project.status === 'generating' || project.status === 'starting') && started) {
    const ageMin = (Date.now() - started) / 60000
    if (ageMin >= 25) {
      issues.push({
        key: 'slow',
        label: `Still generating after ${Math.round(ageMin)} minutes`,
        detail: project.stage || null
      })
    }
  }

  if (project.printStatus === 'failed') {
    issues.push({ key: 'print', label: 'Hardcover print failed', detail: project.printError || null })
  }

  return issues
}

export function customerEmail (project: Project) {
  return project.email || project.payment?.email || 'No email'
}

export function bookTypeLabel (project: Project) {
  return project.outputType === 'LULU_BOOK' ? 'Hardcover' : 'Digital'
}

export function statusLabel (status: Project['status']) {
  switch (status) {
    case 'awaiting_payment':
      return 'Waiting for payment'
    case 'paid':
      return 'Paid — not started'
    case 'starting':
      return 'Starting'
    case 'generating':
      return 'Making the book'
    case 'ready':
      return 'Ready'
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    case 'refunded':
      return 'Refunded'
    default:
      return status
  }
}

export function formatMoney (minor: number, currency = 'INR') {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format((minor || 0) / 100)
  } catch {
    return `${currency} ${((minor || 0) / 100).toLocaleString('en-IN')}`
  }
}

export function moneyFromProject (project: Project) {
  const minor = project.payment?.amountMinor || project.amounts?.totalMinor || 0
  const currency = project.payment?.currency || project.amounts?.currency || 'INR'
  return formatMoney(minor, currency)
}

export function characterNames (project: Project) {
  return (project.characters || []).map((c) => c.name).filter(Boolean).join(', ')
}

export function hasSavedPhotos (project: Project) {
  return (project.uploads || []).some((u) => Boolean(u.gcsUri && u.gcsUri.startsWith('gs://')))
}

export function issueRank (project: Project) {
  const keys = new Set(supportIssues(project).map((issue) => issue.key))
  if (keys.has('failed')) return 0
  if (keys.has('paid_stuck')) return 1
  if (keys.has('start_error')) return 2
  if (keys.has('print')) return 3
  if (keys.has('slow')) return 4
  return 5
}

export type SupportSort = 'issues' | 'newest' | 'oldest' | 'customer'

export function supportSearchHaystack (project: Project) {
  return [
    project.id,
    project.jobId,
    project.email,
    project.payment?.email,
    project.payment?.paymentId,
    project.payment?.orderId,
    project.payment?.contact,
    project.title,
    project.storyline,
    project.story?.title,
    project.adminNotes,
    ...(project.characters || []).map((c) => c.name)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function matchesSupportSearch (project: Project, query: string) {
  if (!query) return true
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true
  const hay = supportSearchHaystack(project)
  return tokens.every((token) => hay.includes(token))
}

export function looksLikeCustomerLookup (query: string) {
  const q = query.trim()
  if (!q) return false
  if (q.includes('@')) return true
  if (/^(pay_|order_|proj_|job_)/i.test(q)) return true
  if (/^\+?\d{8,}$/.test(q.replace(/[\s-]/g, ''))) return true
  return q.length >= 3
}

export function sortSupportBooks (books: Project[], sort: SupportSort) {
  const copy = [...books]
  if (sort === 'oldest') {
    return copy.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  }
  if (sort === 'customer') {
    return copy.sort((a, b) => (
      customerEmail(a).localeCompare(customerEmail(b)) || (b.createdAt || 0) - (a.createdAt || 0)
    ))
  }
  if (sort === 'newest') {
    return copy.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  }
  return copy.sort((a, b) => {
    const aIssue = supportIssues(a).length > 0 ? 0 : 1
    const bIssue = supportIssues(b).length > 0 ? 0 : 1
    if (aIssue !== bIssue) return aIssue - bIssue
    return issueRank(a) - issueRank(b) || (b.createdAt || 0) - (a.createdAt || 0)
  })
}
