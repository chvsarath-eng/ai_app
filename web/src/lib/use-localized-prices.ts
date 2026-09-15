'use client'

import { useEffect, useState } from 'react'

import type { LocalizedPricesPayload } from '@/lib/geo-pricing'

export const DEFAULT_LOCALIZED_PRICES: LocalizedPricesPayload = {
  countryCode: 'US',
  countryName: 'United States',
  currencyCode: 'USD',
  currencySymbol: '$',
  locale: 'en-US',
  exponent: 2,
  usdToLocal: 1,
  digital: { price: '$9.99', priceRaw: 999 },
  hardcover: { price: '$39.99', priceRaw: 3999 },
  isLocalized: false,
  provider: 'razorpay',
  taxNote: 'Tax calculated at checkout'
}

let cached: LocalizedPricesPayload | null = null
let inflight: Promise<LocalizedPricesPayload> | null = null

function timezoneHint () {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

async function fetchLocalizedPrices (): Promise<LocalizedPricesPayload> {
  const params = new URLSearchParams()
  const tz = timezoneHint()
  if (tz) params.set('tz', tz)
  const response = await fetch(`/api/localize-prices?${params.toString()}`)
  if (!response.ok) throw new Error('Failed to load local prices')
  return response.json() as Promise<LocalizedPricesPayload>
}

function loadLocalizedPrices () {
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = fetchLocalizedPrices()
      .then((data) => {
        cached = data
        return data
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

export function useLocalizedPrices () {
  const [prices, setPrices] = useState<LocalizedPricesPayload>(cached || DEFAULT_LOCALIZED_PRICES)
  const [isLoading, setIsLoading] = useState(!cached)

  useEffect(() => {
    let cancelled = false
    void loadLocalizedPrices()
      .then((data) => {
        if (!cancelled) setPrices(data)
      })
      .catch((error) => {
        console.error('Failed to fetch localized prices:', error)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { prices, isLoading }
}
