import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export const runtime = 'nodejs'

// Paddle webhook signature verification
function verifyPaddleWebhook(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false

  // Paddle uses ts;h1= format for signatures
  const parts = signature.split(';')
  const tsMatch = parts.find(p => p.startsWith('ts='))
  const h1Match = parts.find(p => p.startsWith('h1='))

  if (!tsMatch || !h1Match) return false

  const ts = tsMatch.replace('ts=', '')
  const h1 = h1Match.replace('h1=', '')

  // Build the signed payload
  const signedPayload = `${ts}:${rawBody}`
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(h1),
    Buffer.from(expectedSignature)
  )
}

interface PaddleEvent {
  event_type: string
  data: {
    id: string
    status: string
    customer_id?: string
    custom_data?: Record<string, string>
    items?: Array<{
      price: {
        id: string
        product_id: string
      }
      quantity: number
    }>
    customer?: {
      email: string
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('paddle-signature')
    const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET

    // Verify webhook signature in production
    if (webhookSecret && webhookSecret !== 'your_webhook_secret') {
      const isValid = verifyPaddleWebhook(rawBody, signature, webhookSecret)
      if (!isValid) {
        console.error('Invalid Paddle webhook signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const event: PaddleEvent = JSON.parse(rawBody)
    console.log('Paddle webhook received:', event.event_type)

    switch (event.event_type) {
      case 'transaction.completed': {
        const { data } = event
        const customData = data.custom_data || {}
        const customerEmail = data.customer?.email

        console.log('Payment completed:', {
          transactionId: data.id,
          email: customerEmail,
          customData
        })

        // TODO: In production, trigger storybook generation here
        // This requires storing the uploaded image before checkout
        // and retrieving it here using an ID from customData

        // For now, log the successful payment
        // The actual job creation will happen when we implement
        // temporary storage for the form data

        break
      }

      case 'transaction.payment_failed': {
        console.log('Payment failed:', event.data.id)
        break
      }

      default:
        console.log('Unhandled event type:', event.event_type)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
