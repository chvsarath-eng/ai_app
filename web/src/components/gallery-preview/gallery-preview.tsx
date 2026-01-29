'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import type { StaticImageData } from 'next/image'

import styles from './gallery-preview.module.css'

import cover1 from '../../../gallery/images/cover_1.jpg'
import cover2 from '../../../gallery/images/cover_2.png'
import cover3 from '../../../gallery/images/cover_3.png'
import cover4 from '../../../gallery/images/cover_4.png'

const covers: StaticImageData[] = [
  cover1,
  cover2,
  cover3,
  cover4,
  cover2,
  cover3
]

const books: StaticImageData[] = Array.from({ length: 10 }, (_, index) => {
  return covers[index % covers.length]
})

export function GalleryPreview () {
  const [isOpen, setIsOpen] = useState(false)
  const bookUrl = useMemo(() => '/Gallery_books/digital_book_1.html', [])

  const handleOpen = useCallback(() => {
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
        {books.map((cover, index) => (
          <button
            key={`book-${index}`}
            type="button"
            className={styles.bookContainer}
            aria-label={`Open book preview ${index + 1}`}
            style={{ '--i': index } as CSSProperties}
            onClick={handleOpen}
          >
            <div className={styles.book}>
              <div className={styles.frontFace}>
                <div className={styles.cover} style={{ backgroundImage: `url(${cover.src})` }}>
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
              title="Digital book preview"
              src={bookUrl}
              className={styles.modalFrame}
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
