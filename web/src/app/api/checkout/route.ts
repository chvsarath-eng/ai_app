import { NextRequest, NextResponse } from 'next/server'

const PADDLE_PRICES = {
  DIGI_BOOK: process.env.NEXT_PUBLIC_PADDLE_PRICE_DIGITAL || 'pri_01kgbfsfghbddqsaz0t77m50qy',
  LULU_BOOK: process.env.NEXT_PUBLIC_PADDLE_PRICE_HARDCOVER || 'pri_01kgbfsgjxhsgab6kp453mqh0n'
}

const PADDLE_API_KEY = process.env.PADDLE_API_KEY
const PADDLE_ENVIRONMENT = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT || 'sandbox'
const PADDLE_API_BASE = PADDLE_ENVIRONMENT === 'production'
  ? 'https://api.paddle.com'
  : 'https://sandbox-api.paddle.com'

interface PaddleTransactionItem {
  price_id?: string
  quantity: number
  price?: {
    description: string
    name: string
    unit_price: {
      amount: string
      currency_code: string
    }
    product: {
      name: string
      tax_category: string
      description: string
    }
  }
}

interface PaddleTransactionRequest {
  items: PaddleTransactionItem[]
  currency_code: string
  custom_data?: Record<string, string>
  customer?: {
    email: string
  }
  address?: {
    country_code: string
    postal_code?: string
    region?: string
    city?: string
    first_line?: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, outputType, formData } = body

    // Validate required fields
    if (typeof email !== 'string' || !email || !outputType) {
      return NextResponse.json(
        { error: 'Missing required fields: email and outputType' },
        { status: 400 }
      )
    }

    // Validate output type
    if (!['DIGI_BOOK', 'LULU_BOOK'].includes(outputType)) {
      return NextResponse.json(
        { error: 'Invalid outputType. Must be DIGI_BOOK or LULU_BOOK' },
        { status: 400 }
      )
    }

    // Validate Paddle API key
    if (!PADDLE_API_KEY) {
      console.error('PADDLE_API_KEY not configured')
      return NextResponse.json(
        { error: 'Payment configuration error' },
        { status: 500 }
      )
    }

    const isHardcover = outputType === 'LULU_BOOK'
    const priceId = PADDLE_PRICES[outputType as keyof typeof PADDLE_PRICES]

    // Build custom data for webhook processing
    const customData: Record<string, string> = {
      name: formData?.name || '',
      age: formData?.age?.toString() || '',
      storyline: formData?.storyline || '',
      outputType
    }

    if (formData?.shippingName) customData.shippingName = formData.shippingName
    if (formData?.shippingAddress1) customData.shippingAddress1 = formData.shippingAddress1
    if (formData?.shippingAddress2) customData.shippingAddress2 = formData.shippingAddress2
    if (formData?.shippingCity) customData.shippingCity = formData.shippingCity
    if (formData?.shippingRegion) customData.shippingRegion = formData.shippingRegion
    if (formData?.shippingPostalCode) customData.shippingPostalCode = formData.shippingPostalCode
    if (formData?.shippingCountry) customData.shippingCountry = formData.shippingCountry
    if (formData?.shippingPhone) customData.shippingPhone = formData.shippingPhone
    if (formData?.shippingLevel) customData.shippingLevel = formData.shippingLevel
    if (typeof formData?.shippingCost !== 'undefined') customData.shippingCost = formData.shippingCost.toString()
    if (typeof formData?.orderTotal !== 'undefined') customData.orderTotal = formData.orderTotal.toString()

    // Build transaction items
    const items: PaddleTransactionItem[] = [
      {
        price_id: priceId,
        quantity: 1
      }
    ]

    // Add shipping as a non-catalog item for hardcover orders
    if (isHardcover && formData?.shippingCost && formData.shippingCost > 0) {
      const shippingAmountCents = Math.round(formData.shippingCost * 100).toString()
      const shippingLevelName = getShippingLevelName(formData.shippingLevel)

      items.push({
        quantity: 1,
        price: {
          description: shippingLevelName,
          name: 'Shipping & Handling',
          unit_price: {
            amount: shippingAmountCents,
            currency_code: 'USD'
          },
          product: {
            name: 'Shipping',
            tax_category: 'standard',
            description: 'Shipping to your address'
          }
        }
      })
    }

    // Build the transaction request
    const transactionRequest: PaddleTransactionRequest = {
      items,
      currency_code: 'USD',
      custom_data: customData,
      customer: {
        email
      }
    }

    // Add address for tax calculation (hardcover orders have shipping address)
    if (isHardcover && formData?.shippingCountry) {
      transactionRequest.address = {
        country_code: formData.shippingCountry,
        postal_code: formData.shippingPostalCode || undefined,
        region: formData.shippingRegion || undefined,
        city: formData.shippingCity || undefined,
        first_line: formData.shippingAddress1 || undefined
      }
    }

    // Create transaction via Paddle API
    const paddleResponse = await fetch(`${PADDLE_API_BASE}/transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PADDLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(transactionRequest)
    })

    const paddleData = await paddleResponse.json()

    if (!paddleResponse.ok) {
      console.error('Paddle API error:', paddleData)
      return NextResponse.json(
        { error: 'Failed to create checkout session', details: paddleData },
        { status: 500 }
      )
    }

    const transactionId = paddleData.data?.id
    if (!transactionId) {
      console.error('No transaction ID in Paddle response:', paddleData)
      return NextResponse.json(
        { error: 'Invalid response from payment provider' },
        { status: 500 }
      )
    }

    // Return the transaction ID for the frontend to use
    return NextResponse.json({
      success: true,
      checkout: {
        transactionId,
        email
      }
    })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: 'Failed to initialize checkout' },
      { status: 500 }
    )
  }
}

function getShippingLevelName(level?: string): string {
  switch (level) {
    case 'MAIL':
      return 'Standard Mail Shipping'
    case 'GROUND_HD':
    case 'GROUND_BUS':
    case 'GROUND':
      return 'Ground Shipping'
    case 'PRIORITY_MAIL':
      return 'Priority Mail Shipping'
    case 'EXPEDITED':
      return 'Expedited Shipping'
    case 'EXPRESS':
      return 'Express Shipping'
    default:
      return 'Shipping'
  }
}
