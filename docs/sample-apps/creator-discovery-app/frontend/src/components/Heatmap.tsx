'use client'

import { useMemo } from 'react'
import { clsx } from 'clsx'
import type { BrandMentionEvent } from '@/lib/types'

interface HeatmapProps {
  events: BrandMentionEvent[]
  videoDuration: number
  numBuckets?: number
  onBucketClick?: (startTime: number) => void
}

export function Heatmap({
  events,
  videoDuration,
  numBuckets = 30,
  onBucketClick,
}: HeatmapProps) {
  const { brands, buckets } = useMemo(() => {
    // Collect unique brand names
    const brandSet = new Set<string>()
    events.forEach((e) => brandSet.add(e.brand))
    const brands = Array.from(brandSet).sort()

    // Build time buckets
    const bucketDuration = videoDuration / numBuckets
    const buckets = Array.from({ length: numBuckets }, (_, i) => {
      const bucketStart = i * bucketDuration
      const bucketEnd = (i + 1) * bucketDuration
      const brandPresence: Record<string, { count: number; prominence: string }> = {}

      events.forEach((event) => {
        // Check overlap between event and bucket
        if (event.start_time < bucketEnd && event.end_time > bucketStart) {
          const key = event.brand
          if (!brandPresence[key]) {
            brandPresence[key] = { count: 0, prominence: 'none' }
          }
          brandPresence[key].count += 1
          // Keep highest prominence
          const order = ['high', 'medium', 'low', 'none']
          if (order.indexOf(event.prominence) < order.indexOf(brandPresence[key].prominence)) {
            brandPresence[key].prominence = event.prominence
          }
        }
      })

      return {
        index: i,
        startTime: bucketStart,
        endTime: bucketEnd,
        brands: brandPresence,
      }
    })

    return { brands, buckets }
  }, [events, videoDuration, numBuckets])

  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No brand mentions detected in this video.
      </div>
    )
  }

  const getIntensityClass = (prominence: string) => {
    switch (prominence) {
      case 'high':
        return 'bg-red-500'
      case 'medium':
        return 'bg-orange-400'
      case 'low':
        return 'bg-yellow-300'
      default:
        return 'bg-gray-100'
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Header: time labels */}
        <div className="flex mb-1 pl-24">
          {buckets
            .filter((_, i) => i % Math.max(1, Math.floor(numBuckets / 10)) === 0)
            .map((bucket) => (
              <div
                key={bucket.index}
                className="text-xs text-gray-400"
                style={{
                  marginLeft: `${(bucket.index / numBuckets) * 100}%`,
                  position: 'absolute',
                }}
              >
                {formatTime(bucket.startTime)}
              </div>
            ))}
        </div>

        {/* Heatmap rows (one per brand) */}
        {brands.map((brand) => (
          <div key={brand} className="flex items-center gap-2 mb-1">
            <div className="w-24 text-xs text-gray-600 font-medium truncate text-right pr-2">
              {brand}
            </div>
            <div className="flex-1 flex gap-px">
              {buckets.map((bucket) => {
                const presence = bucket.brands[brand]
                return (
                  <div
                    key={bucket.index}
                    className={clsx(
                      'h-6 flex-1 rounded-sm transition-all cursor-pointer hover:opacity-80',
                      presence ? getIntensityClass(presence.prominence) : 'bg-gray-100'
                    )}
                    title={`${brand} at ${formatTime(bucket.startTime)} - ${presence ? presence.prominence : 'none'}`}
                    onClick={() => onBucketClick?.(bucket.startTime)}
                  />
                )
              })}
            </div>
          </div>
        ))}

        {/* Total exposure row */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
          <div className="w-24 text-xs text-gray-600 font-semibold text-right pr-2">
            Total
          </div>
          <div className="flex-1 flex gap-px">
            {buckets.map((bucket) => {
              const totalBrands = Object.keys(bucket.brands).length
              return (
                <div
                  key={bucket.index}
                  className={clsx(
                    'h-6 flex-1 rounded-sm transition-all cursor-pointer hover:opacity-80',
                    totalBrands > 2
                      ? 'bg-red-500'
                      : totalBrands > 1
                        ? 'bg-orange-400'
                        : totalBrands > 0
                          ? 'bg-yellow-300'
                          : 'bg-gray-100'
                  )}
                  title={`${formatTime(bucket.startTime)}: ${totalBrands} brand(s)`}
                  onClick={() => onBucketClick?.(bucket.startTime)}
                />
              )
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pl-24 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-red-500" /> High
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-orange-400" /> Medium
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-yellow-300" /> Low
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-gray-100 border border-gray-200" /> None
          </div>
        </div>
      </div>
    </div>
  )
}
