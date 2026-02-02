'use client'

import { useState, useEffect, useCallback } from 'react'
import { MapPin, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CheckoutData } from '@/lib/checkout-store'

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AU', name: 'Australia' },
  { code: 'NZ', name: 'New Zealand' },
  { code: 'IE', name: 'Ireland' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'PL', name: 'Poland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'HU', name: 'Hungary' },
  { code: 'RO', name: 'Romania' },
  { code: 'GR', name: 'Greece' },
  { code: 'TR', name: 'Turkey' },
  { code: 'IL', name: 'Israel' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'IN', name: 'India' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'PH', name: 'Philippines' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'HK', name: 'Hong Kong' },
  { code: 'TW', name: 'Taiwan' },
  { code: 'MX', name: 'Mexico' },
  { code: 'BR', name: 'Brazil' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'ZA', name: 'South Africa' }
]

interface ShippingFormProps {
  store: CheckoutData & {
    setShippingAddress: (address: Partial<CheckoutData>) => void
  }
  onAddressComplete: () => void
  isSubmitting: boolean
}

export function ShippingForm ({ store, onAddressComplete, isSubmitting }: ShippingFormProps) {
  const [showAddress2, setShowAddress2] = useState(Boolean(store.shippingAddress2))
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Create address key for change detection
  const addressKey = `${store.shippingName}|${store.shippingAddress1}|${store.shippingCity}|${store.shippingRegion}|${store.shippingPostalCode}|${store.shippingCountry}`

  // Debounce the address complete check - only when address fields change
  useEffect(() => {
    const isComplete = Boolean(
      store.shippingName &&
      store.shippingAddress1 &&
      store.shippingCity &&
      store.shippingRegion &&
      store.shippingPostalCode &&
      store.shippingCountry
    )

    if (!isComplete) return

    const timer = setTimeout(() => {
      onAddressComplete()
    }, 500)

    return () => clearTimeout(timer)
  }, [addressKey]) // Only re-run when address actually changes

  const handleChange = (field: keyof CheckoutData, value: string) => {
    store.setShippingAddress({ [field]: value })
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateField = (field: string, value: string, label: string) => {
    if (!value.trim()) {
      setErrors(prev => ({ ...prev, [field]: `${label} is required` }))
      return false
    }
    return true
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 mb-6">
        <MapPin className="h-5 w-5 text-emerald-600" />
        Shipping Address
      </h2>

      <div className="space-y-4">
        {/* Full Name */}
        <div className="space-y-2">
          <Label htmlFor="shippingName">
            Full name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="shippingName"
            placeholder="John Doe"
            autoComplete="name"
            disabled={isSubmitting}
            value={store.shippingName}
            onChange={(e) => handleChange('shippingName', e.target.value)}
            onBlur={(e) => validateField('shippingName', e.target.value, 'Full name')}
            className={errors.shippingName ? 'border-red-500' : ''}
          />
          {errors.shippingName && (
            <p className="text-sm text-red-600">{errors.shippingName}</p>
          )}
        </div>

        {/* Phone (optional) */}
        <div className="space-y-2">
          <Label htmlFor="shippingPhone">
            Phone number <span className="text-zinc-400">(optional, for delivery updates)</span>
          </Label>
          <Input
            id="shippingPhone"
            type="tel"
            placeholder="+1 (555) 123-4567"
            autoComplete="tel"
            disabled={isSubmitting}
            value={store.shippingPhone}
            onChange={(e) => handleChange('shippingPhone', e.target.value)}
          />
        </div>

        {/* Street Address */}
        <div className="space-y-2">
          <Label htmlFor="shippingAddress1">
            Street address <span className="text-red-500">*</span>
          </Label>
          <Input
            id="shippingAddress1"
            placeholder="123 Main Street"
            autoComplete="address-line1"
            disabled={isSubmitting}
            value={store.shippingAddress1}
            onChange={(e) => handleChange('shippingAddress1', e.target.value)}
            onBlur={(e) => validateField('shippingAddress1', e.target.value, 'Street address')}
            className={errors.shippingAddress1 ? 'border-red-500' : ''}
          />
          {errors.shippingAddress1 && (
            <p className="text-sm text-red-600">{errors.shippingAddress1}</p>
          )}
        </div>

        {/* Address Line 2 - Hidden behind link */}
        {showAddress2 ? (
          <div className="space-y-2">
            <Label htmlFor="shippingAddress2">
              Apartment, suite, etc. <span className="text-zinc-400">(optional)</span>
            </Label>
            <Input
              id="shippingAddress2"
              placeholder="Apt 4B"
              autoComplete="address-line2"
              disabled={isSubmitting}
              value={store.shippingAddress2}
              onChange={(e) => handleChange('shippingAddress2', e.target.value)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddress2(true)}
            className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add apartment, suite, etc.
          </button>
        )}

        {/* City, State, ZIP */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="shippingCity">
              City <span className="text-red-500">*</span>
            </Label>
            <Input
              id="shippingCity"
              placeholder="New York"
              autoComplete="address-level2"
              disabled={isSubmitting}
              value={store.shippingCity}
              onChange={(e) => handleChange('shippingCity', e.target.value)}
              onBlur={(e) => validateField('shippingCity', e.target.value, 'City')}
              className={errors.shippingCity ? 'border-red-500' : ''}
            />
            {errors.shippingCity && (
              <p className="text-sm text-red-600">{errors.shippingCity}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="shippingRegion">
              State/Region <span className="text-red-500">*</span>
            </Label>
            <Input
              id="shippingRegion"
              placeholder="NY"
              autoComplete="address-level1"
              disabled={isSubmitting}
              value={store.shippingRegion}
              onChange={(e) => handleChange('shippingRegion', e.target.value)}
              onBlur={(e) => validateField('shippingRegion', e.target.value, 'State/Region')}
              className={errors.shippingRegion ? 'border-red-500' : ''}
            />
            {errors.shippingRegion && (
              <p className="text-sm text-red-600">{errors.shippingRegion}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="shippingPostalCode">
              ZIP/Postal <span className="text-red-500">*</span>
            </Label>
            <Input
              id="shippingPostalCode"
              placeholder="10001"
              autoComplete="postal-code"
              disabled={isSubmitting}
              value={store.shippingPostalCode}
              onChange={(e) => handleChange('shippingPostalCode', e.target.value)}
              onBlur={(e) => validateField('shippingPostalCode', e.target.value, 'ZIP/Postal code')}
              className={errors.shippingPostalCode ? 'border-red-500' : ''}
            />
            {errors.shippingPostalCode && (
              <p className="text-sm text-red-600">{errors.shippingPostalCode}</p>
            )}
          </div>
        </div>

        {/* Country */}
        <div className="space-y-2">
          <Label htmlFor="shippingCountry">
            Country <span className="text-red-500">*</span>
          </Label>
          <select
            id="shippingCountry"
            autoComplete="country"
            disabled={isSubmitting}
            value={store.shippingCountry}
            onChange={(e) => handleChange('shippingCountry', e.target.value)}
            onBlur={(e) => validateField('shippingCountry', e.target.value, 'Country')}
            className={`flex h-11 w-full rounded-xl border bg-white px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              errors.shippingCountry ? 'border-red-500' : 'border-zinc-200'
            }`}
          >
            <option value="">Select a country</option>
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          {errors.shippingCountry && (
            <p className="text-sm text-red-600">{errors.shippingCountry}</p>
          )}
        </div>
      </div>
    </div>
  )
}
