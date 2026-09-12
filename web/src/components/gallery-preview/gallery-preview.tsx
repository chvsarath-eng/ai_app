'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Loader2 } from 'lucide-react'

import styles from './gallery-preview.module.css'

type GalleryBook = {
  coverSrc: string
  coverFallback: string
  bookNumber: number
}

const books: GalleryBook[] = [
  { coverSrc: '/gallery/thumbs/cover_9.webp', coverFallback: '/gallery/cover_9.jpg', bookNumber: 9 },
  { coverSrc: '/gallery/thumbs/cover_10.webp', coverFallback: '/gallery/cover_10.jpg', bookNumber: 10 },
  { coverSrc: '/gallery/thumbs/cover_11.webp', coverFallback: '/gallery/cover_11.jpg', bookNumber: 11 },
  { coverSrc: '/gallery/thumbs/cover_12.webp', coverFallback: '/gallery/cover_12.jpg', bookNumber: 12 },
  { coverSrc: '/gallery/thumbs/cover_6.webp', coverFallback: '/gallery/cover_6.jpg', bookNumber: 6 },
  { coverSrc: '/gallery/thumbs/cover_7.webp', coverFallback: '/gallery/cover_7.jpg', bookNumber: 7 },
  { coverSrc: '/gallery/thumbs/cover_8.webp', coverFallback: '/gallery/cover_8.jpg', bookNumber: 8 },
  { coverSrc: '/gallery/thumbs/cover_1.webp', coverFallback: '/gallery/cover_1.jpg', bookNumber: 1 }
]

const getBookUrl = (bookNumber: number): string => {
  return `/Gallery_books/digital_book_${bookNumber}.html`
}

const prefetchBook = (bookNumber: number): void => {
  if (typeof window === 'undefined') return
  const htmlUrl = getBookUrl(bookNumber)
  if (!document.querySelector(`link[rel="prefetch"][href="${htmlUrl}"]`)) {
    const link = document.createElement('link')
    link.rel = 'prefetch'
    link.href = htmlUrl
    document.head.appendChild(link)
  }
  ;['p01', 'p02', 'p03', 'p04'].forEach((page) => {
    const src = `/Gallery_books/digital_book_${bookNumber}_assets/${page}.jpg`
    const img = new window.Image()
    img.decoding = 'async'
    img.src = src
  })
}

export function GalleryPreview () {
  const galleryRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [selectedBook, setSelectedBook] = useState<GalleryBook>(books[0])
  const [isInView, setIsInView] = useState(true)
  const [isPageVisible, setIsPageVisible] = useState(true)
  const shouldAnimate = isInView && isPageVisible && !isOpen

  const handleOpen = useCallback((book: GalleryBook) => {
    prefetchBook(book.bookNumber)
    setSelectedBook(book)
    setIframeLoaded(false)
    setIsOpen(true)
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
  }, [])

  useEffect(() => {
    const node = galleryRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.15))
      },
      { threshold: [0, 0.15, 0.4] }
    )
    observer.observe(node)

    const handleVisibility = () => {
      setIsPageVisible(document.visibilityState === 'visible')
    }
    handleVisibility()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
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
      <div
        ref={galleryRef}
        className={`${styles.gallery} ${shouldAnimate ? '' : styles.galleryPaused}`}
      >
        {books.map((book, index) => (
          <button
            key={`book-${index}`}
            type="button"
            className={styles.bookContainer}
            aria-label={`Open book preview ${index + 1}`}
            style={{ '--i': index } as CSSProperties}
            onClick={() => handleOpen(book)}
            onMouseEnter={() => prefetchBook(book.bookNumber)}
            onPointerDown={() => prefetchBook(book.bookNumber)}
            onFocus={() => prefetchBook(book.bookNumber)}
          >
            <div className={styles.book}>
              <div className={styles.frontFace}>
                <div
                  className={styles.cover}
                  style={{ backgroundImage: `url(${book.coverSrc}), url(${book.coverFallback})` }}
                >
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
              loading="eager"
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
