import { NextRequest, NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/session'
import { listRecentProjects, refreshProjects } from '@/lib/projects-server'
import { getDataBackend } from '@/lib/data-store'

export const runtime = 'nodejs'

function isAuthorizedAdminKey (request: NextRequest) {
  const adminKey = request.headers.get('x-admin-key')
  const expected = process.env.ADMIN_SECRET_KEY
  return Boolean(adminKey && expected && adminKey === expected)
}

export async function GET (request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!isAuthorizedAdminKey(request) && !user?.isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const stored = await listRecentProjects(200)
    const projects = await refreshProjects(stored)

    let totalRevenueMinor = 0
    let activeGenerating = 0
    let completedProjects = 0
    let failedProjects = 0
    let awaitingPayment = 0
    let currency = 'INR'

    for (const p of projects) {
      if (p.status === 'generating' || p.status === 'starting' || p.status === 'paid') activeGenerating++
      else if (p.status === 'ready') completedProjects++
      else if (p.status === 'failed') failedProjects++
      else if (p.status === 'awaiting_payment') awaitingPayment++

      if (p.payment?.status === 'captured') {
        totalRevenueMinor += Number(p.payment.amountMinor || p.amounts?.totalMinor || 0)
        if (p.payment.currency) currency = p.payment.currency
      }
    }

    const finished = completedProjects + failedProjects
    const successRate = finished > 0 ? Math.round((completedProjects / finished) * 100) : null

    return NextResponse.json({
      stats: {
        totalProjects: projects.length,
        completedProjects,
        activeGenerating,
        failedProjects,
        awaitingPayment,
        totalRevenueMinor,
        currency,
        successRate
      },
      recentProjects: projects.slice(0, 10),
      dataBackend: getDataBackend(),
      activeModel: process.env.IMAGE_MODEL || 'gpt-image-2.5-sunburst-2026-09-08',
      activeProvider: process.env.IMAGE_PROVIDER || 'openai_images'
    })
  } catch (error: unknown) {
    console.error('Admin overview error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch admin stats'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
