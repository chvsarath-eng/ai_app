import 'server-only'

import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Minimal document store used by API routes.
 *
 * Backends:
 *   - `firestore` (production): firebase-admin Firestore.
 *   - `local` (dev / no Firebase yet): JSON files under `web/.data/`.
 *
 * Selection: `DATA_BACKEND=local|firestore`. Defaults to `local` when Firebase is not
 * configured (no `NEXT_PUBLIC_FIREBASE_PROJECT_ID`), otherwise `firestore`.
 */

export type StoredDoc = Record<string, unknown> & { id: string }

export type ListOptions = {
  where?: Array<[field: string, value: unknown]>
  orderBy?: string
  descending?: boolean
  limit?: number
}

export function getDataBackend (): 'local' | 'firestore' {
  const explicit = (process.env.DATA_BACKEND || '').trim().toLowerCase()
  if (explicit === 'local' || explicit === 'firestore') return explicit
  return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? 'firestore' : 'local'
}

export function isLocalDataBackend () {
  return getDataBackend() === 'local'
}

// ---------------------------------------------------------------------------
// Local JSON backend
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.LOCAL_DATA_DIR || path.join(process.cwd(), '.data')

function collectionPath (collection: string) {
  const safe = collection.replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(DATA_DIR, `${safe}.json`)
}

function readCollection (collection: string): Record<string, StoredDoc> {
  const file = collectionPath(collection)
  if (!fs.existsSync(file)) return {}
  try {
    const raw = fs.readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw) as Record<string, StoredDoc>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    console.warn(`data-store: could not parse ${file}, starting empty`, err)
    return {}
  }
}

function writeCollection (collection: string, docs: Record<string, StoredDoc>) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const file = collectionPath(collection)
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(docs, null, 2), 'utf8')
  fs.renameSync(tmp, file)
}

// Serialize writes per process so concurrent route handlers don't clobber each other.
let writeChain: Promise<unknown> = Promise.resolve()
function serialized<T> (fn: () => T | Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn)
  writeChain = next.catch(() => {})
  return next
}

function isPlainObject (value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function deepMerge (base: Record<string, unknown>, patch: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key] as Record<string, unknown>, value)
    } else {
      out[key] = value
    }
  }
  return out
}

function getPath (doc: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((acc, key) => {
    if (!isPlainObject(acc)) return undefined
    return acc[key]
  }, doc)
}

function compare (a: unknown, b: unknown) {
  if (a === b) return 0
  if (a === undefined || a === null) return -1
  if (b === undefined || b === null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

const localBackend = {
  async get (collection: string, id: string): Promise<StoredDoc | null> {
    return readCollection(collection)[id] ?? null
  },
  async set (collection: string, id: string, data: Record<string, unknown>, merge: boolean): Promise<StoredDoc> {
    return serialized(() => {
      const docs = readCollection(collection)
      const existing = docs[id]
      const next = merge && existing ? deepMerge(existing, data) : { ...data }
      const doc = { ...next, id } as StoredDoc
      docs[id] = doc
      writeCollection(collection, docs)
      return doc
    })
  },
  async delete (collection: string, id: string): Promise<void> {
    await serialized(() => {
      const docs = readCollection(collection)
      if (id in docs) {
        delete docs[id]
        writeCollection(collection, docs)
      }
    })
  },
  async list (collection: string, options: ListOptions = {}): Promise<StoredDoc[]> {
    let docs = Object.values(readCollection(collection))
    for (const [field, value] of options.where || []) {
      docs = docs.filter((doc) => getPath(doc, field) === value)
    }
    if (options.orderBy) {
      const field = options.orderBy
      docs.sort((a, b) => compare(getPath(a, field), getPath(b, field)))
      if (options.descending) docs.reverse()
    }
    if (options.limit && options.limit > 0) docs = docs.slice(0, options.limit)
    return docs
  }
}

// ---------------------------------------------------------------------------
// Firestore backend
// ---------------------------------------------------------------------------

async function firestore () {
  const { adminDb, toPlain } = await import('@/lib/firebase/admin')
  return { db: adminDb(), toPlain }
}

const firestoreBackend = {
  async get (collection: string, id: string): Promise<StoredDoc | null> {
    const { db, toPlain } = await firestore()
    const snap = await db.collection(collection).doc(id).get()
    if (!snap.exists) return null
    return { ...toPlain(snap.data()), id: snap.id }
  },
  async set (collection: string, id: string, data: Record<string, unknown>, merge: boolean): Promise<StoredDoc> {
    const { db } = await firestore()
    await db.collection(collection).doc(id).set(data, { merge })
    return { ...data, id } as StoredDoc
  },
  async delete (collection: string, id: string): Promise<void> {
    const { db } = await firestore()
    await db.collection(collection).doc(id).delete()
  },
  async list (collection: string, options: ListOptions = {}): Promise<StoredDoc[]> {
    const { db, toPlain } = await firestore()
    let query: FirebaseFirestore.Query = db.collection(collection)
    for (const [field, value] of options.where || []) {
      query = query.where(field, '==', value)
    }
    if (options.orderBy) query = query.orderBy(options.orderBy, options.descending ? 'desc' : 'asc')
    if (options.limit) query = query.limit(options.limit)
    const snap = await query.get()
    return snap.docs.map((doc) => ({ ...toPlain(doc.data()), id: doc.id }))
  }
}

function backend () {
  return isLocalDataBackend() ? localBackend : firestoreBackend
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getDocument (collection: string, id: string) {
  return backend().get(collection, id)
}

export function setDocument (collection: string, id: string, data: Record<string, unknown>, options: { merge?: boolean } = {}) {
  return backend().set(collection, id, data, options.merge ?? true)
}

export function deleteDocument (collection: string, id: string) {
  return backend().delete(collection, id)
}

export function listDocuments (collection: string, options?: ListOptions) {
  return backend().list(collection, options)
}
