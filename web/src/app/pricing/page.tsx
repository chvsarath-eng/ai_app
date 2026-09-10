import type { Metadata } from 'next'
import Link from 'next/link'

import { PricingCards } from '@/components/pricing-cards'
import { PageHeader, Accent } from '@/components/page-header'

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Digital and Premium Hardcover personalized storybooks with 4K AI illustrations. Simple pricing, local currency and tax calculated at checkout.'
}

export default function PricingPage () {
  return (
    <div className="py-10 sm:py-14">
      <PageHeader
        tone="emerald"
        eyebrow="Pricing"
        title={<>Choose your <Accent tone="emerald">perfect format</Accent></>}
        subtitle="Limited time launch pricing — grab your discount before it's gone"
        className="mb-12"
      />

      <PricingCards />

      <p className="mt-8 text-center text-sm text-zinc-500">
        Have a question about formats or shipping?{' '}
        <Link className="font-semibold text-violet-600 transition hover:text-violet-700" href="/#faq">
          Read the FAQ
        </Link>
        {' '}or{' '}
        <Link className="font-semibold text-violet-600 transition hover:text-violet-700" href="/#contact">
          talk to us
        </Link>.
      </p>
    </div>
  )
}
