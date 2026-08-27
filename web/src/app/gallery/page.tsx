import styles from './gallery.module.css'

const books = [
  '/gallery/cover_1.jpg',
  '/gallery/cover_2.jpg',
  '/gallery/cover_3.jpg',
  '/gallery/cover_4.jpg',
  '/gallery/cover_2.jpg',
  '/gallery/cover_3.jpg'
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

function renderBook (coverSrc: string, index: number) {
  return (
    <div
      key={`book-${index}`}
      className={styles.bookContainer}
      role="img"
      aria-label={`Book cover ${index + 1}`}
    >
      <div className={styles.book}>
        <div className={styles.frontFace}>
          <div className={styles.cover} style={{ backgroundImage: `url(${coverSrc})` }}>
            <div className={styles.coverOverlay} />
          </div>
        </div>
        <div className={styles.spine} />
      </div>
    </div>
  )
}
