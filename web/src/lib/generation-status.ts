const STAGE_LABELS: Array<[RegExp, string]> = [
  [/story_generation_start|job_started/, 'Writing your story'],
  [/story_generation_done|story_ready/, 'Story is ready — painting every scene'],
  [/images_phase_start/, 'Painting all scenes at once'],
  [/images_start|images_phase/, 'Painting cover and pages together'],
  [/image_ready/, 'New scenes are landing'],
  [/images_done/, 'Illustrations are in — binding your book'],
  [/pdf_generation_start/, 'Binding your flipbook'],
  [/pdf_generation_done|upload_done|pipeline_done/, 'Finishing your book'],
  [/print_/, 'Rendering the hardcover edition']
]

const LIVE_HINTS = [
  'Every page is rendering at the same time — nothing is waiting in a queue of 6.',
  'Cover, scenes, and extras are all in flight together.',
  'Finished pages pop in here as soon as each one lands.',
  'This usually takes a few minutes. You can stay on this screen.',
  'Matching faces from your photo across every scene.'
]

export function friendlyStageLabel (stage?: string | null) {
  const raw = (stage || '').trim()
  if (!raw) return 'Starting your storybook'
  const hit = STAGE_LABELS.find(([pattern]) => pattern.test(raw))
  return hit ? hit[1] : raw.replace(/_/g, ' ')
}

export function liveHint (elapsedMs: number, imagesDone = 0) {
  if (imagesDone > 0) {
    return 'Keep this tab open — more finished pages will appear as they complete.'
  }
  return LIVE_HINTS[Math.floor(elapsedMs / 4000) % LIVE_HINTS.length]
}

export function feltProgress ({
  stage,
  imagesDone = 0,
  imagesTotal = 12,
  elapsedMs
}: {
  stage?: string | null
  imagesDone?: number
  imagesTotal?: number
  elapsedMs: number
}) {
  const total = Math.max(1, imagesTotal || 12)
  const done = Math.max(0, imagesDone || 0)
  const name = (stage || '').toLowerCase()

  if (done > 0) {
    return Math.min(96, Math.round(28 + (done / total) * 66))
  }

  let floor = 8
  if (/story_generation_start|job_started/.test(name)) floor = 12
  if (/story_generation_done|story_ready/.test(name)) floor = 24
  if (/images/.test(name)) floor = 30
  if (/pdf|upload|pipeline/.test(name)) floor = 90

  const creep = Math.min(16, (elapsedMs / 1000) * 0.05)
  const cap = /images/.test(name) ? 42 : 28
  return Math.round(Math.min(cap, Math.max(floor, floor + creep)))
}

export function formatElapsed (ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  if (min <= 0) return `${sec}s`
  return `${min}m ${String(sec).padStart(2, '0')}s`
}
