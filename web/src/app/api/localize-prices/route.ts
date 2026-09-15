import { NextRequest, NextResponse } from 'next/server'

import { quoteToApiPayload, resolveLocalizedPricing } from '@/lib/geo-pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET (request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const quote = await resolveLocalizedPricing({
      headers: request.headers,
      countryOverride: searchParams.get('country'),
      currencyOverride: searchParams.get('currency'),
      timezone: searchParams.get('tz')
    })

    return NextResponse.json(quoteToApiPayload(quote), {
      headers: { 'Cache-Control': 'private, max-age=300' }
    })
  } catch (error) {
    console.error('Price localization failed:', error)
    return NextResponse.json({
      countryCode: 'US',
      countryName: 'United States',
      currencyCode: 'USD',
      currencySymbol: '$',
      locale: 'en-US',
      exponent: 2,
      usdToLocal: 1,
      digital: { price: '$9.99', priceRaw: 999 },
      hardcover: { price: '$39.99', priceRaw: 3999 },
      isLocalized: false,
      provider: 'razorpay',
      taxNote: 'Tax calculated at checkout'
    })
  }
}
