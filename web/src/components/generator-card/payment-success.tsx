'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, Sparkles, ArrowRight, Clock, PlusCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

type OutputType = 'DIGI_BOOK' | 'LULU_BOOK'

export function PaymentSuccess ({
  transactionId,
  jobId,
  outputType,
  onCreateAnother
}: {
  transactionId: string
  jobId: string
  outputType: OutputType
  onCreateAnother: () => void
}) {
  const isDigital = outputType === 'DIGI_BOOK'
  const productName = isDigital ? 'Digital Storybook' : 'Premium Hardcover Book'

  return (
    <Card className="relative mx-auto w-full max-w-md overflow-hidden lg:max-w-4xl">
      {/* Success gradient background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-violet-50" />

      <CardContent className="relative z-10 p-6 sm:p-8">
        {/* Desktop: Two-column layout | Mobile: Single column */}
        <div className="lg:flex lg:gap-10">
          {/* Left column: Success message */}
          <div className="flex flex-col items-center text-center lg:w-1/3 lg:justify-center lg:border-r lg:border-zinc-100 lg:pr-10">
            <div className="animate-success-scale mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 shadow-lg shadow-emerald-200 lg:h-20 lg:w-20">
              <Check className="h-8 w-8 text-white lg:h-10 lg:w-10" strokeWidth={3} />
            </div>

            <h2 className="text-xl font-semibold text-zinc-900 sm:text-2xl lg:text-2xl">
              Payment Successful!
            </h2>

            <p className="mt-2 text-sm text-zinc-500 lg:text-base">
              Your order has been placed and your book is being created.
            </p>

            {/* Support - shown on desktop in left column */}
            <p className="mt-4 hidden text-sm text-zinc-400 lg:block">
              Questions?{' '}
              <a href="mailto:team@img2x.com" className="text-violet-500 hover:text-violet-600 underline">
                team@img2x.com
              </a>
            </p>
          </div>

          {/* Right column: Order details & actions */}
          <div className="mt-6 lg:mt-0 lg:flex-1">
            {/* Order details */}
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <span className="text-sm font-medium text-zinc-700">Order Summary</span>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Product</span>
                  <span className="text-sm font-medium text-zinc-800">{productName}</span>
                </div>
                {transactionId && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Receipt</span>
                    <a
                      href={`/api/payments/${transactionId}/invoice`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-violet-600 underline hover:text-violet-700"
                    >
                      View receipt
                    </a>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Order ID</span>
                  <span className="max-w-[180px] truncate font-mono text-xs text-zinc-600" title={jobId}>
                    {jobId}
                  </span>
                </div>
                {transactionId ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-500">Payment</span>
                    <span className="max-w-[180px] truncate font-mono text-xs text-zinc-600" title={transactionId}>
                      {transactionId}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* What happens next */}
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100">
                  <Clock className="h-4 w-4 text-violet-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-violet-900">What happens next?</h3>
                  <p className="mt-1 text-sm text-violet-700">
                    {isDigital
                      ? 'Your storybook will be ready in 10-15 minutes. Check your email!'
                      : 'Your book will ship in 5-7 business days. Check your email for tracking.'
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:gap-3">
              <Button
                onClick={onCreateAnother}
                size="sm"
                className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md hover:shadow-lg sm:flex-1"
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Another
              </Button>

              <Button
                asChild
                variant="ghost"
                size="sm"
                className="w-full text-zinc-500 hover:text-zinc-700 sm:flex-1"
              >
                <Link href={`/order/${jobId}?type=${outputType}&payment=${transactionId}`}>
                  Order Details
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Support - shown on mobile only */}
        <p className="mt-6 text-center text-sm text-zinc-400 lg:hidden">
          Questions?{' '}
          <a href="mailto:team@img2x.com" className="text-violet-500 hover:text-violet-600 underline">
            team@img2x.com
          </a>
        </p>
      </CardContent>
    </Card>
  )
}
