'use client'

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void
      on: (event: string, handler: (response: unknown) => void) => void
    }
  }
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

export interface RazorpayFailureResponse {
  error: {
    code: string
    description: string
    source: string
    step: string
    reason: string
    metadata: {
      order_id: string
      payment_id?: string
    }
  }
}

export interface RazorpayCheckoutOptions {
  key: string
  amount: number
  currency: string
  name: string
  description?: string
  image?: string
  order_id: string
  handler?: (response: RazorpaySuccessResponse) => void
  prefill?: {
    name?: string
    email?: string
    contact?: string
  }
  notes?: Record<string, string>
  theme?: {
    color?: string
  }
  modal?: {
    ondismiss?: () => void
    confirm_close?: boolean
    animation?: boolean
    escape?: boolean
    backdropclose?: boolean
  }
  retry?: {
    enabled?: boolean
  }
  config?: {
    display?: {
      hide?: Array<{ method: string }>
      preferences?: { show_default_blocks?: boolean }
    }
  }
}

let razorpayScriptLoad: Promise<boolean> | null = null

export function loadRazorpayScript (): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.Razorpay) return Promise.resolve(true)
  if (razorpayScriptLoad) return razorpayScriptLoad
  razorpayScriptLoad = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]')
    const script = existing || document.createElement('script')
    const finish = (loaded: boolean) => {
      window.clearTimeout(timeout)
      script.removeEventListener('load', onLoad)
      script.removeEventListener('error', onError)
      if (!loaded) script.remove()
      resolve(loaded)
    }
    const onLoad = () => finish(Boolean(window.Razorpay))
    const onError = () => finish(false)
    const timeout = window.setTimeout(() => finish(Boolean(window.Razorpay)), 20000)
    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)
    if (!existing) {
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      document.body.appendChild(script)
    }
  }).finally(() => { razorpayScriptLoad = null })
  return razorpayScriptLoad
}

export async function openRazorpayCheckout (
  options: Omit<RazorpayCheckoutOptions, 'key'> & { key?: string; onFailure?: (response: RazorpayFailureResponse) => void }
): Promise<void> {
  const isLoaded = await loadRazorpayScript()
  const key = options.key || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_placeholder'
  
  if (!isLoaded || !window.Razorpay) {
    throw new Error('Could not load Razorpay payment SDK. Please check your internet connection.')
  }

  try {
    // Test keys use Razorpay's dummy "Software Private Ltd Bank" page, which
    // opens a separate browser window. Hide netbanking in test so checkout
    // stays in the overlay (card / UPI / wallet). Live keys keep netbanking.
    const isTestKey = key.startsWith('rzp_test_')
    const { onFailure, ...checkoutOptions } = options
    const rzp = new window.Razorpay({
      ...checkoutOptions,
      key,
      image: options.image || '/brand/img2x-logo-transparent.png',
      theme: {
        color: options.theme?.color || '#7c3aed'
      },
      retry: { enabled: false },
      modal: {
        confirm_close: true,
        animation: true,
        escape: true,
        backdropclose: false,
        ...options.modal
      },
      config: {
        display: {
          hide: isTestKey ? [{ method: 'netbanking' }] : [],
          preferences: { show_default_blocks: true }
        }
      }
    })

    rzp.on('payment.failed', (response) => {
      if (onFailure) onFailure(response as RazorpayFailureResponse)
      else options.modal?.ondismiss?.()
    })

    rzp.open()
  } catch (err) {
    throw err instanceof Error ? err : new Error('Could not open payment checkout. Please try again.')
  }
}
