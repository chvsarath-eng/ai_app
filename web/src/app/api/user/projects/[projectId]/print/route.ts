import { NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/session'
import { canUserAccessProject, getProject } from '@/lib/projects-server'
import { startProjectPrintEdition } from '@/lib/start-generation'

export const runtime = 'nodejs'

/** POST: re-render a finished digital book at print size after a hardcover order. */
export async function POST (
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

    const project = await getProject(projectId)
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    if (!canUserAccessProject(project, user)) {
      return NextResponse.json({ error: 'This project belongs to another account' }, { status: 403 })
    }

    const paid = project.status === 'paid' || project.status === 'ready' || Boolean(project.payment?.paymentId)
    if (!paid && !user.isAdmin) {
      return NextResponse.json({ error: 'Payment is required before a print edition can start' }, { status: 402 })
    }

    const result = await startProjectPrintEdition(projectId)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 })
    }
    return NextResponse.json({ ok: true, jobId: result.jobId, alreadyStarted: result.alreadyStarted })
  } catch (error: unknown) {
    console.error('Print edition failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to start print edition'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
