import { NextRequest, NextResponse } from 'next/server'

const PADDLE_PRICES = {
  DIGI_BOOK: process.env.NEXT_PUBLIC_PADDLE_PRICE_DIGITAL || 'pri_01kgbfsfghbddqsaz0t77m50qy',
  LULU_BOOK: process.env.NEXT_PUBLIC_PADDLE_PRICE_HARDCOVER || 'pri_01kgbfsgjxhsgab6kp453mqh0n'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, outputType, formData } = body

    // Validate required fields
    if (!email || !outputType) {
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

    // Get the price ID for the selected product
    const priceId = PADDLE_PRICES[outputType as keyof typeof PADDLE_PRICES]

    // Store form data temporarily (in production, use a database or cache)
    // For now, we'll pass it through customData in the checkout
    const customData = {
      name: formData?.name || '',
      age: formData?.age?.toString() || '',
      storyline: formData?.storyline || '',
      outputType
    }

    // Return checkout configuration for the frontend
    return NextResponse.json({
      success: true,
      checkout: {
        priceId,
        email,
        customData
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
