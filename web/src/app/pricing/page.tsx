import { PricingCards } from '@/components/pricing-cards'

export default function PricingPage () {
  return (
    <div className="py-10 sm:py-12">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Pricing</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
          No payment flow in the MVP — just clear tiers and clean UI.
        </p>
      </div>

      <PricingCards />

      <p className="mt-6 text-sm text-zinc-500">
        Payments and billing will be added later. For now, use the generator on the home page.
      </p>
    </div>
  )
}

