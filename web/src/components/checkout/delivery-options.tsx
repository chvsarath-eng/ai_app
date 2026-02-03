'use client'

import { useState, useEffect } from 'react'
import { Truck, Calendar, AlertCircle, ChevronDown, Check } from 'lucide-react'
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
  const [isExpanded, setIsExpanded] = useState(false)

  // Auto-expand when shipping options become available
  useEffect(() => {
    if (shippingOptions.length > 0 && !selectedShipping) {
      setIsExpanded(true)
    }
  }, [shippingOptions, selectedShipping])

  // Collapse after selection (with slight delay for visual feedback)
  const handleSelectShipping = (option: ShippingOption) => {
    onSelectShipping(option)
    setTimeout(() => setIsExpanded(false), 300)
  }

  const isDisabled = !isAddressComplete && !shippingLoading && shippingOptions.length === 0
  const hasSelection = Boolean(selectedShipping)

  return (
    <div className={cn(
      'rounded-xl border bg-white shadow-sm overflow-hidden transition-all',
      isDisabled ? 'border-zinc-100 opacity-60' : 'border-zinc-200'
    )}>
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => !isDisabled && setIsExpanded(!isExpanded)}
        disabled={isDisabled}
        className={cn(
          'w-full flex items-center justify-between p-4 sm:p-5 text-left transition-colors',
          !isDisabled && 'hover:bg-zinc-50',
          isDisabled && 'cursor-not-allowed'
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full shrink-0',
            hasSelection ? 'bg-emerald-100' : 'bg-zinc-100'
          )}>
            {hasSelection ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Truck className={cn('h-4 w-4', isDisabled ? 'text-zinc-300' : 'text-zinc-500')} />
            )}
          </div>
          <div className="min-w-0">
            <h2 className={cn(
              'font-semibold text-sm sm:text-base',
              isDisabled ? 'text-zinc-400' : 'text-zinc-900'
            )}>
              Delivery Options
            </h2>
            {hasSelection && selectedShipping ? (
              <p className="text-xs sm:text-sm text-emerald-600 mt-0.5 truncate">
                {selectedShipping.description} · ${selectedShipping.shipping_cost.toFixed(2)}
              </p>
            ) : isDisabled ? (
              <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
                Complete shipping address first
              </p>
            ) : shippingLoading ? (
              <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">
                Calculating options...
              </p>
            ) : null}
          </div>
        </div>
        
        {!isDisabled && (
          <ChevronDown className={cn(
            'h-5 w-5 text-zinc-400 transition-transform',
            isExpanded && 'rotate-180'
          )} />
        )}
      </button>

      {/* Accordion Content */}
      <div className={cn(
        'overflow-hidden transition-all duration-300',
        isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
      )}>
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0">
          {/* Loading state */}
          {shippingLoading && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-4">
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
            <div className="space-y-2">
              {shippingOptions.map((option) => (
                <label
                  key={option.level}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-lg border p-3 sm:p-4 transition-all',
                    selectedShipping?.level === option.level
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-zinc-200 hover:border-zinc-300 bg-white'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="radio"
                      name="shippingOption"
                      value={option.level}
                      checked={selectedShipping?.level === option.level}
                      onChange={() => handleSelectShipping(option)}
                      className="h-4 w-4 text-emerald-600 border-zinc-300 focus:ring-emerald-500 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-zinc-900 text-sm sm:text-base break-words">{option.description}</p>
                      {option.estimatedDelivery && (
                        <p className="flex items-center gap-1 text-xs sm:text-sm text-zinc-500 mt-0.5">
                          <Calendar className="h-3 w-3 shrink-0" />
                          <span className="truncate">{option.estimatedDelivery}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <p className="text-sm sm:text-base font-semibold text-zinc-900 shrink-0 ml-2">
                    ${option.shipping_cost.toFixed(2)}
                  </p>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
