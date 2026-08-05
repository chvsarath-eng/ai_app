import { NextRequest, NextResponse } from 'next/server'
import type DodoPayments from 'dodopayments'
import type { OutputType } from '@/types/storybook'
import { DODO_PRODUCTS, formatMinorUnits, getDodoClient, getDodoProductId } from '@/lib/dodo-payments'

type CharacterFormValue = {
  name?: string
}

type CheckoutFormData = {
  characters?: CharacterFormValue[]
  storyline?: string
  numCharacters?: number
  shippingName?: string
  shippingPhone?: string
  shippingAddress1?: string
  shippingAddress2?: string
  shippingCity?: string
  shippingRegion?: string
  shippingPostalCode?: string
  shippingCountry?: string
  shippingLevel?: string
  shippingCost?: number
  orderTotal?: number
}

type CreateCheckoutBody = {
  email?: string
  outputType?: OutputType
  discountCode?: string
  formData?: CheckoutFormData
}

function getOrigin (request: NextRequest) {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host')

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }

  return request.nextUrl.origin
}

function buildMetadata (outputType: OutputType, formData: CheckoutFormData = {}) {
  const characters = Array.isArray(formData.characters) ? formData.characters : []
  const characterNames = characters
    .map((character) => character?.name || '')
    .filter(Boolean)

  const metadata: Record<string, string> = {
    outputType,
    storyline: formData.storyline || '',
    characters: JSON.stringify(characters),
    characterNames: characterNames.join(', '),
    numCharacters: String(formData.numCharacters || characters.length || 1)
  }

  const optionalFields: Record<string, string | number | undefined> = {
    shippingName: formData.shippingName,
    shippingPhone: formData.shippingPhone,
    shippingAddress1: formData.shippingAddress1,
    shippingAddress2: formData.shippingAddress2,
    shippingCity: formData.shippingCity,
    shippingRegion: formData.shippingRegion,
    shippingPostalCode: formData.shippingPostalCode,
    shippingCountry: formData.shippingCountry,
    shippingLevel: formData.shippingLevel,
    shippingCost: formData.shippingCost,
    orderTotal: formData.orderTotal
  }

  Object.entries(optionalFields).forEach(([key, value]) => {
    if (typeof value === 'undefined' || value === '') return
    metadata[key] = String(value)
  })

  return metadata
}

function buildBillingAddress (outputType: OutputType, formData: CheckoutFormData): DodoPayments.CheckoutSessionBillingAddress | undefined {
  if (outputType !== 'LULU_BOOK' || !formData.shippingCountry) {
    return undefined
  }

  return {
    country: formData.shippingCountry as DodoPayments.CountryCode,
    city: formData.shippingCity || undefined,
    state: formData.shippingRegion || undefined,
    street: formData.shippingAddress1 || undefined,
    zipcode: formData.shippingPostalCode || undefined
  }
}

function buildProductCart (outputType: OutputType, formData: CheckoutFormData): DodoPayments.CheckoutSessionCreateParams['product_cart'] {
  const productCart: DodoPayments.CheckoutSessionCreateParams['product_cart'] = [
    {
      product_id: getDodoProductId(outputType),
      quantity: 1
    }
  ]

  if (outputType === 'LULU_BOOK') {
    const shippingCost = Number(formData.shippingCost || 0)
    if (shippingCost > 0) {
      if (!DODO_PRODUCTS.SHIPPING) {
        throw new Error('DODO_PRODUCT_SHIPPING_ID is not configured')
      }

      productCart.push({
        product_id: DODO_PRODUCTS.SHIPPING,
        quantity: 1,
        amount: formatMinorUnits(shippingCost)
      })
    }
  }

  return productCart
}

async function createCheckoutSession (request: NextRequest, body: CreateCheckoutBody) {
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const outputType = body.outputType
  const formData = body.formData || {}

  if (!outputType) {
    return NextResponse.json(
      { error: 'Missing required field: outputType' },
      { status: 400 }
    )
  }

  if (!getDodoProductId(outputType)) {
    return NextResponse.json(
      { error: 'Payment product not configured for selected book type' },
      { status: 500 }
    )
  }

  if (outputType === 'LULU_BOOK') {
    const requiredFields = [
      formData.shippingName,
      formData.shippingAddress1,
      formData.shippingCity,
      formData.shippingRegion,
      formData.shippingPostalCode,
      formData.shippingCountry
    ]

    if (requiredFields.some((value) => !value)) {
      return NextResponse.json(
        { error: 'Missing shipping details for hardcover checkout' },
        { status: 400 }
      )
    }
  }

  const client = getDodoClient()
  const metadata = buildMetadata(outputType, formData)
  const billingAddress = buildBillingAddress(outputType, formData)
  const origin = getOrigin(request)
  const customer = email
    ? {
        email,
        phone_number: formData.shippingPhone || undefined
      }
    : undefined
  const customization = {
    theme: 'light',
    show_order_details: false,
    show_on_demand_tag: false,
    force_language: 'en',
    theme_config: {
      font_primary_url: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
      font_size: 'md',
      font_weight: 'medium',
      radius: '12px',
      pay_button_text: 'Continue to Payment',
      light: {
        bg_primary: '#ffffff',
        bg_secondary: '#ffffff',
        text_primary: '#18181b',
        text_secondary: '#71717a',
        button_primary: '#7c3aed',
        button_primary_hover: '#7c3aed',
        button_text_primary: '#ffffff',
        border_primary: '#e4e4e7'
      },
      dark: {
        bg_primary: '#18181b',
        bg_secondary: '#18181b',
        text_primary: '#fafafa',
        text_secondary: '#d4d4d8',
        button_primary: '#7c3aed',
        button_primary_hover: '#6d28d9',
        button_text_primary: '#ffffff',
        border_primary: '#3f3f46'
      }
    }
  } as unknown as DodoPayments.CheckoutSessionCreateParams['customization']

  const checkoutSession = await client.checkoutSessions.create({
    product_cart: buildProductCart(outputType, formData),
    customer,
    billing_address: billingAddress,
    discount_code: body.discountCode || undefined,
    metadata,
    return_url: `${origin}/checkout?payment_return=1`,
    feature_flags: {
      allow_customer_editing_email: true,
      allow_discount_code: true,
      allow_currency_selection: false,
      allow_phone_number_collection: outputType === 'LULU_BOOK',
      redirect_immediately: true
    },
    customization
  })

  if (!checkoutSession.checkout_url) {
    return NextResponse.json(
      { error: 'Payment provider did not return a checkout URL' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    checkout: {
      sessionId: checkoutSession.session_id,
      checkoutUrl: checkoutSession.checkout_url,
      email: email || null
    }
  })
}

async function verifyCheckoutSession (request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  const client = getDodoClient()
  const session = await client.checkoutSessions.retrieve(sessionId)

  if (!session.payment_id) {
    return NextResponse.json({
      success: true,
      checkout: {
        sessionId,
        status: session.payment_status || 'requires_payment_method'
      }
    })
  }

  const payment = await client.payments.retrieve(session.payment_id)

  return NextResponse.json({
    success: true,
    checkout: {
      sessionId,
      paymentId: payment.payment_id,
      status: payment.status || session.payment_status || 'processing',
      customerEmail: payment.customer.email,
      invoiceUrl: payment.invoice_url || null,
      metadata: payment.metadata
    }
  })
}

export async function POST (request: NextRequest) {
  try {
    const body = await request.json() as CreateCheckoutBody
    return await createCheckoutSession(request, body)
  } catch (error) {
    console.error('Dodo checkout creation failed:', error)
    return NextResponse.json(
      { error: 'Failed to initialize checkout' },
      { status: 500 }
    )
  }
}

export async function GET (request: NextRequest) {
  try {
    return await verifyCheckoutSession(request)
  } catch (error) {
    console.error('Dodo checkout verification failed:', error)
    return NextResponse.json(
      { error: 'Failed to verify checkout session' },
      { status: 500 }
    )
  }
}
