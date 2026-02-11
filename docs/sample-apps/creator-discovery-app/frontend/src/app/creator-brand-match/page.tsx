'use client'

import { useState, useEffect } from 'react'
import { ArrowRight, RefreshCw, ArrowLeftRight } from 'lucide-react'
import { fetchVideos, findMatches } from '@/lib/api'
import { VideoCard } from '@/components/VideoCard'
import { VideoModal } from '@/components/VideoModal'
import { VideoUpload } from '@/components/VideoUpload'
import type { Video, MatchResult, VideoSource } from '@/lib/types'

export default function CreatorBrandMatchPage() {
  const [sourceType, setSourceType] = useState<VideoSource>('brand')
  const [videos, setVideos] = useState<Video[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null)
  const [matches, setMatches] = useState<MatchResult[]>([])
  const [sourceTitle, setSourceTitle] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingVideos, setIsLoadingVideos] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalVideo, setModalVideo] = useState<{ url: string; title: string } | null>(null)

  const loadVideos = async () => {
    setIsLoadingVideos(true)
    setError(null)
    try {
      const data = await fetchVideos(sourceType)
      setVideos(data)
      setSelectedVideoId(null)
      setMatches([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load videos')
    } finally {
      setIsLoadingVideos(false)
    }
  }

  useEffect(() => { loadVideos() }, [sourceType])

  const handleFindMatches = async () => {
    if (selectedVideoId === null) return
    setIsLoading(true)
    setError(null)
    try {
      const result = await findMatches(selectedVideoId, sourceType)
      setMatches(result.matches)
      setSourceTitle(result.source_title)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Match search failed')
    } finally {
      setIsLoading(false)
    }
  }

  const targetType = sourceType === 'brand' ? 'creator' : 'brand'

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-kcta mb-2 tracking-tight">
            Creator-Brand Match
          </h1>
          <p className="text-ktext text-sm">
            Select a source video and find matching content using Twelve Labs embeddings.
          </p>
        </div>
        <VideoUpload onUploaded={loadVideos} />
      </div>

      {/* Source type toggle */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm font-semibold text-kblue">Source:</span>
        <div className="flex items-center gap-1 bg-kbeige-card rounded-lg p-1 border border-kbeige-border">
          <button
            onClick={() => setSourceType('brand')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              sourceType === 'brand'
                ? 'bg-white text-kcta shadow-sm'
                : 'text-ktext hover:text-kcta'
            }`}
          >
            Brand
          </button>
          <button
            onClick={() => setSourceType('creator')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              sourceType === 'creator'
                ? 'bg-white text-kcta shadow-sm'
                : 'text-ktext hover:text-kcta'
            }`}
          >
            Creator
          </button>
        </div>
        <ArrowLeftRight className="w-4 h-4 text-kbeige-border" />
        <span className="text-sm text-ktext">
          Matching against {targetType} videos
        </span>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-kred/5 border border-kred/20 rounded-xl text-sm text-kred">
          {error}
        </div>
      )}

      {/* Video selection */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-kcta mb-3">
          1. Select a {sourceType} video
        </h2>
        {isLoadingVideos ? (
          <div className="flex items-center gap-2 text-ktext">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading videos...
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                title={video.title}
                category={video.category}
                source={video.source}
                videoUrl={video.video_url}
                isSelected={selectedVideoId === video.id}
                onClick={() => setSelectedVideoId(video.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Find Matches button */}
      <div className="mb-8">
        <button
          onClick={handleFindMatches}
          disabled={selectedVideoId === null || isLoading}
          className="flex items-center gap-2 px-6 py-3 bg-kcta text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Finding matches...
            </>
          ) : (
            <>
              Find Matches
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {/* Match results */}
      {matches.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-kcta mb-1">
            2. Matching {targetType} videos
          </h2>
          <p className="text-sm text-ktext mb-4">
            Found {matches.length} match{matches.length !== 1 ? 'es' : ''} for
            &ldquo;{sourceTitle}&rdquo;
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {matches.map((match) => (
              <VideoCard
                key={`${match.source}-${match.id}`}
                title={match.title}
                category={match.category}
                source={match.source}
                videoUrl={match.video_url}
                score={match.score}
                matchType={match.match_type}
                onClick={() =>
                  setModalVideo({ url: match.video_url, title: match.title })
                }
              />
            ))}
          </div>
        </div>
      )}

      {modalVideo && (
        <VideoModal
          isOpen={true}
          onClose={() => setModalVideo(null)}
          videoUrl={modalVideo.url}
          title={modalVideo.title}
        />
      )}
    </div>
  )
}
