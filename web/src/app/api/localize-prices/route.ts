import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const PADDLE_API_KEY = process.env.PADDLE_API_KEY
const PADDLE_ENVIRONMENT = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT || 'production'
const PADDLE_API_BASE = PADDLE_ENVIRONMENT === 'production'
  ? 'https://api.paddle.com'
  : 'https://sandbox-api.paddle.com'

const DIGITAL_PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PRICE_DIGITAL || 'pri_01kjs01khpqbnzar05jcpsmehp'
const HARDCOVER_PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PRICE_HARDCOVER || 'pri_01kjp9fre6y1ypcntekw5vrk3a'

// Default USD fallback (pre-tax subtotals shown on pricing page)
const DEFAULT_RESPONSE = {
  currencyCode: 'USD',
  currencySymbol: '$',
  digital: { price: '$9.99', priceRaw: 999 },
  hardcover: { price: '$39.99', priceRaw: 3999 },
  isLocalized: false
}

export async function GET (request: NextRequest) {
  if (!PADDLE_API_KEY) {
    console.warn('PADDLE_API_KEY not set, returning default prices')
    return NextResponse.json(DEFAULT_RESPONSE)
  }

  try {
    // Get client IP from Cloud Run headers
    const forwardedFor = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const clientIp = forwardedFor?.split(',')[0]?.trim() || realIp || null

    // Build the Paddle preview prices request
    const previewBody: Record<string, unknown> = {
      items: [
        { price_id: DIGITAL_PRICE_ID, quantity: 1 },
        { price_id: HARDCOVER_PRICE_ID, quantity: 1 }
      ]
    }

    // Pass IP so Paddle can geolocate and auto-convert currency
    // For local dev (no real IP), Paddle returns USD with no conversion
    if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') {
      previewBody.customer_ip_address = clientIp
    }

    const paddleResponse = await fetch(`${PADDLE_API_BASE}/prices/preview`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PADDLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(previewBody)
    })

    if (!paddleResponse.ok) {
      const errorText = await paddleResponse.text()
      console.error('Paddle preview prices failed:', paddleResponse.status, errorText)
      return NextResponse.json(DEFAULT_RESPONSE)
    }

    const paddleData = await paddleResponse.json()
    const lineItems: Array<Record<string, unknown>> = paddleData?.data?.details?.line_items || []

    if (lineItems.length === 0) {
      console.error('Paddle preview prices returned no line items')
      return NextResponse.json(DEFAULT_RESPONSE)
    }

    const currencyCode: string = (paddleData?.data?.currency_code as string) || 'USD'

    // Find each item by price_id
    const digitalItem = lineItems.find(
      (item) => (item.price as Record<string, unknown>)?.id === DIGITAL_PRICE_ID
    )
    const hardcoverItem = lineItems.find(
      (item) => (item.price as Record<string, unknown>)?.id === HARDCOVER_PRICE_ID
    )

    if (!digitalItem || !hardcoverItem) {
      console.error('Could not find price items in Paddle preview response')
      return NextResponse.json(DEFAULT_RESPONSE)
    }

    // Use unit_totals.total (tax-inclusive total) — the number the customer will pay
    // formatted_unit_totals contains currency-formatted strings from Paddle
    const digitalFormatted = digitalItem.formatted_unit_totals as Record<string, string>
    const hardcoverFormatted = hardcoverItem.formatted_unit_totals as Record<string, string>
    const digitalTotals = digitalItem.unit_totals as Record<string, string>
    const hardcoverTotals = hardcoverItem.unit_totals as Record<string, string>

    const isLocalized = currencyCode !== 'USD'

    console.log('Paddle price preview:', {
      ip: clientIp,
      currencyCode,
      digital: digitalFormatted?.total,
      hardcover: hardcoverFormatted?.total
    })

    return NextResponse.json({
      currencyCode,
      // Paddle returns formatted strings like "$14.99" or "£11.99" or "₹1,249"
      digital: {
        price: digitalFormatted?.total || DEFAULT_RESPONSE.digital.price,
        priceRaw: parseInt(digitalTotals?.total || '999', 10)
      },
      hardcover: {
        price: hardcoverFormatted?.total || DEFAULT_RESPONSE.hardcover.price,
        priceRaw: parseInt(hardcoverTotals?.total || '3999', 10)
      },
      isLocalized
    })
  } catch (error) {
    console.error('Localization error:', error)
    return NextResponse.json(DEFAULT_RESPONSE)
  }
}
