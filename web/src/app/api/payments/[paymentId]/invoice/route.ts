import { NextResponse } from 'next/server'
import { getStripe } from '@/lib/stripe'

export const runtime = 'nodejs'

export async function GET (
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const { paymentId } = await params

  if (!paymentId) {
    return NextResponse.json({ error: 'Invalid payment id' }, { status: 400 })
  }

  try {
    const stripe = getStripe()

    if (paymentId.startsWith('cs_')) {
      const session = await stripe.checkout.sessions.retrieve(paymentId)
      if (session.url && session.status !== 'complete') {
        return NextResponse.redirect(session.url)
      }
      if (typeof session.invoice === 'string') {
        const invoice = await stripe.invoices.retrieve(session.invoice)
        if (invoice.hosted_invoice_url) {
          return NextResponse.redirect(invoice.hosted_invoice_url)
        }
      }
      if (typeof session.payment_intent === 'string') {
        const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent)
        const chargeId = typeof paymentIntent.latest_charge === 'string'
          ? paymentIntent.latest_charge
          : paymentIntent.latest_charge?.id
        if (chargeId) {
          const charge = await stripe.charges.retrieve(chargeId)
          if (charge.receipt_url) {
            return NextResponse.redirect(charge.receipt_url)
          }
        }
      }
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId)
    const chargeId = typeof paymentIntent.latest_charge === 'string'
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id

    if (chargeId) {
      const charge = await stripe.charges.retrieve(chargeId)
      if (charge.receipt_url) {
        return NextResponse.redirect(charge.receipt_url)
      }
    }

    return NextResponse.json(
      { error: 'Receipt not available yet' },
      { status: 404 }
    )
  } catch (error) {
    console.error('Failed to fetch Stripe receipt:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoice' },
      { status: 500 }
    )
  }
}
