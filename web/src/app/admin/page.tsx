'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowDownUp,
  BookOpen,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
  X
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Eyebrow } from '@/components/page-header'
import { useAuthStore } from '@/lib/auth-store'
import {
  bookTypeLabel,
  characterNames,
  customerEmail,
  formatMoney,
  looksLikeCustomerLookup,
  matchesSupportSearch,
  moneyFromProject,
  sortSupportBooks,
  statusLabel,
  supportIssues,
  type SupportSort
} from '@/lib/admin-support'
import type { Project } from '@/types/project'

type TabType = 'attention' | 'books' | 'orders'

function StatusPill ({ project }: { project: Project }) {
  const issues = supportIssues(project)
  if (issues.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200/70">
        <AlertCircle className="h-3 w-3" />
        {issues[0].label}
      </span>
    )
  }
  if (project.status === 'ready') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
        <CheckCircle2 className="h-3 w-3" /> Ready
      </span>
    )
  }
  if (project.status === 'generating' || project.status === 'starting') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/70">
        <Clock className="h-3 w-3" /> {statusLabel(project.status)}
      </span>
    )
  }
  if (project.status === 'awaiting_payment') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-600 ring-1 ring-zinc-200/70">
        Waiting for payment
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-600">
      {statusLabel(project.status)}
    </span>
  )
}

function BookActions ({ project }: { project: Project }) {
  return (
    <div className="flex justify-end gap-2">
      <Button asChild variant="outline" size="sm" className="h-7 px-2 text-[11px]">
        <Link href={`/admin/books/${project.id}`}>
          Open case
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-[11px]">
        <Link href={`/projects/${project.id}`} target="_blank">
          <ExternalLink className="mr-1 h-3 w-3" />
          Live book
        </Link>
      </Button>
    </div>
  )
}

export default function AdminPage () {
  const user = useAuthStore((s) => s.user)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const openSignIn = useAuthStore((s) => s.openSignIn)

  const [activeTab, setActiveTab] = useState<TabType>('attention')
  const [recentBooks, setRecentBooks] = useState<Project[]>([])
  const [searchHits, setSearchHits] = useState<Project[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState<SupportSort>('issues')
  const [urlReady, setUrlReady] = useState(false)

  const fetchRecent = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/jobs', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setRecentBooks(data.jobs || [])
    } catch (err) {
      console.error('Failed to fetch customer books:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const runCustomerSearch = useCallback(async (query: string) => {
    if (!looksLikeCustomerLookup(query)) {
      setSearchHits(null)
      return
    }
    setIsSearching(true)
    try {
      const res = await fetch(`/api/admin/jobs?q=${encodeURIComponent(query)}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setSearchHits(data.jobs || [])
    } catch (err) {
      console.error('Failed to search customer books:', err)
    } finally {
      setIsSearching(false)
    }
  }, [])

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q') || ''
    if (initial) setSearchQuery(initial)
    setUrlReady(true)
  }, [])

  useEffect(() => {
    if (!user?.isAdmin) return
    void fetchRecent()
  }, [fetchRecent, user?.isAdmin])

  useEffect(() => {
    if (!urlReady) return
    const url = new URL(window.location.href)
    if (searchQuery.trim()) url.searchParams.set('q', searchQuery.trim())
    else url.searchParams.delete('q')
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
  }, [searchQuery, urlReady])

  useEffect(() => {
    if (!user?.isAdmin) return
    const query = searchQuery.trim()
    if (!query) {
      setSearchHits(null)
      return
    }
    const timer = window.setTimeout(() => {
      void runCustomerSearch(query)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [runCustomerSearch, searchQuery, user?.isAdmin])

  const books = searchHits ?? recentBooks

  const filtered = useMemo(
    () => sortSupportBooks(
      books.filter((book) => matchesSupportSearch(book, searchQuery)),
      sort
    ),
    [books, searchQuery, sort]
  )

  const attention = useMemo(
    () => sortSupportBooks(
      filtered.filter((book) => supportIssues(book).length > 0),
      sort
    ),
    [filtered, sort]
  )

  const orders = useMemo(
    () => sortSupportBooks(
      filtered.filter((book) => Boolean(book.payment?.orderId || book.payment?.paymentId)),
      sort
    ),
    [filtered, sort]
  )

  const focusCustomer = (email: string) => {
    if (!email || email === 'No email') return
    setSearchQuery(email)
    setSort('issues')
    setActiveTab('books')
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchHits(null)
  }

  const stats = useMemo(() => {
    let revenueMinor = 0
    let currency = 'INR'
    let generating = 0
    let ready = 0
    let failed = 0
    for (const book of recentBooks) {
      if (book.status === 'generating' || book.status === 'starting') generating++
      if (book.status === 'ready') ready++
      if (book.status === 'failed') failed++
      if (book.payment?.status === 'captured') {
        revenueMinor += Number(book.payment.amountMinor || book.amounts?.totalMinor || 0)
        if (book.payment.currency) currency = book.payment.currency
      }
    }
    return {
      revenue: formatMoney(revenueMinor, currency),
      generating,
      ready,
      failed,
      attention: recentBooks.filter((book) => supportIssues(book).length > 0).length
    }
  }, [recentBooks])

  if (isAuthLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-pink-500" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-white">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-800">Support desk</h1>
          <p className="mt-2 text-sm text-zinc-500">Sign in with an admin account to help customers.</p>
          <Button className="mt-6 w-full font-semibold" onClick={() => openSignIn('Admin access requires sign-in.')}>
            Sign in
          </Button>
        </Card>
      </div>
    )
  }

  if (!user.isAdmin) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-800">Admin access required</h1>
          <p className="mt-2 text-sm text-zinc-500">
            <span className="font-medium text-zinc-700">{user.email}</span> is not on the admin list.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/projects">Go to my books</Link>
          </Button>
        </Card>
      </div>
    )
  }

  const rows = activeTab === 'attention' ? attention : activeTab === 'orders' ? orders : filtered

  return (
    <div className="py-10 sm:py-14">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex flex-col gap-4 border-b border-zinc-200/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col items-start gap-3">
            <Eyebrow tone="emerald">Support</Eyebrow>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-800 sm:text-3xl">
              Customer books
            </h1>
            <p className="max-w-xl text-sm text-zinc-500">
              Paste a customer email, payment id, or book title. Click their email in the list to see only that person.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void fetchRecent()
              if (searchQuery.trim()) void runCustomerSearch(searchQuery)
            }}
            disabled={isLoading || isSearching}
            className="h-9 gap-1.5 bg-white/80 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading || isSearching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-zinc-500">Needs you</CardTitle>
              <AlertCircle className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">{stats.attention}</div>
              <p className="mt-1 text-[11px] text-zinc-500">Failed, stuck, or running too long</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-zinc-500">Books sold</CardTitle>
              <BookOpen className="h-4 w-4 text-violet-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-900">{stats.ready}</div>
              <p className="mt-1 text-[11px] text-zinc-500">{recentBooks.length} total in the recent list</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-zinc-500">Making now</CardTitle>
              <Clock className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{stats.generating}</div>
              <p className="mt-1 text-[11px] text-zinc-500">{stats.failed} failed</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-zinc-500">Revenue captured</CardTitle>
              <DollarSign className="h-4 w-4 text-emerald-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{stats.revenue}</div>
              <p className="mt-1 text-[11px] text-zinc-500">From paid orders in this list</p>
            </CardContent>
          </Card>
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void runCustomerSearch(searchQuery)
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <Input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Customer email, payment id, character name, or book title…"
                className="h-11 pl-10 pr-10 text-sm"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-700"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <label className="flex h-11 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-600 shadow-sm">
              <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span className="shrink-0">Sort</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SupportSort)}
                className="min-w-0 flex-1 bg-transparent font-medium text-zinc-800 outline-none"
              >
                <option value="issues">Issues first</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="customer">Customer A–Z</option>
              </select>
            </label>
          </div>
          {searchQuery.trim() ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600">
              <span className="rounded-full bg-violet-50 px-3 py-1 font-medium text-violet-800">
                {filtered.length} book{filtered.length === 1 ? '' : 's'} for this search
                {attention.length ? ` · ${attention.length} need you` : ''}
              </span>
              {isSearching ? <span className="text-zinc-500">Looking up older orders…</span> : null}
              <button type="button" onClick={clearSearch} className="font-medium text-zinc-500 hover:text-zinc-800">
                Show everyone
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Click a customer email to jump straight to their books.</p>
          )}
        </form>

        <div className="flex flex-wrap gap-2 border-b border-zinc-200/70 pb-3">
          {([
            { id: 'attention' as const, label: `Needs attention (${attention.length})`, icon: AlertCircle },
            { id: 'books' as const, label: `All books (${filtered.length})`, icon: BookOpen },
            { id: 'orders' as const, label: `Orders (${orders.length})`, icon: CreditCard }
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'bg-white/80 text-zinc-600 ring-1 ring-zinc-200/70 hover:bg-white hover:text-zinc-900'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white shadow-[0_16px_50px_rgba(10,10,15,0.07)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-700">
              <thead className="border-b border-zinc-200/70 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="p-3.5">
                    <button
                      type="button"
                      onClick={() => setSort('customer')}
                      className={`inline-flex items-center gap-1 ${sort === 'customer' ? 'text-zinc-800' : 'hover:text-zinc-800'}`}
                    >
                      Customer
                    </button>
                  </th>
                  <th className="p-3.5">Book</th>
                  <th className="p-3.5">
                    {activeTab === 'orders' ? 'Payment' : (
                      <button
                        type="button"
                        onClick={() => setSort('issues')}
                        className={`inline-flex items-center gap-1 ${sort === 'issues' ? 'text-zinc-800' : 'hover:text-zinc-800'}`}
                      >
                        What happened
                      </button>
                    )}
                  </th>
                  <th className="p-3.5">Product</th>
                  <th className="p-3.5">
                    <button
                      type="button"
                      onClick={() => setSort(sort === 'newest' ? 'oldest' : 'newest')}
                      className={`inline-flex items-center gap-1 ${sort === 'newest' || sort === 'oldest' ? 'text-zinc-800' : 'hover:text-zinc-800'}`}
                    >
                      When {sort === 'oldest' ? '↑' : sort === 'newest' ? '↓' : ''}
                    </button>
                  </th>
                  <th className="p-3.5 text-right">Fix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {isLoading && books.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-500">Loading customer books…</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-zinc-500">
                      {activeTab === 'attention' && searchQuery && filtered.length > 0 ? (
                        <div className="space-y-2">
                          <p>This search has {filtered.length} book{filtered.length === 1 ? '' : 's'}, and none need attention.</p>
                          <button
                            type="button"
                            onClick={() => setActiveTab('books')}
                            className="font-medium text-violet-700 hover:underline"
                          >
                            See all their books
                          </button>
                        </div>
                      ) : activeTab === 'attention' && !searchQuery
                        ? 'No customer books need you right now.'
                        : 'No books match that search. Try the exact email or payment id.'}
                    </td>
                  </tr>
                ) : (
                  rows.map((book) => {
                    const issues = supportIssues(book)
                    const names = characterNames(book)
                    return (
                      <tr key={book.id} className="transition hover:bg-zinc-50">
                        <td className="p-3.5">
                          <button
                            type="button"
                            onClick={() => focusCustomer(customerEmail(book))}
                            className="text-left font-medium text-zinc-800 hover:text-violet-700 hover:underline"
                            title="Show only this customer"
                          >
                            {customerEmail(book)}
                          </button>
                          {names ? <p className="mt-0.5 text-[11px] text-zinc-500">{names}</p> : null}
                        </td>
                        <td className="max-w-[220px] p-3.5">
                          <p className="truncate font-medium text-zinc-800">
                            {book.title || book.story?.title || 'Personalized Storybook'}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-zinc-500">{book.storyline || '—'}</p>
                        </td>
                        <td className="max-w-[240px] p-3.5">
                          {activeTab === 'orders' ? (
                            <div>
                              <p className="font-semibold text-zinc-800">{moneyFromProject(book)}</p>
                              <p className="truncate font-mono text-[10px] text-zinc-500">
                                {book.payment?.paymentId || book.payment?.orderId || '—'}
                              </p>
                            </div>
                          ) : issues.length > 0 ? (
                            <div>
                              <StatusPill project={book} />
                              {issues[0].detail ? (
                                <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{issues[0].detail}</p>
                              ) : null}
                            </div>
                          ) : (
                            <StatusPill project={book} />
                          )}
                        </td>
                        <td className="p-3.5 text-zinc-600">{bookTypeLabel(book)}</td>
                        <td className="p-3.5 text-zinc-500">
                          {new Date(book.createdAt || Date.now()).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>
                        <td className="p-3.5 text-right">
                          <BookActions project={book} />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
