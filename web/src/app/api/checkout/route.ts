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
  customer_id?: string
  address_id?: string
}

// Create or get a Paddle customer by email
async function getOrCreateCustomer(email: string): Promise<string> {
  // First, try to find existing customer by email
  const searchResponse = await fetch(
    `${PADDLE_API_BASE}/customers?email=${encodeURIComponent(email)}`,
    {
      headers: {
        'Authorization': `Bearer ${PADDLE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  )

  if (searchResponse.ok) {
    const searchData = await searchResponse.json()
    if (searchData.data && searchData.data.length > 0) {
      return searchData.data[0].id
    }
  }

  // Customer doesn't exist, create one
  const createResponse = await fetch(`${PADDLE_API_BASE}/customers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PADDLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email })
  })

  if (!createResponse.ok) {
    const errorData = await createResponse.json()
    console.error('Failed to create customer:', errorData)
    throw new Error('Failed to create customer')
  }

  const createData = await createResponse.json()
  return createData.data.id
}

// Create an address for a customer
async function createAddress(
  customerId: string,
  address: {
    countryCode: string
    postalCode?: string
    region?: string
    city?: string
    firstLine?: string
  }
): Promise<string> {
  const addressPayload: Record<string, string> = {
    country_code: address.countryCode
  }

  if (address.postalCode) addressPayload.postal_code = address.postalCode
  if (address.region) addressPayload.region = address.region
  if (address.city) addressPayload.city = address.city
  if (address.firstLine) addressPayload.first_line = address.firstLine

  const response = await fetch(`${PADDLE_API_BASE}/customers/${customerId}/addresses`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PADDLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(addressPayload)
  })

  if (!response.ok) {
    const errorData = await response.json()
    console.error('Failed to create address:', errorData)
    throw new Error('Failed to create address')
  }

  const data = await response.json()
  return data.data.id
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
    const characters = formData?.characters || []
    const characterNames = characters.map((c: { name?: string }) => c?.name || '').filter(Boolean)
    const customData: Record<string, string> = {
      characters: JSON.stringify(characters),
      storyline: formData?.storyline || '',
      outputType,
      numCharacters: (formData?.numCharacters || characters.length || 1).toString(),
      characterNames: characterNames.join(', ')
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

    // Create customer and address in Paddle for tax calculation
    // For hardcover: pre-create customer + address for accurate tax display
    // For digital: skip customer creation - let Paddle checkout collect country for tax
    let customerId: string | undefined
    let addressId: string | undefined

    if (isHardcover && formData?.shippingCountry) {
      try {
        // Create or get customer
        customerId = await getOrCreateCustomer(email)

        // Create address for tax calculation with full shipping details
        addressId = await createAddress(customerId, {
          countryCode: formData.shippingCountry,
          postalCode: formData.shippingPostalCode,
          region: formData.shippingRegion,
          city: formData.shippingCity,
          firstLine: formData.shippingAddress1
        })
      } catch (err) {
        console.error('Error creating customer/address:', err)
        // Continue without customer/address - Paddle will collect at checkout
        customerId = undefined
        addressId = undefined
      }
    }
    // For digital orders, we intentionally skip customer/address creation
    // This allows Paddle checkout to collect the customer's country and calculate tax

    // Build the transaction request
    const transactionRequest: PaddleTransactionRequest = {
      items,
      currency_code: 'USD',
      custom_data: customData
    }

    // Only add customer and address IDs for hardcover orders where we have both
    // For digital orders, leaving these out lets Paddle collect location for tax
    if (isHardcover && customerId && addressId) {
      transactionRequest.customer_id = customerId
      transactionRequest.address_id = addressId
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
