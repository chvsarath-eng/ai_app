import { NextRequest, NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/session'
import { deleteProject, listRecentProjects, refreshProjects } from '@/lib/projects-server'

export const runtime = 'nodejs'

function isAuthorizedAdminKey (request: NextRequest) {
  const adminKey = request.headers.get('x-admin-key')
  const expected = process.env.ADMIN_SECRET_KEY
  return Boolean(adminKey && expected && adminKey === expected)
}

async function assertAdmin (request: NextRequest) {
  const user = await getSessionUser()
  return isAuthorizedAdminKey(request) || Boolean(user?.isAdmin)
}

export async function GET (request: NextRequest) {
  try {
    if (!(await assertAdmin(request))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const stored = await listRecentProjects(100)
    const jobs = await refreshProjects(stored)
    return NextResponse.json({ jobs })
  } catch (error: unknown) {
    console.error('Admin jobs fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch jobs', jobs: [] }, { status: 500 })
  }
}

export async function DELETE (request: NextRequest) {
  try {
    if (!(await assertAdmin(request))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const projectId = typeof body?.projectId === 'string' ? body.projectId : ''
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }

    await deleteProject(projectId)
    return NextResponse.json({ success: true, deletedId: projectId })
  } catch (error: unknown) {
    console.error('Admin job delete error:', error)
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 })
  }
}
