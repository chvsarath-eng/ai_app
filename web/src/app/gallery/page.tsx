import type { StaticImageData } from 'next/image'

import styles from './gallery.module.css'

import cover1 from '../../../gallery/images/cover_1.jpg'
import cover2 from '../../../gallery/images/cover_2.png'
import cover3 from '../../../gallery/images/cover_3.png'
import cover4 from '../../../gallery/images/cover_4.png'

const books: StaticImageData[] = [
  cover1,
  cover2,
  cover3,
  cover4,
  cover2,
  cover3
]

export default function GalleryPage () {
  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Gallery</h1>
        <p className={styles.subtitle}>AI-generated covers inspired by your samples.</p>
      </header>

      <div className={styles.gallery}>
        {books.map(renderBook)}
      </div>
    </section>
  )
}

function renderBook (cover: StaticImageData, index: number) {
  return (
    <div
      key={`book-${index}`}
      className={styles.bookContainer}
      role="img"
      aria-label={`Book cover ${index + 1}`}
    >
      <div className={styles.book}>
        <div className={styles.frontFace}>
          <div className={styles.cover} style={{ backgroundImage: `url(${cover.src})` }}>
            <div className={styles.coverOverlay} />
          </div>
        </div>
        <div className={styles.spine} />
      </div>
    </div>
  )
}
