'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

interface VideoModalProps {
  isOpen: boolean
  onClose: () => void
  videoUrl: string
  title: string
  startTime?: number
}

export function VideoModal({
  isOpen,
  onClose,
  videoUrl,
  title,
  startTime,
}: VideoModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (isOpen && videoRef.current && startTime !== undefined) {
      videoRef.current.currentTime = startTime
    }
  }, [isOpen, startTime])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-kcta/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 overflow-hidden border border-kbeige-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-kbeige-border">
          <h3 className="text-lg font-semibold text-kcta truncate pr-4 tracking-tight">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-kbeige-hover transition-colors"
          >
            <X className="w-5 h-5 text-ktext" />
          </button>
        </div>
        <div className="aspect-video bg-kcta">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full"
            controls
            autoPlay
          />
        </div>
      </div>
    </div>
  )
}
