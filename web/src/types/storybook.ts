export const themes = ['Cowboy', 'Space', 'Princess', 'Superhero', 'Custom'] as const

export type Theme = (typeof themes)[number]

export const outputTypes = ['DIGI_BOOK', 'LULU_BOOK'] as const

export type OutputType = (typeof outputTypes)[number]

export type CreateJobRequest = {
  imageFile: File
  theme: Theme
  storyline: string
  email: string
  outputType: OutputType
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

