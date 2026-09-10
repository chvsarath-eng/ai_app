import 'server-only'

import { getDocument, setDocument } from '@/lib/data-store'

export type AppSettings = {
  pricing: {
    currency: string
    digitalMinor: number
    hardcoverMinor: number
  }
  images: {
    provider: string
    model: string
    modelPages: string
    quality: string
    sizeDigital: string
    sizePrint: string
  }
  story: {
    provider: string
    model: string
  }
  maintenance: {
    enabled: boolean
    message: string
  }
  updatedAt?: number
  updatedBy?: string | null
}

function envInt (name: string, fallback: number) {
  const raw = process.env[name]
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function getDefaultSettings (): AppSettings {
  return {
    pricing: {
      currency: (process.env.PRICE_CURRENCY || 'USD').toUpperCase(),
      digitalMinor: envInt('PRICE_DIGITAL_MINOR', 999),
      hardcoverMinor: envInt('PRICE_HARDCOVER_MINOR', 3999)
    },
    // Empty strings mean "defer to the story service's own configuration". Only an explicit
    // admin save (or IMAGE_MODEL_OVERRIDE) should override the story service's defaults.
    images: {
      provider: '',
      model: process.env.IMAGE_MODEL_OVERRIDE || '',
      modelPages: process.env.IMAGE_MODEL_PAGES_OVERRIDE || '',
      quality: process.env.IMAGE_QUALITY || 'high',
      sizeDigital: process.env.IMAGE_SIZE_DIGI || '1024x1024',
      sizePrint: process.env.IMAGE_SIZE_PRINT || '2048x2048'
    },
    story: {
      provider: process.env.STORY_MODEL_PROVIDER || 'openai',
      model: process.env.STORY_MODEL || ''
    },
    maintenance: {
      enabled: false,
      message: ''
    }
  }
}

let cache: { value: AppSettings; at: number } | null = null
const CACHE_TTL_MS = 30_000

function deepMerge<T extends Record<string, unknown>> (base: T, patch: Partial<T> | undefined): T {
  if (!patch) return base
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof base[key] === 'object') {
      out[key] = deepMerge(base[key] as Record<string, unknown>, value as Record<string, unknown>)
    } else if (value !== undefined && value !== null && value !== '') {
      out[key] = value
    } else if (value === '' && typeof base[key] === 'string') {
      out[key] = ''
    }
  }
  return out as T
}

export async function getAppSettings (force = false): Promise<AppSettings> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value
  const defaults = getDefaultSettings()
  try {
    const doc = await getDocument('settings', 'app')
    const data = doc ? (doc as unknown as Partial<AppSettings>) : undefined
    const merged = deepMerge(defaults as unknown as Record<string, unknown>, data as Record<string, unknown> | undefined) as unknown as AppSettings
    cache = { value: merged, at: Date.now() }
    return merged
  } catch (err) {
    console.warn('Failed to load settings/app, using defaults:', err)
    return defaults
  }
}

export async function saveAppSettings (patch: Partial<AppSettings>, updatedBy: string | null) {
  await setDocument('settings', 'app', { ...patch, updatedAt: Date.now(), updatedBy }, { merge: true })
  cache = null
}

export function getPriceMinor (settings: AppSettings, outputType: string) {
  return outputType === 'LULU_BOOK' ? settings.pricing.hardcoverMinor : settings.pricing.digitalMinor
}
