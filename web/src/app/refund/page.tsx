import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Refund Policy',
  description: 'img2x Refund Policy. Learn about our refund and cancellation policy for digital and hardcover personalized storybooks.',
  openGraph: {
    title: 'Refund Policy | img2x',
    description: 'Learn about our refund and cancellation policy for personalized storybooks.',
    url: 'https://img2x.com/refund',
  },
}

export default function RefundPage () {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-16 pt-12 sm:px-6 lg:px-10">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
        Refund Policy
      </h1>
      <p className="mt-3 text-sm text-zinc-600">
        Last Updated: January 29, 2026
      </p>

      <section className="mt-8 space-y-4 text-sm text-zinc-700 leading-relaxed">
        <p>
          At img2x, we strive to provide you with high-quality, personalized storybooks that delight you and your loved ones. 
          Because our products are custom-created using AI technology based on your unique inputs, our refund policy reflects 
          the personalized nature of our service.
        </p>
        <p>
          For questions about refunds, contact us at{' '}
          <a className="text-violet-600 hover:text-violet-700 underline" href="mailto:team@img2x.com">team@img2x.com</a>.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">Digital Books ($9.99 retail)</h2>
        <p className="text-sm text-zinc-700">
          Due to the personalized and instantly-delivered digital nature of our products, <strong>digital book purchases 
          are generally non-refundable</strong> once the book has been generated and delivered.
        </p>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">When We Will Refund Digital Books</h3>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Technical errors preventing you from accessing or downloading your book</li>
          <li>System failures resulting in the book not being generated</li>
          <li>Significant errors on our end that cause the content to be completely different from what was promised</li>
          <li>Duplicate charges for the same order</li>
        </ul>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">What Is Not Refundable</h3>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Dissatisfaction with AI-generated content style or artistic interpretation</li>
          <li>Issues arising from low-quality photos you provided</li>
          <li>Change of mind after purchase</li>
          <li>Failure to check spam/junk folders for delivery emails</li>
        </ul>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">Premium Hardcover Books ($39.99)</h2>
        <p className="text-sm text-zinc-700">
          Because hardcover books are custom-printed specifically for you, <strong>orders cannot be cancelled once 
          production begins</strong> (typically within 24 hours of order placement).
        </p>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">When We Will Refund or Reprint</h3>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Book arrives damaged due to printing or shipping issues</li>
          <li>Significant printing defects (incorrect colors, missing pages, binding issues)</li>
          <li>Wrong product shipped to you</li>
          <li>Book lost in transit (with carrier confirmation)</li>
        </ul>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">What Is Not Refundable</h3>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Damage occurring after delivery</li>
          <li>Issues with AI-generated content that accurately reflects your inputs</li>
          <li>Delays caused by incorrect shipping address you provided</li>
          <li>Customs delays or duties for international orders</li>
          <li>Minor color variations inherent to printing processes</li>
        </ul>
        <p className="text-sm text-zinc-700 mt-4">
          Shipping charges and taxes are calculated at checkout. These fees are generally non-refundable once the book
          has shipped, except where required by law.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">How to Request a Refund</h2>
        <div className="space-y-4 text-sm text-zinc-700">
          <p><strong>Step 1:</strong> Email us at{' '}
            <a className="text-violet-600 hover:text-violet-700 underline" href="mailto:team@img2x.com">team@img2x.com</a>{' '}
            within 14 days of delivery
          </p>
          <p><strong>Step 2:</strong> Include your order number and email address used for purchase</p>
          <p><strong>Step 3:</strong> Describe the issue and attach photos if applicable (for damaged physical books)</p>
          <p><strong>Step 4:</strong> Our team will review your request within 2-3 business days</p>
        </div>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">Refund Processing</h2>
        <ul className="space-y-2 text-sm text-zinc-700 list-disc pl-6">
          <li>Approved refunds are processed within 5-10 business days</li>
          <li>Refunds are issued to your original payment method</li>
          <li>Bank processing times may add 3-5 additional business days</li>
          <li>For damaged hardcover books, we may offer a reprint instead of a refund</li>
        </ul>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">Cancellation Policy</h2>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">Before Production</h3>
        <p className="text-sm text-zinc-700">
          If you need to cancel an order, contact us immediately. We can provide a full refund if production has not yet begun.
        </p>
        <h3 className="text-lg font-semibold text-zinc-900 mt-6">After Production Begins</h3>
        <p className="text-sm text-zinc-700">
          Once our AI has started generating your storybook (usually within minutes of payment), cancellation is not possible 
          as resources have already been allocated. For hardcover books, once sent to print, no cancellation is available.
        </p>
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-zinc-900">Our Commitment to You</h2>
        <p className="text-sm text-zinc-700">
          We want you to love your personalized storybook. If something isn't right, we'll work with you to make it right. 
          Our customer support team is here to help resolve any issues fairly and promptly.
        </p>
        <p className="text-sm text-zinc-700 mt-4">
          For any questions or concerns, please reach out to us at{' '}
          <a className="text-violet-600 hover:text-violet-700 underline" href="mailto:team@img2x.com">team@img2x.com</a>.
        </p>
      </section>

      <section className="mt-10 p-6 bg-violet-50 rounded-lg">
        <p className="text-sm text-zinc-700">
          <strong>Note:</strong> This refund policy is part of our{' '}
          <a className="text-violet-600 hover:text-violet-700 underline" href="/terms">Terms of Service</a>. 
          By making a purchase, you agree to these terms.
        </p>
      </section>
    </main>
  )
}
