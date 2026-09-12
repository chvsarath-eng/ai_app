import type { Metadata } from 'next'
import Link from 'next/link'

import { GalleryPreview } from '@/components/gallery-preview/gallery-preview'
import { PageHeader, Accent } from '@/components/page-header'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Gallery',
  description: 'Explore sample personalized digital storybooks created with img2x — ultra-photorealistic 4K AI illustrations.'
}

const FIRST_THUMBS = [
  '/gallery/thumbs/cover_9.webp',
  '/gallery/thumbs/cover_10.webp',
  '/gallery/thumbs/cover_11.webp',
  '/gallery/thumbs/cover_12.webp'
]

export default function GalleryPage () {
  return (
    <div className="py-10 sm:py-14">
      {FIRST_THUMBS.map((href) => (
        <link key={href} rel="preload" as="image" href={href} />
      ))}
      <PageHeader
        eyebrow="Gallery"
        title={<>Explore our <Accent>Digital Books</Accent></>}
        subtitle="Beautiful stories brought to life with AI-generated 4K illustrations. Click any book to open it."
        className="mb-12"
      />

      <GalleryPreview />

      <div className="mt-14 flex justify-center">
        <Button asChild size="lg" className="px-8 font-semibold">
            <Link href="/#create">Create your own storybook</Link>
        </Button>
      </div>
    </div>
  )
}
