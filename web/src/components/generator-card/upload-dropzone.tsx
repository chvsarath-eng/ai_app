'use client'

import * as React from 'react'
import { ImagePlus, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { PhotoGuidelinesDialog } from '@/components/photo-guidelines-dialog'

type Props = {
  value?: File
  onChange: (file?: File) => void
  isDisabled?: boolean
}

export function UploadDropzone ({ value, onChange, isDisabled }: Props) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [isGuidelinesOpen, setIsGuidelinesOpen] = React.useState(false)

  React.useEffect(() => {
    if (!value) {
      setPreviewUrl(null)
      return
    }

    const url = URL.createObjectURL(value)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [value])

  const acceptFile = React.useCallback((file?: File | null) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return
    onChange(file)
  }, [onChange])

  const onDrop = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (isDisabled) return
    const file = e.dataTransfer.files?.[0]
    acceptFile(file)
  }, [acceptFile, isDisabled])

  const onPick = React.useCallback(() => {
    if (isDisabled) return
    setIsGuidelinesOpen(true)
  }, [isDisabled])

  const onClear = React.useCallback(() => {
    if (isDisabled) return
    setPreviewUrl(null)
    if (inputRef.current) inputRef.current.value = ''
    onChange(undefined)
  }, [isDisabled, onChange])

  return (
    <div>
      <PhotoGuidelinesDialog
        isOpen={isGuidelinesOpen}
        onOpenChange={setIsGuidelinesOpen}
        onContinue={() => inputRef.current?.click()}
      />
      <input
        id="imageFile"
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => acceptFile(e.target.files?.[0])}
        disabled={isDisabled}
        aria-label="Upload photo"
      />

      <div
        role="button"
        tabIndex={isDisabled ? -1 : 0}
        aria-disabled={isDisabled ? 'true' : 'false'}
        onClick={onPick}
        onKeyDown={(e) => {
          if (isDisabled) return
          if (e.key === 'Enter' || e.key === ' ') onPick()
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (isDisabled) return
          setIsDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (isDisabled) return
          setIsDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDragging(false)
        }}
        onDrop={onDrop}
        className={cn(
          'group relative grid min-h-[168px] w-full place-items-center overflow-hidden rounded-2xl border border-dashed p-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:focus-visible:ring-zinc-50 dark:ring-offset-zinc-950',
          isDragging ? 'border-violet-400 bg-violet-50/50 dark:bg-violet-500/10' : 'border-zinc-200 hover:bg-zinc-50/60 dark:border-zinc-800 dark:hover:bg-zinc-900/40',
          isDisabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
        )}
      >
        {previewUrl
          ? (
            <div className="relative w-full">
              {/* Image Preview */}
              <div className="relative mx-auto h-32 w-32 overflow-hidden rounded-2xl border-2 border-zinc-200 bg-zinc-50 shadow-md sm:h-36 sm:w-36">
                <img
                  src={previewUrl}
                  alt="Selected photo preview"
                  className="h-full w-full object-cover"
                />
                {/* Overlay on hover */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/30">
                  <span className="text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    Change
                  </span>
                </div>
              </div>
              
              {/* Remove Button - positioned on corner */}
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute right-1/2 top-0 h-6 w-6 translate-x-[4rem] -translate-y-1 rounded-full border border-zinc-300 bg-white shadow-sm hover:bg-red-50 hover:border-red-300 hover:text-red-600 sm:translate-x-[4.5rem]"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onClear()
                }}
                aria-label="Remove photo"
                disabled={isDisabled}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </Button>
            </div>
          )
          : (
            <div className="flex max-w-sm flex-col items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-zinc-950 text-zinc-50 shadow-sm dark:bg-zinc-50 dark:text-zinc-950">
                <ImagePlus className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium">Drop a photo here</p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">or click to browse</p>
              </div>
              <p className="text-xs text-zinc-500">JPG, PNG, HEIC supported</p>
            </div>
          )}
      </div>
    </div>
  )
}

