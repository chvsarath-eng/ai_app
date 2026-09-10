import { NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/session'
import { listProjectsForUser, refreshProjects } from '@/lib/projects-server'

export const runtime = 'nodejs'

/** GET: the signed-in user's projects, refreshed with live job progress when needed. */
export async function GET () {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stored = await listProjectsForUser(user)
    const projects = await refreshProjects(stored)

    return NextResponse.json({
      projects: projects.map((p) => ({
        ...p,
        createdAt: p.createdAt || Date.now(),
        updatedAt: p.updatedAt || Date.now()
      }))
    })
  } catch (error: unknown) {
    console.error('Failed to fetch user projects:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch projects'
    return NextResponse.json({ error: message, projects: [] }, { status: 500 })
  }
}
