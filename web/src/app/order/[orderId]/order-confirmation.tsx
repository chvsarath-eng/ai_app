'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, Mail, Sparkles, ArrowRight, Clock, Truck, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Eyebrow, Accent } from '@/components/page-header'

type OutputType = 'DIGI_BOOK' | 'LULU_BOOK'

export function OrderConfirmation ({
  orderId,
  outputType,
  transactionId
}: {
  orderId: string
  outputType: OutputType
  transactionId?: string
}) {
  const isDigital = outputType === 'DIGI_BOOK'
  const tone = isDigital ? 'violet' : 'emerald'
  const iconBox = isDigital
    ? 'bg-gradient-to-br from-violet-500 to-pink-500 text-white'
    : 'bg-gradient-to-br from-emerald-500 to-cyan-500 text-white'
  const smallIcon = isDigital
    ? 'bg-gradient-to-br from-violet-600 via-fuchsia-500 to-pink-500 text-white shadow-sm'
    : 'bg-gradient-to-br from-emerald-600 to-cyan-600 text-white shadow-sm'

  const deliverables = isDigital
    ? [
        { icon: Sparkles, title: 'Interactive HTML flipbook', description: 'Beautiful flipbook you can view on any device' },
        { icon: FileText, title: 'PDF download', description: 'High-quality PDF to save and share' }
      ]
    : [
        { icon: FileText, title: 'PDF download', description: 'High-quality PDF sent to your email' },
        { icon: Truck, title: 'Printed hardcover book', description: '8.5×8.5" premium book delivered to your door' }
      ]

  return (
    <div className="flex min-h-[80vh] items-center justify-center py-12 sm:py-16">
      <div className="mx-auto w-full max-w-xl">
        <div className="flex flex-col items-center gap-3 text-center">
          <Eyebrow tone={tone}>
            <Check className="h-3 w-3" aria-hidden="true" />
            {isDigital ? 'Digital book' : 'Premium hardcover'} ordered
          </Eyebrow>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-800 sm:text-4xl">
            Your storybook is <Accent tone={tone}>on its way</Accent>
          </h1>
          <p className="max-w-md text-sm text-zinc-500 sm:text-base">
            {isDigital
              ? 'We\'re creating your digital storybook. Check your email soon.'
              : 'We\'re preparing your premium hardcover book for printing and delivery.'}
          </p>
        </div>

        <Card className="mt-8 p-6 sm:p-8">
          <div className="flex items-start gap-4 border-b border-zinc-100 pb-6">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBox}`}>
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">Check your inbox</h3>
              <p className="mt-1 text-sm text-zinc-500">
                {isDigital
                  ? <>Your digital book will arrive within <span className="font-medium text-zinc-700">10–15 minutes</span>.</>
                  : <>Your PDF will arrive within <span className="font-medium text-zinc-700">10–15 minutes</span>. The printed book ships in <span className="font-medium text-zinc-700">5–7 business days</span>.</>}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <h4 className="text-xs font-medium uppercase tracking-widest text-zinc-400">What you&apos;ll receive</h4>
            {deliverables.map((item) => {
              const Icon = item.icon
              return (
                <div key={item.title} className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${smallIcon}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{item.title}</p>
                    <p className="text-sm text-zinc-500">{item.description}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 flex items-center justify-between rounded-2xl border border-zinc-200/70 bg-zinc-50 px-4 py-3">
            <span className="text-xs text-zinc-500">Order ID</span>
            <span className="font-mono text-xs text-zinc-600">{orderId}</span>
          </div>

          {transactionId ? (
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-zinc-200/70 bg-zinc-50 px-4 py-3">
              <span className="text-xs text-zinc-500">Receipt</span>
              <a
                className="text-xs font-semibold text-violet-600 underline hover:text-violet-700"
                href={`/api/payments/${transactionId}/invoice`}
                target="_blank"
                rel="noreferrer"
              >
                Download PDF
              </a>
            </div>
          ) : null}
        </Card>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-zinc-400">
          <Clock className="h-4 w-4" />
          <span>
            {isDigital
              ? 'Email delivery: 10–15 minutes'
              : 'Email: 10–15 min · Printed book: 5–7 business days'}
          </span>
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button asChild variant="outline" className="w-full bg-white/80 sm:w-auto">
            <Link href="/projects">View my books</Link>
          </Button>
          <Button asChild className="w-full font-semibold sm:w-auto">
            <Link href="/#create">
              Create another book
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <p className="mt-6 text-center text-sm text-zinc-500">
          Need help? Email{' '}
          <a className="font-semibold text-violet-600 underline hover:text-violet-700" href="mailto:team@img2x.com">
            team@img2x.com
          </a>
        </p>
      </div>
    </div>
  )
}
