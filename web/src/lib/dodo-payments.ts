import DodoPayments from 'dodopayments'
import type { OutputType } from '@/types/storybook'

export type DodoEnvironment = 'live_mode' | 'test_mode'

export const DODO_PRODUCTS = {
  DIGITAL: process.env.DODO_PRODUCT_DIGITAL_ID || '',
  HARDCOVER: process.env.DODO_PRODUCT_HARDCOVER_ID || '',
  SHIPPING: process.env.DODO_PRODUCT_SHIPPING_ID || ''
} as const

export function getDodoEnvironment (): DodoEnvironment {
  return process.env.DODO_PAYMENTS_ENVIRONMENT === 'test_mode'
    ? 'test_mode'
    : 'live_mode'
}

export function getDodoClient () {
  const bearerToken = process.env.DODO_PAYMENTS_API_KEY

  if (!bearerToken) {
    throw new Error('DODO_PAYMENTS_API_KEY is not configured')
  }

  return new DodoPayments({
    bearerToken,
    environment: getDodoEnvironment()
  })
}

export function getDodoProductId (outputType: OutputType): string {
  return outputType === 'DIGI_BOOK'
    ? DODO_PRODUCTS.DIGITAL
    : DODO_PRODUCTS.HARDCOVER
}

export function getDodoWebhookKey () {
  return process.env.DODO_PAYMENTS_WEBHOOK_KEY || ''
}

export function formatMinorUnits (amount: number) {
  return Math.round(amount * 100)
}
