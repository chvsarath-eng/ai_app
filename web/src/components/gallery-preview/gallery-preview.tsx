'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Loader2 } from 'lucide-react'

import styles from './gallery-preview.module.css'

type GalleryBook = {
  coverSrc: string
  bookNumber: number
}

const galleryBooks: GalleryBook[] = [
  { coverSrc: '/gallery/cover_1.jpg', bookNumber: 1 },
  { coverSrc: '/gallery/cover_2.jpg', bookNumber: 2 },
  { coverSrc: '/gallery/cover_3.jpg', bookNumber: 3 },
  { coverSrc: '/gallery/cover_4.jpg', bookNumber: 4 },
  { coverSrc: '/gallery/cover_5.jpg', bookNumber: 5 }
]

const books: GalleryBook[] = Array.from({ length: 10 }, (_, index) => {
  return galleryBooks[index % galleryBooks.length]
})

const getBookUrl = (bookNumber: number): string => {
  return `/Gallery_books/digital_book_${bookNumber}.html`
}

export function GalleryPreview () {
  const [isOpen, setIsOpen] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [selectedBook, setSelectedBook] = useState<GalleryBook>(books[0])

  const handleOpen = useCallback((book: GalleryBook) => {
    setSelectedBook(book)
    setIframeLoaded(false)
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
                <div className={styles.cover} style={{ backgroundImage: `url(${book.coverSrc})` }}>
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
            {!iframeLoaded && (
              <div
                className={styles.loadingOverlay}
                style={{ backgroundImage: `url(${selectedBook.coverSrc})` }}
                aria-live="polite"
              >
                <div className={styles.loadingScrim} />
                <div className={styles.loadingContent}>
                  <Loader2 className={styles.spinner} aria-hidden="true" />
                  <p className={styles.loadingText}>Loading 3D experience...</p>
                </div>
              </div>
            )}
            <iframe
              title={`Digital book preview ${selectedBook.bookNumber}`}
              src={getBookUrl(selectedBook.bookNumber)}
              className={`${styles.modalFrame} ${iframeLoaded ? styles.modalFrameVisible : styles.modalFrameHidden}`}
              allow="fullscreen"
              onLoad={() => setIframeLoaded(true)}
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
