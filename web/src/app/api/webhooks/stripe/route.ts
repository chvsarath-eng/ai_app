import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe'
import {
  sendCustomerOrderConfirmation,
  sendOrderNotification,
  type ShippingDetails
} from '@/lib/order-emails'

export const runtime = 'nodejs'

function getStringValue (value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function extractShipping (metadata?: Stripe.Metadata | null): ShippingDetails | null {
  if (!metadata) return null

  const shipping = {
    name: getStringValue(metadata.shippingName),
    address1: getStringValue(metadata.shippingAddress1),
    address2: getStringValue(metadata.shippingAddress2),
    city: getStringValue(metadata.shippingCity),
    region: getStringValue(metadata.shippingRegion),
    postalCode: getStringValue(metadata.shippingPostalCode),
    country: getStringValue(metadata.shippingCountry)
  }

  return Object.values(shipping).some(Boolean) ? shipping : null
}

async function handleCheckoutCompleted (session: Stripe.Checkout.Session) {
  const metadata = session.metadata || {}
  const shipping = extractShipping(metadata)
  const outputType = getStringValue(metadata.outputType)
  const customerEmail = session.customer_details?.email || session.customer_email || undefined
  const customerName = session.customer_details?.name || undefined
  const paymentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id || session.id

  await sendOrderNotification({
    paymentId,
    customerEmail,
    outputType,
    metadata: metadata as Record<string, string>,
    shipping
  })

  if (customerEmail) {
    await sendCustomerOrderConfirmation({
      paymentId,
      customerEmail,
      customerName,
      outputType,
      currencyCode: session.currency || 'usd',
      totalAmount: session.amount_total || 0,
      taxAmount: session.total_details?.amount_tax || 0,
      shipping,
      characterNames: getStringValue(metadata.characterNames),
      numCharacters: metadata.numCharacters ? parseInt(metadata.numCharacters, 10) : undefined
    })
  }
}

export async function POST (request: NextRequest) {
  const stripe = getStripe()
  const webhookSecret = getStripeWebhookSecret()
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')

  let event: Stripe.Event

  try {
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
    }
    if (!signature) {
      throw new Error('Missing stripe-signature header')
    }
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (error) {
    console.error('Stripe webhook signature verification failed:', error)
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.payment_status === 'paid') {
          await handleCheckoutCompleted(session)
        }
        break
      }
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutCompleted(session)
        break
      }
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('Stripe payment failed:', paymentIntent.id, paymentIntent.last_payment_error?.message)
        break
      }
      default:
        console.log('Unhandled Stripe webhook event:', event.type)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook processing failed:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
