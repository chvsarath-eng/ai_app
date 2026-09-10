import { create } from 'zustand'

export type AuthUser = {
  uid: string
  email: string | null
  name: string | null
  picture: string | null
  isAdmin: boolean
}

export type AuthMode = 'firebase' | 'local'

interface AuthStore {
  user: AuthUser | null
  isLoading: boolean
  /** False only when neither Firebase nor local dev auth is available. */
  isConfigured: boolean
  authMode: AuthMode
  isSignInOpen: boolean
  signInReason: string | null
  setUser: (user: AuthUser | null) => void
  setLoading: (isLoading: boolean) => void
  setConfigured: (isConfigured: boolean) => void
  setAuthMode: (authMode: AuthMode) => void
  openSignIn: (reason?: string) => void
  closeSignIn: () => void
}

export const useAuthStore = create<AuthStore>()((set) => ({
  user: null,
  isLoading: true,
  isConfigured: true,
  authMode: 'firebase',
  isSignInOpen: false,
  signInReason: null,
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setConfigured: (isConfigured) => set({ isConfigured }),
  setAuthMode: (authMode) => set({ authMode }),
  openSignIn: (reason) => set({ isSignInOpen: true, signInReason: reason ?? null }),
  closeSignIn: () => set({ isSignInOpen: false, signInReason: null })
}))
