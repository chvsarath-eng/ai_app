import type { Metadata } from 'next'
import Link from 'next/link'
import { Images, Clapperboard } from 'lucide-react'

import { PageHeader, Accent } from '@/components/page-header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Coming Soon',
  description: 'Albums and personalized story videos are coming to img2x.'
}

const upcoming = [
  {
    icon: Images,
    label: 'Albums',
    title: 'Beautiful collections',
    description: 'Curate pages into shareable albums with themes and highlights.'
  },
  {
    icon: Clapperboard,
    label: 'Story videos',
    title: 'Short personalized clips',
    description: 'Turn your book into a cinematic, narrated story video.'
  }
]

export default function ComingSoonPage () {
  return (
    <div className="flex flex-col items-center py-16 sm:py-24">
      <PageHeader
        eyebrow="Coming soon"
        title={<>Albums and <Accent>personalized story videos</Accent></>}
        subtitle="We are building a new experience for curated albums and short story videos. Stay tuned."
      />

      <div className="mt-12 grid w-full max-w-3xl gap-5 sm:grid-cols-2">
        {upcoming.map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.label} className="p-6 text-left">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 text-white">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="mt-4 text-xs font-medium uppercase tracking-widest text-violet-600">{item.label}</p>
              <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-zinc-900">{item.title}</h2>
              <p className="mt-2 text-sm text-zinc-500">{item.description}</p>
            </Card>
          )
        })}
      </div>

      <Button asChild variant="outline" className="mt-10 bg-white/80 font-semibold">
        <Link href="/#contact">Tell us what you'd love to see</Link>
      </Button>
    </div>
  )
}
