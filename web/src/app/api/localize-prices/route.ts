import { NextRequest, NextResponse } from 'next/server'
import { RAZORPAY_AMOUNTS, getProductPriceMinor } from '@/lib/razorpay'

export const runtime = 'nodejs'

function formatAmount (amount: number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0
  }).format(amount / 100)
}

function getCurrencySymbol (currencyCode: string) {
  const parts = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode
  }).formatToParts(0)

  return parts.find((part) => part.type === 'currency')?.value || currencyCode
}

export async function GET (request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const requestedCurrency = searchParams.get('currency')?.toUpperCase() || process.env.RAZORPAY_CURRENCY || 'INR'
    const currency = requestedCurrency === 'USD' ? 'USD' : 'INR'

    const digitalAmount = getProductPriceMinor('DIGI_BOOK', currency)
    const hardcoverAmount = getProductPriceMinor('LULU_BOOK', currency)

    return NextResponse.json({
      currencyCode: currency,
      currencySymbol: getCurrencySymbol(currency),
      digital: {
        price: formatAmount(digitalAmount, currency),
        priceRaw: digitalAmount
      },
      hardcover: {
        price: formatAmount(hardcoverAmount, currency),
        priceRaw: hardcoverAmount
      },
      isLocalized: true,
      provider: 'razorpay',
      taxNote: 'Inclusive of all applicable taxes'
    })
  } catch (error) {
    console.error('Price localization failed:', error)
    return NextResponse.json({
      currencyCode: 'INR',
      currencySymbol: '₹',
      digital: { price: '₹799', priceRaw: RAZORPAY_AMOUNTS.DIGITAL_INR_MINOR },
      hardcover: { price: '₹2,999', priceRaw: RAZORPAY_AMOUNTS.HARDCOVER_INR_MINOR },
      isLocalized: false,
      provider: 'razorpay',
      taxNote: 'Inclusive of all applicable taxes'
    })
  }
}
