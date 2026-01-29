import { NextResponse } from 'next/server'
import * as fs from 'node:fs'
import * as path from 'node:path'

export const runtime = 'nodejs'

function pickCredentialsSource () {
  if (process.env.STORY_INVOKER_CREDENTIALS_JSON) return { source: 'STORY_INVOKER_CREDENTIALS_JSON' }

  const explicitPath = process.env.STORY_INVOKER_CREDENTIALS_PATH
  if (explicitPath && fs.existsSync(explicitPath)) return { source: 'STORY_INVOKER_CREDENTIALS_PATH', path: explicitPath }

  const projectPath = path.join(process.cwd(), 'invoker.json')
  if (fs.existsSync(projectPath)) return { source: 'web/invoker.json', path: projectPath }

  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (gac && fs.existsSync(gac)) return { source: 'GOOGLE_APPLICATION_CREDENTIALS', path: gac }

  return { source: 'ADC (no local file found)' }
}

export async function GET () {
  const invokerPath = path.join(process.cwd(), 'invoker.json')
  const picked = pickCredentialsSource()
  return NextResponse.json({
    STORY_SERVICE_URL: process.env.STORY_SERVICE_URL,
    STORY_SERVICE_AUDIENCE: process.env.STORY_SERVICE_AUDIENCE,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    STORY_INVOKER_CREDENTIALS_PATH: process.env.STORY_INVOKER_CREDENTIALS_PATH,
    hasStoryInvokerCredentialsJson: Boolean(process.env.STORY_INVOKER_CREDENTIALS_JSON),
    hasProjectInvokerJson: fs.existsSync(invokerPath),
    projectInvokerJsonPath: invokerPath,
    credentialsSourceUsed: picked.source,
    credentialsPathUsed: picked.path
  })
}

