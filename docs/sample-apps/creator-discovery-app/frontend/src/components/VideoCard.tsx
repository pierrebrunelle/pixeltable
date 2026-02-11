'use client'

import { Film, Tag } from 'lucide-react'
import { clsx } from 'clsx'

interface VideoCardProps {
  title: string
  category: string
  source: 'brand' | 'creator'
  videoUrl?: string
  score?: number
  matchType?: string
  isSelected?: boolean
  onClick?: () => void
}

function getYouTubeThumbnail(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/)
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : null
}

export function VideoCard({
  title,
  category,
  source,
  videoUrl,
  score,
  matchType,
  isSelected,
  onClick,
}: VideoCardProps) {
  const ytThumb = videoUrl ? getYouTubeThumbnail(videoUrl) : null
  const isDirectVideo = videoUrl && !ytThumb && (videoUrl.endsWith('.mp4') || videoUrl.startsWith('http'))

  return (
    <div
      className={clsx(
        'bg-white rounded-xl border overflow-hidden transition-all duration-200',
        onClick ? 'cursor-pointer hover:shadow-md hover:shadow-kblue/[0.06] hover:-translate-y-0.5' : '',
        isSelected
          ? 'border-kblue ring-2 ring-kblue/20 shadow-md'
          : 'border-kbeige-border hover:border-kblue/20'
      )}
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-kbeige-card flex items-center justify-center overflow-hidden">
        {ytThumb ? (
          <img src={ytThumb} alt={title} className="w-full h-full object-cover" />
        ) : isDirectVideo ? (
          <video src={videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
        ) : (
          <Film className="w-10 h-10 text-kbeige-border" />
        )}

        {/* Source badge */}
        <span
          className={clsx(
            'absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-semibold',
            source === 'brand'
              ? 'bg-kblue/90 text-white'
              : 'bg-kyellow/90 text-white'
          )}
        >
          {source === 'brand' ? 'Brand' : 'Creator'}
        </span>

        {/* Score badge */}
        {score !== undefined && (
          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-kblue text-white">
            {(score * 100).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="text-sm font-medium text-kcta line-clamp-2 leading-tight">
          {title}
        </h3>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-ktext">
            <Tag className="w-3 h-3" />
            {category}
          </span>
          {matchType && (
            <span className="text-xs text-ktext/60">{matchType}</span>
          )}
        </div>
      </div>
    </div>
  )
}
