import { NextResponse } from 'next/server'
import { getDodoClient } from '@/lib/dodo-payments'

export const runtime = 'nodejs'

export async function GET (
  request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const { paymentId } = await params

  if (!paymentId) {
    return NextResponse.json({ error: 'Invalid payment id' }, { status: 400 })
  }

  try {
    const client = getDodoClient()
    const payment = await client.payments.retrieve(paymentId)

    if (payment.invoice_url) {
      return NextResponse.redirect(payment.invoice_url)
    }

    const invoiceResponse = await client.invoices.payments.retrieve(paymentId)
    const arrayBuffer = await invoiceResponse.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': invoiceResponse.headers.get('content-type') || 'application/pdf',
        'Content-Disposition': `inline; filename="${paymentId}.pdf"`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    console.error('Failed to fetch Dodo invoice:', error)
    return NextResponse.json(
      { error: 'Failed to fetch invoice' },
      { status: 500 }
    )
  }
}
