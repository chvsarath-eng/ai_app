'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { Hand, MousePointer2 } from 'lucide-react'
import { Suspense, useEffect, useRef, useState } from 'react'
import { SRGBColorSpace } from 'three'

import { HeroCoverImage } from '@/components/hero-cover'

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
  }, [])

  useEffect(() => {
    if (!isMounted) return
    // R3F now owns this slot (cover overlay, then the book). Drop the HTML poster.
    onBookRevealed?.()
  }, [isMounted, onBookRevealed])

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

    // Keep the cover visible for 2.5s AFTER the first 3D frame is ready,
    // then fade it out and start the demo from page 1.
    const timer = window.setTimeout(() => {
      setIsCoverVisible(false)
      onBookRevealed?.()
    }, 2500)

    return () => window.clearTimeout(timer)
  }, [isMounted, hasWebgl, isCanvasReady, onBookRevealed])

  // Auto flip pages after book is revealed — only while this preview is on screen.
  useEffect(() => {
    if (!showBook) return
    if (!isActive) return
    if (isCoverVisible) return
    if (hasUserInteracted) return
    if (isAutoFlipPaused) return

    let flipInterval = 0
    const startDelay = window.setTimeout(() => {
      let flipCount = 0
      const maxFlips = Math.min(maxPage, 3)

      flipInterval = window.setInterval(() => {
        flipCount += 1

        setPage((prev) => {
          if (prev < maxPage) return prev + 1
          return prev
        })

        if (flipCount === 2) {
          setIsHintVisible(true)
        }

        if (flipCount >= maxFlips) {
          window.clearInterval(flipInterval)
          flipInterval = 0
          setIsAutoFlipPaused(true)
          setIsHintVisible(true)
        }
      }, 2800)
    }, 1200)

    return () => {
      window.clearTimeout(startDelay)
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
    if (page > 0) {
      audio.currentTime = 0
      const playPromise = audio.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {})
      }
    }

    return () => {
      stopFlipAudio(audio)
    }
  }, [page, isMounted, hasWebgl, isActive])

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
        className={`absolute inset-0 z-10 bg-[var(--md-surface)] transition-opacity duration-700 ${
          isCoverVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <PreviewCover className="h-full w-full" />
      </div>

      {isHintVisible && !isCoverVisible && !hasUserInteracted && !isReceded
        ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4">
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

