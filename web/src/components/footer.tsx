import Link from 'next/link'
import Image from 'next/image'

export function Footer () {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-zinc-200/70 bg-zinc-50/50 py-12">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10">
        {/* Main Footer Content */}
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand Section */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2">
              <Image
                src="/brand/img2x-logo-transparent.png"
                alt="img2x"
                width={120}
                height={32}
                className="h-8 w-auto"
              />
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-zinc-600">
              Turn your photos into ultra-photorealistic storybooks with AI-generated 4K illustrations. 
              Create personalized stories your children will treasure forever.
            </p>
            <div className="mt-4 space-y-2 text-sm text-zinc-600">
              <p>
                <span className="font-medium text-zinc-900">Email:</span>{' '}
                <a className="hover:text-violet-600 transition" href="mailto:team@img2x.com">
                  team@img2x.com
                </a>
              </p>
              <p>
                <span className="font-medium text-zinc-900">Support:</span> We reply within 24-48 hours
              </p>
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Product</h3>
            <ul className="mt-4 space-y-3 text-sm text-zinc-600">
              <li>
                <Link className="hover:text-zinc-950 transition" href="/#gallery">
                  Gallery
                </Link>
              </li>
              <li>
                <Link className="hover:text-zinc-950 transition" href="/#pricing">
                  Pricing
                </Link>
              </li>
              <li>
                <Link className="hover:text-zinc-950 transition" href="/#reviews">
                  Reviews
                </Link>
              </li>
              <li>
                <Link className="hover:text-zinc-950 transition" href="/#faq">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Company</h3>
            <ul className="mt-4 space-y-3 text-sm text-zinc-600">
              <li>
                <Link className="hover:text-zinc-950 transition" href="/#contact">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link className="hover:text-zinc-950 transition" href="/coming-soon">
                  Coming Soon
                </Link>
              </li>
              <li>
                <Link className="hover:text-zinc-950 transition" href="/privacy">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link className="hover:text-zinc-950 transition" href="/terms">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 border-t border-zinc-200/70 pt-8 text-center text-sm text-zinc-600">
          <p>© {currentYear} img2x. All rights reserved.</p>
        </div>

        {/* Trust Badges / Additional Info */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1">
            <svg className="h-4 w-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Secure Payments
          </span>
          <span className="flex items-center gap-1">
            <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            Fast Delivery
          </span>
          <span className="flex items-center gap-1">
            <svg className="h-4 w-4 text-violet-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            24/7 Support
          </span>
          <span className="flex items-center gap-1">
            <svg className="h-4 w-4 text-pink-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
            Made with Love
          </span>
        </div>
      </div>
    </footer>
  )
}

