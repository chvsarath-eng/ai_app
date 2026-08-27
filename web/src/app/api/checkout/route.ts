import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import type { OutputType } from '@/types/storybook'
import {
  buildBookLineItem,
  buildShippingLineItem,
  getStripe,
  isStripeAutomaticTaxEnabled,
  truncateMetadataValue
} from '@/lib/stripe'

export const runtime = 'nodejs'

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
  consents?: {
    ageConfirmed?: boolean
    likenessPermission?: boolean
    termsAccepted?: boolean
  }
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
    storyline: truncateMetadataValue(formData.storyline || ''),
    characters: truncateMetadataValue(JSON.stringify(characters)),
    characterNames: truncateMetadataValue(characterNames.join(', ')),
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
    metadata[key] = truncateMetadataValue(String(value))
  })

  return metadata
}

function mapPaymentStatus (session: Stripe.Checkout.Session) {
  if (session.payment_status === 'paid') return 'succeeded'
  if (session.status === 'expired') return 'cancelled'
  if (session.payment_status === 'unpaid') return 'requires_payment_method'
  return session.payment_status || 'processing'
}

async function createCheckoutSession (request: NextRequest, body: CreateCheckoutBody) {
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const outputType = body.outputType
  const formData = body.formData || {}
  const consents = body.consents || {}

  if (!outputType) {
    return NextResponse.json(
      { error: 'Missing required field: outputType' },
      { status: 400 }
    )
  }

  if (!email || !/\S+@\S+\.\S+/.test(email)) {
    return NextResponse.json(
      { error: 'A valid email address is required' },
      { status: 400 }
    )
  }

  if (!consents.ageConfirmed || !consents.likenessPermission || !consents.termsAccepted) {
    return NextResponse.json(
      { error: 'Required checkout consents are missing' },
      { status: 400 }
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

  const stripe = getStripe()
  const origin = getOrigin(request)
  const metadata = buildMetadata(outputType, formData)
  metadata.ageConfirmed = 'true'
  metadata.likenessPermission = 'true'
  metadata.termsAccepted = 'true'

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    buildBookLineItem(outputType)
  ]

  if (outputType === 'LULU_BOOK') {
    const shippingItem = buildShippingLineItem(Number(formData.shippingCost || 0))
    if (shippingItem) {
      lineItems.push(shippingItem)
    }
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'payment',
    customer_email: email,
    line_items: lineItems,
    success_url: `${origin}/checkout?payment_return=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout?payment_cancelled=1`,
    metadata,
    payment_intent_data: {
      metadata
    },
    automatic_tax: {
      enabled: isStripeAutomaticTaxEnabled()
    },
    billing_address_collection: 'required',
    phone_number_collection: {
      enabled: outputType === 'LULU_BOOK'
    },
    allow_promotion_codes: true,
    locale: 'auto'
  }

  if (isStripeAutomaticTaxEnabled()) {
    sessionParams.tax_id_collection = { enabled: true }
  }

  if (body.discountCode) {
    // Promotion codes are entered on Stripe Checkout; store intended code for support.
    metadata.discountCode = truncateMetadataValue(body.discountCode)
  }

  const checkoutSession = await stripe.checkout.sessions.create(sessionParams)

  if (!checkoutSession.url) {
    return NextResponse.json(
      { error: 'Payment provider did not return a checkout URL' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    success: true,
    checkout: {
      sessionId: checkoutSession.id,
      checkoutUrl: checkoutSession.url,
      email
    }
  })
}

async function verifyCheckoutSession (request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId')

  if (!sessionId) {
    return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  const stripe = getStripe()
  const session = await stripe.checkout.sessions.retrieve(sessionId)
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id

  const status = mapPaymentStatus(session)

  if (status !== 'succeeded' || !paymentIntentId) {
    return NextResponse.json({
      success: true,
      checkout: {
        sessionId,
        status
      }
    })
  }

  return NextResponse.json({
    success: true,
    checkout: {
      sessionId,
      paymentId: paymentIntentId,
      status,
      customerEmail: session.customer_details?.email || session.customer_email || null,
      invoiceUrl: session.invoice
        ? null
        : null,
      metadata: session.metadata || {}
    }
  })
}

export async function POST (request: NextRequest) {
  try {
    const body = await request.json() as CreateCheckoutBody
    return await createCheckoutSession(request, body)
  } catch (error) {
    console.error('Stripe checkout creation failed:', error)
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
    console.error('Stripe checkout verification failed:', error)
    return NextResponse.json(
      { error: 'Failed to verify checkout session' },
      { status: 500 }
    )
  }
}
