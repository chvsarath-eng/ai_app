import stories from './story_content.json'

export type BookPage = {
  id: string
  front?: string
  back?: string
  frontText?: string
  backText?: string
}

type StoryItem = { page: number, text: string }

function toPages (items: StoryItem[]) {
  const safeItems = Array.isArray(items) ? items : []

  // Matches the original R3F demo:
  // - cover page: img-1 (front) + img-2 (back)
  // - pages 1..9: story text on the right (frontText), image on the left (back img-3..img-11)
  // - last: story 10 on the right, img-12 on the left/back
  const pages: BookPage[] = [
    { id: 'cover', front: 'img-1', back: 'img-2' }
  ]

  for (let i = 0; i < 9; i++) {
    const story = safeItems[i]
    if (!story?.text) continue
    pages.push({
      id: `page-${i + 1}`,
      frontText: story.text,
      back: `img-${i + 3}`
    })
  }

  const last = safeItems[9]
  if (last?.text) {
    pages.push({
      id: 'page-10',
      frontText: last.text,
      back: 'img-12'
    })
  }

  return pages
}

export const bookPages: BookPage[] = toPages(stories as StoryItem[])

