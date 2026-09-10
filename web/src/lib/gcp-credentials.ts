import * as fs from 'node:fs'

export type ServiceAccountJson = {
  project_id?: string
  client_email?: string
  private_key?: string
  [key: string]: unknown
}

function parseJson (raw: string | undefined, label: string): ServiceAccountJson | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as ServiceAccountJson
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid JSON'
    throw new Error(`Invalid ${label}: ${message}`)
  }
}

function readFile (filePath: string | undefined): ServiceAccountJson | undefined {
  if (!filePath || !fs.existsSync(filePath)) return undefined
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ServiceAccountJson
}

/**
 * Service-account credentials for server-side GCP access (Firestore, GCS).
 *
 * Resolution order:
 *   1. GCP_SERVICE_ACCOUNT_JSON            (Secret Manager string)
 *   2. FIREBASE_SERVICE_ACCOUNT_JSON       (legacy name)
 *   3. GOOGLE_APPLICATION_CREDENTIALS path (local dev)
 *   4. undefined -> Application Default Credentials (Cloud Run runtime SA)
 */
export function getGcpCredentials (): ServiceAccountJson | undefined {
  return (
    parseJson(process.env.GCP_SERVICE_ACCOUNT_JSON, 'GCP_SERVICE_ACCOUNT_JSON') ||
    parseJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, 'FIREBASE_SERVICE_ACCOUNT_JSON') ||
    readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS)
  )
}

export function getGcpProjectId (): string | undefined {
  return (
    process.env.GCP_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    getGcpCredentials()?.project_id
  )
}
