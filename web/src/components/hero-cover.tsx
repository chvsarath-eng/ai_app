export const HERO_COVER_SRC = '/brand/preview-cover_hero.webp'
export const HERO_COVER_SRC_800 = '/brand/preview-cover_hero-800.webp'
export const HERO_COVER_FALLBACK = '/brand/preview-cover_hero.jpg'
export const HERO_COVER_WIDTH = 1400
export const HERO_COVER_HEIGHT = 1045
export const HERO_COVER_SRCSET = `${HERO_COVER_SRC_800} 800w, ${HERO_COVER_SRC} 1400w`
export const HERO_COVER_SIZES = '(max-width: 640px) 92vw, (max-width: 1024px) 55vw, 560px'

export function HeroCoverImage ({
  className = 'max-h-full max-w-full object-contain',
  alt = 'Personalized photorealistic storybook preview'
}: {
  className?: string
  alt?: string
}) {
  return (
    <picture>
      <source
        type="image/webp"
        srcSet={HERO_COVER_SRCSET}
        sizes={HERO_COVER_SIZES}
      />
      <img
        src={HERO_COVER_FALLBACK}
        alt={alt}
        width={HERO_COVER_WIDTH}
        height={HERO_COVER_HEIGHT}
        fetchPriority="high"
        decoding="async"
        className={className}
        style={{ transform: 'scale(0.9)' }}
      />
    </picture>
  )
}
