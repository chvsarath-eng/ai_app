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

export function loadRazorpayScript (): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false)
      return
    }
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(true))
      existing.addEventListener('error', () => resolve(false))
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export async function openRazorpayCheckout (
  options: Omit<RazorpayCheckoutOptions, 'key'> & { key?: string }
): Promise<void> {
  const isLoaded = await loadRazorpayScript()
  const key = options.key || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_placeholder'
  
  // If order is mock (e.g., local dev without live Razorpay credentials), complete via fallback test confirmation
  if (options.order_id.includes('mock') || key === 'rzp_test_placeholder' || !key.startsWith('rzp_')) {
    const shouldProceed = window.confirm(
      `[Razorpay Test Mode]\n\nSimulate successful payment for ${options.name}?\nAmount: ₹${(options.amount / 100).toFixed(0)} ${options.currency}\n\nClick OK to simulate successful payment and generate your storybook.`
    )
    if (shouldProceed && options.handler) {
      options.handler({
        razorpay_payment_id: `pay_mock_${Date.now()}`,
        razorpay_order_id: options.order_id,
        razorpay_signature: 'test_mock_signature'
      })
      return
    } else {
      if (options.modal?.ondismiss) options.modal.ondismiss()
      return
    }
  }

  if (!isLoaded || !window.Razorpay) {
    throw new Error('Could not load Razorpay payment SDK. Please check your internet connection.')
  }

  try {
    // Test keys use Razorpay's dummy "Software Private Ltd Bank" page, which
    // opens a separate browser window. Hide netbanking in test so checkout
    // stays in the overlay (card / UPI / wallet). Live keys keep netbanking.
    const isTestKey = key.startsWith('rzp_test_')
    const rzp = new window.Razorpay({
      ...options,
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

    if (options.modal?.ondismiss) {
      rzp.on('payment.failed', () => {
        options.modal?.ondismiss?.()
      })
    }

    rzp.open()
  } catch (err) {
    console.warn('Razorpay open failed, offering local test simulation:', err)
    const shouldProceed = window.confirm(
      `[Razorpay Simulation]\n\nCould not open live Razorpay window. Proceed with simulated test payment?\n\nClick OK to continue.`
    )
    if (shouldProceed && options.handler) {
      options.handler({
        razorpay_payment_id: `pay_mock_${Date.now()}`,
        razorpay_order_id: options.order_id,
        razorpay_signature: 'test_mock_signature'
      })
    } else {
      if (options.modal?.ondismiss) options.modal.ondismiss()
    }
  }
}
