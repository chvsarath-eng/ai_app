'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, Mail, Sparkles, Book, ArrowRight, Clock, Truck, FileText } from 'lucide-react'

import { Button } from '@/components/ui/button'

type OutputType = 'DIGI_BOOK' | 'LULU_BOOK'

export function OrderConfirmation ({ orderId, outputType }: { orderId: string; outputType: OutputType }) {
  const isDigital = outputType === 'DIGI_BOOK'
  return (
    <div className="relative min-h-[85vh]">
      {/* Subtle Background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-50 via-white to-violet-50/30" />
      </div>

      <div className="flex min-h-[85vh] items-center justify-center px-4 py-12">
        <div className="mx-auto w-full max-w-xl">
          
          {/* Success Badge - Small & Elegant */}
          <div className="mb-6 flex justify-center">
            <div className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ring-1 ${isDigital ? 'bg-violet-50 text-violet-700 ring-violet-200/80' : 'bg-emerald-50 text-emerald-700 ring-emerald-200/80'}`}>
              <Check className="h-4 w-4" />
              {isDigital ? 'Digital Book' : 'Premium Hardcover'} ordered
            </div>
          </div>

          {/* Main Heading */}
          <h1 className="text-center text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            Your storybook is on its way
          </h1>
          
          <p className="mx-auto mt-3 max-w-md text-center text-zinc-500">
            {isDigital 
              ? "We're creating your digital storybook. Check your email soon."
              : "We're preparing your premium hardcover book for printing and delivery."
            }
          </p>

          {/* Main Content Card */}
          <div className="mt-8 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm sm:p-8">
            
            {/* Email notification */}
            <div className="flex items-start gap-4 border-b border-zinc-100 pb-6">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isDigital ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'}`}>
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-medium text-zinc-900">Check your inbox</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  {isDigital 
                    ? <>Your digital book will arrive within <span className="font-medium text-zinc-700">10-15 minutes</span></>
                    : <>Your PDF will arrive within <span className="font-medium text-zinc-700">10-15 minutes</span>. Printed book ships in <span className="font-medium text-zinc-700">5-7 business days</span></>
                  }
                </p>
              </div>
            </div>

            {/* What you'll receive */}
            <div className="mt-6 space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">What you'll receive</h4>
              
              {isDigital ? (
                <>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-800">Interactive HTML Flipbook</p>
                      <p className="text-sm text-zinc-500">Beautiful flipbook you can view on any device</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-100 text-violet-600">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-800">PDF Download</p>
                      <p className="text-sm text-zinc-500">High-quality PDF to save and share</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-800">PDF Download</p>
                      <p className="text-sm text-zinc-500">High-quality PDF sent to your email</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
                      <Truck className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-800">Printed Hardcover Book</p>
                      <p className="text-sm text-zinc-500">8.5×8.5" premium book delivered to your door</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Order ID */}
            <div className="mt-6 flex items-center justify-between rounded-lg bg-zinc-50 px-4 py-3">
              <span className="text-xs text-zinc-500">Order ID</span>
              <span className="font-mono text-xs text-zinc-600">{orderId}</span>
            </div>
          </div>

          {/* Estimated time indicator */}
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-zinc-400">
            <Clock className="h-4 w-4" />
            <span>
              {isDigital 
                ? 'Email delivery: 10-15 minutes'
                : 'Email: 10-15 min • Printed book: 5-7 business days'
              }
            </span>
          </div>

          {/* Actions */}
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/">
                Back to home
              </Link>
            </Button>
            <Button asChild className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md hover:shadow-lg sm:w-auto">
              <Link href="/">
                Create another book
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

        </div>
      </div>
    </div>
  )
}
