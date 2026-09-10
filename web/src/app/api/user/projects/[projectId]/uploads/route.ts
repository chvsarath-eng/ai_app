import { NextResponse } from 'next/server'

import { getSessionUser } from '@/lib/session'
import { canUserAccessProject, getProject, upsertProject } from '@/lib/projects-server'
import { uploadBuffer } from '@/lib/gcs'
import type { ProjectUpload } from '@/types/project'

export const runtime = 'nodejs'

const MAX_FILES = 4
const MAX_BYTES = 12 * 1024 * 1024

function safeName (name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'photo.jpg'
}

/** POST: store face photos on GCS so generation can start after payment even if the browser loses the files. */
export async function POST (
  request: Request,
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

    const form = await request.formData()
    const files = form.getAll('images').filter((v): v is File => typeof v !== 'string' && Boolean(v))
    if (files.length === 0) {
      return NextResponse.json({ error: 'At least one photo is required' }, { status: 400 })
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: 'Maximum 4 photos allowed' }, { status: 400 })
    }

    const uploads: ProjectUpload[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: `${file.name || 'Photo'} is larger than 12 MB` }, { status: 400 })
      }
      const bytes = Buffer.from(await file.arrayBuffer())
      if (bytes.length < 32) {
        return NextResponse.json({ error: 'One of the photos is empty. Please re-select it and try again.' }, { status: 400 })
      }
      const gcsUri = await uploadBuffer({
        name: `projects/${projectId}/uploads/char_${i + 1}_${safeName(file.name)}`,
        data: bytes,
        contentType: file.type || 'image/jpeg',
        metadata: { uid: user.uid, projectId, index: String(i) }
      })
      uploads.push({
        index: i,
        gcsUri,
        contentType: file.type || 'image/jpeg',
        size: bytes.length,
        originalName: file.name
      })
    }

    await upsertProject(projectId, { uploads, startError: null })
    return NextResponse.json({ ok: true, count: uploads.length })
  } catch (error: unknown) {
    console.error('Photo upload failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to save photos'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
