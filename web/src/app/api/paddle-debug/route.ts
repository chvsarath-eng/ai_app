import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

function getClientTokenInfo (token: string | undefined) {
  if (!token) {
    return { present: false }
  }

  return {
    present: true,
    startsWithTest: token.startsWith('test_'),
    length: token.length
  }
}

function getApiKeyInfo (apiKey: string | undefined) {
  if (!apiKey) {
    return { present: false }
  }

  return {
    present: true,
    isSandboxKey: apiKey.startsWith('pdl_sdbx_'),
    isLiveKey: apiKey.startsWith('pdl_live_')
  }
}

export async function GET () {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
  const apiKey = process.env.PADDLE_API_KEY
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET

  const response = NextResponse.json({
    nodeEnv: process.env.NODE_ENV,
    paddleEnvironment: process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT,
    clientToken: getClientTokenInfo(clientToken),
    prices: {
      digital: Boolean(process.env.NEXT_PUBLIC_PADDLE_PRICE_DIGITAL),
      hardcover: Boolean(process.env.NEXT_PUBLIC_PADDLE_PRICE_HARDCOVER)
    },
    apiKey: getApiKeyInfo(apiKey),
    webhookSecret: {
      present: Boolean(webhookSecret),
      isPlaceholder: webhookSecret === 'your_webhook_secret'
    }
  })

  response.headers.set('Cache-Control', 'no-store')
  return response
}
