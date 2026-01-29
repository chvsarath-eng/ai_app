import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  message: z.string().trim().min(1).max(2000)
})

export async function POST (request: Request) {
  let payload: z.infer<typeof schema>

  try {
    payload = schema.parse(await request.json())
  } catch (error) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !port || !user || !pass) {
    return NextResponse.json({ error: 'Email service not configured' }, { status: 500 })
  }

  const to = process.env.CONTACT_TO ?? 'team@img2x.com'
  const from = process.env.CONTACT_FROM ?? user

  try {
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
      from: `img2x Contact <${from}>`,
      replyTo: payload.email,
      to,
      subject: 'Special request from img2x',
      text: `Email: ${payload.email}\n\nMessage:\n${payload.message}`
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
