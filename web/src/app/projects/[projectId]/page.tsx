'use client'

import { useEffect, useState, useCallback, use, useRef } from 'react'
import Link from 'next/link'
import {
  BookOpen,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Share2,
  Truck
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  GeneratingPreview,
  ProjectGeneratingStatus,
  ShimmerBlock
} from '@/components/project-generating-status'
import { friendlyStageLabel } from '@/lib/generation-status'
import { useAuthStore } from '@/lib/auth-store'
import { cn } from '@/lib/utils'
import type { Project } from '@/types/project'

function resolveMedia (jobId: string | null | undefined, url: string | null | undefined) {
  if (!url) return null
  if (url.startsWith('/jobs/')) return `/api/storybook${url}`
  if (url.startsWith('https://img2x.com/api/storybook/')) {
    return url.replace('https://img2x.com', '')
  }
  if (!url.startsWith('http') && !url.startsWith('/') && jobId) {
    return `/api/storybook/jobs/${jobId}/images/${url}`
  }
  return url
}

export default function ProjectDetailsPage ({
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
  const [selectedPage, setSelectedPage] = useState<number>(1)
  const [copied, setCopied] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [needsPhotos, setNeedsPhotos] = useState(false)
  const autoStartRef = useRef(false)

  const fetchProject = useCallback(async () => {
    try {
      // Fast path: the project record (refreshed with live job progress server-side).
      const single = await fetch(`/api/user/projects/${encodeURIComponent(projectId)}`, { cache: 'no-store' })
      if (single.ok) {
        const data = await single.json()
        if (data?.project) {
          setProject(data.project as Project)
          setError(null)
          return
        }
      }
      if (single.status === 403) {
        setError('This storybook belongs to another account.')
        return
      }

      const res = await fetch(`/api/user/projects`, { cache: 'no-store' })
      const data = await res.json()
      if (res.ok && Array.isArray(data.projects)) {
        const found = data.projects.find((p: Project) => p.id === projectId || p.jobId === projectId)
        if (found) {
          setProject(found)
          setError(null)
          return
        }
      }
      // If not found in user list, attempt fetching job status directly
      const jobRes = await fetch(`/api/storybook/jobs/${projectId}`, { cache: 'no-store' })
      const jobData = await jobRes.json()
      if (jobRes.ok) {
        setProject((prev) => ({
          ...(prev || ({} as Project)),
          id: projectId,
          jobId: projectId,
          status: jobData.status === 'succeeded' ? 'ready' : (jobData.status || 'generating'),
          stage: jobData.stage,
          story: jobData.story,
          images: jobData.images || {},
          imagesDone: jobData.images_done,
          imagesTotal: jobData.images_total,
          artifacts: jobData.artifacts || {},
          outputType: jobData.output_type || 'DIGI_BOOK',
          createdAt: jobData.created_at ? jobData.created_at * 1000 : Date.now(),
          updatedAt: Date.now()
        }))
        setError(null)
      } else {
        setError('Storybook not found')
      }
    } catch (err) {
      console.error('Failed to fetch project details:', err)
      setError('Could not load storybook details')
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void fetchProject()
  }, [fetchProject])

  const startGeneration = useCallback(async (files?: FileList | null) => {
    setIsStarting(true)
    setStartError(null)
    try {
      if (files && files.length > 0) {
        const form = new FormData()
        Array.from(files).slice(0, 4).forEach((file) => form.append('images', file))
        const uploadRes = await fetch(`/api/user/projects/${encodeURIComponent(projectId)}/uploads`, {
          method: 'POST',
          body: form
        })
        const uploadData = await uploadRes.json().catch(() => ({}))
        if (!uploadRes.ok) throw new Error(uploadData?.error || 'Could not save photos')
      }

      const startRes = await fetch(`/api/user/projects/${encodeURIComponent(projectId)}/start`, {
        method: 'POST'
      })
      const startData = await startRes.json().catch(() => ({}))
      if (!startRes.ok) {
        setNeedsPhotos(Boolean(startData?.needsPhotos))
        throw new Error(startData?.error || 'Could not start generation')
      }
      setNeedsPhotos(false)
      await fetchProject()
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Could not start generation')
    } finally {
      setIsStarting(false)
    }
  }, [fetchProject, projectId])

  // Polling while generating
  useEffect(() => {
    if (!project) return
    const generating = project.status === 'generating' || project.status === 'starting'
    if (!generating) return

    const interval = setInterval(() => {
      void fetchProject()
    }, 2000)
    return () => clearInterval(interval)
  }, [project, fetchProject])

  const lastReadyCount = useRef(0)
  useEffect(() => {
    if (!project) return
    const generating = project.status === 'generating' || project.status === 'starting'
    if (!generating) return
    const readyKeys = Object.entries(project.images || {}).filter(([, img]) => Boolean(img?.url))
    if (readyKeys.length <= lastReadyCount.current) return
    lastReadyCount.current = readyKeys.length
    const pagesReady = readyKeys
      .map(([key]) => key)
      .filter((key) => key.startsWith('page_'))
      .map((key) => Number(key.slice(5)))
      .filter((n) => Number.isFinite(n))
    if (pagesReady.length > 0) {
      setSelectedPage(Math.max(...pagesReady))
      return
    }
    if (project.images?.cover?.url) setSelectedPage(0)
  }, [project])

  useEffect(() => {
    if (!project || isStarting || autoStartRef.current) return
    if (project.status !== 'paid' || project.jobId) return
    autoStartRef.current = true
    void startGeneration()
  }, [isStarting, project, startGeneration])

  const handleShare = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  if (isLoading && !project) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-pink-500" />
          <p className="text-sm text-zinc-500">Loading your storybook…</p>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-800">Storybook not found</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {error || "We couldn't locate this storybook. It may still be generating or the link is incorrect."}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild variant="outline">
              <Link href="/projects">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to my books
              </Link>
            </Button>
            <Button onClick={() => void fetchProject()} className="font-semibold">
              Try again
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const isGenerating = project.status === 'generating' || project.status === 'starting'
  const isReady = project.status === 'ready'
  const isFailed = project.status === 'failed'
  const isPaidStuck = project.status === 'paid' && !project.jobId
  const isHardcover = project.outputType === 'LULU_BOOK'

  const pages = project.story?.pages || []
  const activePage = pages.find((p) => p.pageNumber === selectedPage) || pages[0]
  const activePageImage = resolveMedia(
    project.jobId,
    project.images?.[`page_${activePage?.pageNumber || selectedPage}`]?.url
  )
  const coverImage = resolveMedia(project.jobId, project.coverUrl || project.images?.cover?.url)

  const flipbookUrl =
    project.artifacts?.html?.url ||
    (project.jobId ? `/api/storybook/jobs/${project.jobId}/storybook.html` : null)

  return (
    <div className="px-0 py-3 sm:py-12">
      <div className="mx-auto max-w-6xl">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between gap-3 pb-3 sm:pb-6">
          <Link
            href="/projects"
            className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-zinc-500 transition hover:text-zinc-900"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Back to my storybooks</span>
          </Link>

          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            className="h-8 shrink-0 gap-1.5 bg-white/80 px-3 text-xs text-zinc-700"
          >
            <Share2 className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Share'}
          </Button>
        </div>

        {/* Header */}
        <Card className="mb-3 p-3 sm:mb-8 sm:p-8">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center lg:gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {isReady && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                  </span>
                )}
                {isGenerating && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                    <Clock className="h-3.5 w-3.5 animate-spin" />
                    {friendlyStageLabel(project.stage)}
                  </span>
                )}
                {isFailed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200/70">
                    <AlertCircle className="h-3.5 w-3.5" /> Generation failed
                  </span>
                )}
                {isPaidStuck && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200/70">
                    <Clock className="h-3.5 w-3.5" /> Payment received
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200/70">
                  {isHardcover ? 'Hardcover edition' : 'Digital edition'}
                </span>
              </div>

              <h1 className="break-words text-xl font-bold tracking-tight text-zinc-800 sm:text-3xl">
                {project.title || project.story?.title || 'Personalized Storybook'}
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-zinc-500">
                {project.storyline || 'A custom cinematic storybook generated with AI face preservation.'}
              </p>
              {isFailed && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm text-rose-800">
                  <span>{project.error?.message || 'Something went wrong while generating this book.'}</span>
                  <Button asChild size="sm" variant="outline" className="h-8 border-rose-300 bg-white text-rose-800 hover:bg-rose-100">
                    <Link href="/#create">Create another storybook</Link>
                  </Button>
                </div>
              )}
              {isPaidStuck && (
                <div className="mt-3 space-y-3 rounded-2xl border border-zinc-200/70 bg-zinc-50 px-4 py-4 text-sm text-zinc-700">
                  <p>
                    Payment went through, but we still need the photos to create this storybook.
                    Upload them once and generation starts immediately.
                  </p>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-zinc-500">Photos (1–4)</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={isStarting}
                      onChange={(event) => {
                        void startGeneration(event.target.files)
                      }}
                      className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                    />
                  </label>
                  {startError && <p className="text-sm text-red-600">{startError}</p>}
                  {isStarting && <p className="text-xs text-zinc-500">Saving photos and starting your book…</p>}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2.5">
              {isReady && flipbookUrl && (
                <Button asChild className="font-semibold">
                  <a href={flipbookUrl} target="_blank" rel="noopener noreferrer">
                    <BookOpen className="mr-1.5 h-4 w-4" />
                    Open flipbook
                  </a>
                </Button>
              )}

              {project.artifacts?.pdf?.url && (
                <Button asChild variant="outline" className="bg-white/80">
                  <a href={project.artifacts.pdf.url} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-1.5 h-4 w-4" />
                    Download PDF
                  </a>
                </Button>
              )}
            </div>
          </div>

          {isGenerating && (
            <ProjectGeneratingStatus
              stage={project.stage}
              imagesDone={project.imagesDone || 0}
              imagesTotal={project.imagesTotal || 12}
              startedAt={project.startedAt || project.paidAt || project.createdAt}
            />
          )}
        </Card>

        {/* Page viewer: image first on phones, filmstrip beside on desktop */}
        <div className="grid gap-3 lg:grid-cols-12 lg:gap-8">
          <div className="order-2 space-y-2 lg:order-1 lg:col-span-4">
            <h2 className="text-xs font-medium uppercase tracking-widest text-zinc-500">
              Pages &amp; scenes
            </h2>

            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [-webkit-overflow-scrolling:touch] lg:max-h-[70vh] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
              <button
                type="button"
                onClick={() => setSelectedPage(0)}
                className={cn(
                  'flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-1.5 text-left transition sm:w-28 sm:gap-2 sm:p-2 lg:w-full lg:flex-row lg:p-3',
                  selectedPage === 0
                    ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/20'
                    : 'border-zinc-200/70 bg-white hover:border-violet-300'
                )}
              >
                <div className="relative h-16 w-full shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 sm:h-20 lg:h-14 lg:w-14">
                  {coverImage ? (
                    <img src={coverImage} alt="Cover" className="h-full w-full object-cover" />
                  ) : isGenerating ? (
                    <ShimmerBlock className="h-full w-full" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-bold text-zinc-400">
                      COVER
                    </div>
                  )}
                </div>
                <div className="min-w-0 w-full">
                  <p className="truncate text-center text-[11px] font-semibold text-zinc-900 sm:text-xs lg:text-left">Cover</p>
                  <p className="truncate text-center text-[10px] text-zinc-500 sm:text-[11px] lg:text-left">
                    {coverImage ? 'Ready' : isGenerating ? 'Painting' : 'Title art'}
                  </p>
                </div>
              </button>

              {(pages.length > 0
                ? pages
                : Array.from({ length: 10 }, (_, i) => ({ pageNumber: i + 1, story: '' }))
              ).map((p) => {
                const pageNum = p.pageNumber
                const isSelected = selectedPage === pageNum
                const pageImg = resolveMedia(project.jobId, project.images?.[`page_${pageNum}`]?.url)

                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setSelectedPage(pageNum)}
                    className={cn(
                      'flex w-[4.75rem] shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-1.5 text-left transition sm:w-28 sm:gap-2 sm:p-2 lg:w-full lg:flex-row lg:p-2.5',
                      isSelected
                        ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/20'
                        : 'border-zinc-200/70 bg-white hover:border-violet-300'
                    )}
                  >
                    <div className="relative h-16 w-full shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 sm:h-20 lg:h-12 lg:w-12">
                      {pageImg ? (
                        <img src={pageImg} alt={`Page ${pageNum}`} className="h-full w-full object-cover" />
                      ) : isGenerating ? (
                        <ShimmerBlock className="h-full w-full" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[11px] font-bold text-zinc-400">
                          {pageNum}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 w-full">
                      <p className="text-center text-[11px] font-semibold text-zinc-900 sm:text-xs lg:text-left">Page {pageNum}</p>
                      <p className="mt-0.5 line-clamp-1 text-center text-[10px] text-zinc-500 sm:text-[11px] lg:text-left">
                        {pageImg ? 'Ready' : isGenerating ? 'Painting' : (p.story || `Scene ${pageNum}`)}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="order-1 lg:order-2 lg:col-span-8">
            <Card className="p-3 sm:p-6">
              <div className="mb-3 flex items-center justify-between gap-2 border-b border-zinc-100 pb-3 sm:mb-6 sm:pb-4">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-xs font-bold text-white">
                    {selectedPage === 0 ? 'C' : selectedPage}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold tracking-tight text-zinc-900">
                      {selectedPage === 0 ? 'Book cover' : `Page ${selectedPage}`}
                    </h3>
                    <p className="truncate text-xs text-zinc-500">
                      {selectedPage === 0 ? 'Title art' : isGenerating && !activePageImage ? 'Painting this scene now' : 'Scene and story'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedPage <= 0}
                    onClick={() => setSelectedPage((prev) => Math.max(0, prev - 1))}
                    className="h-8 px-2.5 text-xs"
                  >
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedPage >= pages.length}
                    onClick={() => setSelectedPage((prev) => Math.min(pages.length, prev + 1))}
                    className="h-8 px-2.5 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 md:gap-6">
                {selectedPage === 0 ? (
                  coverImage ? (
                    <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200">
                      <img src={coverImage} alt="Cover" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <GeneratingPreview
                      title="Painting the cover"
                      subtitle="This scene is rendering with every other page at the same time."
                    />
                  )
                ) : activePageImage ? (
                  <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-100 ring-1 ring-zinc-200">
                    <img
                      src={activePageImage}
                      alt={`Page ${selectedPage}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <GeneratingPreview
                    title={`Painting page ${selectedPage}`}
                    subtitle="All remaining scenes are rendering together, not waiting in batches of 6."
                  />
                )}

                {/* Narrative Text Content */}
                <div className="flex flex-col justify-between space-y-4">
                  <div className="space-y-3">
                    <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-50 to-pink-50 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-violet-600">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />
                      {selectedPage === 0 ? 'Cover synopsis' : `Page ${selectedPage} story`}
                    </span>

                    <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50/80 p-4">
                      {selectedPage === 0 ? (
                        <p className="text-sm leading-relaxed text-zinc-800">
                          {project.story?.coverText || project.storyline || 'Personalized AI storybook created with your character photos.'}
                        </p>
                      ) : activePage?.story ? (
                        <p className="text-sm leading-relaxed text-zinc-800">{activePage.story}</p>
                      ) : isGenerating ? (
                        <div className="space-y-2">
                          <ShimmerBlock className="h-3 w-full rounded-full" />
                          <ShimmerBlock className="h-3 w-5/6 rounded-full" />
                          <ShimmerBlock className="h-3 w-4/6 rounded-full" />
                          <p className="pt-1 text-xs text-zinc-500">Story text appears as soon as writing finishes.</p>
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed text-zinc-800">
                          The magical adventure unfolds with your character facing extraordinary encounters.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Lulu Hardcover Print CTA for digital books */}
                  {!isHardcover && !isGenerating && (
                    <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-teal-50/40 p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900">
                        <Truck className="h-4 w-4 text-emerald-600" />
                        Order as a printed hardcover
                      </div>
                      <p className="mt-1 text-[11px] text-zinc-600">
                        Delivered as a keepsake 8.5×8.5" casebound hardcover book.
                      </p>
                      <Button asChild size="sm" className="mt-3 h-8 w-full bg-gradient-to-r from-emerald-600 to-cyan-600 text-xs font-semibold text-white hover:from-emerald-700 hover:to-cyan-700">
                        <Link href="/checkout">Order hardcover print</Link>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
