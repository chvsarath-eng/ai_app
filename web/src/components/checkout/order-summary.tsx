'use client'

import { ShoppingBag, Lock, Book, Sparkles } from 'lucide-react'
import type { CheckoutData } from '@/lib/checkout-store'
import type { ShippingOption } from '@/app/checkout/page'

interface OrderSummaryProps {
  store: CheckoutData
  selectedShipping: ShippingOption | null
}

export function OrderSummary ({
  store,
  selectedShipping
}: OrderSummaryProps) {
  const isHardcover = store.outputType === 'LULU_BOOK'
  const bookPrice = isHardcover ? store.bookPrice : 14.99
  const shippingCost = isHardcover ? (selectedShipping?.shipping_cost || 0) : 0
  const subtotal = bookPrice + shippingCost

  return (
    <div className="sticky top-24 rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-zinc-100 bg-zinc-50/50 px-6 py-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
          <ShoppingBag className="h-5 w-5 text-emerald-600" />
          Order Summary
        </h2>
      </div>

      <div className="p-6 space-y-6">
        {/* Product */}
        <div className="flex gap-4">
          {/* Book preview image */}
          <div className="relative h-20 w-20 shrink-0 rounded-lg bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center overflow-hidden">
            {store.imagePreviewUrl ? (
              <img
                src={store.imagePreviewUrl}
                alt="Your photo"
                className="h-full w-full object-cover"
              />
            ) : isHardcover ? (
              <Book className="h-8 w-8 text-emerald-400" />
            ) : (
              <Sparkles className="h-8 w-8 text-violet-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-zinc-900 truncate">
              Personalized Storybook
            </h3>
            <p className="text-sm text-zinc-500 mt-0.5">
              {isHardcover
                ? 'Premium Hardcover · 8.5×8.5"'
                : 'Digital Book · Interactive HTML'}
            </p>
            <p className="text-sm text-zinc-500 mt-0.5 truncate">
              Featuring: {store.name}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-100" />

        {/* Price breakdown */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-600">
              {isHardcover ? 'Hardcover Book' : 'Digital Book'}
            </span>
            <span className="font-medium text-zinc-900">${bookPrice.toFixed(2)}</span>
          </div>
          {isHardcover && (
            <div className="flex justify-between">
              <span className="text-zinc-600">Shipping</span>
              {selectedShipping ? (
                <span className="font-medium text-zinc-900">${shippingCost.toFixed(2)}</span>
              ) : (
                <span className="text-zinc-400">—</span>
              )}
            </div>
          )}
          <div className="flex justify-between text-zinc-500">
            <span>Tax</span>
            <span>Calculated at payment</span>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-200" />

        {/* Total */}
        <div className="flex justify-between items-baseline">
          <span className="text-base font-semibold text-zinc-900">Subtotal</span>
          <span className="text-xl font-bold text-emerald-600">
            ${subtotal.toFixed(2)}
          </span>
        </div>

        {/* Security note */}
        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-zinc-400">
          <Lock className="h-3.5 w-3.5" />
          <span>Secure checkout powered by Paddle</span>
        </div>
      </div>
    </div>
  )
}
