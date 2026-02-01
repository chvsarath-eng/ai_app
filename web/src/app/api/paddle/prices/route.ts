import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Price IDs from environment
const DIGITAL_PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PRICE_DIGITAL || 'pri_01kgbfsfghbddqsaz0t77m50qy'
const HARDCOVER_PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PRICE_HARDCOVER || 'pri_01kgbfsgjxhsgab6kp453mqh0n'

interface PaddlePricePreviewResponse {
  data: {
    details: {
      lineItems: Array<{
        price: {
          id: string
          productId: string
        }
        formattedTotals: {
          subtotal: string
          total: string
        }
        formattedUnitTotals: {
          subtotal: string
          total: string
        }
        totals: {
          subtotal: string
          total: string
        }
      }>
    }
    currencyCode: string
  }
}

export async function GET(request: NextRequest) {
  const apiKey = process.env.PADDLE_API_KEY
  
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Paddle API key not configured' },
      { status: 500 }
    )
  }

  // Get client IP from headers
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const clientIp = forwardedFor?.split(',')[0]?.trim() || realIp || null

  // Determine Paddle API URL based on environment
  const isSandbox = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === 'sandbox'
  const baseUrl = isSandbox ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'

  try {
    // Build request body
    const requestBody: Record<string, unknown> = {
      items: [
        { priceId: DIGITAL_PRICE_ID, quantity: 1 },
        { priceId: HARDCOVER_PRICE_ID, quantity: 1 }
      ]
    }

    // Add IP address for geo-location if available
    if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') {
      requestBody.customerIpAddress = clientIp
    }

    const response = await fetch(`${baseUrl}/pricing-preview`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Paddle price preview failed:', response.status, errorText)
      
      // Return fallback USD prices
      return NextResponse.json({
        currencyCode: 'USD',
        currencySymbol: '$',
        digital: {
          price: '$14.99',
          priceRaw: 1499
        },
        hardcover: {
          price: '$39.99',
          priceRaw: 3999
        },
        isLocalized: false
      })
    }

    const data: PaddlePricePreviewResponse = await response.json()
    
    // Extract prices from response
    const lineItems = data.data.details.lineItems
    const digitalItem = lineItems.find(item => item.price.id === DIGITAL_PRICE_ID)
    const hardcoverItem = lineItems.find(item => item.price.id === HARDCOVER_PRICE_ID)

    const currencyCode = data.data.currencyCode

    // Get currency symbol from formatted price
    const getCurrencySymbol = (formattedPrice: string): string => {
      // Extract currency symbol from formatted string (e.g., "$14.99" -> "$", "€12.99" -> "€")
      const match = formattedPrice.match(/^([^\d\s]+)/)
      return match ? match[1] : '$'
    }

    const digitalFormatted = digitalItem?.formattedUnitTotals?.subtotal || '$14.99'
    const hardcoverFormatted = hardcoverItem?.formattedUnitTotals?.subtotal || '$39.99'

    return NextResponse.json({
      currencyCode,
      currencySymbol: getCurrencySymbol(digitalFormatted),
      digital: {
        price: digitalFormatted,
        priceRaw: digitalItem ? parseInt(digitalItem.totals.subtotal, 10) : 1499
      },
      hardcover: {
        price: hardcoverFormatted,
        priceRaw: hardcoverItem ? parseInt(hardcoverItem.totals.subtotal, 10) : 3999
      },
      isLocalized: clientIp !== null && clientIp !== '127.0.0.1'
    })
  } catch (error) {
    console.error('Error fetching Paddle prices:', error)
    
    // Return fallback USD prices on error
    return NextResponse.json({
      currencyCode: 'USD',
      currencySymbol: '$',
      digital: {
        price: '$14.99',
        priceRaw: 1499
      },
      hardcover: {
        price: '$39.99',
        priceRaw: 3999
      },
      isLocalized: false
    })
  }
}
