import { GoogleAuth } from 'google-auth-library'
import * as fs from 'node:fs'
import * as path from 'node:path'

function getServiceUrl () {
  const url = process.env.STORY_SERVICE_URL
  if (!url) throw new Error('Missing env STORY_SERVICE_URL')
  return url.replace(/\/+$/, '')
}

function getAudience () {
  return process.env.STORY_SERVICE_AUDIENCE || getServiceUrl()
}

function getCredentialsFromEnv () {
  const raw = process.env.STORY_INVOKER_CREDENTIALS_JSON
  if (!raw) return undefined

  try {
    return JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON'
    throw new Error(`Invalid STORY_INVOKER_CREDENTIALS_JSON: ${message}`)
  }
}

function readCredentialsFile (filePath: string) {
  if (!filePath) return undefined
  if (!fs.existsSync(filePath)) return undefined

  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read credentials file'
    throw new Error(`Failed to read credentials JSON at ${filePath}: ${message}`)
  }
}

function getCredentialsFromKnownPaths () {
  const explicitPath = process.env.STORY_INVOKER_CREDENTIALS_PATH
  const explicit = readCredentialsFile(explicitPath || '')
  if (explicit) return explicit

  const projectDefault = readCredentialsFile(path.join(process.cwd(), 'invoker.json'))
  if (projectDefault) return projectDefault

  // Only use GOOGLE_APPLICATION_CREDENTIALS if it points to a real file
  const gac = readCredentialsFile(process.env.GOOGLE_APPLICATION_CREDENTIALS || '')
  if (gac) return gac

  return undefined
}

export async function getStoryAuthHeaders () {
  const credentials = getCredentialsFromEnv() || getCredentialsFromKnownPaths()
  const auth = new GoogleAuth({ credentials })

  const client = await auth.getIdTokenClient(getAudience())
  return await client.getRequestHeaders()
}

export function getStoryServiceUrl () {
  return getServiceUrl()
}

