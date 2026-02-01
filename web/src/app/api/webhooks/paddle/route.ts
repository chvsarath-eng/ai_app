import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import nodemailer from 'nodemailer'

export const runtime = 'nodejs'

// Fetch customer details from Paddle API
async function fetchPaddleCustomer(customerId: string): Promise<{ email?: string, name?: string } | null> {
  const apiKey = process.env.PADDLE_API_KEY
  if (!apiKey) {
    console.warn('PADDLE_API_KEY not configured, cannot fetch customer')
    return null
  }

  const isSandbox = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === 'sandbox'
  const baseUrl = isSandbox ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com'

  try {
    const response = await fetch(`${baseUrl}/customers/${customerId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.error('Failed to fetch Paddle customer:', response.status, await response.text())
      return null
    }

    const result = await response.json()
    return {
      email: result.data?.email,
      name: result.data?.name
    }
  } catch (error) {
    console.error('Error fetching Paddle customer:', error)
    return null
  }
}

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

interface PaddleItem {
  price: {
    id: string
    product_id: string
    name?: string
    description?: string
    unit_price?: {
      amount: string
      currency_code: string
    }
  }
  product?: {
    name?: string
    description?: string
  }
  quantity: number
  totals?: {
    subtotal: string
    tax: string
    total: string
  }
}

interface PaddleEvent {
  event_type: string
  data: {
    id: string
    status: string
    customer_id?: string
    currency_code?: string
    custom_data?: Record<string, unknown>
    details?: {
      totals?: {
        subtotal: string
        tax: string
        total: string
        grand_total: string
      }
    }
    items?: PaddleItem[]
    customer?: {
      email: string
      name?: string
    }
    billing_period?: {
      starts_at: string
      ends_at: string
    }
    created_at?: string
    updated_at?: string
  }
}

type ShippingDetails = {
  name?: string
  address1?: string
  address2?: string
  city?: string
  region?: string
  postalCode?: string
  country?: string
}

function getStringValue (value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function extractShipping (customData?: Record<string, unknown>): ShippingDetails | null {
  if (!customData) return null

  const shipping = {
    name: getStringValue(customData.shippingName),
    address1: getStringValue(customData.shippingAddress1),
    address2: getStringValue(customData.shippingAddress2),
    city: getStringValue(customData.shippingCity),
    region: getStringValue(customData.shippingRegion),
    postalCode: getStringValue(customData.shippingPostalCode),
    country: getStringValue(customData.shippingCountry)
  }

  const hasAny = Object.values(shipping).some((value) => Boolean(value))
  return hasAny ? shipping : null
}

async function sendOrderNotification (payload: {
  transactionId: string
  customerEmail?: string
  outputType?: string
  items?: Array<{ priceId: string, productId: string, quantity: number }>
  shipping?: ShippingDetails | null
  customData?: Record<string, unknown>
}) {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !port || !user || !pass) {
    console.warn('SMTP not configured, skipping order email')
    return
  }

  const to = process.env.ORDER_NOTIFY_TO ?? process.env.CONTACT_TO ?? 'team@img2x.com'
  const from = process.env.CONTACT_FROM ?? user

  const lines = [
    `Transaction: ${payload.transactionId}`,
    payload.customerEmail ? `Customer email: ${payload.customerEmail}` : 'Customer email: (missing)',
    payload.outputType ? `Output type: ${payload.outputType}` : 'Output type: (unknown)'
  ]

  if (payload.items?.length) {
    lines.push('', 'Items:')
    payload.items.forEach((item) => {
      lines.push(`- ${item.productId} (${item.priceId}) x ${item.quantity}`)
    })
  }

  if (payload.shipping) {
    lines.push('', 'Shipping:')
    if (payload.shipping.name) lines.push(`Name: ${payload.shipping.name}`)
    if (payload.shipping.address1) lines.push(`Address 1: ${payload.shipping.address1}`)
    if (payload.shipping.address2) lines.push(`Address 2: ${payload.shipping.address2}`)
    if (payload.shipping.city) lines.push(`City: ${payload.shipping.city}`)
    if (payload.shipping.region) lines.push(`Region: ${payload.shipping.region}`)
    if (payload.shipping.postalCode) lines.push(`Postal code: ${payload.shipping.postalCode}`)
    if (payload.shipping.country) lines.push(`Country: ${payload.shipping.country}`)
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: {
      user,
      pass
    }
  })

  await transporter.sendMail({
    from: `img2x Orders <${from}>`,
    to,
    replyTo: payload.customerEmail,
    subject: 'New img2x order',
    text: lines.join('\n')
  })
}

// Customer-facing order confirmation email
async function sendCustomerOrderConfirmation(payload: {
  transactionId: string
  customerEmail: string
  customerName?: string
  outputType?: string
  currencyCode?: string
  items?: Array<{ name?: string, quantity: number, total?: string }>
  totals?: { subtotal?: string, tax?: string, total?: string }
  shipping?: ShippingDetails | null
}) {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !port || !user || !pass) {
    console.warn('SMTP not configured, skipping customer confirmation email')
    return
  }

  const from = user
  const isHardcover = payload.outputType === 'LULU_BOOK'
  const productName = isHardcover ? 'Personalized Hardcover Storybook' : 'Personalized Digital Storybook (PDF)'
  const currency = payload.currencyCode || 'USD'

  // Format currency amount
  const formatAmount = (amount?: string) => {
    if (!amount) return '$0.00'
    const num = parseInt(amount, 10) / 100
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(num)
  }

  const receiptUrl = `https://img2x.com/api/paddle/transactions/${payload.transactionId}/invoice`
  const supportEmail = 'team@img2x.com'

  // Build HTML email
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid #e5e7eb;">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #7c3aed;">img2x</h1>
              <p style="margin: 8px 0 0; font-size: 14px; color: #6b7280;">AI-Powered Personalized Storybooks</p>
            </td>
          </tr>

          <!-- Success Message -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <div style="width: 64px; height: 64px; margin: 0 auto 20px; background-color: #ecfdf5; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 32px;">✓</span>
              </div>
              <h2 style="margin: 0 0 8px; font-size: 24px; font-weight: 600; color: #111827;">Thank You for Your Order!</h2>
              <p style="margin: 0; font-size: 16px; color: #6b7280;">
                ${payload.customerName ? `Hi ${payload.customerName}, ` : ''}Your payment has been successfully processed.
              </p>
            </td>
          </tr>

          <!-- Order Details -->
          <tr>
            <td style="padding: 20px 40px;">
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px;">
                <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #111827;">Order Details</h3>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">Order ID</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #111827; text-align: right; font-family: monospace;">${payload.transactionId}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">Product</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #111827; text-align: right;">${productName}</td>
                  </tr>
                  ${payload.totals?.subtotal ? `
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">Subtotal</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #111827; text-align: right;">${formatAmount(payload.totals.subtotal)}</td>
                  </tr>
                  ` : ''}
                  ${payload.totals?.tax ? `
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #6b7280;">Tax</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #111827; text-align: right;">${formatAmount(payload.totals.tax)}</td>
                  </tr>
                  ` : ''}
                  ${payload.totals?.total ? `
                  <tr style="border-top: 1px solid #e5e7eb;">
                    <td style="padding: 12px 0 8px; font-size: 16px; font-weight: 600; color: #111827;">Total</td>
                    <td style="padding: 12px 0 8px; font-size: 16px; font-weight: 600; color: #7c3aed; text-align: right;">${formatAmount(payload.totals.total)}</td>
                  </tr>
                  ` : ''}
                </table>
              </div>
            </td>
          </tr>

          ${payload.shipping && isHardcover ? `
          <!-- Shipping Address -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background-color: #f9fafb; border-radius: 8px; padding: 24px;">
                <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #111827;">Shipping Address</h3>
                <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
                  ${payload.shipping.name ? `${payload.shipping.name}<br>` : ''}
                  ${payload.shipping.address1 ? `${payload.shipping.address1}<br>` : ''}
                  ${payload.shipping.address2 ? `${payload.shipping.address2}<br>` : ''}
                  ${payload.shipping.city ? `${payload.shipping.city}` : ''}${payload.shipping.region ? `, ${payload.shipping.region}` : ''} ${payload.shipping.postalCode || ''}<br>
                  ${payload.shipping.country || ''}
                </p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- What's Next -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background-color: #faf5ff; border-radius: 8px; padding: 24px; border-left: 4px solid #7c3aed;">
                <h3 style="margin: 0 0 12px; font-size: 16px; font-weight: 600; color: #7c3aed;">What's Next?</h3>
                <p style="margin: 0; font-size: 14px; color: #374151; line-height: 1.6;">
                  ${isHardcover
                    ? 'Your personalized storybook is now being created! Our AI is crafting unique 4K illustrations based on your photos. Once complete, your hardcover book will be printed and shipped to the address above. You\'ll receive another email with tracking information when it ships.'
                    : 'Your personalized storybook is now being created! Our AI is crafting unique 4K illustrations based on your photos. You\'ll receive another email with your download link once it\'s ready (typically within 15-30 minutes).'
                  }
                </p>
              </div>
            </td>
          </tr>

          <!-- Receipt Button -->
          <tr>
            <td style="padding: 0 40px 20px; text-align: center;">
              <a href="${receiptUrl}" style="display: inline-block; padding: 14px 32px; background-color: #7c3aed; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Download Receipt
              </a>
            </td>
          </tr>

          <!-- Support -->
          <tr>
            <td style="padding: 20px 40px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #6b7280;">
                Questions about your order?
              </p>
              <a href="mailto:${supportEmail}" style="font-size: 14px; color: #7c3aed; text-decoration: none;">
                ${supportEmail}
              </a>
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" style="width: 100%; max-width: 600px; margin-top: 20px;">
          <tr>
            <td style="text-align: center; padding: 20px;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} img2x. All rights reserved.
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #9ca3af;">
                <a href="https://img2x.com/privacy" style="color: #9ca3af; text-decoration: none;">Privacy Policy</a> • 
                <a href="https://img2x.com/terms" style="color: #9ca3af; text-decoration: none;">Terms of Service</a> • 
                <a href="https://img2x.com/refund" style="color: #9ca3af; text-decoration: none;">Refund Policy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  // Plain text fallback
  const text = `
Thank You for Your Order!

${payload.customerName ? `Hi ${payload.customerName},` : ''}Your payment has been successfully processed.

ORDER DETAILS
-------------
Order ID: ${payload.transactionId}
Product: ${productName}
${payload.totals?.subtotal ? `Subtotal: ${formatAmount(payload.totals.subtotal)}` : ''}
${payload.totals?.tax ? `Tax: ${formatAmount(payload.totals.tax)}` : ''}
${payload.totals?.total ? `Total: ${formatAmount(payload.totals.total)}` : ''}

${payload.shipping && isHardcover ? `
SHIPPING ADDRESS
----------------
${payload.shipping.name || ''}
${payload.shipping.address1 || ''}
${payload.shipping.address2 || ''}
${payload.shipping.city || ''}, ${payload.shipping.region || ''} ${payload.shipping.postalCode || ''}
${payload.shipping.country || ''}
` : ''}

WHAT'S NEXT?
------------
${isHardcover
  ? 'Your personalized storybook is now being created! Our AI is crafting unique 4K illustrations based on your photos. Once complete, your hardcover book will be printed and shipped. You\'ll receive another email with tracking information when it ships.'
  : 'Your personalized storybook is now being created! Our AI is crafting unique 4K illustrations based on your photos. You\'ll receive another email with your download link once it\'s ready (typically within 15-30 minutes).'
}

Download your receipt: ${receiptUrl}

Questions? Contact us at ${supportEmail}

---
© ${new Date().getFullYear()} img2x. All rights reserved.
https://img2x.com
  `.trim()

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: {
      user,
      pass
    }
  })

  await transporter.sendMail({
    from: `img2x <${from}>`,
    to: payload.customerEmail,
    subject: 'Your img2x Order Confirmation',
    text,
    html
  })

  console.log('Customer confirmation email sent to:', payload.customerEmail)
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
        const outputType = getStringValue(customData.outputType)

        // Fetch customer details from Paddle API (webhook doesn't include email)
        let customerEmail = data.customer?.email
        let customerName = data.customer?.name

        if (!customerEmail && data.customer_id) {
          console.log('Fetching customer details from Paddle API for:', data.customer_id)
          const customer = await fetchPaddleCustomer(data.customer_id)
          if (customer) {
            customerEmail = customer.email
            customerName = customer.name
            console.log('Fetched customer email:', customerEmail)
          }
        }
        const shipping = extractShipping(customData)
        const currencyCode = data.currency_code
        const totals = data.details?.totals

        const items = data.items?.map((item) => ({
          priceId: item.price.id,
          productId: item.price.product_id,
          quantity: item.quantity
        }))

        const itemsForCustomer = data.items?.map((item) => ({
          name: item.product?.name || item.price.name || 'Personalized Storybook',
          quantity: item.quantity,
          total: item.totals?.total
        }))

        console.log('Payment completed:', {
          transactionId: data.id,
          email: customerEmail,
          customData
        })

        // Send internal team notification
        await sendOrderNotification({
          transactionId: data.id,
          customerEmail,
          outputType,
          items,
          shipping,
          customData
        })

        // Send customer order confirmation email
        if (customerEmail) {
          await sendCustomerOrderConfirmation({
            transactionId: data.id,
            customerEmail,
            customerName,
            outputType,
            currencyCode,
            items: itemsForCustomer,
            totals: totals ? {
              subtotal: totals.subtotal,
              tax: totals.tax,
              total: totals.grand_total || totals.total
            } : undefined,
            shipping
          })
        }

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
