'use client'

export interface PaddleEventData {
  name: string
  data?: {
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

export interface PaddleCheckoutOptions {
  items: Array<{
    priceId: string
    quantity: number
  }>
  customer?: {
    email?: string
  }
  customData?: Record<string, string>
  successUrl?: string
  settings?: {
    displayMode?: 'overlay' | 'inline'
    theme?: 'light' | 'dark'
    locale?: string
    successUrl?: string
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
        console.log('Paddle event:', event.name, event.data)
        
        if (event.name === 'checkout.completed' && event.data?.transaction_id) {
          currentCallbacks?.onSuccess?.(event.data.transaction_id)
        }
        
        if (event.name === 'checkout.closed') {
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
      locale: 'en',
      ...options.settings
    }
  })
}

export function getPriceIdForOutputType(outputType: 'DIGI_BOOK' | 'LULU_BOOK'): string {
  return outputType === 'DIGI_BOOK' ? PADDLE_PRICES.DIGITAL : PADDLE_PRICES.HARDCOVER
}
