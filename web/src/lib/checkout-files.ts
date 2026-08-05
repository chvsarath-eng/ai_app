'use client'

const DATABASE_NAME = 'img2x-checkout'
const STORE_NAME = 'files'
const FILES_KEY = 'pending-checkout-files'

function openDatabase (): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available'))
      return
    }

    const request = window.indexedDB.open(DATABASE_NAME, 1)

    request.onerror = () => {
      reject(request.error || new Error('Failed to open checkout file database'))
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }
  })
}

function withStore<T> (
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void
): Promise<T> {
  return openDatabase().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const store = transaction.objectStore(STORE_NAME)

    transaction.oncomplete = () => db.close()
    transaction.onerror = () => {
      reject(transaction.error || new Error('IndexedDB transaction failed'))
    }

    handler(store, resolve, reject)
  }))
}

export function saveCheckoutFiles (files: File[]): Promise<void> {
  return withStore('readwrite', (store, resolve, reject) => {
    const request = store.put(files, FILES_KEY)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('Failed to save checkout files'))
  })
}

export function loadCheckoutFiles (): Promise<File[]> {
  return withStore('readonly', (store, resolve, reject) => {
    const request = store.get(FILES_KEY)

    request.onsuccess = () => {
      resolve(Array.isArray(request.result) ? request.result as File[] : [])
    }
    request.onerror = () => reject(request.error || new Error('Failed to load checkout files'))
  })
}

export function clearCheckoutFiles (): Promise<void> {
  return withStore('readwrite', (store, resolve, reject) => {
    const request = store.delete(FILES_KEY)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('Failed to clear checkout files'))
  })
}
