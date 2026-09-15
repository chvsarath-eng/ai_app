/** About two typed pages. High enough that people almost never hit the wall. */
export const STORYLINE_MAX = 8000

export type StoryWhoId =
  | 'kid'
  | 'dad'
  | 'mom'
  | 'girlfriend'
  | 'boyfriend'
  | 'couple'
  | 'baby'
  | 'friends'

export type StoryVibeId =
  | 'adventure'
  | 'animals'
  | 'space'
  | 'magic'
  | 'superhero'
  | 'love'
  | 'pirates'
  | 'dinosaurs'

export type StoryOccasionId =
  | 'birthday'
  | 'just-because'
  | 'anniversary'
  | 'holiday'
  | 'milestone'
  | 'bedtime'
  | 'thank-you'

export type StoryToneId =
  | 'sweet'
  | 'funny'
  | 'brave'
  | 'cozy'
  | 'heartfelt'
  | 'surprise'

export type StoryChip = {
  id: string
  label: string
}

export type StoryDraft = {
  who: StoryWhoId | null
  vibe: StoryVibeId | null
  occasion: StoryOccasionId | null
  tone: StoryToneId | null
  names: string[]
}

export const STORY_WHO: StoryChip[] = [
  { id: 'kid', label: 'For my kid' },
  { id: 'dad', label: 'Gift for dad' },
  { id: 'mom', label: 'Gift for mom' },
  { id: 'girlfriend', label: 'Girlfriend' },
  { id: 'boyfriend', label: 'Boyfriend' },
  { id: 'couple', label: 'Us as a couple' },
  { id: 'baby', label: 'New baby' },
  { id: 'friends', label: 'Best friends' }
]

export const STORY_VIBES: StoryChip[] = [
  { id: 'adventure', label: 'Adventure' },
  { id: 'animals', label: 'Animals' },
  { id: 'space', label: 'Space' },
  { id: 'magic', label: 'Magic' },
  { id: 'superhero', label: 'Superhero' },
  { id: 'love', label: 'Love day' },
  { id: 'pirates', label: 'Pirates' },
  { id: 'dinosaurs', label: 'Dinosaurs' }
]

export const STORY_OCCASIONS: StoryChip[] = [
  { id: 'birthday', label: 'Birthday' },
  { id: 'just-because', label: 'Just because' },
  { id: 'anniversary', label: 'Anniversary' },
  { id: 'holiday', label: 'Holiday' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'bedtime', label: 'Bedtime' },
  { id: 'thank-you', label: 'Thank you' }
]

export const STORY_TONES: StoryChip[] = [
  { id: 'sweet', label: 'Sweet' },
  { id: 'funny', label: 'Funny' },
  { id: 'brave', label: 'Brave' },
  { id: 'cozy', label: 'Cozy' },
  { id: 'heartfelt', label: 'Heartfelt' },
  { id: 'surprise', label: 'Surprise ending' }
]

function nameAt (names: string[], index: number, fallback: string) {
  const value = names[index]?.trim()
  return value || fallback
}

function pair (names: string[], fallbackA: string, fallbackB: string) {
  if (names.length >= 2) return `${names[0].trim()} and ${names[1].trim()}`
  if (names.length === 1) return `${names[0].trim()} and ${fallbackB}`
  return `${fallbackA} and ${fallbackB}`
}

function giftTarget (who: StoryWhoId | null, names: string[]) {
  switch (who) {
    case 'kid':
      return nameAt(names, 0, 'your kid')
    case 'dad':
      return 'Dad'
    case 'mom':
      return 'Mom'
    case 'girlfriend':
      return nameAt(names, 0, 'her')
    case 'boyfriend':
      return nameAt(names, 0, 'him')
    case 'couple':
      return names.length >= 2 ? pair(names, 'the two of you', '') : 'the two of you'
    case 'baby':
      return names[0]?.trim() ? `baby ${names[0].trim()}` : 'the baby'
    case 'friends':
      return names.length ? pair(names, 'your friends', 'a best friend') : 'your friends'
    default:
      return nameAt(names, 0, 'them')
  }
}

function cast (who: StoryWhoId | null, names: string[]): { subject: string, plural: boolean } {
  switch (who) {
    case 'dad':
      return names[0]?.trim()
        ? { subject: `${names[0].trim()} and Dad`, plural: true }
        : { subject: 'Dad', plural: false }
    case 'mom':
      return names[0]?.trim()
        ? { subject: `${names[0].trim()} and Mom`, plural: true }
        : { subject: 'Mom', plural: false }
    case 'girlfriend':
      return { subject: `${nameAt(names, 0, 'she')} and I`, plural: true }
    case 'boyfriend':
      return { subject: `${nameAt(names, 0, 'he')} and I`, plural: true }
    case 'couple':
      return { subject: pair(names, 'We', 'I'), plural: true }
    case 'friends':
      return { subject: pair(names, 'Two friends', 'a best friend'), plural: true }
    case 'baby':
      return { subject: names[0]?.trim() ? `Baby ${names[0].trim()}` : 'the baby', plural: false }
    case 'kid':
      return { subject: nameAt(names, 0, 'A curious kid'), plural: false }
    default:
      return { subject: nameAt(names, 0, 'The hero'), plural: false }
  }
}

const VIBE_ONE: Record<StoryVibeId, (hero: string) => string> = {
  adventure: (h) => `${h} follows a hand-drawn map, crosses a little river, and finds one big surprise.`,
  animals: (h) => `${h} meets talking animals who need help getting home before sunset.`,
  space: (h) => `${h} finds a secret door to the stars and befriends a gentle robot.`,
  magic: (h) => `${h} steps through a glowing tree and helps a tiny dragon find its way.`,
  superhero: (h) => `${h} discovers a quiet superpower and saves the neighborhood without anyone noticing.`,
  love: (h) => `${h} shares one ordinary day that turns unexpectedly tender.`,
  pirates: (h) => `${h} follows a bottle-map to a backyard island and a cardboard ship.`,
  dinosaurs: (h) => `${h} finds a baby dinosaur in the garden and helps it hide from the grown-ups.`
}

const VIBE_PAIR: Record<StoryVibeId, (people: string) => string> = {
  adventure: (p) => `${p} follow a hand-drawn map, cross a little river, and find one big surprise.`,
  animals: (p) => `${p} help talking animals get home before sunset.`,
  space: (p) => `${p} find a secret door to the stars and befriend a gentle robot.`,
  magic: (p) => `${p} step through a glowing tree and help a tiny dragon find its way.`,
  superhero: (p) => `${p} discover a quiet superpower and save the neighborhood together.`,
  love: (p) => `${p} spend one ordinary day that turns unexpectedly tender.`,
  pirates: (p) => `${p} follow a bottle-map to a backyard island and a cardboard ship.`,
  dinosaurs: (p) => `${p} find a baby dinosaur in the garden and help it hide from the grown-ups.`
}

const OCCASION_LINE: Record<StoryOccasionId, (target: string) => string> = {
  birthday: (t) => `This is a birthday story for ${t}.`,
  'just-because': (t) => `A just-because story for ${t}.`,
  anniversary: (t) => `An anniversary story for ${t}.`,
  holiday: (t) => `A holiday story for ${t}.`,
  milestone: (t) => `A milestone story for ${t} — a first, a win, or a new chapter.`,
  bedtime: (t) => `A bedtime story for ${t}.`,
  'thank-you': (t) => `A thank-you story for ${t}.`
}

const TONE_LINE: Record<StoryToneId, string> = {
  sweet: 'Keep it sweet and warm — small kind moments, no scares.',
  funny: 'Keep it funny — little mishaps and a laugh on the last page.',
  brave: 'They get a little scared, then they do the hard thing anyway.',
  cozy: 'Keep it cozy and quiet — rain on the window, hot drinks, a soft ending.',
  heartfelt: 'Make it heartfelt — they say the thing they never say out loud on the last page.',
  surprise: 'End with a surprise they did not see coming, then a hug.'
}

function whoDefault (who: StoryWhoId, names: string[]) {
  switch (who) {
    case 'kid':
      return `${nameAt(names, 0, 'A curious kid')} discovers a secret door in the garden and comes home with a new friend.`
    case 'dad':
      return names[0]
        ? `${names[0]} and Dad go on a Saturday treasure hunt, and the family is waiting at the end.`
        : 'The kids take Dad on a Saturday treasure hunt, and the family is waiting at the end.'
    case 'mom':
      return names[0]
        ? `${names[0]} plans a tiny kitchen adventure for Mom and hides a thank-you note on the last page.`
        : 'The kids plan a tiny kitchen adventure for Mom and hide a thank-you note on the last page.'
    case 'girlfriend':
      return `A rainy-day date where ${nameAt(names, 0, 'she')} and I find a hidden garden and stay until the lights come on.`
    case 'boyfriend':
      return `${nameAt(names, 0, 'He')} and I sneak out for late-night street food and watch the city wake up.`
    case 'couple':
      return `${pair(names, 'We', 'I')} spend one perfect day, from morning coffee to a quiet rooftop sunset.`
    case 'baby':
      return `The family welcomes baby ${nameAt(names, 0, 'the newest one')} with a gentle first-year walk through ordinary magic.`
    case 'friends':
      return `${pair(names, 'Two friends', 'a best friend')} follow a stray puppy through the neighborhood and get it home before dinner.`
    default:
      return VIBE_ONE.adventure(nameAt(names, 0, 'the hero'))
  }
}

function vibeLine (vibe: StoryVibeId, who: StoryWhoId | null, names: string[]) {
  const { subject, plural } = cast(who, names)
  return plural ? VIBE_PAIR[vibe](subject) : VIBE_ONE[vibe](subject)
}

export function buildStoryline (draft: StoryDraft) {
  const names = draft.names.map((n) => n.trim()).filter(Boolean)
  const parts: string[] = []

  if (draft.occasion) {
    parts.push(OCCASION_LINE[draft.occasion](giftTarget(draft.who, names)))
  }

  if (draft.vibe) {
    parts.push(vibeLine(draft.vibe, draft.who, names))
  } else if (draft.who) {
    parts.push(whoDefault(draft.who, names))
  }

  if (draft.tone) {
    parts.push(TONE_LINE[draft.tone])
  }

  if (draft.occasion || draft.tone) {
    parts.push('Add any extra details you want — a place, another person, or how it should end.')
  }

  return clampStoryline(parts.filter(Boolean).join(' '))
}

export function clampStoryline (value: string) {
  const text = value.trim()
  if (text.length <= STORYLINE_MAX) return text
  return `${text.slice(0, STORYLINE_MAX - 1).trimEnd()}`
}

export function isStoryWhoId (value: string): value is StoryWhoId {
  return STORY_WHO.some((chip) => chip.id === value)
}

export function isStoryVibeId (value: string): value is StoryVibeId {
  return STORY_VIBES.some((chip) => chip.id === value)
}

export function isStoryOccasionId (value: string): value is StoryOccasionId {
  return STORY_OCCASIONS.some((chip) => chip.id === value)
}

export function isStoryToneId (value: string): value is StoryToneId {
  return STORY_TONES.some((chip) => chip.id === value)
}
