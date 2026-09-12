import { NextRequest, NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/session'
import { getProject, refreshProjectFromJob, upsertProject } from '@/lib/projects-server'
import { startProjectGeneration } from '@/lib/start-generation'

export const runtime = 'nodejs'

async function assertAdmin (request: NextRequest) {
  const user = await getSessionUser()
  const adminKey = request.headers.get('x-admin-key')
  const expected = process.env.ADMIN_SECRET_KEY
  const keyOk = Boolean(adminKey && expected && adminKey === expected)
  if (!keyOk && !user?.isAdmin) return null
  return user
}

export async function GET (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!(await assertAdmin(request))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const { projectId } = await params
    const stored = await getProject(projectId)
    if (!stored) return NextResponse.json({ error: 'Book not found' }, { status: 404 })
    const project = await refreshProjectFromJob(stored)
    return NextResponse.json({ project })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load book'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!(await assertAdmin(request))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const { projectId } = await params
    const stored = await getProject(projectId)
    if (!stored) return NextResponse.json({ error: 'Book not found' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}

    if (typeof body.storyline === 'string') {
      patch.storyline = body.storyline.trim()
    }
    if (typeof body.adminNotes === 'string') {
      patch.adminNotes = body.adminNotes
    }
    if (Array.isArray(body.characters)) {
      patch.characters = body.characters
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    await upsertProject(projectId, patch)
    const project = await getProject(projectId)
    return NextResponse.json({ project })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update book'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST (
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    if (!(await assertAdmin(request))) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
    const { projectId } = await params
    const stored = await getProject(projectId)
    if (!stored) return NextResponse.json({ error: 'Book not found' }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const beforeStart: Record<string, unknown> = {}
    if (typeof body.storyline === 'string') beforeStart.storyline = body.storyline.trim()
    if (typeof body.adminNotes === 'string') beforeStart.adminNotes = body.adminNotes
    if (Array.isArray(body.characters)) beforeStart.characters = body.characters
    if (Object.keys(beforeStart).length > 0) {
      await upsertProject(projectId, beforeStart)
    }

    const result = await startProjectGeneration(projectId, { force: body.action === 'remake' })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 })
    }
    const project = await getProject(projectId)
    return NextResponse.json({
      ok: true,
      jobId: result.jobId,
      alreadyStarted: result.alreadyStarted,
      project
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to remake book'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
