import { NextRequest, NextResponse } from 'next/server'
import type DodoPayments from 'dodopayments'
import { DODO_PRODUCTS, getDodoClient } from '@/lib/dodo-payments'

export const runtime = 'nodejs'

const DEFAULT_RESPONSE = {
  currencyCode: 'USD',
  currencySymbol: '$',
  digital: { price: '$9.99', priceRaw: 999 },
  hardcover: { price: '$39.99', priceRaw: 3999 },
  isLocalized: false
}

function getCountryCode (request: NextRequest) {
  const headerCandidates = [
    request.headers.get('x-vercel-ip-country'),
    request.headers.get('cf-ipcountry'),
    request.headers.get('x-country-code'),
    request.headers.get('x-appengine-country'),
    request.headers.get('x-geo-country')
  ]

  const countryCode = headerCandidates.find((value) => typeof value === 'string' && value.length === 2)
  return countryCode || undefined
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

type PreviewProduct = DodoPayments.CheckoutSessionPreviewResponse['product_cart'][number]

function getPreviewAmount (item?: PreviewProduct) {
  if (!item) return undefined
  return item.discounted_price + (item.tax || 0)
}

export async function GET (request: NextRequest) {
  if (!DODO_PRODUCTS.DIGITAL || !DODO_PRODUCTS.HARDCOVER) {
    console.warn('Dodo product IDs not configured, returning default prices')
    return NextResponse.json(DEFAULT_RESPONSE)
  }

  try {
    const client = getDodoClient()
    const countryCode = getCountryCode(request)

    const previewBody: DodoPayments.CheckoutSessionPreviewParams = {
      product_cart: [
        { product_id: DODO_PRODUCTS.DIGITAL, quantity: 1 },
        { product_id: DODO_PRODUCTS.HARDCOVER, quantity: 1 }
      ]
    }

    if (countryCode) {
      previewBody.billing_address = {
        country: countryCode as DodoPayments.CountryCode
      }
    }

    const preview = await client.checkoutSessions.preview(previewBody)
    const currencyCode = preview.currency || 'USD'
    const digitalItem = preview.product_cart.find((item) => item.product_id === DODO_PRODUCTS.DIGITAL)
    const hardcoverItem = preview.product_cart.find((item) => item.product_id === DODO_PRODUCTS.HARDCOVER)
    const digitalAmount = getPreviewAmount(digitalItem) || DEFAULT_RESPONSE.digital.priceRaw
    const hardcoverAmount = getPreviewAmount(hardcoverItem) || DEFAULT_RESPONSE.hardcover.priceRaw

    return NextResponse.json({
      currencyCode,
      currencySymbol: getCurrencySymbol(currencyCode),
      digital: {
        price: formatAmount(digitalAmount, currencyCode),
        priceRaw: digitalAmount
      },
      hardcover: {
        price: formatAmount(hardcoverAmount, currencyCode),
        priceRaw: hardcoverAmount
      },
      isLocalized: Boolean(countryCode && currencyCode !== 'USD')
    })
  } catch (error) {
    console.error('Dodo localization preview failed:', error)
    return NextResponse.json(DEFAULT_RESPONSE)
  }
}
