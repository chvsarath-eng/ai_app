import { useCursor } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { ThreeElements } from '@react-three/fiber'
import { easing } from 'maath'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bone,
  BoxGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  MathUtils,
  MeshStandardMaterial,
  Skeleton,
  SkinnedMesh,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Uint16BufferAttribute,
  Vector3
} from 'three'

import type { BookPage } from './pages'
import { bookPages } from './pages'

const easingFactor = 0.5
const easingFactorFold = 0.3
const insideCurveStrength = 0.18
const outsideCurveStrength = 0.05
const turningCurveStrength = 0.09

const PAGE_WIDTH = 1.28
const PAGE_HEIGHT = 1.28
const PAGE_DEPTH = 0.003
const PAGE_SEGMENTS = 24
const SEGMENT_WIDTH = PAGE_WIDTH / PAGE_SEGMENTS

const baseUrl = '/r3f-book/textures'

function getTextureUrl (name?: string) {
  if (!name) return ''
  const filename = name.includes('.') ? name : `${name}.jpeg`
  return `${baseUrl}/${filename}`
}

const textureLoader = new TextureLoader()
const textureCache = new Map<string, Texture>()
const texturePending = new Map<string, Promise<Texture>>()

function loadTexture (url: string) {
  if (textureCache.has(url)) return Promise.resolve(textureCache.get(url)!)
  if (texturePending.has(url)) return texturePending.get(url)!

  const p = new Promise<Texture>((resolve, reject) => {
    textureLoader.load(
      url,
      (t) => {
        t.colorSpace = SRGBColorSpace
        t.needsUpdate = true
        textureCache.set(url, t)
        texturePending.delete(url)
        resolve(t)
      },
      undefined,
      (err) => {
        texturePending.delete(url)
        reject(err)
      }
    )
  })

  texturePending.set(url, p)
  return p
}

function useNonSuspenseTexture (url?: string) {
  const [texture, setTexture] = useState<Texture | null>(() => {
    if (!url) return null
    return textureCache.get(url) || null
  })

  useEffect(() => {
    if (!url) {
      setTexture(null)
      return
    }

    const cached = textureCache.get(url)
    if (cached) {
      setTexture(cached)
      return
    }

    let isCancelled = false
    loadTexture(url)
      .then((t) => {
        if (isCancelled) return
        setTexture(t)
      })
      .catch(() => {
        if (isCancelled) return
        setTexture(null)
      })

    return () => {
      isCancelled = true
    }
  }, [url])

  return texture
}

const pageGeometry = new BoxGeometry(
  PAGE_WIDTH,
  PAGE_HEIGHT,
  PAGE_DEPTH,
  PAGE_SEGMENTS,
  2
)

pageGeometry.translate(PAGE_WIDTH / 2, 0, 0)

const position = pageGeometry.attributes.position
const vertex = new Vector3()
const skinIndexes: number[] = []
const skinWeights: number[] = []

for (let i = 0; i < position.count; i++) {
  vertex.fromBufferAttribute(position, i)
  const x = vertex.x
  const skinIndex = Math.max(0, Math.floor(x / SEGMENT_WIDTH))
  const skinWeight = (x % SEGMENT_WIDTH) / SEGMENT_WIDTH

  skinIndexes.push(skinIndex, skinIndex + 1, 0, 0)
  skinWeights.push(1 - skinWeight, skinWeight, 0, 0)
}

pageGeometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndexes, 4))
pageGeometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4))

// Slightly darker than white so pages separate from background
const paperColor = new Color('#e9ebef')
const pageMaterials = [
  // Slightly off-white so page edges read against a white background
  new MeshStandardMaterial({ color: paperColor, roughness: 0.85 }),
  new MeshStandardMaterial({ color: '#111' }),
  new MeshStandardMaterial({ color: paperColor, roughness: 0.85 }),
  new MeshStandardMaterial({ color: paperColor, roughness: 0.85 })
]

function createTextTexture (text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const context = canvas.getContext('2d')
  if (!context) return new CanvasTexture(canvas)

  context.fillStyle = 'white'
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.font = 'bold 24px Georgia'
  context.fillStyle = 'black'
  context.textAlign = 'left'
  context.textBaseline = 'top'

  const maxWidth = canvas.width - 250
  const lineHeight = 36
  const paragraphSpacing = 14
  const x = 150
  let y = 80

  const paragraphs = text.split('\n')
  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(' ')
    let line = ''

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' '
      const testWidth = context.measureText(testLine).width
      if (testWidth > maxWidth && n > 0) {
        context.fillText(line, x, y)
        line = words[n] + ' '
        y += lineHeight
      } else {
        line = testLine
      }
    }

    context.fillText(line, x, y)
    y += lineHeight + paragraphSpacing
  })

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function Page ({
  number,
  page,
  opened,
  bookClosed,
  front,
  back,
  frontText,
  backText,
  onSelect
}: BookPage & {
  number: number
  page: number
  opened: boolean
  bookClosed: boolean
  onSelect: (nextPage: number) => void
}) {
  const group = useRef<Group>(null)
  const turnedAt = useRef(0)
  const lastOpened = useRef(opened)
  const skinnedMeshRef = useRef<SkinnedMesh>(null)
  const [highlighted, setHighlighted] = useState(false)
  useCursor(highlighted)

  const frontTexture = useMemo(() => {
    if (frontText) return createTextTexture(frontText)
    return null
  }, [frontText])

  const backTexture = useMemo(() => {
    if (backText) return createTextTexture(backText)
    return null
  }, [backText])

  const frontTexPath = frontText ? '' : getTextureUrl(front)
  const backTexPath = backText ? '' : getTextureUrl(back)
  const loadedFront = useNonSuspenseTexture(frontTexPath || undefined)
  const loadedBack = useNonSuspenseTexture(backTexPath || undefined)

  const manualSkinnedMesh = useMemo(() => {
    const bones: Bone[] = []

    for (let i = 0; i <= PAGE_SEGMENTS; i++) {
      const bone = new Bone()
      bones.push(bone)
      bone.position.x = i === 0 ? 0 : SEGMENT_WIDTH
      if (i > 0) bones[i - 1].add(bone)
    }

    const skeleton = new Skeleton(bones)

    const materials = [
      ...pageMaterials,
      new MeshStandardMaterial({
        color: paperColor,
        map: frontText ? frontTexture : (loadedFront || null),
        roughness: 0.55
      }),
      new MeshStandardMaterial({
        color: paperColor,
        map: backText ? backTexture : (loadedBack || null),
        roughness: 0.55
      })
    ]

    const mesh = new SkinnedMesh(pageGeometry, materials)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.add(skeleton.bones[0])
    mesh.bind(skeleton)

    return mesh
  }, [frontTexture, backTexture, loadedFront, loadedBack, frontText, backText])

  useFrame((_, delta) => {
    if (!skinnedMeshRef.current || !group.current) return

    if (lastOpened.current !== opened) {
      turnedAt.current = Date.now()
      lastOpened.current = opened
    }

    let turningTime = Math.min(400, Date.now() - turnedAt.current) / 400
    turningTime = Math.sin(turningTime * Math.PI)

    let targetRotation = opened ? -Math.PI / 2 : Math.PI / 2
    if (!bookClosed) targetRotation += MathUtils.degToRad(number * 0.8)

    const bones = skinnedMeshRef.current.skeleton.bones
    for (let i = 0; i < bones.length; i++) {
      const target = i === 0 ? group.current : bones[i]

      const insideCurveIntensity = i < 8 ? Math.sin(i * 0.2 + 0.25) : 0
      const outsideCurveIntensity = i >= 8 ? Math.cos(i * 0.3 + 0.09) : 0
      const turningIntensity = Math.sin(i * Math.PI * (1 / bones.length)) * turningTime

      let rotationAngle =
        insideCurveStrength * insideCurveIntensity * targetRotation -
        outsideCurveStrength * outsideCurveIntensity * targetRotation +
        turningCurveStrength * turningIntensity * targetRotation

      let foldRotationAngle = MathUtils.degToRad(Math.sign(targetRotation) * 2)
      if (bookClosed) {
        if (i === 0) {
          rotationAngle = targetRotation
          foldRotationAngle = 0
        } else {
          rotationAngle = 0
          foldRotationAngle = 0
        }
      }

      easing.dampAngle(target.rotation, 'y', rotationAngle, easingFactor, delta)

      const foldIntensity = i > 8
        ? Math.sin(i * Math.PI * (1 / bones.length) - 0.5) * turningTime
        : 0

      easing.dampAngle(
        target.rotation,
        'x',
        foldRotationAngle * foldIntensity,
        easingFactorFold,
        delta
      )
    }
  })

  return (
    <group
      ref={group}
      onPointerEnter={(e) => {
        e.stopPropagation()
        setHighlighted(true)
      }}
      onPointerLeave={(e) => {
        e.stopPropagation()
        setHighlighted(false)
      }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect(opened ? number : number + 1)
        setHighlighted(false)
      }}
    >
      <primitive
        object={manualSkinnedMesh}
        ref={skinnedMeshRef}
        position-z={-number * PAGE_DEPTH + page * PAGE_DEPTH}
      />
    </group>
  )
}

export function Book ({
  page,
  onSelectPage,
  ...props
}: {
  page: number
  onSelectPage: (nextPage: number) => void
} & ThreeElements['group']) {
  const [delayedPage, setDelayedPage] = useState(page)
  const lastSelectAtRef = useRef(0)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined

    const goToPage = () => {
      setDelayedPage((current) => {
        if (page === current) return current

        timeout = setTimeout(
          () => goToPage(),
          Math.abs(page - current) > 2 ? 50 : 150
        )

        if (page > current) return current + 1
        if (page < current) return current - 1
        return current
      })
    }

    goToPage()

    return () => {
      if (timeout) clearTimeout(timeout)
    }
  }, [page])

  const handleSelectPage = (nextPage: number) => {
    // Prevent jitter when users spam-click while pages are still animating.
    // Only allow a new selection once the current animation has settled,
    // and throttle rapid taps.
    if (delayedPage !== page) return

    const now = Date.now()
    if (now - lastSelectAtRef.current < 300) return
    lastSelectAtRef.current = now

    onSelectPage(nextPage)
  }

  return (
    <group {...props} rotation-y={-Math.PI / 2}>
      {bookPages.map((pageData, index) => (
        <Page
          key={pageData.id}
          page={delayedPage}
          number={index}
          opened={delayedPage > index}
          bookClosed={delayedPage === 0 || delayedPage === bookPages.length}
          onSelect={handleSelectPage}
          {...pageData}
        />
      ))}
    </group>
  )
}

