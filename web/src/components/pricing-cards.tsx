import Link from 'next/link'
import { Check, Sparkles, Book } from 'lucide-react'

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const products = [
  {
    name: 'Digital Book',
    icon: Sparkles,
    description: 'Interactive HTML book that mimics a real flipbook experience',
    originalPrice: '$39.99',
    salePrice: '$19.99',
    discount: '50% OFF',
    cta: 'Get Digital Book',
    href: '/#try',
    image: '/brand/digitalbook_preview.png',
    highlights: [
      'Instant delivery via email',
      'Interactive page-flip experience',
      '4K ultra-realistic AI-generated images',
      'Works on any device',
      'Share with friends & family'
    ],
    isPopular: true
  },
  {
    name: 'Premium Hardcover Book',
    icon: Book,
    description: '24-page premium color book',
    originalPrice: '$99.99',
    salePrice: '$59.99',
    discount: '40% OFF',
    cta: 'Order Hardcover',
    href: '/#try',
    image: '/brand/hardcover-preview.png',
    highlights: [
      '8.5" × 8.5" square',
      'Hardcover case wrap with matte finish',
      '80# white coated paper',
      '4K ultra-realistic AI-generated images',
      'Ships worldwide'
    ],
    isPopular: false
  }
] as const

export function PricingCards () {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {products.map((p) => {
        const Icon = p.icon
        const hasImage = Boolean(p.image)
        return (
          <Card
            key={p.name}
            className={`group relative flex flex-col overflow-hidden ${
              p.isPopular
                ? 'border-violet-200/70 shadow-lg shadow-violet-100/50'
                : 'border-zinc-200/70'
            }`}
          >
            {/* Limited time badge */}
            <div className="absolute -right-8 top-6 rotate-45 bg-gradient-to-r from-orange-500 to-pink-500 px-10 py-1 text-xs font-semibold text-white shadow-sm">
              {p.discount}
            </div>

            <div className={hasImage ? 'grid gap-0 md:grid-cols-[1fr_468px]' : ''}>
              <div>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      p.isPopular
                        ? 'bg-gradient-to-br from-violet-500 to-pink-500 text-white'
                        : 'bg-gradient-to-br from-emerald-500 to-cyan-500 text-white'
                    }`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg whitespace-nowrap">{p.name}</CardTitle>
                      {p.isPopular && (
                        <span className="text-xs font-medium text-violet-600">Most Popular</span>
                      )}
                    </div>
                  </div>

                  <p className="mt-3 text-sm text-zinc-500">{p.description}</p>

                  {/* Pricing */}
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-3xl font-bold tracking-tight text-zinc-900">{p.salePrice}</span>
                    <span className="text-lg text-zinc-400 line-through">{p.originalPrice}</span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-orange-600">Limited time offer</p>
                </CardHeader>

                <CardContent className="space-y-2.5 pb-6">
                  {p.highlights.map((h) => (
                    <div key={h} className="flex items-center gap-2.5 text-sm">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="text-zinc-700">{h}</span>
                    </div>
                  ))}
                </CardContent>
              </div>

              {hasImage && (
                <div className="flex items-center justify-center p-4 md:justify-start md:pl-0 md:pr-2">
                  <img
                    src={p.image ?? ''}
                    alt={p.name}
                    className="w-full max-w-[320px] object-contain drop-shadow-xl sm:max-w-[380px] md:w-[520px] md:max-w-full md:-ml-8"
                  />
                </div>
              )}
            </div>

            <CardFooter className="mt-auto">
              <Button
                asChild
                className={`w-full text-white ${
                  p.isPopular
                    ? 'bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700'
                    : 'bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-700 hover:to-cyan-700'
                }`}
                variant="default"
              >
                <Link href={p.href}>{p.cta}</Link>
              </Button>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
