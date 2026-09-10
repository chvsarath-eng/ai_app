import { NextRequest, NextResponse } from 'next/server'
import { verifyRazorpayWebhookSignature } from '@/lib/razorpay'
import { getProject, upsertProject } from '@/lib/projects-server'
import { sendCustomerOrderConfirmation, sendOrderNotification } from '@/lib/order-emails'
import { startProjectGeneration } from '@/lib/start-generation'

export const runtime = 'nodejs'

export async function POST (request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-razorpay-signature') || ''

    if (process.env.RAZORPAY_WEBHOOK_SECRET) {
      const isValid = verifyRazorpayWebhookSignature({
        body: rawBody,
        signature
      })
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
      }
    }

    const event = JSON.parse(rawBody)
    const eventType = event.event
    const payload = event.payload || {}
    const payment = payload.payment?.entity || {}
    const order = payload.order?.entity || {}

    const orderId = order.id || payment.order_id
    const paymentId = payment.id
    const email = payment.email || order.notes?.email
    const projectId = order.notes?.projectId

    const docId: string | null = projectId || (orderId ? `proj_${orderId}` : null)

    if (eventType === 'order.paid' || eventType === 'payment.captured') {
      if (docId) {
        try {
          const existing = await getProject(docId)
          // Never regress a project that has already moved on to generation.
          const keepStatus = existing && ['starting', 'generating', 'ready', 'failed'].includes(existing.status)
          await upsertProject(docId, {
            id: docId,
            ...(keepStatus ? {} : { status: 'paid' }),
            paidAt: existing?.paidAt || Date.now(),
            email: existing?.email || email || null,
            payment: {
              provider: 'razorpay',
              orderId,
              paymentId,
              status: 'captured',
              amountMinor: payment.amount,
              currency: payment.currency,
              method: payment.method,
              email,
              contact: payment.contact,
              paidAt: existing?.payment?.paidAt || Date.now()
            },
            createdAt: existing?.createdAt || Date.now()
          })
          const generation = await startProjectGeneration(docId)
          if (!generation.ok) {
            console.warn('Webhook could not start generation', docId, generation.error)
          }
        } catch (err) {
          console.error('Webhook project update error:', err)
        }
      }

      // Send emails
      if (email && paymentId) {
        try {
          await Promise.allSettled([
            sendCustomerOrderConfirmation({
              paymentId,
              customerEmail: email,
              totalAmount: payment.amount,
              currencyCode: payment.currency,
              outputType: order.notes?.outputType || 'DIGI_BOOK'
            }),
            sendOrderNotification({
              paymentId,
              customerEmail: email,
              outputType: order.notes?.outputType || 'DIGI_BOOK',
              metadata: order.notes || {}
            })
          ])
        } catch (mailErr) {
          console.warn('Could not send confirmation email:', mailErr)
        }
      }
    } else if (eventType === 'payment.failed') {
      if (docId) {
        try {
          await upsertProject(docId, {
            payment: {
              provider: 'razorpay',
              orderId,
              paymentId,
              status: 'failed',
              error: {
                code: payment.error_code,
                description: payment.error_description
              }
            }
          })
        } catch (err) {
          console.error('Webhook payment-failed update error:', err)
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: unknown) {
    console.error('Razorpay webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
