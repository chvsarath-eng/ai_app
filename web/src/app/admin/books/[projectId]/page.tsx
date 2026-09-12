'use client'

import { use, useCallback, useEffect, useLayoutEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  Play,
  RefreshCw,
  Save,
  ShieldCheck
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAuthStore } from '@/lib/auth-store'
import {
  bookTypeLabel,
  customerEmail,
  hasSavedPhotos,
  moneyFromProject,
  statusLabel,
  supportIssues
} from '@/lib/admin-support'
import type { Project } from '@/types/project'
import type { CharacterInfo } from '@/types/storybook'

function shippingLine (project: Project) {
  const s = project.shipping
  if (!s?.address1) return null
  return [s.name, s.address1, s.address2, s.city, s.region, s.postalCode, s.country]
    .filter(Boolean)
    .join(', ')
}

export default function AdminBookPage ({
  params
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = use(params)
  const user = useAuthStore((s) => s.user)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const openSignIn = useAuthStore((s) => s.openSignIn)

  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [storyline, setStoryline] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [characters, setCharacters] = useState<CharacterInfo[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [projectId])

  const applyProject = (next: Project) => {
    setProject(next)
    setStoryline(next.storyline || '')
    setAdminNotes(next.adminNotes || '')
    setCharacters(next.characters || [])
  }

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not load this book')
      applyProject(data.project as Project)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this book')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (user?.isAdmin) void load()
  }, [load, user?.isAdmin])

  const saveDetails = async () => {
    setIsSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyline, adminNotes, characters })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not save')
      applyProject(data.project as Project)
      setMessage('Saved. The new story prompt is stored on this order.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setIsSaving(false)
    }
  }

  const startBook = async (force: boolean) => {
    const confirmText = force
      ? 'Remake this book with the story prompt currently in the box? The customer will see a new generation.'
      : 'Start making this book with the story prompt currently in the box?'
    if (!confirm(confirmText)) return
    setIsStarting(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: force ? 'remake' : 'start',
          storyline,
          adminNotes,
          characters
        })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Could not start this book')
      applyProject(data.project as Project)
      setMessage(force
        ? 'Remake started. Open the live book to watch pages come in.'
        : 'Generation started. Open the live book to watch pages come in.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not start this book')
    } finally {
      setIsStarting(false)
    }
  }

  const updateCharacter = (index: number, patch: Partial<CharacterInfo>) => {
    setCharacters((prev) => prev.map((character, i) => (
      i === index ? { ...character, ...patch } : character
    )))
  }

  if (isAuthLoading || (user?.isAdmin && isLoading && !project)) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-pink-500" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <Card className="w-full max-w-md p-8 text-center">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-emerald-600" />
          <h1 className="text-xl font-bold">Admin sign-in required</h1>
          <Button className="mt-6 w-full" onClick={() => openSignIn('Admin access requires sign-in.')}>
            Sign in
          </Button>
        </Card>
      </div>
    )
  }

  if (!user.isAdmin) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <Card className="w-full max-w-md p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-amber-600" />
          <h1 className="text-xl font-bold">Admin access required</h1>
        </Card>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-3xl px-3 py-10">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" /> Back to support
        </Link>
        <Card className="mt-6 p-8 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-rose-500" />
          <h1 className="text-xl font-bold">Could not open this book</h1>
          <p className="mt-2 text-sm text-zinc-500">{error || 'Not found'}</p>
        </Card>
      </div>
    )
  }

  const issues = supportIssues(project)
  const email = customerEmail(project)
  const paid = Boolean(project.payment?.paymentId || project.paidAt || ['paid', 'ready', 'generating', 'starting'].includes(project.status))
  const photosOk = hasSavedPhotos(project)
  const needsStart = Boolean(!project.jobId && paid)
  const coverSrc = project.jobId
    ? `/api/storybook/jobs/${encodeURIComponent(project.jobId)}/images/cover`
    : project.coverUrl
  const ship = shippingLine(project)
  const messageOk = Boolean(message && (message.startsWith('Saved') || message.startsWith('Remake') || message.startsWith('Generation')))

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-3 py-8 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-4 w-4" /> All customer books
        </Link>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button asChild size="sm" className="gap-1.5">
            <Link href={`/projects/${project.id}`} target="_blank">
              <ExternalLink className="h-3.5 w-3.5" />
              Open customer book
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        {coverSrc ? (
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverSrc} alt="" className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Customer book</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-900">
            {project.title || project.story?.title || 'Personalized Storybook'}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {email} · {bookTypeLabel(project)} · {statusLabel(project.status)}
          </p>
          <p className="mt-1 text-xs text-zinc-400">{new Date(project.createdAt).toLocaleString()}</p>
        </div>
      </div>

      {issues.length > 0 && (
        <Card className="border-rose-200/80 bg-rose-50/70 p-4">
          <p className="text-sm font-semibold text-rose-800">Needs attention</p>
          <ul className="mt-2 space-y-2 text-sm text-rose-800">
            {issues.map((issue) => (
              <li key={issue.key}>
                <span className="font-medium">{issue.label}</span>
                {issue.detail ? <span className="mt-0.5 block text-rose-700/90">{issue.detail}</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!photosOk && (
        <Card className="border-amber-200/80 bg-amber-50/70 p-4 text-sm text-amber-900">
          Photos were not saved on this order, so a remake will fail. The customer needs to create the book again with photos.
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Order</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Status</dt>
              <dd className="font-medium text-zinc-800">{statusLabel(project.status)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Product</dt>
              <dd className="font-medium text-zinc-800">{bookTypeLabel(project)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Paid</dt>
              <dd className="font-medium text-zinc-800">{paid ? moneyFromProject(project) : 'No'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Payment</dt>
              <dd className="truncate font-mono text-xs text-zinc-700">{project.payment?.paymentId || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-zinc-500">Pages ready</dt>
              <dd className="font-medium text-zinc-800">{project.imagesDone || 0} / {project.imagesTotal || 12}</dd>
            </div>
            {project.printStatus ? (
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Print</dt>
                <dd className="font-medium text-zinc-800">{project.printStatus}</dd>
              </div>
            ) : null}
          </dl>
          {ship ? <p className="mt-3 text-xs text-zinc-500">Ship to {ship}</p> : null}
        </Card>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">People in the story</p>
          <p className="mt-1 text-xs text-zinc-500">Fix a misspelled name here before you remake.</p>
          <div className="mt-3 space-y-3">
            {characters.length === 0 ? (
              <p className="text-sm text-zinc-500">No character names saved.</p>
            ) : (
              characters.map((character, index) => (
                <div key={index} className="grid grid-cols-[1fr_4.5rem_1fr] gap-2">
                  <Input
                    value={character.name}
                    onChange={(event) => updateCharacter(index, { name: event.target.value })}
                    placeholder={`Character ${index + 1}`}
                  />
                  <Input
                    type="number"
                    min={0}
                    value={character.age || ''}
                    onChange={(event) => updateCharacter(index, { age: Number(event.target.value) || 0 })}
                    placeholder="Age"
                  />
                  <Input
                    value={String(character.relationship || '')}
                    onChange={(event) => updateCharacter(index, { relationship: event.target.value })}
                    placeholder="Relationship"
                  />
                </div>
              ))
            )}
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            {project.uploads?.length || 0} photo{project.uploads?.length === 1 ? '' : 's'} on file
          </p>
        </Card>
      </div>

      <Card className="space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Story prompt</h2>
          <p className="mt-1 text-sm text-zinc-500">
            This is what the customer asked for. Edit it if the story went wrong, then remake the book.
          </p>
        </div>
        <Textarea
          value={storyline}
          onChange={(event) => setStoryline(event.target.value)}
          rows={6}
          className="min-h-[140px] resize-y text-sm"
        />
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-zinc-600">Internal notes (customer never sees this)</label>
          <Input
            value={adminNotes}
            onChange={(event) => setAdminNotes(event.target.value)}
            placeholder="e.g. Mom emailed — face looks off on page 4. Remaking with a clearer prompt."
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void saveDetails()} disabled={isSaving} className="gap-1.5">
            {isSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </Button>
          {needsStart ? (
            <Button onClick={() => void startBook(false)} disabled={isStarting || !photosOk} variant="outline" className="gap-1.5">
              {isStarting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Start book
            </Button>
          ) : (
            <Button onClick={() => void startBook(true)} disabled={isStarting || !photosOk} variant="outline" className="gap-1.5">
              {isStarting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
              Remake book
            </Button>
          )}
        </div>
        {message && (
          <p className={`text-sm ${messageOk ? 'text-emerald-700' : 'text-rose-700'}`}>
            {message}
          </p>
        )}
      </Card>

      {project.story?.pages?.length ? (
        <Card className="p-4 sm:p-6">
          <h2 className="text-base font-semibold text-zinc-900">Written pages</h2>
          <p className="mt-1 text-sm text-zinc-500">Read these to see what went wrong, then fix the prompt above.</p>
          <div className="mt-3 space-y-3">
            {project.story.pages.map((page) => (
              <div key={page.pageNumber} className="rounded-2xl bg-zinc-50 p-3 text-sm">
                <p className="text-xs font-semibold text-zinc-500">Page {page.pageNumber}</p>
                <p className="mt-1 text-zinc-800">{page.story || '—'}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="flex items-center gap-2 text-xs text-zinc-500">
        {project.status === 'ready' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock className="h-4 w-4" />}
        Last updated {new Date(project.updatedAt).toLocaleString()}
      </div>
    </div>
  )
}
