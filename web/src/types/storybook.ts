export const themes = ['Cowboy', 'Space', 'Princess', 'Superhero', 'Custom'] as const

export type Theme = (typeof themes)[number]

export const outputTypes = ['DIGI_BOOK', 'LULU_BOOK'] as const

export type OutputType = (typeof outputTypes)[number]

export type ShippingAddress = {
  fullName: string
  phone?: string
  line1: string
  line2?: string
  city: string
  region: string
  postalCode: string
  countryCode: string
}

export const genders = ['male', 'female', 'other'] as const
export type Gender = (typeof genders)[number]

export const relationships = [
  'father', 'mother', 'son', 'daughter',
  'brother', 'sister', 'friend', 'sibling',
  'grandfather', 'grandmother', 'uncle', 'aunt', 'cousin',
  'boyfriend', 'girlfriend'
] as const
export type Relationship = (typeof relationships)[number]

export type CharacterInfo = {
  name: string
  age: number
  gender: Gender
  relationship: Relationship | string
}

export type CreateJobRequest = {
  imageFiles: File[]
  characters: CharacterInfo[]
  storyline: string
  email: string
  outputType: OutputType
  shippingAddress?: ShippingAddress
}

export type JobStage =
  | 'UPLOAD_RECEIVED'
  | 'STORY_CREATED'
  | 'IMAGES_GENERATING'
  | 'BOOK_BUILDING'
  | 'DONE'

export type JobStatusResponse = {
  jobId: string
  status: 'PENDING' | 'RUNNING' | 'FAILED' | 'DONE'
  stage?: JobStage
  progress?: { current: number, total: number }
  previewPages?: Array<{
    pageNumber: number
    thumbnailUrl?: string
    htmlSnippet?: string
  }>
  result?: { storybookHtmlUrl?: string, pdfUrl?: string }
  error?: { message: string, code?: string }
}

