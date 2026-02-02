import { NextRequest, NextResponse } from 'next/server'
import { calculateShippingCost, BOOK_BASE_PRICE_USD } from '@/lib/lulu'

export const runtime = 'nodejs'

interface ShippingCostRequest {
  shipping_address: {
    name: string
    street1: string
    street2?: string
    city: string
    state_code: string
    postcode: string
    country_code: string
    phone_number?: string
  }
  quantity?: number
}

export async function POST(request: NextRequest) {
  try {
    const body: ShippingCostRequest = await request.json()
    
    // Validate required fields
    const { shipping_address, quantity = 1 } = body
    
    if (!shipping_address) {
      return NextResponse.json(
        { error: 'shipping_address is required' },
        { status: 400 }
      )
    }
    
    const requiredFields = ['name', 'street1', 'city', 'state_code', 'postcode', 'country_code']
    const missingFields = requiredFields.filter(f => !shipping_address[f as keyof typeof shipping_address])
    
    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      )
    }
    
    // Call Lulu API to calculate shipping cost
    const result = await calculateShippingCost({
      name: shipping_address.name,
      street1: shipping_address.street1,
      street2: shipping_address.street2,
      city: shipping_address.city,
      state_code: shipping_address.state_code,
      postcode: shipping_address.postcode,
      country_code: shipping_address.country_code,
      phone_number: shipping_address.phone_number
    }, quantity)
    
    if (!result.valid) {
      return NextResponse.json({
        valid: false,
        errors: result.errors,
        book_price: BOOK_BASE_PRICE_USD,
        shipping_options: [],
        currency: 'USD'
      })
    }
    
    // Format response with total calculations
    const shippingOptionsWithTotal = result.shipping_options.map(option => ({
      level: option.level,
      description: option.description,
      shipping_cost: option.cost,
      book_price: BOOK_BASE_PRICE_USD,
      total: parseFloat((BOOK_BASE_PRICE_USD + option.cost).toFixed(2)),
      currency: option.currency
    }))
    
    return NextResponse.json({
      valid: true,
      book_price: BOOK_BASE_PRICE_USD,
      shipping_options: shippingOptionsWithTotal,
      currency: result.currency,
      // Include manufacturing cost for reference (what Lulu charges us)
      manufacturing_cost: result.book_manufacturing_cost
    })
  } catch (error) {
    console.error('Shipping cost calculation error:', error)
    return NextResponse.json(
      { error: 'Failed to calculate shipping cost' },
      { status: 500 }
    )
  }
}
