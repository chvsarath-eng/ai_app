'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { StaticImageData } from 'next/image'

import styles from './gallery-preview.module.css'

import cover1 from '../../../gallery/images/cover_1.jpg'
import cover2 from '../../../gallery/images/cover_2.png'
import cover3 from '../../../gallery/images/cover_3.png'
import cover4 from '../../../gallery/images/cover_4.png'
import cover5 from '../../../gallery/images/cover_5.png'

type GalleryBook = {
  cover: StaticImageData
  bookNumber: number
}

// Keep this list in sync with files in /public/Gallery_books/digital_book_<n>.html
const galleryBooks: GalleryBook[] = [
  { cover: cover1, bookNumber: 1 },
  { cover: cover2, bookNumber: 2 },
  { cover: cover3, bookNumber: 3 },
  { cover: cover4, bookNumber: 4 },
  { cover: cover5, bookNumber: 5 }
]

const books: GalleryBook[] = Array.from({ length: 10 }, (_, index) => {
  return galleryBooks[index % galleryBooks.length]
})

const getBookUrl = (bookNumber: number): string => {
  return `/Gallery_books/digital_book_${bookNumber}.html`
}

export function GalleryPreview () {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedBook, setSelectedBook] = useState<GalleryBook>(books[0])

  const handleOpen = useCallback((book: GalleryBook) => {
    setSelectedBook(book)
    setIsOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose()
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleClose])

  return (
    <>
      <div className={styles.gallery}>
        {books.map((book, index) => (
          <button
            key={`book-${index}`}
            type="button"
            className={styles.bookContainer}
            aria-label={`Open book preview ${index + 1}`}
            style={{ '--i': index } as CSSProperties}
            onClick={() => handleOpen(book)}
          >
            <div className={styles.book}>
              <div className={styles.frontFace}>
                <div className={styles.cover} style={{ backgroundImage: `url(${book.cover.src})` }}>
                  <div className={styles.coverOverlay} />
                </div>
              </div>
              <div className={styles.spine} />
            </div>
          </button>
        ))}
      </div>

      {isOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modalContent}>
            <button
              type="button"
              className={styles.modalClose}
              onClick={handleClose}
              aria-label="Close book preview"
            >
              ×
            </button>
            <iframe
              title={`Digital book preview ${selectedBook.bookNumber}`}
              src={getBookUrl(selectedBook.bookNumber)}
              className={styles.modalFrame}
              allow="fullscreen"
            />
          </div>
          <button
            type="button"
            className={styles.modalBackdrop}
            onClick={handleClose}
            aria-label="Close overlay"
          />
        </div>
      )}
    </>
  )
}
