import type { Metadata } from 'next'
import { CreatePageContent } from './create-page-content'

export const metadata: Metadata = {
  title: 'Create Your Storybook | img2x',
  description: 'Create a personalized storybook with multiple characters. Upload photos, customize your story, and generate a beautiful 4K illustrated book.',
  openGraph: {
    title: 'Create Your Storybook | img2x',
    description: 'Create a personalized storybook with multiple characters.',
    url: 'https://img2x.com/create',
    siteName: 'img2x',
    type: 'website'
  }
}

export default function CreatePage () {
  return <CreatePageContent />
}
