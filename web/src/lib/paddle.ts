'use client'

import { trackEvent } from '@/lib/analytics'

export interface PaddleEventData {
  name: string
  data?: Record<string, unknown> & {
    transaction_id?: string
    status?: string
  }
}

declare global {
  interface Window {
    Paddle?: {
      Environment: {
        set: (env: 'sandbox' | 'production') => void
      }
      Initialize: (options: { 
        token: string
        eventCallback?: (event: PaddleEventData) => void
      }) => void
      Checkout: {
        open: (options: PaddleCheckoutOptions) => void
      }
    }
  }
}

// Checkout can be opened with either items (price IDs) or a transactionId (server-created transaction)
export interface PaddleCheckoutOptions {
  // Option 1: Pass items directly (Paddle creates transaction automatically)
  items?: Array<{
    priceId: string
    quantity: number
  }>
  // Option 2: Pass a server-created transaction ID (for custom items like shipping)
  transactionId?: string
  customer?: {
    email?: string
    address?: {
      countryCode?: string
      postalCode?: string
      region?: string
      city?: string
      line1?: string
      line2?: string
    }
  }
  customData?: Record<string, string>
  successUrl?: string
  settings?: {
    displayMode?: 'overlay' | 'inline'
    variant?: 'one-page' | 'multi-page'
    theme?: 'light' | 'dark'
    locale?: string
    successUrl?: string
    frameTarget?: string
    frameInitialHeight?: number
    frameStyle?: string
    allowLogout?: boolean
  }
}

export interface PaddleCheckoutCallbacks {
  onSuccess?: (transactionId: string) => void
  onClose?: () => void
}

export const PADDLE_PRICES = {
  DIGITAL: process.env.NEXT_PUBLIC_PADDLE_PRICE_DIGITAL || 'pri_01kgbfsfghbddqsaz0t77m50qy',
  HARDCOVER: process.env.NEXT_PUBLIC_PADDLE_PRICE_HARDCOVER || 'pri_01kgbfsgjxhsgab6kp453mqh0n'
}

export const PADDLE_ENVIRONMENT = (process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT || 'sandbox') as 'sandbox' | 'production'

let paddleInitialized = false
let currentCallbacks: PaddleCheckoutCallbacks | null = null

export function initializePaddle(callbacks?: PaddleCheckoutCallbacks) {
  if (typeof window === 'undefined' || !window.Paddle) {
    return
  }

  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN

  if (!clientToken) {
    console.warn('Paddle client token not configured')
    return
  }

  if (!paddleInitialized) {
    window.Paddle.Environment.set(PADDLE_ENVIRONMENT)
    window.Paddle.Initialize({ 
      token: clientToken,
      eventCallback: (event: PaddleEventData) => {
        const eventData = event?.data && typeof event.data === 'object'
          ? (event.data as Record<string, unknown>)
          : {}
        const errorData = typeof eventData.error === 'object' && eventData.error
          ? (eventData.error as Record<string, unknown>)
          : undefined
        const errorCode = typeof errorData?.code === 'string' ? errorData.code : undefined
        const errorType = typeof errorData?.type === 'string' ? errorData.type : undefined
        const transactionId = typeof event.data?.transaction_id === 'string'
          ? event.data.transaction_id
          : undefined
        console.log('Paddle event:', event.name, event.data)

        if (event.name === 'checkout.loaded') {
          trackEvent('checkout_opened', { source: 'paddle' })
        }
        if (event.name === 'checkout.error') {
          trackEvent('checkout_failed', { error_code: errorCode, error_type: errorType })
        }
        
        if (event.name === 'checkout.completed' && transactionId) {
          trackEvent('checkout_completed', { transaction_id: transactionId })
          currentCallbacks?.onSuccess?.(transactionId)
        }
        
        if (event.name === 'checkout.closed') {
          trackEvent('checkout_closed')
          currentCallbacks?.onClose?.()
        }
      }
    })
    paddleInitialized = true
  }
  
  if (callbacks) {
    currentCallbacks = callbacks
  }
}

export function openPaddleCheckout(
  options: PaddleCheckoutOptions, 
  callbacks?: PaddleCheckoutCallbacks
) {
  if (typeof window === 'undefined' || !window.Paddle) {
    console.error('Paddle not loaded')
    callbacks?.onClose?.()
    return
  }

  // Store callbacks for event handling
  if (callbacks) {
    currentCallbacks = callbacks
  }

  if (!paddleInitialized) {
    initializePaddle(callbacks)
  }

  window.Paddle.Checkout.open({
    ...options,
    settings: {
      displayMode: 'overlay',
      theme: 'light',
      // No locale specified - Paddle auto-detects based on customer's browser/location
      ...options.settings
    }
  })
}

export function getPriceIdForOutputType(outputType: 'DIGI_BOOK' | 'LULU_BOOK'): string {
  return outputType === 'DIGI_BOOK' ? PADDLE_PRICES.DIGITAL : PADDLE_PRICES.HARDCOVER
}
