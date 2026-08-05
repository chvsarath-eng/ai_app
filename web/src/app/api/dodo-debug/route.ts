import { NextResponse } from 'next/server'
import { DODO_PRODUCTS, getDodoEnvironment } from '@/lib/dodo-payments'

export const runtime = 'nodejs'

function getApiKeyInfo (apiKey: string | undefined) {
  if (!apiKey) {
    return { present: false }
  }

  return {
    present: true,
    length: apiKey.length
  }
}

export async function GET () {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const apiKey = process.env.DODO_PAYMENTS_API_KEY
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY

  const response = NextResponse.json({
    nodeEnv: process.env.NODE_ENV,
    dodoEnvironment: getDodoEnvironment(),
    products: {
      digital: Boolean(DODO_PRODUCTS.DIGITAL),
      hardcover: Boolean(DODO_PRODUCTS.HARDCOVER),
      shipping: Boolean(DODO_PRODUCTS.SHIPPING)
    },
    apiKey: getApiKeyInfo(apiKey),
    webhookKey: {
      present: Boolean(webhookKey)
    }
  })

  response.headers.set('Cache-Control', 'no-store')
  return response
}
