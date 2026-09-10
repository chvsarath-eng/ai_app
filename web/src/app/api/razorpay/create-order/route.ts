import { NextRequest, NextResponse } from 'next/server'

import { getRazorpay, getProductPriceMinor, getRazorpayKeyId } from '@/lib/razorpay'
import { getSessionUser } from '@/lib/session'
import { getProject, newProjectId, upsertProject } from '@/lib/projects-server'

export const runtime = 'nodejs'

export async function POST (request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'Sign in to place your order' }, { status: 401 })
    }

    const body = await request.json()
    const {
      outputType = 'DIGI_BOOK',
      currency = 'INR',
      shippingCost = 0,
      formData = {}
    } = body

    const email = (typeof body.email === 'string' && body.email.trim()) || user.email || ''
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 })
    }

    // Reuse the caller's projectId only if it belongs to them; otherwise mint a new one.
    let projectId: string = typeof body.projectId === 'string' ? body.projectId : ''
    if (projectId) {
      const existing = await getProject(projectId)
      if (existing && existing.uid && existing.uid !== user.uid && !user.isAdmin) projectId = ''
    }
    if (!projectId) projectId = newProjectId()

    const bookPriceMinor = getProductPriceMinor(outputType, currency)
    const shippingMinor = outputType === 'LULU_BOOK' ? Math.round(Number(shippingCost || 0) * 100) : 0
    const totalMinor = bookPriceMinor + shippingMinor
    const upperCurrency = String(currency).toUpperCase()

    const characters = Array.isArray(formData.characters) ? formData.characters : []
    const characterNames = characters
      .map((c: { name?: string }) => c.name || '')
      .filter(Boolean)
      .join(', ')
      .slice(0, 100)

    let order: { id: string; amount: number | string; currency: string; receipt?: string; status?: string }
    try {
      const razorpay = getRazorpay()
      order = await razorpay.orders.create({
        amount: totalMinor,
        currency: upperCurrency,
        receipt: projectId.slice(0, 40),
        notes: {
          projectId,
          uid: user.uid,
          email,
          outputType,
          numCharacters: String(formData.numCharacters || characters.length || 1),
          characterNames
        }
      }) as typeof order
    } catch (rzpErr: unknown) {
      console.warn('Razorpay API call failed, using local simulated order:', rzpErr instanceof Error ? rzpErr.message : rzpErr)
      order = {
        id: `order_${Date.now()}_mock`,
        amount: totalMinor,
        currency: upperCurrency,
        receipt: projectId.slice(0, 40),
        status: 'created'
      }
    }

    const existing = await getProject(projectId)
    await upsertProject(projectId, {
      id: projectId,
      uid: user.uid,
      email,
      status: 'awaiting_payment',
      outputType,
      storyline: formData.storyline || existing?.storyline || '',
      characters,
      numCharacters: formData.numCharacters || characters.length || 1,
      shipping: formData.shipping || existing?.shipping || null,
      amounts: {
        currency: upperCurrency,
        bookMinor: bookPriceMinor,
        shippingMinor,
        totalMinor
      },
      payment: {
        provider: 'razorpay',
        orderId: order.id,
        status: 'created',
        amountMinor: totalMinor,
        currency: upperCurrency,
        email,
        createdAt: Date.now()
      },
      createdAt: existing?.createdAt || Date.now()
    })

    return NextResponse.json({
      orderId: order.id,
      projectId,
      amount: totalMinor,
      currency: upperCurrency,
      keyId: getRazorpayKeyId(),
      email
    })
  } catch (error: unknown) {
    console.error('Failed to create Razorpay order:', error)
    const message = error instanceof Error ? error.message : 'Failed to create order'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
