import { ContactShadows, Environment, Float, OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { useMemo, useRef } from 'react'
import { Vector3 } from 'three'
import type { Group } from 'three'

import { Book } from './book'

export function Experience ({
  page,
  isReceded,
  onSelectPage
}: {
  page: number
  isReceded?: boolean
  onSelectPage: (nextPage: number) => void
}) {
  const bookGroupRef = useRef<Group>(null)

  const targets = useMemo(() => {
    // No recede behavior — book stays in place since shadow is removed
    return {
      position: new Vector3(0, -0.1, 0),
      scale: new Vector3(1.35, 1.35, 1.35),
      shadowOpacity: 0,
      shadowBlur: 3.6,
      shadowFar: 3.6
    }
  }, [])

  useFrame((_, delta) => {
    if (!bookGroupRef.current) return
    easing.damp3(bookGroupRef.current.position, targets.position, 0.35, delta)
    easing.damp3(bookGroupRef.current.scale, targets.scale, 0.35, delta)
  })

  return (
    <>
      <ambientLight intensity={0.35} />
      <Float
        rotation-x={-Math.PI / 4}
        // Reduce "free flow" motion so it feels steadier.
        floatIntensity={isReceded ? 0.12 : 0.25}
        speed={1.2}
        rotationIntensity={isReceded ? 0.35 : 0.6}
      >
        <group ref={bookGroupRef}>
          <Book page={page} onSelectPage={onSelectPage} />
        </group>
      </Float>

      {/* User control like the original demo: drag to rotate, scroll to zoom */}
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={2.6}
        maxDistance={6.5}
        minPolarAngle={0.35}
        maxPolarAngle={1.35}
      />

      <Environment preset="studio" />

      <directionalLight
        position={[2, 5, 2]}
        intensity={1.6}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0001}
      />

      {/* Rim light to separate white pages from white background */}
      <directionalLight
        position={[-4, 2.5, -2]}
        intensity={0.55}
        color="#ffffff"
      />

      {/* Soft shadow without a visible "slab" plane */}
      <ContactShadows
        position={[0, -1.55, 0]}
        opacity={targets.shadowOpacity}
        blur={targets.shadowBlur}
        far={targets.shadowFar}
        resolution={512}
      />
    </>
  )
}

