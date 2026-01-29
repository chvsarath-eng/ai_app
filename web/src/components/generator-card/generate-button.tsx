'use client'

import { Button } from '@/components/ui/button'

export function GenerateButton ({
  isLoading,
  hasPhoto
}: {
  isLoading: boolean
  hasPhoto: boolean
}) {
  const isDisabled = !hasPhoto || isLoading
  return (
    <Button
      type="submit"
      className="h-12 w-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-pink-500 text-white shadow-md transition hover:brightness-105"
      variant={hasPhoto ? 'default' : 'secondary'}
      disabled={isDisabled}
      aria-disabled={isDisabled ? 'true' : 'false'}
    >
      {isLoading ? 'Generating…' : 'Generate'}
    </Button>
  )
}

