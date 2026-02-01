import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function getPaddleBaseUrl () {
  const env = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT || 'sandbox'
  return env === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com'
}

export async function GET (
  request: Request,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  const { transactionId } = await params
  if (!transactionId || !transactionId.startsWith('txn_')) {
    return NextResponse.json({ error: 'Invalid transaction id' }, { status: 400 })
  }

  const apiKey = process.env.PADDLE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Paddle API key not configured' }, { status: 500 })
  }

  const baseUrl = getPaddleBaseUrl()
  const url = `${baseUrl}/transactions/${encodeURIComponent(transactionId)}/invoice?disposition=inline`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    cache: 'no-store'
  })

  if (!res.ok) {
    const text = await res.text()
    return NextResponse.json({ error: text || 'Failed to fetch invoice' }, { status: res.status })
  }

  const data = await res.json() as { data?: { url?: string } }
  const invoiceUrl = data?.data?.url
  if (!invoiceUrl) {
    return NextResponse.json({ error: 'Invoice URL not available yet' }, { status: 404 })
  }

  return NextResponse.redirect(invoiceUrl)
}
