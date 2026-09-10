import { NextRequest, NextResponse } from 'next/server'

import { verifyRazorpaySignature } from '@/lib/razorpay'
import { getSessionUser } from '@/lib/session'
import { getProject, upsertProject } from '@/lib/projects-server'

export const runtime = 'nodejs'

export async function POST (request: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    }

    const body = await request.json()
    const {
      orderId,
      paymentId,
      signature,
      projectId,
      outputType = 'DIGI_BOOK',
      formData = {}
    } = body

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json(
        { error: 'Missing payment signature verification parameters' },
        { status: 400 }
      )
    }

    const isValid = verifyRazorpaySignature({ orderId, paymentId, signature })
    if (!isValid) {
      return NextResponse.json({ error: 'Payment signature verification failed' }, { status: 400 })
    }

    const resolvedProjectId: string = projectId || `proj_${orderId}`
    const existing = await getProject(resolvedProjectId)
    if (existing?.uid && existing.uid !== user.uid && !user.isAdmin) {
      return NextResponse.json({ error: 'This order belongs to another account' }, { status: 403 })
    }
    if (existing?.payment?.orderId && existing.payment.orderId !== orderId) {
      return NextResponse.json({ error: 'Order does not match this project' }, { status: 400 })
    }

    const email = (typeof body.email === 'string' && body.email) || existing?.email || user.email || null
    const characters = Array.isArray(formData.characters) ? formData.characters : existing?.characters || []

    const project = await upsertProject(resolvedProjectId, {
      id: resolvedProjectId,
      uid: existing?.uid || user.uid,
      email,
      status: 'paid',
      paidAt: Date.now(),
      outputType: existing?.outputType || outputType,
      storyline: formData.storyline || existing?.storyline || '',
      characters,
      numCharacters: formData.numCharacters || characters.length || existing?.numCharacters || 1,
      payment: {
        provider: 'razorpay',
        orderId,
        paymentId,
        signature,
        status: 'captured',
        amountMinor: existing?.payment?.amountMinor ?? existing?.amounts?.totalMinor ?? 0,
        currency: existing?.payment?.currency ?? existing?.amounts?.currency ?? 'INR',
        paidAt: Date.now(),
        email
      },
      createdAt: existing?.createdAt || Date.now()
    })

    return NextResponse.json({
      success: true,
      projectId: project.id,
      orderId,
      paymentId
    })
  } catch (error: unknown) {
    console.error('Payment verification failed:', error)
    const message = error instanceof Error ? error.message : 'Verification failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
