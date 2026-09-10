'use client'

import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app'
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User
} from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
}

export function isFirebaseConfigured () {
  return Boolean(config.apiKey && config.projectId && config.appId)
}

let app: FirebaseApp | null = null

export function getFirebaseApp (): FirebaseApp {
  if (app) return app
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* environment variables.')
  }
  app = getApps().length > 0 ? getApp() : initializeApp(config)
  return app
}

export function getFirebaseAuth (): Auth {
  return getAuth(getFirebaseApp())
}

export function getFirebaseDb (): Firestore {
  return getFirestore(getFirebaseApp())
}

function isLikelyPopupBlockedEnv () {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIos = /iPhone|iPad|iPod/i.test(ua)
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS/i.test(ua)
  const isInAppBrowser = /FBAN|FBAV|Instagram|Line\/|wv\)/i.test(ua)
  return (isIos && isSafari) || isInAppBrowser
}

/**
 * Google sign-in. Uses a popup by default and falls back to a redirect when the
 * environment is known to block popups (iOS Safari, in-app browsers) or the popup
 * is blocked at runtime.
 */
export async function signInWithGoogle (): Promise<User | null> {
  const auth = getFirebaseAuth()
  await setPersistence(auth, browserLocalPersistence)
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })

  if (isLikelyPopupBlockedEnv()) {
    await signInWithRedirect(auth, provider)
    return null
  }

  try {
    const result = await signInWithPopup(auth, provider)
    return result.user
  } catch (err) {
    const code = (err as { code?: string })?.code || ''
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider)
      return null
    }
    throw err
  }
}

export async function completeRedirectSignIn (): Promise<User | null> {
  if (!isFirebaseConfigured()) return null
  try {
    const result = await getRedirectResult(getFirebaseAuth())
    return result?.user ?? null
  } catch (err) {
    console.error('Redirect sign-in failed:', err)
    return null
  }
}

export async function signInWithEmail (email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth()
  await setPersistence(auth, browserLocalPersistence)
  const result = await signInWithEmailAndPassword(auth, email, password)
  return result.user
}

export async function registerWithEmail (email: string, password: string): Promise<User> {
  const auth = getFirebaseAuth()
  await setPersistence(auth, browserLocalPersistence)
  const result = await createUserWithEmailAndPassword(auth, email, password)
  return result.user
}

export async function resetPassword (email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseAuth(), email)
}

export async function signOutUser (): Promise<void> {
  if (!isFirebaseConfigured()) return
  await signOut(getFirebaseAuth())
}
