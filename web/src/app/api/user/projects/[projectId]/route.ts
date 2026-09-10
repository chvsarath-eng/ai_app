import { NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/session'
import { canUserAccessProject, getProject, refreshProjectFromJob } from '@/lib/projects-server'

export const runtime = 'nodejs'

/** GET: one project (owner or admin), refreshed with live job progress. */
export async function GET (
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stored = await getProject(projectId)
    if (!stored) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (!canUserAccessProject(stored, user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const project = await refreshProjectFromJob(stored)
    return NextResponse.json({ project })
  } catch (error: unknown) {
    console.error('Failed to fetch project:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch project'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
