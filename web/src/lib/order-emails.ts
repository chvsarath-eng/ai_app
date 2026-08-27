import nodemailer from 'nodemailer'

export type ShippingDetails = {
  name?: string
  address1?: string
  address2?: string
  city?: string
  region?: string
  postalCode?: string
  country?: string
}

function formatAmount (amount: number | undefined, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase()
  }).format((amount || 0) / 100)
}

function getTransporter () {
  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !port || !user || !pass) {
    return null
  }

  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: {
      user,
      pass
    }
  })
}

export async function sendOrderNotification (payload: {
  paymentId: string
  customerEmail?: string
  outputType?: string
  metadata?: Record<string, string>
  shipping?: ShippingDetails | null
}) {
  const transporter = getTransporter()
  const from = process.env.CONTACT_FROM ?? process.env.SMTP_USER
  const to = process.env.ORDER_NOTIFY_TO ?? process.env.CONTACT_TO ?? 'team@img2x.com'

  if (!transporter || !from) {
    console.warn('SMTP not configured, skipping order notification')
    return
  }

  const characterNames = payload.metadata?.characterNames || '(unknown)'
  const numCharacters = payload.metadata?.numCharacters || '1'
  const lines = [
    `Payment: ${payload.paymentId}`,
    payload.customerEmail ? `Customer email: ${payload.customerEmail}` : 'Customer email: (missing)',
    payload.outputType ? `Output type: ${payload.outputType}` : 'Output type: (unknown)',
    `Characters: ${characterNames} (${numCharacters})`
  ]

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

  await transporter.sendMail({
    from: `img2x Orders <${from}>`,
    to,
    replyTo: payload.customerEmail,
    subject: 'New img2x order',
    text: lines.join('\n')
  })
}

export async function sendCustomerOrderConfirmation (payload: {
  paymentId: string
  customerEmail: string
  customerName?: string
  outputType?: string
  currencyCode?: string
  totalAmount?: number
  taxAmount?: number
  shipping?: ShippingDetails | null
  characterNames?: string
  numCharacters?: number
}) {
  const transporter = getTransporter()
  const from = process.env.SMTP_USER

  if (!transporter || !from) {
    console.warn('SMTP not configured, skipping customer confirmation email')
    return
  }

  const isHardcover = payload.outputType === 'LULU_BOOK'
  const currency = payload.currencyCode || 'USD'
  const subtotal = Math.max((payload.totalAmount || 0) - (payload.taxAmount || 0), 0)
  const productName = isHardcover ? 'Personalized Hardcover Storybook' : 'Personalized Digital Storybook'
  const charLabel = payload.characterNames || 'your characters'
  const receiptUrl = `https://img2x.com/api/payments/${payload.paymentId}/invoice`
  const supportEmail = 'team@img2x.com'

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" style="width:100%;max-width:600px;border-collapse:collapse;background:#ffffff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
          <tr>
            <td style="padding:40px 40px 20px;text-align:center;border-bottom:1px solid #e5e7eb;">
              <img src="https://img2x.com/brand/img2x-logo-transparent.png" alt="img2x" width="140" style="display:block;margin:0 auto;" />
              <p style="margin:12px 0 0;font-size:14px;color:#6b7280;">AI-Powered Personalized Storybooks</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 40px 20px;text-align:center;">
              <div style="width:64px;height:64px;margin:0 auto 20px;background-color:#10b981;border-radius:50%;line-height:64px;text-align:center;">
                <span style="font-size:28px;color:#ffffff;">✓</span>
              </div>
              <h2 style="margin:0 0 8px;font-size:24px;font-weight:600;color:#111827;">Thank You for Your Order!</h2>
              <p style="margin:0;font-size:16px;color:#6b7280;">
                ${payload.customerName ? `Hi ${payload.customerName}, ` : ''}your payment has been successfully processed.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;">
              <div style="background:#f9fafb;border-radius:8px;padding:24px;">
                <h3 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111827;">Order Details</h3>
                <table role="presentation" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td style="padding:8px 0;font-size:14px;color:#6b7280;">Payment ID</td>
                    <td style="padding:8px 0;font-size:14px;color:#111827;text-align:right;font-family:monospace;">${payload.paymentId}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:14px;color:#6b7280;">Product</td>
                    <td style="padding:8px 0;font-size:14px;color:#111827;text-align:right;">${productName}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:14px;color:#6b7280;">Subtotal</td>
                    <td style="padding:8px 0;font-size:14px;color:#111827;text-align:right;">${formatAmount(subtotal, currency)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:14px;color:#6b7280;">Tax</td>
                    <td style="padding:8px 0;font-size:14px;color:#111827;text-align:right;">${formatAmount(payload.taxAmount, currency)}</td>
                  </tr>
                  <tr style="border-top:1px solid #e5e7eb;">
                    <td style="padding:12px 0 8px;font-size:16px;font-weight:600;color:#111827;">Total</td>
                    <td style="padding:12px 0 8px;font-size:16px;font-weight:600;color:#7c3aed;text-align:right;">${formatAmount(payload.totalAmount, currency)}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>
          ${payload.shipping && isHardcover ? `
          <tr>
            <td style="padding:0 40px 20px;">
              <div style="background:#f9fafb;border-radius:8px;padding:24px;">
                <h3 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111827;">Shipping Address</h3>
                <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
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
          <tr>
            <td style="padding:0 40px 20px;">
              <div style="background:#faf5ff;border-radius:8px;padding:24px;border-left:4px solid #7c3aed;">
                <h3 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#7c3aed;">What's Next?</h3>
                <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
                  Your personalized storybook featuring <strong>${charLabel}</strong>${payload.numCharacters && payload.numCharacters > 1 ? ` (${payload.numCharacters} characters)` : ''} is now being created.
                  ${isHardcover ? ' Once complete, your hardcover book will be printed and shipped to the address above.' : ' You will receive another email with your download link once it is ready.'}
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 20px;text-align:center;">
              <a href="${receiptUrl}" style="display:inline-block;padding:14px 32px;background-color:#7c3aed;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
                Download Receipt
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Questions about your order?</p>
              <a href="mailto:${supportEmail}" style="font-size:14px;color:#7c3aed;text-decoration:none;">${supportEmail}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()

  const text = [
    'Thank You for Your Order!',
    '',
    payload.customerName ? `Hi ${payload.customerName},` : '',
    'Your payment has been successfully processed.',
    '',
    `Payment ID: ${payload.paymentId}`,
    `Product: ${productName}`,
    `Subtotal: ${formatAmount(subtotal, currency)}`,
    `Tax: ${formatAmount(payload.taxAmount, currency)}`,
    `Total: ${formatAmount(payload.totalAmount, currency)}`,
    '',
    `Receipt: ${receiptUrl}`,
    '',
    `Questions? Contact us at ${supportEmail}`
  ].filter(Boolean).join('\n')

  await transporter.sendMail({
    from: `img2x <${from}>`,
    to: payload.customerEmail,
    subject: 'Your img2x Order Confirmation',
    text,
    html
  })
}
