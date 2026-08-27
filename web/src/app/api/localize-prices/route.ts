import { NextResponse } from 'next/server'
import { getStripe, STRIPE_AMOUNTS, STRIPE_PRICE_IDS } from '@/lib/stripe'

export const runtime = 'nodejs'

const DEFAULT_RESPONSE = {
  currencyCode: 'USD',
  currencySymbol: '$',
  digital: { price: '$9.99', priceRaw: STRIPE_AMOUNTS.DIGITAL_CENTS },
  hardcover: { price: '$39.99', priceRaw: STRIPE_AMOUNTS.HARDCOVER_CENTS },
  isLocalized: false,
  taxNote: 'Tax calculated at checkout for your country'
}

function formatAmount (amount: number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode
  }).format(amount / 100)
}

function getCurrencySymbol (currencyCode: string) {
  const parts = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode
  }).formatToParts(0)

  return parts.find((part) => part.type === 'currency')?.value || currencyCode
}

async function getPriceAmountCents (priceId: string | undefined, fallback: number) {
  if (!priceId || !process.env.STRIPE_SECRET_KEY) {
    return fallback
  }

  try {
    const stripe = getStripe()
    const price = await stripe.prices.retrieve(priceId)
    return typeof price.unit_amount === 'number' ? price.unit_amount : fallback
  } catch (error) {
    console.warn('Failed to retrieve Stripe price, using fallback:', priceId, error)
    return fallback
  }
}

export async function GET () {
  try {
    const [digitalAmount, hardcoverAmount] = await Promise.all([
      getPriceAmountCents(STRIPE_PRICE_IDS.DIGITAL, STRIPE_AMOUNTS.DIGITAL_CENTS),
      getPriceAmountCents(STRIPE_PRICE_IDS.HARDCOVER, STRIPE_AMOUNTS.HARDCOVER_CENTS)
    ])

    return NextResponse.json({
      currencyCode: 'USD',
      currencySymbol: getCurrencySymbol('USD'),
      digital: {
        price: formatAmount(digitalAmount, 'USD'),
        priceRaw: digitalAmount
      },
      hardcover: {
        price: formatAmount(hardcoverAmount, 'USD'),
        priceRaw: hardcoverAmount
      },
      isLocalized: false,
      taxNote: DEFAULT_RESPONSE.taxNote
    })
  } catch (error) {
    console.error('Stripe price localization failed:', error)
    return NextResponse.json(DEFAULT_RESPONSE)
  }
}
