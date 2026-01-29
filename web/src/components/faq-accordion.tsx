'use client'

import { useState } from 'react'
import Link from 'next/link'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const faq = [
  {
    q: 'How does img2x work?',
    a: 'Simply upload a photo, enter your child\'s name and age, write a short storyline, and our AI creates a personalized storybook with ultra-realistic 4K illustrations. The entire process takes just minutes, and you\'ll receive your digital book via email within 24-48 hours.'
  },
  {
    q: 'What\'s the difference between Digital and Premium Hardcover books?',
    a: 'Digital books are interactive HTML files you can view on any device, share with family, and keep forever. Premium Hardcover books are professionally printed 8.5" × 8.5" physical books with 24 pages, premium color printing, matte finish, and 80# white coated paper—perfect as keepsakes or gifts.'
  },
  {
    q: 'How long does delivery take?',
    a: 'Digital books are delivered via email within 24-48 hours. Premium Hardcover books take 3-5 business days for production, plus 5-10 business days for domestic shipping (10-20 days for international). You\'ll receive tracking information once your book ships.'
  },
  {
    q: 'What photo should I upload?',
    a: 'Upload a clear, well-lit photo of your child\'s face. The AI works best with front-facing photos where the face is clearly visible. Avoid group photos, sunglasses, or heavily filtered images. JPEG, PNG, and HEIC formats are supported.'
  },
  {
    q: 'Can I customize the story theme?',
    a: 'Yes! You can write any storyline you want—space adventures, fairy tales, superhero stories, or anything your child loves. Our AI will generate unique illustrations and narrative based on your input. For special custom themes, contact us through our "Talk to us" section.'
  },
  {
    q: 'Is my photo and data safe?',
    a: 'Absolutely. We take privacy seriously. Your uploaded photos are deleted within 30 days after your book is generated. We never sell your data or use your child\'s photos for marketing without explicit consent.'
  },
  {
    q: 'What if I\'m not satisfied with the result?',
    a: 'Digital books are non-refundable once generated, but we\'ll provide a refund if there\'s a technical issue preventing access. For physical books, we offer refunds or reprints if your book arrives damaged, has printing defects, or is incorrect. Contact us within 14 days of delivery with photos of any issues.'
  },
  {
    q: 'Can I order multiple copies of the same book?',
    a: 'Yes! Once your book is generated, you can order additional Premium Hardcover copies at any time within 12 months. Digital books can be downloaded and shared with family members for personal use.'
  },
  {
    q: 'Do you ship internationally?',
    a: 'Yes, we ship Premium Hardcover books worldwide. International shipping typically takes 10-20 business days. Note that customs duties, taxes, and import fees may apply and are the customer\'s responsibility.'
  },
  {
    q: 'What age range is this suitable for?',
    a: 'Our storybooks are perfect for children ages 2-12. The AI adapts the complexity and tone of the story based on the age you provide. Younger children get simpler narratives, while older kids get more detailed adventures.'
  },
  {
    q: 'Can I preview the book before ordering the physical copy?',
    a: 'Not currently, but we recommend ordering the Digital Book first ($19.99) to see the full story and illustrations. If you love it, you can then order the Premium Hardcover version. The digital and physical versions contain identical content.'
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept all major credit cards (Visa, Mastercard, American Express, Discover) and other payment methods through our secure payment processor. All transactions are encrypted and secure.'
  },
  {
    q: 'Can I cancel my order?',
    a: 'Digital book orders cannot be cancelled once generation begins (typically within minutes). Physical book orders cannot be cancelled once production starts (usually within 24 hours). Contact us immediately if you need to make changes.'
  },
  {
    q: 'How do I contact customer support?',
    a: 'Email us at team@img2x.com for any questions, issues, or special requests. We typically respond within 24-48 hours. For urgent matters, please include "URGENT" in your subject line.'
  }
] as const

export function FAQAccordion () {
  const [showAll, setShowAll] = useState(false)
  const visibleFaqs = showAll ? faq : faq.slice(0, 6)

  return (
    <div className="space-y-4">
      <Accordion type="single" collapsible className="w-full space-y-2">
        {visibleFaqs.map((item, idx) => (
          <AccordionItem 
            key={item.q} 
            value={`item-${idx}`}
            className="rounded-2xl border border-zinc-200/70 bg-white/60 px-5 py-1 shadow-sm backdrop-blur transition hover:bg-white/80"
          >
            <AccordionTrigger className="text-left font-semibold text-zinc-900 hover:no-underline">
              {item.q}
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-sm leading-relaxed text-zinc-700">{item.a}</p>
              {idx === 5 && (
                <p className="mt-3 text-sm text-zinc-600">
                  Read our full{' '}
                  <Link className="font-semibold text-violet-600 hover:text-violet-700 underline" href="/privacy">
                    Privacy Policy
                  </Link>
                  {' '}for complete details.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {!showAll && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setShowAll(true)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-50 to-pink-50 px-6 py-2.5 text-sm font-semibold text-violet-700 transition hover:from-violet-100 hover:to-pink-100"
          >
            Show {faq.length - 6} more questions
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}

      {showAll && (
        <div className="flex justify-center pt-2">
          <button
            onClick={() => setShowAll(false)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-50 to-pink-50 px-6 py-2.5 text-sm font-semibold text-violet-700 transition hover:from-violet-100 hover:to-pink-100"
          >
            Show less
            <svg className="h-4 w-4 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
