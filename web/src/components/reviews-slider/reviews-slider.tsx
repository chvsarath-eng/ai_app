import styles from './reviews-slider.module.css'

const testimonials = [
  {
    id: 't-1',
    title: 'A Real Keepsake',
    quote: 'Seeing our son on the cover made us tear up. The colors are rich, the pages feel premium, and it looks like a real bookstore book.',
    name: 'Anika & Raj',
    image: '/brand/review_1.png'
  },
  {
    id: 't-2',
    title: 'Pure Joy',
    quote: 'We gifted him his Viking story and he could not stop smiling. The quality is beautiful, and he keeps showing it to everyone.',
    name: 'Nadia & Mark',
    image: '/brand/review_2.png'
  },
  {
    id: 't-3',
    title: 'Bedtime Favorite',
    quote: 'Bedtime feels special now. She sees herself in the story and asks for it every night. The print looks so crisp.',
    name: 'Olivia & Ben',
    image: '/brand/review_3.png'
  },
  {
    id: 't-4',
    title: 'Real Emotion',
    quote: 'She loves showing her book to everyone. It feels like a real story with her as the hero, and the finish feels premium.',
    name: 'Mei & Lucas',
    image: '/brand/review_4.png'
  },
  {
    id: 't-5',
    title: 'Perfect Gift',
    quote: 'He was so proud to share his book with friends. The quality is amazing and it feels like a real gift we will keep forever.',
    name: 'Marcus & June',
    image: '/brand/review_5.png'
  }
]

export function ReviewsSlider () {
  return (
    <div className={styles.slider}>
      <input type="radio" name="testimonial" id="t-1" />
      <input type="radio" name="testimonial" id="t-2" />
      <input type="radio" name="testimonial" id="t-3" defaultChecked />
      <input type="radio" name="testimonial" id="t-4" />
      <input type="radio" name="testimonial" id="t-5" />

      <div className={styles.testimonials}>
        {testimonials.map((item) => (
          <label key={item.id} className={styles.item} htmlFor={item.id}>
            <div className={styles.mycard}>
              <p className={styles.cardtitle}>{item.title}</p>
              <div>
                <img src={item.image} alt={item.name} className={styles.cardimg} />
              </div>
              <div>
                <p className={styles.carddescription}>{item.quote}</p>
                <p className={styles.cardmeta}>{item.name}</p>
              </div>
            </div>
          </label>
        ))}
      </div>

      <div className={styles.dots}>
        <label htmlFor="t-1" />
        <label htmlFor="t-2" />
        <label htmlFor="t-3" />
        <label htmlFor="t-4" />
        <label htmlFor="t-5" />
      </div>
    </div>
  )
}
