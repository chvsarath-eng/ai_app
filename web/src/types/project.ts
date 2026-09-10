import type { CharacterInfo, OutputType } from '@/types/storybook'

export type ProjectStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'starting'
  | 'generating'
  | 'ready'
  | 'failed'
  | 'cancelled'
  | 'refunded'

export type PaymentStatus = 'created' | 'authorized' | 'captured' | 'failed' | 'refunded'

export type ProjectShipping = {
  name?: string
  phone?: string
  address1?: string
  address2?: string
  city?: string
  region?: string
  postalCode?: string
  country?: string
  level?: string | null
  cost?: number
}

export type ProjectAmounts = {
  currency: string
  bookMinor: number
  shippingMinor: number
  totalMinor: number
  discountCode?: string | null
}

export type ProjectPayment = {
  provider: 'razorpay'
  orderId: string
  paymentId?: string | null
  signature?: string | null
  status: PaymentStatus
  amountMinor: number
  currency: string
  method?: string | null
  email?: string | null
  contact?: string | null
  createdAt?: number
  paidAt?: number | null
  refundId?: string | null
  refundedAt?: number | null
  error?: { code?: string; description?: string } | null
}

export type ProjectUpload = {
  index: number
  gcsUri: string
  contentType: string
  size: number
  originalName?: string
}

export type ProjectStoryPage = { pageNumber: number; story: string }

export type ProjectStory = {
  title: string
  coverText?: string
  pages: ProjectStoryPage[]
  characters: { index: number; name: string }[]
}

export type ProjectImage = {
  url: string | null
  gcsPath: string | null
  readyAt?: number
  model?: string | null
  type?: string
  pageNumber?: number | null
}

export type ProjectArtifact = { url: string | null; gcsPath: string | null }

export type Project = {
  id: string
  uid: string
  email: string | null
  status: ProjectStatus
  outputType: OutputType
  storyline: string
  characters: CharacterInfo[]
  numCharacters: number
  uploads: ProjectUpload[]
  shipping?: ProjectShipping | null
  amounts: ProjectAmounts
  payment?: ProjectPayment | null
  consents?: { age: boolean; likeness: boolean; terms: boolean; acceptedAt?: number }
  createdAt: number
  updatedAt: number
  paidAt?: number | null
  // Live generation state (written by the story API)
  jobId?: string | null
  stage?: string | null
  stageAt?: number | null
  title?: string
  coverUrl?: string | null
  story?: ProjectStory | null
  images?: Record<string, ProjectImage>
  imagesDone?: number
  imagesTotal?: number
  artifacts?: Record<string, ProjectArtifact>
  signedUrlsExpireAt?: number | null
  timing?: Record<string, number>
  cost?: Record<string, unknown>
  error?: { type?: string; message?: string; stage?: string } | null
  startError?: string | null
  startedAt?: number | null
  finishedAt?: number | null
  emailStatus?: string | null
  adminNotes?: string | null
}

export type ProjectSummary = Pick<
  Project,
  'id' | 'status' | 'outputType' | 'title' | 'coverUrl' | 'createdAt' | 'updatedAt' | 'numCharacters' | 'imagesDone' | 'imagesTotal' | 'stage'
> & { characterNames: string[] }
