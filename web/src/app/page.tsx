import * as React from 'react'

import { HeroSplit } from '@/components/hero-split'
import { DemoLoop } from '@/components/demo-loop'
import { GeneratorCard } from '@/components/generator-card'
import { PricingCards } from '@/components/pricing-cards'
import { FAQAccordion } from '@/components/faq-accordion'
import { GalleryPreview } from '@/components/gallery-preview/gallery-preview'
import { ReviewsSlider } from '@/components/reviews-slider/reviews-slider'
import { ContactForm } from '@/components/contact-form'
import { cn } from '@/lib/utils'

export default function Home () {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://img2x.com/#organization',
        name: 'img2x',
        url: 'https://img2x.com',
        logo: {
          '@type': 'ImageObject',
          url: 'https://img2x.com/brand/img2x-logo-transparent.png',
        },
        contactPoint: {
          '@type': 'ContactPoint',
          email: 'team@img2x.com',
          contactType: 'Customer Service',
          availableLanguage: 'English',
        },
        sameAs: [],
      },
      {
        '@type': 'WebSite',
        '@id': 'https://img2x.com/#website',
        url: 'https://img2x.com',
        name: 'img2x',
        description: 'Create personalized storybooks with AI-generated 4K illustrations for children, couples, pets, retirement, anniversaries and more',
        publisher: {
          '@id': 'https://img2x.com/#organization',
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: 'https://img2x.com/?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'WebPage',
        '@id': 'https://img2x.com/#webpage',
        url: 'https://img2x.com',
        name: 'AI Personalized Storybooks for Kids, Couples, Pets & Special Occasions',
        isPartOf: {
          '@id': 'https://img2x.com/#website',
        },
        about: {
          '@id': 'https://img2x.com/#organization',
        },
        description: 'Turn your photos into ultra-photorealistic storybooks with AI. Perfect for children\'s books, romantic love stories, pet adventures, retirement gifts, anniversaries, and more. Digital books $19.99, Premium Hardcover $59.99.',
        keywords: 'personalized storybook, AI photo book, custom love story, pet memorial book, retirement gift book, children\'s book creator, couple storybook, anniversary gift, graduation gift',
      },
      {
        '@type': 'Product',
        '@id': 'https://img2x.com/#digital-book',
        name: 'Digital Storybook',
        description: 'Interactive HTML storybook with 4K ultra-realistic AI-generated images. Perfect for children, couples, pets, and special occasions.',
        image: 'https://img2x.com/brand/digitalbook_preview.png',
        brand: {
          '@type': 'Brand',
          name: 'img2x',
        },
        category: 'Personalized Gifts > Photo Books',
        offers: {
          '@type': 'Offer',
          url: 'https://img2x.com/#pricing',
          priceCurrency: 'USD',
          price: '19.99',
          priceValidUntil: '2026-12-31',
          availability: 'https://schema.org/InStock',
          itemCondition: 'https://schema.org/NewCondition',
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.8',
          reviewCount: '127',
        },
      },
      {
        '@type': 'Product',
        '@id': 'https://img2x.com/#hardcover-book',
        name: 'Premium Hardcover Storybook',
        description: '24-page premium color hardcover book with 4K AI-generated illustrations, 8.5" × 8.5", matte finish. Ideal gift for kids, couples, pet lovers, retirement, graduation, and anniversaries.',
        image: 'https://img2x.com/brand/hardcover-preview.png',
        brand: {
          '@type': 'Brand',
          name: 'img2x',
        },
        category: 'Personalized Gifts > Photo Books',
        offers: {
          '@type': 'Offer',
          url: 'https://img2x.com/#pricing',
          priceCurrency: 'USD',
          price: '59.99',
          priceValidUntil: '2026-12-31',
          availability: 'https://schema.org/InStock',
          itemCondition: 'https://schema.org/NewCondition',
        },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.9',
          reviewCount: '89',
        },
      },
      // Service schema for different use cases
      {
        '@type': 'Service',
        '@id': 'https://img2x.com/#service',
        name: 'AI Personalized Storybook Creation',
        provider: {
          '@id': 'https://img2x.com/#organization',
        },
        description: 'Create custom storybooks from your photos using AI for any occasion',
        serviceType: 'Personalized Gift Creation',
        areaServed: 'Worldwide',
        hasOfferCatalog: {
          '@type': 'OfferCatalog',
          name: 'Storybook Categories',
          itemListElement: [
            {
              '@type': 'OfferCatalog',
              name: 'Children\'s Storybooks',
              description: 'Personalized adventure stories featuring your child as the hero',
            },
            {
              '@type': 'OfferCatalog',
              name: 'Couple & Love Story Books',
              description: 'Romantic storybooks for couples, anniversaries, weddings, and Valentine\'s Day',
            },
            {
              '@type': 'OfferCatalog',
              name: 'Pet Storybooks',
              description: 'Custom adventure books featuring your dog, cat, or pet. Also pet memorial books.',
            },
            {
              '@type': 'OfferCatalog',
              name: 'Retirement & Appreciation Books',
              description: 'Personalized gift books for retirement, employee appreciation, and farewells',
            },
            {
              '@type': 'OfferCatalog',
              name: 'Graduation & Milestone Books',
              description: 'Custom storybooks celebrating graduation, birthdays, and life milestones',
            },
          ],
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'How does img2x work?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Simply upload a photo of anyone (child, couple, pet, friend, colleague), write a short storyline, and our AI creates a personalized storybook with ultra-realistic 4K illustrations. The entire process takes just minutes, and you\'ll receive your digital book via email within 24-48 hours.',
            },
          },
          {
            '@type': 'Question',
            name: 'What types of storybooks can I create?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'You can create storybooks for anyone and any occasion: children\'s adventure stories, romantic love stories for couples, pet adventure books, retirement gift books, graduation stories, anniversary keepsakes, memorial tributes, Valentine\'s Day gifts, birthday celebrations, and more. Any photo can become a story!',
            },
          },
          {
            '@type': 'Question',
            name: 'Can I create a love story book for my partner?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes! img2x is perfect for couples. Create a personalized "how we met" story, anniversary gift book, Valentine\'s Day surprise, or wedding keepsake. Upload a photo of you and your partner, write your love story, and we\'ll create a beautiful illustrated book.',
            },
          },
          {
            '@type': 'Question',
            name: 'Can I make a storybook featuring my pet?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Absolutely! Create custom storybooks starring your dog, cat, or any pet. Perfect for pet adventure stories, birthday celebrations, or memorial tributes to honor a beloved pet who has passed away.',
            },
          },
          {
            '@type': 'Question',
            name: 'Is this good for retirement or graduation gifts?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes! img2x creates meaningful personalized gift books for retirement parties, graduation celebrations, employee appreciation, farewell gifts, and career milestones. Create a story celebrating their journey and achievements.',
            },
          },
          {
            '@type': 'Question',
            name: 'What\'s the difference between Digital and Premium Hardcover books?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Digital books ($19.99) are interactive HTML files you can view on any device and share instantly. Premium Hardcover books ($59.99) are professionally printed 8.5" × 8.5" physical books with 24 pages, premium color printing, matte finish—perfect as keepsake gifts.',
            },
          },
          {
            '@type': 'Question',
            name: 'How long does delivery take?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Digital books are delivered via email within 24-48 hours. Premium Hardcover books take 3-5 business days for production, plus 5-10 business days for domestic shipping (10-20 days for international). We ship worldwide.',
            },
          },
          {
            '@type': 'Question',
            name: 'Is my photo and data safe?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Yes, we take privacy seriously. Your uploaded photos are deleted within 30 days after your book is generated. We never sell your data or use photos for marketing without explicit consent. GDPR and CCPA compliant.',
            },
          },
        ],
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="pb-16">
      <HeroSplit
        left={<HeroLeft />}
        right={<GeneratorCard className="mx-auto mt-6 w-full max-w-[92vw] sm:max-w-[460px] md:max-w-[520px] lg:max-w-[440px] xl:max-w-[480px] lg:mt-6" />}
      />

      {/* Gallery section — flows from hero */}
      <section id="gallery" className="relative mt-2 pt-4 pb-16">
        {/* Refined title with subtle decorative treatment */}
        <div className="mb-12 flex flex-col items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-50 to-pink-50 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-violet-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />
            Gallery
          </span>
          <h2 className="text-center text-3xl font-bold tracking-tight text-zinc-800 sm:text-4xl lg:text-5xl">
            Explore our <span className="bg-gradient-to-r from-orange-500 via-pink-500 to-violet-500 bg-clip-text text-transparent">Digital Books</span>
          </h2>
          <p className="max-w-md text-center text-sm text-zinc-500 sm:text-base">
            Beautiful stories brought to life with AI-generated 4K illustrations
          </p>
        </div>

        <GalleryPreview />
      </section>

      {/* Pricing section — refined to match gallery style */}
      <section id="pricing" className="py-12 sm:py-16">
        <div className="mb-12 flex flex-col items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-emerald-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Pricing
          </span>
          <h2 className="text-center text-3xl font-bold tracking-tight text-zinc-800 sm:text-4xl lg:text-5xl">
            Choose your <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">perfect format</span>
          </h2>
          <p className="max-w-md text-center text-sm text-zinc-500 sm:text-base">
            Limited time launch pricing — grab your discount before it's gone
          </p>
        </div>

        <PricingCards />
      </section>

      <section id="reviews" className="py-12 sm:py-16">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-50 to-pink-50 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-violet-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />
            Reviews
          </span>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-800 sm:text-4xl lg:text-5xl">
            What people <span className="bg-gradient-to-r from-violet-500 via-pink-500 to-orange-500 bg-clip-text text-transparent">are saying</span>
          </h2>
          <p className="max-w-md text-sm text-zinc-500 sm:text-base">
            Feedback from parents and builders who tried img2x.
          </p>
        </div>
        <ReviewsSlider />
      </section>

      <section id="contact" className="py-12 sm:py-16">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 rounded-3xl border border-violet-100 bg-white/80 px-6 py-10 text-center shadow-sm ring-1 ring-violet-100/60 backdrop-blur">
          <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-orange-50 to-pink-50 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-orange-600">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-400" />
            Talk to us
          </span>
          <h2 className="text-3xl font-bold tracking-tight text-zinc-800 sm:text-4xl">
            Have a special request?
          </h2>
          <p className="max-w-2xl text-sm text-zinc-600 sm:text-base">
            Tell us what you want to create. We love custom themes, unique story ideas, and
            one‑of‑a‑kind gifts. Share your details and we will help make it happen.
          </p>
          <ContactForm />
        </div>
      </section>

      <Section id="faq" title="Frequently Asked Questions" subtitle="Everything you need to know about img2x">
        <FAQAccordion />
      </Section>
      </div>
    </>
  )
}

function Section ({
  id,
  title,
  subtitle,
  children,
  className
}: {
  id?: string
  title: string
  subtitle: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} className={cn('py-10 sm:py-12', className)}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
          <p className="mt-1 text-sm text-zinc-600 sm:text-base">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

function HeroLeft () {
  return (
    <div className="min-w-0">
      <h1 className="break-words text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl lg:max-w-[52rem]">
        Turn your photo into an <span className="ultraGlowText font-bold">Ultra‑Photorealistic</span> storybook with{' '}
        <span className="ultraGlowText font-bold">4K</span> images.
      </h1>

      <DemoLoop className="mt-2 sm:mt-4" />
    </div>
  )
}

 
