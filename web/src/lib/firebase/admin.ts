import 'server-only'

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore'

import { getGcpCredentials, getGcpProjectId } from '@/lib/gcp-credentials'

let app: App | null = null

function getAdminApp (): App {
  if (app) return app
  const existing = getApps()
  if (existing.length > 0) {
    app = existing[0]
    return app
  }

  const credentials = getGcpCredentials()
  const projectId = getGcpProjectId()

  app = initializeApp(
    credentials?.client_email && credentials?.private_key
      ? {
          credential: cert({
            projectId: credentials.project_id || projectId,
            clientEmail: credentials.client_email,
            privateKey: credentials.private_key
          }),
          projectId: credentials.project_id || projectId
        }
      : { projectId }
  )
  return app
}

export function adminAuth (): Auth {
  return getAuth(getAdminApp())
}

let db: Firestore | null = null

export function adminDb (): Firestore {
  if (db) return db
  db = getFirestore(getAdminApp())
  db.settings({ ignoreUndefinedProperties: true })
  return db
}

export const getFirebaseAdminDb = adminDb

export { FieldValue }

export function serverTimestamp () {
  return FieldValue.serverTimestamp()
}

/** Convert Firestore Timestamps / nested objects into JSON-safe plain values. */
export function toPlain<T = Record<string, unknown>> (value: unknown): T {
  return JSON.parse(
    JSON.stringify(value, (_key, val) => {
      if (val && typeof val === 'object' && typeof (val as { toMillis?: () => number }).toMillis === 'function') {
        return (val as { toMillis: () => number }).toMillis()
      }
      return val
    })
  ) as T
}
