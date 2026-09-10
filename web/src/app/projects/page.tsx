'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  BookOpen,
  Sparkles,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  ExternalLink,
  Truck,
  FileText,
  Share2
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/page-header'
import { useAuthStore } from '@/lib/auth-store'
import type { Project } from '@/types/project'

export default function ProjectsPage () {
  const user = useAuthStore((s) => s.user)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const openSignIn = useAuthStore((s) => s.openSignIn)

  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'ready' | 'generating'>('all')

  const fetchProjects = useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/user/projects', { cache: 'no-store' })
      const data = await res.json()
      if (res.ok && Array.isArray(data.projects)) {
        setProjects(data.projects)
      }
    } catch (err) {
      console.error('Failed to load projects:', err)
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) {
      void fetchProjects()
    } else if (!isAuthLoading) {
      setIsLoading(false)
    }
  }, [user, isAuthLoading, fetchProjects])

  // Periodic refresh if any project is generating
  useEffect(() => {
    const hasGenerating = projects.some((p) => p.status === 'generating' || p.status === 'starting')
    if (!hasGenerating) return

    const timer = setInterval(() => {
      void fetchProjects()
    }, 4000)
    return () => clearInterval(timer)
  }, [projects, fetchProjects])

  if (isAuthLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-pink-500" />
          <p className="text-sm text-zinc-500">Checking your accountâ€¦</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-white">
            <BookOpen className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-800">My Storybooks</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Sign in to access your generated storybooks, download high-res PDFs, and order printed hardcovers.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              className="font-semibold"
              onClick={() => openSignIn('Sign in to view your saved books')}
            >
              Sign in
            </Button>
            <Button asChild variant="outline">
              <Link href="/create">Create a book</Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  const filteredProjects = projects.filter((p) => {
    if (filter === 'ready') return p.status === 'ready'
    if (filter === 'generating') return p.status === 'generating' || p.status === 'starting'
    return true
  })

  return (
    <div className="py-10 sm:py-14">
      <div className="mx-auto max-w-6xl">
        <PageHeader
          align="left"
          size="md"
          eyebrow="My books"
          title={
            <span className="inline-flex flex-wrap items-center gap-3">
              My Storybooks
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
                {projects.length} {projects.length === 1 ? 'book' : 'books'}
              </span>
            </span>
          }
          subtitle="Manage your personal storybooks, interactive flipbooks, and print orders."
          actions={
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchProjects()}
                disabled={isLoading}
                className="gap-1.5 bg-white/80 text-xs font-medium"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button asChild size="sm" className="gap-1.5 text-xs font-semibold">
                <Link href="/create">
                  <Plus className="h-4 w-4" />
                  Create new book
                </Link>
              </Button>
            </>
          }
          className="border-b border-zinc-200/70 pb-6"
        />

        {/* Filter pills */}
        <div className="flex items-center gap-2 pb-4 pt-6">
          {([
            { key: 'all', label: 'All', count: projects.length },
            { key: 'ready', label: 'Ready', count: projects.filter((p) => p.status === 'ready').length },
            { key: 'generating', label: 'Generating', count: projects.filter((p) => p.status === 'generating' || p.status === 'starting').length }
          ] as const).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                filter === f.key
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'bg-white/80 text-zinc-600 ring-1 ring-zinc-200/70 hover:bg-white hover:text-zinc-900'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {isLoading && projects.length === 0 && (
          <div className="grid gap-6 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <Card key={n} className="animate-pulse space-y-4 p-5">
                <div className="aspect-[4/3] rounded-2xl bg-zinc-200" />
                <div className="h-5 w-2/3 rounded bg-zinc-200" />
                <div className="h-4 w-1/2 rounded bg-zinc-100" />
              </Card>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filteredProjects.length === 0 && (
          <div className="mt-6 rounded-3xl border border-dashed border-zinc-300 bg-white/60 p-12 text-center">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-pink-500 text-white">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold tracking-tight text-zinc-900">
              {filter === 'all' ? 'No storybooks yet' : `No ${filter} storybooks`}
            </h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
              Upload a photo and let our AI generate a personalized, cinematic storybook in minutes.
            </p>
            <div className="mt-6">
              <Button asChild className="font-semibold">
                <Link href="/create">Create your first book</Link>
              </Button>
            </div>
          </div>
        )}

        {/* Project grid */}
        <div className="grid gap-6 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProjects.map((project) => {
            const isGenerating = project.status === 'generating' || project.status === 'starting'
            const isReady = project.status === 'ready'
            const isHardcover = project.outputType === 'LULU_BOOK'
            const coverImage =
              project.coverUrl ||
              project.images?.cover?.url ||
              project.images?.page_1?.url ||
              null

            const progressPct =
              project.imagesTotal && project.imagesTotal > 0
                ? Math.round(((project.imagesDone || 0) / project.imagesTotal) * 100)
                : isGenerating
                  ? 25
                  : 100

            return (
              <Card
                key={project.id}
                className="flex flex-col overflow-hidden transition-shadow hover:shadow-[0_20px_60px_rgba(10,10,15,0.10)]"
              >
                {/* Book cover / thumbnail */}
                <div className="relative aspect-[16/11] overflow-hidden border-b border-zinc-100 bg-gradient-to-br from-zinc-100 to-zinc-200">
                  <CoverThumb
                    src={coverImage}
                    alt={project.title || 'Storybook cover'}
                    fallbackText={project.storyline || 'Custom Storybook'}
                  />

                  {/* Status Badge */}
                  <div className="absolute top-3 right-3">
                    {isReady && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 backdrop-blur px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
                        <CheckCircle2 className="h-3 w-3" /> Ready
                      </span>
                    )}
                    {isGenerating && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 backdrop-blur px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm animate-pulse">
                        <Clock className="h-3 w-3 animate-spin" /> {progressPct}% Done
                      </span>
                    )}
                    {project.status === 'awaiting_payment' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/90 backdrop-blur px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
                        Pending Pay
                      </span>
                    )}
                    {project.status === 'failed' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/90 backdrop-blur px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
                        <AlertCircle className="h-3 w-3" /> Failed
                      </span>
                    )}
                  </div>

                  {/* Book Type Badge */}
                  <div className="absolute bottom-3 left-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2.5 py-0.5 text-[10px] font-medium text-white">
                      {isHardcover ? <Truck className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                      {isHardcover ? 'Lulu Hardcover' : 'Digital Edition'}
                    </span>
                  </div>
                </div>

                {/* Card Content */}
                <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="font-semibold text-zinc-900 text-base line-clamp-1">
                      {project.title || project.story?.title || 'Personalized Storybook'}
                    </h3>
                    <p className="mt-1 text-xs text-zinc-500 line-clamp-2">
                      {project.storyline || 'An exciting personalized tale tailored with AI.'}
                    </p>

                    {/* Characters & Date Info */}
                    <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
                      <span>
                        {project.characters?.length || project.numCharacters || 1}{' '}
                        {(project.characters?.length || 1) === 1 ? 'character' : 'characters'}
                      </span>
                      <span>
                        {new Date(project.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </div>

                    {/* Live Progress Bar for generating jobs */}
                    {isGenerating && (
                      <div className="mt-3 space-y-1">
                        <div className="flex justify-between text-[11px] text-zinc-500">
                          <span className="truncate">{project.stage || 'Rendering pages...'}</span>
                          <span>{project.imagesDone || 0} / {project.imagesTotal || 12} imgs</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-500"
                            style={{ width: `${Math.max(8, progressPct)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-2 border-t border-zinc-100 flex items-center gap-2">
                    {isReady && (
                      <>
                        <Button
                          asChild
                          size="sm"
                          className="h-8 flex-1 text-xs font-semibold"
                        >
                          <Link href={`/projects/${project.id}`}>
                            <BookOpen className="mr-1 h-3.5 w-3.5" />
                            Read flipbook
                          </Link>
                        </Button>

                        {project.artifacts?.pdf?.url && (
                          <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs text-zinc-700"
                            title="Download PDF"
                          >
                            <a href={project.artifacts.pdf.url} target="_blank" rel="noopener noreferrer">
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                      </>
                    )}

                    {isGenerating && (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-8 w-full text-xs font-semibold"
                      >
                        <Link href={`/projects/${project.id}`}>
                          <Sparkles className="mr-1 h-3.5 w-3.5 animate-spin" />
                          View live progress
                        </Link>
                      </Button>
                    )}

                    {project.status === 'awaiting_payment' && (
                      <Button
                        asChild
                        size="sm"
                        className="h-8 w-full bg-none bg-amber-500 text-xs font-semibold text-white hover:bg-amber-600"
                      >
                        <Link href={`/checkout`}>Complete payment</Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

type CoverThumbProps = {
  src: string | null
  alt: string
  fallbackText: string
}

/** Cover image with a text placeholder when there is no cover or it fails to load (outputs gone). */
function CoverThumb ({ src, alt, fallbackText }: CoverThumbProps) {
  const [hasError, setHasError] = useState(false)
  useEffect(() => { setHasError(false) }, [src])

  if (!src || hasError) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
        <BookOpen className="h-10 w-10 text-zinc-400 mb-2" />
        <p className="text-xs text-zinc-500 line-clamp-2">{fallbackText}</p>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
      onError={() => setHasError(true)}
    />
  )
}
