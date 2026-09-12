'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Hand, MousePointer2 } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { SRGBColorSpace } from 'three'

import { HeroCoverImage } from '@/components/hero-cover'

import { preloadBookTextures } from './book'
import { bookPages } from './pages'
import { Experience } from './experience'

function clamp (value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min
  return Math.min(max, Math.max(min, value))
}

function PreviewCover ({
  className
}: {
  className?: string
}) {
  return (
    <div className={`${className} flex items-center justify-center`}>
      <HeroCoverImage alt="" />
    </div>
  )
}

function isCompactCanvas (size: { width: number; height: number }) {
  // Phone well is short and wide — do not use Three viewport.width,
  // which stays large on a 390x230 canvas and skips the mobile framing.
  return size.width < 640 || size.height < 360
}

function ResponsiveCamera () {
  const { camera, size } = useThree()
  const isCompact = isCompactCanvas(size)

  useFrame(() => {
    if (isCompact) {
      // Look slightly above the book so it sits in the lower-center of the well,
      // filling the empty gap above the generate form. Leave a little headroom
      // so page flips are not clipped.
      camera.position.set(0, 0.3, 3.35)
      camera.lookAt(0, 0.12, 0)
      return
    }
    camera.position.set(0, 0.92, 3.65)
    camera.lookAt(0, 0, 0)
  })

  return null
}

function FirstFrame ({ onReady }: { onReady: () => void }) {
  const hasFiredRef = useRef(false)

  useFrame(() => {
    if (hasFiredRef.current) return
    hasFiredRef.current = true
    onReady()
  })

  return null
}

function canUseWebgl () {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    return Boolean(gl)
  } catch {
    return false
  }
}

function stopFlipAudio (audio: HTMLAudioElement | null) {
  if (!audio) return
  audio.pause()
  audio.currentTime = 0
}

export function R3FBookPreview ({
  isReceded,
  isActive = true,
  onBookRevealed
}: {
  isReceded?: boolean
  isActive?: boolean
  onBookRevealed?: () => void
}) {
  const [page, setPage] = useState(0)
  const [isMounted, setIsMounted] = useState(false)
  const [hasWebgl, setHasWebgl] = useState<boolean | null>(null)
  const [isCoverVisible, setIsCoverVisible] = useState(true)
  const [isCanvasReady, setIsCanvasReady] = useState(false)
  const [showBook, setShowBook] = useState(false)
  const [hasUserInteracted, setHasUserInteracted] = useState(false)
  const [isAutoFlipPaused, setIsAutoFlipPaused] = useState(false)
  const [isHintVisible, setIsHintVisible] = useState(false)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const maxPage = bookPages.length

  useEffect(() => {
    setIsMounted(true)
    setHasWebgl(canUseWebgl())
    const phoneLike = window.matchMedia('(pointer: coarse), (max-width: 480px)').matches
    setIsCoarsePointer(phoneLike)
    preloadBookTextures().catch(() => {})
  }, [])

  useEffect(() => {
    if (!isMounted) return
    if (!hasWebgl) return

    // Show the 3D canvas ASAP, but keep a lightweight cover image
    // on top while assets warm up.
    setShowBook(true)
    setIsCoverVisible(true)
    setIsCanvasReady(false)
    setIsAutoFlipPaused(false)
    setIsHintVisible(false)
  }, [isMounted, hasWebgl])

  useEffect(() => {
    if (!isMounted) return
    if (!hasWebgl) return
    if (!isCanvasReady) return

    // Dissolve the hero as soon as the 3D cover is on screen.
    const timer = window.setTimeout(() => {
      setIsCoverVisible(false)
      onBookRevealed?.()
    }, 0)

    return () => window.clearTimeout(timer)
  }, [isMounted, hasWebgl, isCanvasReady, onBookRevealed])

  // Auto flip: one right-hand page at a time, after the overlay has faded.
  useEffect(() => {
    if (!showBook) return
    if (!isActive) return
    if (isCoverVisible) return
    if (hasUserInteracted) return
    if (isAutoFlipPaused) return

    let flipCount = 0
    const maxFlips = Math.min(maxPage, 6)
    let flipInterval = 0

    const flipOnce = () => {
      flipCount += 1
      setPage((prev) => (prev < maxPage ? prev + 1 : prev))

      if (flipCount === 2) {
        setIsHintVisible(true)
      }

      if (flipCount >= maxFlips) {
        window.clearInterval(flipInterval)
        flipInterval = 0
        setIsAutoFlipPaused(true)
        setIsHintVisible(true)
      }
    }

    // Cover turns as the hero dissolves, then one right-hand page at a time.
    flipOnce()
    flipInterval = window.setInterval(flipOnce, 2200)

    return () => {
      window.clearInterval(flipInterval)
    }
  }, [showBook, maxPage, isCoverVisible, hasUserInteracted, isAutoFlipPaused, isActive])

  useEffect(() => {
    // If the demo is running and the user hasn't interacted yet,
    // show a small hint shortly after the cover dissolves.
    if (isCoverVisible) return
    if (hasUserInteracted) return
    if (isHintVisible) return

    const timer = window.setTimeout(() => setIsHintVisible(true), 5200)
    return () => window.clearTimeout(timer)
  }, [isCoverVisible, hasUserInteracted, isHintVisible])

  useEffect(() => {
    if (!isMounted) return
    if (!hasWebgl) return
    if (!audioRef.current) {
      audioRef.current = new Audio('/r3f-book/audios/page-flip-01a.mp3')
      audioRef.current.volume = 0.35
    }

    if (!isActive) {
      stopFlipAudio(audioRef.current)
      return
    }

    const audio = audioRef.current
    // Play on real page turns only — not the already-open starting spread.
    if (!isCoverVisible && page > 0) {
      audio.currentTime = 0
      const playPromise = audio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {})
      }
    }

    return () => {
      stopFlipAudio(audio)
    }
  }, [page, isMounted, hasWebgl, isActive, isCoverVisible])

  const safeSetPage = (next: number) => {
    setHasUserInteracted(true)
    setIsAutoFlipPaused(true)
    setIsHintVisible(false)
    setPage(clamp(next, 0, maxPage))
  }

  if (!isMounted || hasWebgl === null) {
    return (
      <PreviewCover className="h-full w-full bg-[var(--md-surface)]" />
    )
  }

  if (!hasWebgl) {
    return (
      <div className="grid h-full w-full place-items-center">
        <div className="max-w-[38ch] px-6 text-center text-sm text-zinc-600">
          3D preview isn’t available in this browser. You’ll still get the full HTML/PDF preview after generation.
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div
        className={`absolute inset-0 z-10 bg-[var(--md-surface)] transition-opacity duration-150 ${
          isCoverVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <PreviewCover className="h-full w-full" />
      </div>

      {isHintVisible && !isCoverVisible && !hasUserInteracted && !isReceded
        ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-1 z-20 flex justify-center px-4 sm:bottom-6">
              <div className="flex items-center gap-3 rounded-full border border-zinc-200/70 bg-white/80 px-4 py-2 text-sm text-zinc-800 shadow-sm backdrop-blur">
                {isCoarsePointer ? (
                  <span className="inline-flex items-center gap-2">
                    <Hand className="h-4 w-4" aria-hidden="true" />
                    Tap a page to flip
                  </span>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-2">
                      <MousePointer2 className="h-4 w-4" aria-hidden="true" />
                      Click
                    </span>
                    <span className="text-zinc-400">•</span>
                    <span className="inline-flex items-center gap-2">
                      <Hand className="h-4 w-4" aria-hidden="true" />
                      Drag to rotate
                    </span>
                  </>
                )}
                <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-violet-500" />
              </div>
            </div>
          )
        : null}

      <div
        className={`absolute inset-0 transition-opacity duration-1000 ${
          showBook ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <Canvas
          shadows
          frameloop={isActive ? 'always' : 'never'}
          dpr={[1, 2]}
          camera={{ position: [0, 0.92, 3.65], fov: 42 }}
          gl={{ antialias: true, alpha: true }}
          style={{ touchAction: 'pan-y' }}
          onPointerDown={() => {
            setHasUserInteracted(true)
            setIsAutoFlipPaused(true)
            setIsHintVisible(false)
          }}
          onWheel={() => {
            setHasUserInteracted(true)
            setIsAutoFlipPaused(true)
            setIsHintVisible(false)
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0)
            gl.outputColorSpace = SRGBColorSpace
            gl.toneMappingExposure = 1
          }}
        >
          <group position-y={0}>
            <Suspense fallback={null}>
              <ResponsiveCamera />
              <FirstFrame onReady={() => setIsCanvasReady(true)} />
              <Experience
                page={page}
                isReceded={isReceded}
                allowOrbit={!isCoarsePointer}
                onSelectPage={(next) => safeSetPage(next)}
              />
            </Suspense>
          </group>
        </Canvas>
      </div>
    </div>
  )
}

