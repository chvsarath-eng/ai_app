'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ShieldCheck,
  TrendingUp,
  BookOpen,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Cpu,
  Layers,
  Settings,
  CreditCard,
  Trash2,
  ExternalLink,
  Sparkles,
  Truck
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Eyebrow } from '@/components/page-header'
import { useAuthStore } from '@/lib/auth-store'

type TabType = 'overview' | 'jobs' | 'orders' | 'ai-models'

// Map any alias/snapshot the story service reports (e.g. "gpt-image-2.5-sunburst-vip",
// "gpt-image-2.5-flare") onto the option IDs shown in the model picker.
function canonicalModelId (model: string): string {
  const m = model.toLowerCase()
  if (m.includes('sunburst')) return 'gpt-image-2.5-sunburst-2026-09-08'
  if (m.includes('flare')) return 'gpt-image-2.5-flare-2026-09-08'
  if (m.includes('gemini')) return 'gemini-3-pro-image-preview'
  return model
}

export default function AdminPage () {
  const user = useAuthStore((s) => s.user)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const openSignIn = useAuthStore((s) => s.openSignIn)

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [stats, setStats] = useState<any>(null)
  const [jobs, setJobs] = useState<any[]>([])
  const [settings, setSettings] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModel, setSelectedModel] = useState('gpt-image-2.5-sunburst-2026-09-08')
  const [savedOverrideModel, setSavedOverrideModel] = useState<string>('')
  const [isSavingModel, setIsSavingModel] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)

  const fetchAdminData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [overviewRes, jobsRes, settingsRes, appSettingsRes] = await Promise.all([
        fetch('/api/admin/overview', { cache: 'no-store' }),
        fetch('/api/admin/jobs', { cache: 'no-store' }),
        fetch('/api/admin/settings', { cache: 'no-store' }),
        fetch('/api/admin/app-settings', { cache: 'no-store' })
      ])

      let overrideModel = ''
      if (appSettingsRes.ok) {
        const data = await appSettingsRes.json()
        overrideModel = data?.settings?.images?.model || ''
        setSavedOverrideModel(overrideModel)
      }

      if (overviewRes.ok) {
        const data = await overviewRes.json()
        setStats(data.stats)
      }
      if (jobsRes.ok) {
        const data = await jobsRes.json()
        setJobs(data.jobs || [])
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        setSettings(data.settings)
        // Show the override if one is saved, otherwise the story service's effective model.
        const effective = overrideModel || data.settings?.imageModel
        if (effective) setSelectedModel(canonicalModelId(effective))
      }
    } catch (err) {
      console.error('Failed to fetch admin data:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleSaveModel = async (model: string) => {
    setIsSavingModel(true)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/admin/app-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: { model } })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to save')
      setSavedOverrideModel(data?.settings?.images?.model || '')
      setSaveMessage(model ? `Saved. New jobs will use ${model}.` : 'Override cleared. New jobs use the story service default.')
    } catch (err) {
      setSaveMessage(`âœ• ${err instanceof Error ? err.message : 'Failed to save'}`)
    } finally {
      setIsSavingModel(false)
    }
  }

  useEffect(() => {
    void fetchAdminData()
  }, [fetchAdminData])

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job record?')) return
    try {
      const res = await fetch('/api/admin/jobs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: jobId })
      })
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== jobId))
      }
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  const handleTestConnection = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        setTestResult(`âœ• ${data?.error || 'Image API unreachable'}${data?.apiBase ? ` (${data.apiBase})` : ''}`)
        return
      }
      if (data.modelListed) {
        setTestResult(`âœ“ ${data.apiBase} reachable in ${data.elapsedMs}ms Â· model "${data.matchedModel}" is available.`)
      } else {
        setTestResult(`âš  ${data.apiBase} reachable in ${data.elapsedMs}ms, but "${selectedModel}" is not in the model list. Generation will try aliases: ${(data.candidates || []).join(', ')}.`)
      }
    } catch (err) {
      setTestResult(`âœ• ${err instanceof Error ? err.message : 'Connection test failed'}`)
    } finally {
      setIsTesting(false)
    }
  }

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
          <h1 className="text-2xl font-bold tracking-tight text-zinc-800">Admin control center</h1>
          <p className="mt-2 text-sm text-zinc-500">Sign in with an admin account to continue.</p>
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
            <span className="font-medium text-zinc-700">{user.email}</span> is not on the admin list. Add it to <code className="rounded bg-zinc-100 px-1">ADMIN_EMAILS</code> and sign in again.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/projects">Go to my books</Link>
          </Button>
        </Card>
      </div>
    )
  }

  const ok = (flag: boolean | null | undefined) => flag ? 'bg-emerald-400' : 'bg-red-400'
  const revenueCurrency: string = stats?.currency || 'INR'
  const revenueSymbol = revenueCurrency === 'INR' ? 'â‚¹' : revenueCurrency === 'USD' ? '$' : `${revenueCurrency} `

  const filteredJobs = jobs.filter((job) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      (job.id || '').toLowerCase().includes(q) ||
      (job.email || '').toLowerCase().includes(q) ||
      (job.title || '').toLowerCase().includes(q) ||
      (job.storyline || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="py-10 sm:py-14">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Admin header */}
        <div className="flex flex-col gap-4 border-b border-zinc-200/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col items-start gap-3">
            <Eyebrow tone="emerald">Admin</Eyebrow>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-zinc-800 sm:text-3xl">
                Control center
              </h1>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                Live
              </span>
            </div>
            <p className="text-sm text-zinc-500">
              Manage generation jobs, Razorpay revenue, customer orders, and AI model routing.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchAdminData()}
              disabled={isLoading}
              className="h-9 gap-1.5 text-xs bg-white/80"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Sync Data
            </Button>
            <Button asChild size="sm" className="h-9 gap-1.5 text-xs font-semibold">
              <Link href="/create" target="_blank">
                <Sparkles className="h-3.5 w-3.5" />
                Test Generator UI
              </Link>
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 border-b border-zinc-200/70 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'overview'
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'bg-white/80 text-zinc-600 ring-1 ring-zinc-200/70 hover:bg-white hover:text-zinc-900'
            }`}
          >
            <TrendingUp className="h-4 w-4" /> Overview & KPIs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('jobs')}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'jobs'
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'bg-white/80 text-zinc-600 ring-1 ring-zinc-200/70 hover:bg-white hover:text-zinc-900'
            }`}
          >
            <Layers className="h-4 w-4" /> Storybook Jobs ({jobs.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'orders'
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'bg-white/80 text-zinc-600 ring-1 ring-zinc-200/70 hover:bg-white hover:text-zinc-900'
            }`}
          >
            <CreditCard className="h-4 w-4" /> Razorpay Orders
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ai-models')}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'ai-models'
                ? 'bg-zinc-900 text-white shadow-sm'
                : 'bg-white/80 text-zinc-600 ring-1 ring-zinc-200/70 hover:bg-white hover:text-zinc-900'
            }`}
          >
            <Cpu className="h-4 w-4" /> AI Models & LaoZhang
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-medium text-zinc-500">Total Books Created</CardTitle>
                  <BookOpen className="h-4 w-4 text-violet-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-zinc-900">{stats?.totalProjects ?? jobs.length}</div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {stats?.completedProjects ?? 0} ready Â· {stats?.awaitingPayment ?? 0} awaiting payment
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-medium text-zinc-500">Total Revenue ({revenueCurrency})</CardTitle>
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-emerald-600">
                    {revenueSymbol}{((stats?.totalRevenueMinor || 0) / 100).toLocaleString('en-IN')}
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Captured via Razorpay{settings?.razorpayKeyMode ? ` (${settings.razorpayKeyMode} keys)` : ''}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-medium text-zinc-500">Active Generating</CardTitle>
                  <Clock className="h-4 w-4 text-amber-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600">
                    {stats?.activeGenerating ?? jobs.filter((j) => j.status === 'generating' || j.status === 'starting').length}
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {settings?.storyServiceActiveJobs !== null && settings?.storyServiceActiveJobs !== undefined
                      ? `${settings.storyServiceActiveJobs} active on story service`
                      : 'Rendering pages right now'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-xs font-medium text-zinc-500">Generation Success Rate</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-cyan-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-cyan-600">
                    {typeof stats?.successRate === 'number' ? `${stats.successRate}%` : 'â€”'}
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {stats?.failedProjects ? `${stats.failedProjects} failed` : 'No failures recorded'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Quick System Status Card */}
            <Card className="p-5">
              <h3 className="text-sm font-bold text-zinc-800 mb-3">Live System & Provider Health</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div className="flex items-center gap-2 rounded-2xl bg-zinc-50 p-3 border border-zinc-200/70">
                  <span className={`h-2.5 w-2.5 rounded-full ${ok(settings?.storyServiceReachable)} ${settings?.storyServiceReachable ? 'animate-pulse' : ''}`} />
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-800">Story Service</p>
                    <p className="truncate text-zinc-500">
                      {settings?.storyServiceReachable
                        ? `Online Â· ${settings.storyServiceLatencyMs}ms`
                        : settings ? `Offline Â· ${settings.storyServiceError || 'unreachable'}` : 'Checkingâ€¦'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-zinc-50 p-3 border border-zinc-200/70">
                  <span className={`h-2.5 w-2.5 rounded-full ${ok(settings?.razorpayKeyIdSet && settings?.razorpaySecretSet)}`} />
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-800">Payment Gateway</p>
                    <p className="truncate text-zinc-500">
                      {settings?.razorpayKeyIdSet
                        ? `Razorpay Â· ${settings.razorpayKeyMode || 'unknown'} keys${settings.razorpayWebhookSecretSet ? ' Â· webhook set' : ' Â· no webhook secret'}`
                        : 'Razorpay keys missing'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-zinc-50 p-3 border border-zinc-200/70">
                  <span className={`h-2.5 w-2.5 rounded-full ${ok(settings?.laozhangKeySet || settings?.openaiKeySet)}`} />
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-800">Image AI</p>
                    <p className="truncate text-zinc-500">{settings?.imageModel || 'not reported'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-2xl bg-zinc-50 p-3 border border-zinc-200/70">
                  <span className={`h-2.5 w-2.5 rounded-full ${settings?.authMode === 'firebase' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-800">Auth & Data</p>
                    <p className="truncate text-zinc-500">
                      {settings ? `${settings.authMode} auth Â· ${settings.dataBackend} store` : 'Checkingâ€¦'}
                    </p>
                  </div>
                </div>
              </div>
              {settings && settings.authMode === 'local' && (
                <p className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50 p-2.5 text-[11px] text-amber-800">
                  {settings.dataBackend === 'firestore'
                    ? <>Data is in Firestore, but sign-in is still local dev auth. Enable the Google provider in Firebase Auth and set <code>AUTH_MODE=firebase</code> to turn on Google sign-in.</>
                    : <>Running with local dev auth and a JSON data store. Add <code>NEXT_PUBLIC_FIREBASE_*</code> + a service account to switch to Google sign-in and Firestore.</>}
                </p>
              )}
            </Card>
          </div>
        )}

        {/* TAB 2: JOBS QUEUE */}
        {activeTab === 'jobs' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <Input
                  type="text"
                  placeholder="Search by job ID, customer email, character..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs h-9"
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white shadow-[0_16px_50px_rgba(10,10,15,0.07)]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-700">
                  <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200/70 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3.5">Job / Project ID</th>
                      <th className="p-3.5">Customer</th>
                      <th className="p-3.5">Story / Title</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Type</th>
                      <th className="p-3.5">Date</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredJobs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-6 text-center text-zinc-500">
                          No jobs found matching your filter
                        </td>
                      </tr>
                    ) : (
                      filteredJobs.map((job) => {
                        const isGenerating = job.status === 'generating' || job.status === 'starting'
                        const isReady = job.status === 'ready'
                        return (
                          <tr key={job.id} className="hover:bg-zinc-50 transition">
                            <td className="p-3.5 font-mono text-zinc-500 truncate max-w-[140px]">
                              {job.id}
                            </td>
                            <td className="p-3.5 font-medium text-zinc-800">
                              {job.email || job.payment?.email || 'Guest User'}
                            </td>
                            <td className="p-3.5 max-w-[200px] truncate text-zinc-700">
                              {job.title || job.storyline || 'Personalized Story'}
                            </td>
                            <td className="p-3.5">
                              {isReady && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                                  <CheckCircle2 className="h-3 w-3" /> Ready
                                </span>
                              )}
                              {isGenerating && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-pink-500 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm animate-pulse">
                                  <Clock className="h-3 w-3 animate-spin" /> {job.stage || 'Rendering'}
                                </span>
                              )}
                              {job.status === 'awaiting_payment' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/70">
                                  Pending Pay
                                </span>
                              )}
                              {job.status === 'failed' && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200/70">
                                  Failed
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 text-zinc-500">
                              {job.outputType === 'LULU_BOOK' ? 'Hardcover' : 'Digital'}
                            </td>
                            <td className="p-3.5 text-zinc-500">
                              {new Date(job.createdAt || Date.now()).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric'
                              })}
                            </td>
                            <td className="p-3.5 text-right space-x-2">
                              <Button
                                asChild
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px]"
                              >
                                <Link href={`/projects/${job.id}`} target="_blank">
                                  <ExternalLink className="h-3 w-3 mr-1" /> View
                                </Link>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteJob(job.id)}
                                className="h-7 px-2 text-[11px] border-red-200 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
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
        )}

        {/* TAB 3: ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-zinc-200/70 bg-white shadow-[0_16px_50px_rgba(10,10,15,0.07)]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-zinc-700">
                  <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200/70 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="p-3.5">Razorpay Payment ID</th>
                      <th className="p-3.5">Customer Email</th>
                      <th className="p-3.5">Amount</th>
                      <th className="p-3.5">Type</th>
                      <th className="p-3.5">Shipping Address</th>
                      <th className="p-3.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {jobs.filter((j) => j.payment?.orderId).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-zinc-500">
                          No Razorpay orders recorded yet
                        </td>
                      </tr>
                    ) : (
                      jobs
                        .filter((j) => j.payment?.orderId)
                        .map((order) => (
                          <tr key={order.id} className="hover:bg-zinc-50 transition">
                            <td className="p-3.5 font-mono text-emerald-600">
                              <div>{order.payment?.paymentId || 'â€”'}</div>
                              <div className="text-[10px] text-zinc-500">{order.payment?.orderId}</div>
                            </td>
                            <td className="p-3.5 font-medium text-zinc-800">
                              {order.email || order.payment?.email || 'â€”'}
                            </td>
                            <td className="p-3.5 font-semibold text-zinc-800">
                              {(order.payment?.currency || order.amounts?.currency) === 'USD' ? '$' : 'â‚¹'}
                              {((order.payment?.amountMinor || order.amounts?.totalMinor || 0) / 100).toLocaleString('en-IN')}
                            </td>
                            <td className="p-3.5">
                              {order.outputType === 'LULU_BOOK' ? 'Hardcover Print' : 'Digital Edition'}
                            </td>
                            <td className="p-3.5 text-zinc-500 max-w-[200px] truncate">
                              {order.shipping?.address1 ? (
                                `${order.shipping.address1}, ${order.shipping.city} ${order.shipping.postalCode || ''}`
                              ) : (
                                <span className="text-zinc-500">Digital Delivery</span>
                              )}
                            </td>
                            <td className="p-3.5">
                              {order.payment?.status === 'captured' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                                  Captured{String(order.payment?.paymentId || '').includes('mock') ? ' (test)' : ''}
                                </span>
                              ) : order.payment?.status === 'failed' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-200/70">
                                  Failed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200/70">
                                  {order.payment?.status || 'created'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: AI MODELS & SETTINGS */}
        {activeTab === 'ai-models' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-violet-600" />
                  Image Model Configuration
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Select and control the AI generation model routed through LaoZhang API.
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold text-zinc-700">Active Model Snapshot</label>
                <div className="space-y-2">
                  {[
                    {
                      id: 'gpt-image-2.5-sunburst-2026-09-08',
                      name: 'gpt-image-2.5-sunburst (2026-09-08 Snapshot)',
                      desc: 'Highest edit precision, ideal for exact face consistency & cinematic realism'
                    },
                    {
                      id: 'gpt-image-2.5-flare-2026-09-08',
                      name: 'gpt-image-2.5-flare (2026-09-08 Snapshot)',
                      desc: 'Fast everyday generation with high quality'
                    },
                    {
                      id: 'gemini-3-pro-image-preview',
                      name: 'Gemini 3 Pro Image (Nano Banana Pro)',
                      desc: 'Google GenAI Direct / LaoZhang v1beta format'
                    }
                  ].map((m) => (
                    <label
                      key={m.id}
                      onClick={() => setSelectedModel(m.id)}
                      className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
                        selectedModel === m.id
                          ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/20 text-zinc-900'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-violet-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="model"
                        checked={selectedModel === m.id}
                        onChange={() => setSelectedModel(m.id)}
                        className="mt-1 accent-violet-500"
                      />
                      <div>
                        <p className="text-xs font-semibold text-zinc-900">{m.name}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{m.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-zinc-500">
                Story service default: <span className="font-mono text-zinc-700">{settings?.imageModel || 'â€”'}</span>
                {savedOverrideModel
                  ? <> Â· Admin override active: <span className="font-mono text-violet-700">{savedOverrideModel}</span></>
                  : ' Â· No admin override (using default)'}
              </p>

              <div className="pt-3 border-t border-zinc-200/70 flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => handleSaveModel(selectedModel)}
                  disabled={isSavingModel || selectedModel === savedOverrideModel}
                  className="text-xs font-semibold h-9"
                >
                  {isSavingModel ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Apply to new jobs
                </Button>
                {savedOverrideModel && (
                  <Button
                    variant="outline"
                    onClick={() => handleSaveModel('')}
                    disabled={isSavingModel}
                    className="text-xs h-9 bg-white/80"
                  >
                    Clear override
                  </Button>
                )}
                <Button
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  variant="outline"
                  className="text-xs font-semibold h-9"
                >
                  {isTesting ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Test API Connection
                </Button>
              </div>
              {saveMessage && (
                <p className={`text-xs font-medium ${saveMessage.startsWith('âœ•') ? 'text-red-600' : 'text-emerald-600'}`}>{saveMessage}</p>
              )}
              {testResult && (
                <p className={`text-xs font-medium ${testResult.startsWith('âœ“') ? 'text-emerald-600' : testResult.startsWith('âš ') ? 'text-amber-700' : 'text-red-600'}`}>{testResult}</p>
              )}
            </Card>

            <Card className="p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                  <Settings className="h-5 w-5 text-emerald-600" />
                  API & Payment Credentials Status
                </h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Real-time status of configured API keys and environment parameters.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                {[
                  { label: 'LAOZHANG_API_KEY (story service)', set: settings?.laozhangKeySet },
                  { label: 'OPENAI_API_KEY (story service)', set: settings?.openaiKeySet },
                  { label: 'GEMINI_API_KEY (story service)', set: settings?.geminiKeySet },
                  { label: 'SMTP (email delivery)', set: settings?.smtpSet },
                  { label: 'RAZORPAY_KEY_ID', set: settings?.razorpayKeyIdSet },
                  { label: 'RAZORPAY_KEY_SECRET', set: settings?.razorpaySecretSet },
                  { label: 'RAZORPAY_WEBHOOK_SECRET', set: settings?.razorpayWebhookSecretSet },
                  { label: 'Firebase client (Google sign-in)', set: settings?.firebaseClientConfigured },
                  { label: 'ADMIN_EMAILS', set: settings?.adminEmailsConfigured }
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                    <span className="text-zinc-700 font-medium">{row.label}</span>
                    {row.set ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Set
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                        <AlertCircle className="h-3.5 w-3.5" /> Missing
                      </span>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                  <span className="text-zinc-700 font-medium">Image API base</span>
                  <span className="text-zinc-700 font-mono truncate max-w-[220px]">{settings?.imageApiBase || 'â€”'}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                  <span className="text-zinc-700 font-medium">Pages model</span>
                  <span className="text-zinc-700 font-mono truncate max-w-[220px]">{settings?.imageModelPages || 'â€”'}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                  <span className="text-zinc-700 font-medium">Image size (digital / print)</span>
                  <span className="text-zinc-700 font-mono">{settings?.imageSizeDigital || 'â€”'} / {settings?.imageSizePrint || 'â€”'}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                  <span className="text-zinc-700 font-medium">Quality Â· Concurrency</span>
                  <span className="text-zinc-700 font-mono">{settings?.imageQuality || 'â€”'} Â· {settings?.imageConcurrency || 'â€”'}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                  <span className="text-zinc-700 font-medium">Story model</span>
                  <span className="text-zinc-700 font-mono truncate max-w-[220px]">{settings?.storyProvider || 'â€”'}{settings?.storyModel ? ` Â· ${settings.storyModel}` : ''}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 border border-zinc-200/70">
                  <span className="text-zinc-700 font-medium">Story service</span>
                  <span className="text-zinc-700 font-mono truncate max-w-[220px]">{settings?.storyServiceUrl || 'â€”'}</span>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
