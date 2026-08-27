import Stripe from 'stripe'
import type { OutputType } from '@/types/storybook'

export const STRIPE_AMOUNTS = {
  DIGITAL_CENTS: Number(process.env.STRIPE_AMOUNT_DIGITAL_CENTS || 999),
  HARDCOVER_CENTS: Number(process.env.STRIPE_AMOUNT_HARDCOVER_CENTS || 3999)
} as const

export const STRIPE_PRICE_IDS = {
  DIGITAL: process.env.STRIPE_PRICE_DIGITAL_ID || '',
  HARDCOVER: process.env.STRIPE_PRICE_HARDCOVER_ID || ''
} as const

let stripeClient: Stripe | null = null

export function getStripe () {
  const secretKey = process.env.STRIPE_SECRET_KEY

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured')
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2026-07-29.dahlia',
      typescript: true
    })
  }

  return stripeClient
}

export function getStripeWebhookSecret () {
  return process.env.STRIPE_WEBHOOK_SECRET || ''
}

export function getStripePriceId (outputType: OutputType) {
  return outputType === 'DIGI_BOOK'
    ? STRIPE_PRICE_IDS.DIGITAL
    : STRIPE_PRICE_IDS.HARDCOVER
}

export function getStripeAmountCents (outputType: OutputType) {
  return outputType === 'DIGI_BOOK'
    ? STRIPE_AMOUNTS.DIGITAL_CENTS
    : STRIPE_AMOUNTS.HARDCOVER_CENTS
}

export function isStripeAutomaticTaxEnabled () {
  return process.env.STRIPE_AUTOMATIC_TAX !== 'false'
}

export function formatMinorUnits (amount: number) {
  return Math.round(amount * 100)
}

export function truncateMetadataValue (value: string, maxLength = 450) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

export function buildBookLineItem (outputType: OutputType): Stripe.Checkout.SessionCreateParams.LineItem {
  const priceId = getStripePriceId(outputType)

  if (priceId) {
    return {
      price: priceId,
      quantity: 1
    }
  }

  const isDigital = outputType === 'DIGI_BOOK'
  const unitAmount = getStripeAmountCents(outputType)

  return {
    quantity: 1,
    price_data: {
      currency: 'usd',
      unit_amount: unitAmount,
      tax_behavior: 'exclusive',
      product_data: {
        name: isDigital
          ? 'Personalized Digital Storybook'
          : 'Personalized Hardcover Storybook',
        description: isDigital
          ? 'AI-generated interactive flipbook delivered by email'
          : 'AI-generated premium hardcover printed via print-on-demand',
        tax_code: isDigital
          ? (process.env.STRIPE_TAX_CODE_DIGITAL || 'txcd_10000000')
          : (process.env.STRIPE_TAX_CODE_PHYSICAL || 'txcd_99999999')
      }
    }
  }
}

export function buildShippingLineItem (shippingCost: number): Stripe.Checkout.SessionCreateParams.LineItem | null {
  const unitAmount = formatMinorUnits(shippingCost)
  if (unitAmount <= 0) return null

  return {
    quantity: 1,
    price_data: {
      currency: 'usd',
      unit_amount: unitAmount,
      tax_behavior: 'exclusive',
      product_data: {
        name: 'Shipping',
        description: 'Print-on-demand shipping'
      }
    }
  }
}
