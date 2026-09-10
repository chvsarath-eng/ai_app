import 'server-only'

import { Storage } from '@google-cloud/storage'

import { getGcpCredentials, getGcpProjectId } from '@/lib/gcp-credentials'

let storage: Storage | null = null

export function getStorage (): Storage {
  if (storage) return storage
  const credentials = getGcpCredentials()
  storage = new Storage({
    projectId: getGcpProjectId(),
    ...(credentials?.client_email && credentials?.private_key
      ? { credentials: { client_email: credentials.client_email, private_key: credentials.private_key } }
      : {})
  })
  return storage
}

export function getUploadsBucketName (): string {
  const name = process.env.UPLOADS_BUCKET || process.env.JOBS_BUCKET
  if (!name) throw new Error('UPLOADS_BUCKET (or JOBS_BUCKET) is not set')
  return name
}

export function parseGcsUri (uri: string): { bucket: string; name: string } {
  if (!uri.startsWith('gs://')) throw new Error(`Not a gs:// URI: ${uri}`)
  const rest = uri.slice('gs://'.length)
  const slash = rest.indexOf('/')
  if (slash <= 0) throw new Error(`Invalid gs:// URI: ${uri}`)
  return { bucket: rest.slice(0, slash), name: rest.slice(slash + 1) }
}

export async function uploadBuffer (params: {
  bucket?: string
  name: string
  data: Buffer
  contentType: string
  metadata?: Record<string, string>
}): Promise<string> {
  const bucketName = params.bucket || getUploadsBucketName()
  const file = getStorage().bucket(bucketName).file(params.name)
  await file.save(params.data, {
    contentType: params.contentType,
    resumable: false,
    metadata: { metadata: params.metadata }
  })
  return `gs://${bucketName}/${params.name}`
}

/**
 * V4 signed read URL. Requires a service-account key locally, or
 * `roles/iam.serviceAccountTokenCreator` on the runtime SA in Cloud Run.
 */
export async function signReadUrl (gcsUri: string, options?: { expiresInDays?: number; inline?: boolean; filename?: string }): Promise<string> {
  const { bucket, name } = parseGcsUri(gcsUri)
  const days = Math.min(Math.max(options?.expiresInDays ?? 7, 1), 7)
  const disposition = options?.inline === false
    ? `attachment; filename="${options?.filename || name.split('/').pop()}"`
    : undefined
  const [url] = await getStorage().bucket(bucket).file(name).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + days * 24 * 60 * 60 * 1000,
    ...(disposition ? { responseDisposition: disposition } : {})
  })
  return url
}

export async function deleteObject (gcsUri: string): Promise<void> {
  const { bucket, name } = parseGcsUri(gcsUri)
  await getStorage().bucket(bucket).file(name).delete({ ignoreNotFound: true })
}
