'use client'

import { DodoPayments } from 'dodopayments-checkout'
import type { CheckoutEvent, CheckoutMode } from 'dodopayments-checkout'

type CheckoutStatus = 'succeeded' | 'failed' | 'processing' | null

interface OverlayCallbacks {
  onOpened?: () => void
  onClosed?: () => void
  onError?: (message: string) => void
  onStatus?: (status: CheckoutStatus) => void
  onRedirectRequested?: (redirectUrl?: string) => void
}

let initializedMode: CheckoutMode | null = null
let activeCallbacks: OverlayCallbacks = {}

function inferMode (checkoutUrl: string): CheckoutMode {
  return checkoutUrl.includes('test.') ? 'test' : 'live'
}

function getEventMessage (event: CheckoutEvent): Record<string, unknown> | undefined {
  const eventData = event.data
  if (!eventData || typeof eventData !== 'object') return undefined
  const message = eventData.message
  return typeof message === 'object' && message !== null
    ? message as Record<string, unknown>
    : undefined
}

function handleOverlayEvent (event: CheckoutEvent) {
  switch (event.event_type) {
    case 'checkout.opened':
      activeCallbacks.onOpened?.()
      return
    case 'checkout.closed':
      activeCallbacks.onClosed?.()
      return
    case 'checkout.error': {
      const message = getEventMessage(event)?.message
      activeCallbacks.onError?.(typeof message === 'string' ? message : 'Checkout failed to open')
      return
    }
    case 'checkout.status': {
      const status = getEventMessage(event)?.status
      activeCallbacks.onStatus?.(
        status === 'succeeded' || status === 'failed' || status === 'processing'
          ? status
          : null
      )
      return
    }
    case 'checkout.redirect_requested': {
      const redirectTo = getEventMessage(event)?.redirect_to
      activeCallbacks.onRedirectRequested?.(
        typeof redirectTo === 'string' ? redirectTo : undefined
      )
    }
  }
}

function initializeOverlay (checkoutUrl: string, callbacks: OverlayCallbacks) {
  const mode = inferMode(checkoutUrl)
  activeCallbacks = callbacks

  if (initializedMode === mode) {
    return
  }

  DodoPayments.Initialize({
    mode,
    displayType: 'overlay',
    onEvent: handleOverlayEvent
  })

  initializedMode = mode
}

export function openDodoOverlayCheckout (checkoutUrl: string, callbacks: OverlayCallbacks) {
  initializeOverlay(checkoutUrl, callbacks)

  DodoPayments.Checkout.open({
    checkoutUrl,
    options: {
      manualRedirect: true,
      showSecurityBadge: false,
      showTimer: false
    }
  })
}

export function closeDodoOverlayCheckout () {
  if (DodoPayments.Checkout.isOpen()) {
    DodoPayments.Checkout.close()
  }
}
