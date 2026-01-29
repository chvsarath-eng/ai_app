import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/app/providers'
import { SiteHeader } from '@/components/site-header'
import { Footer } from '@/components/footer'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: {
    default: 'img2x - AI Personalized Storybooks with 4K Images | Turn Photos into Stories',
    template: '%s | img2x'
  },
  description: 'Create personalized storybooks with AI-generated 4K illustrations. Turn photos into stories for kids, couples, pets, retirement, anniversaries & more. Digital $19.99, Hardcover $59.99. Fast delivery.',
  keywords: [
    // Primary keywords
    'personalized storybooks',
    'AI storybook generator',
    'custom photo books',
    'photo to storybook',
    '4K illustrations',
    'AI generated books',
    'personalized gift books',
    
    // Children & Family
    'personalized children\'s books',
    'custom kids books',
    'personalized baby book',
    'children\'s story creator',
    'kids adventure book',
    'custom fairy tale book',
    'personalized bedtime story',
    
    // Couples & Romance
    'personalized love book',
    'couple storybook',
    'love story book',
    'romantic anniversary gift',
    'how we met book',
    'personalized wedding gift',
    'custom love story',
    'boyfriend girlfriend gift',
    'husband wife anniversary book',
    'relationship storybook',
    
    // Pets
    'personalized pet book',
    'custom dog storybook',
    'cat story book',
    'pet memorial book',
    'dog memorial gift',
    'pet adventure book',
    'custom pet portrait book',
    
    // Life Events
    'retirement gift book',
    'graduation storybook',
    'employee appreciation book',
    'farewell gift book',
    'milestone celebration book',
    
    // Gift Occasions
    'unique birthday gift',
    'Valentine\'s Day gift',
    'Mother\'s Day gift',
    'Father\'s Day gift',
    'Christmas gift book',
    'personalized keepsake',
    'memory book gift',
    
    // Corporate
    'corporate gift book',
    'employee recognition gift',
    'team appreciation book',
    
    // Technical
    'AI photo book generator',
    'custom hardcover book',
    'photo book maker online',
    'digital storybook creator'
  ],
  authors: [{ name: 'img2x' }],
  creator: 'img2x',
  publisher: 'img2x',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://img2x.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'img2x - Turn Photos into AI Storybooks | Kids, Couples, Pets & More',
    description: 'Create personalized storybooks for anyone: children, couples, pets, retirement, anniversaries. Ultra-realistic 4K AI illustrations. Digital $19.99, Hardcover $59.99.',
    url: 'https://img2x.com',
    siteName: 'img2x',
    images: [
      {
        url: '/brand/preview-cover_new.jpeg',
        width: 1200,
        height: 630,
        alt: 'img2x Personalized AI Storybook - Create custom stories for kids, couples, and pets',
      }
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'img2x - AI Storybooks for Kids, Couples, Pets & Special Moments',
    description: 'Turn photos into personalized storybooks with AI. Perfect for children, couples, pet lovers, retirement, anniversaries. 4K illustrations.',
    images: ['/brand/preview-cover_new.jpeg'],
    creator: '@img2x',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.png?v=2', type: 'image/png', sizes: '16x16' },
      { url: '/favicon.png?v=2', type: 'image/png', sizes: '32x32' }
    ],
    shortcut: '/favicon.png?v=2',
    apple: '/favicon.png?v=2'
  },
  verification: {
    // Add these when you set them up:
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
    // bing: 'your-bing-verification-code',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} min-h-dvh bg-[color:var(--md-surface)] text-[color:var(--md-on-surface)] antialiased`}
      >
        <Providers>
          <div className="pointer-events-none fixed inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(900px_circle_at_15%_-10%,rgba(103,80,164,0.14),transparent_55%),radial-gradient(900px_circle_at_90%_0%,rgba(59,130,246,0.10),transparent_55%),radial-gradient(900px_circle_at_50%_115%,rgba(16,185,129,0.08),transparent_60%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,251,254,0.92),rgba(255,251,254,0.98))]" />
          </div>
          <SiteHeader />
          <main className="mx-auto w-full max-w-screen-2xl px-3 sm:px-4 lg:px-6">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
