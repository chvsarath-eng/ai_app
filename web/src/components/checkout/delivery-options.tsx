'use client'

import { Truck, Calendar, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ShippingOption } from '@/app/checkout/page'

interface DeliveryOptionsProps {
  isAddressComplete: boolean
  shippingLoading: boolean
  shippingError: string | null
  shippingOptions: ShippingOption[]
  selectedShipping: ShippingOption | null
  onSelectShipping: (option: ShippingOption) => void
}

export function DeliveryOptions ({
  isAddressComplete,
  shippingLoading,
  shippingError,
  shippingOptions,
  selectedShipping,
  onSelectShipping
}: DeliveryOptionsProps) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 mb-6">
        <Truck className="h-5 w-5 text-emerald-600" />
        Delivery Options
      </h2>

      {/* Not ready state */}
      {!isAddressComplete && !shippingLoading && (
        <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-6 text-center">
          <Truck className="h-8 w-8 text-zinc-300 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">
            Enter your shipping address above to see delivery options
          </p>
        </div>
      )}

      {/* Loading state */}
      {shippingLoading && (
        <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-6">
          <div className="flex items-center justify-center gap-3">
            <svg className="h-5 w-5 animate-spin text-emerald-600" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm text-zinc-600">Calculating shipping options...</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {shippingError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">Unable to calculate shipping</p>
              <p className="text-sm text-red-600 mt-1">{shippingError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Shipping options */}
      {shippingOptions.length > 0 && (
        <div className="space-y-3">
          {shippingOptions.map((option) => (
            <label
              key={option.level}
              className={cn(
                'flex cursor-pointer items-start justify-between rounded-xl border-2 p-4 transition-all',
                selectedShipping?.level === option.level
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                  : 'border-zinc-200 hover:border-zinc-300 bg-white'
              )}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="shippingOption"
                  value={option.level}
                  checked={selectedShipping?.level === option.level}
                  onChange={() => onSelectShipping(option)}
                  className="mt-1 h-4 w-4 text-emerald-600 border-zinc-300 focus:ring-emerald-500"
                />
                <div>
                  <p className="font-medium text-zinc-900">{option.description}</p>
                  {option.estimatedDelivery && (
                    <p className="flex items-center gap-1 text-sm text-zinc-500 mt-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Arrives {option.estimatedDelivery}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-base font-semibold text-zinc-900">
                ${option.shipping_cost.toFixed(2)}
              </p>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
