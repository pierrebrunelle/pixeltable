'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, BarChart3 } from 'lucide-react'
import { fetchCreatorVideosForMentions, analyzeBrandMentions } from '@/lib/api'
import { VideoModal } from '@/components/VideoModal'
import { Heatmap } from '@/components/Heatmap'
import type { Video, BrandMentionEvent } from '@/lib/types'

export default function BrandMentionDetectionPage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [isLoadingVideos, setIsLoadingVideos] = useState(true)
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analysisResult, setAnalysisResult] = useState<{
    videoTitle: string
    videoUrl: string
    events: BrandMentionEvent[]
    totalFrames: number
  } | null>(null)
  const [modalVideo, setModalVideo] = useState<{
    url: string
    title: string
    startTime?: number
  } | null>(null)

  useEffect(() => {
    const loadVideos = async () => {
      try {
        const data = await fetchCreatorVideosForMentions()
        setVideos(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load videos')
      } finally {
        setIsLoadingVideos(false)
      }
    }
    loadVideos()
  }, [])

  const handleAnalyze = async (videoId: number) => {
    setSelectedVideoId(videoId)
    setIsAnalyzing(true)
    setError(null)
    setAnalysisResult(null)
    try {
      const result = await analyzeBrandMentions(videoId)
      setAnalysisResult({
        videoTitle: result.video_title,
        videoUrl: result.video_url,
        events: result.events,
        totalFrames: result.total_frames_analyzed,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleHeatmapClick = (startTime: number) => {
    if (analysisResult) {
      setModalVideo({
        url: analysisResult.videoUrl,
        title: analysisResult.videoTitle,
        startTime,
      })
    }
  }

  const estimatedDuration = analysisResult
    ? Math.max(
        60,
        ...analysisResult.events.map((e) => e.end_time),
        analysisResult.totalFrames * 5
      )
    : 60

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-kcta mb-2 tracking-tight">
          Brand Mention Detection
        </h1>
        <p className="text-ktext">
          Analyze creator videos for brand appearances using Pixeltable&apos;s
          FrameIterator for frame extraction and OpenAI Vision for brand
          detection. Results are visualized as interactive heatmaps.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-kred/5 border border-kred/20 rounded-xl text-sm text-kred">
          {error}
        </div>
      )}

      {/* Video selection */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-kcta mb-4">
          Select a creator video to analyze
        </h2>
        {isLoadingVideos ? (
          <div className="flex items-center gap-2 text-ktext">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Loading videos...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((video) => {
              const ytMatch = video.video_url?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/)
              const thumb = ytMatch ? `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg` : null
              return (
                <div
                  key={video.id}
                  className={`bg-white rounded-xl border overflow-hidden transition-all duration-200 ${
                    selectedVideoId === video.id
                      ? 'border-kblue ring-2 ring-kblue/20'
                      : 'border-kbeige-border hover:border-kblue/20'
                  }`}
                >
                  <div className="aspect-video bg-kbeige-card overflow-hidden">
                    {thumb ? (
                      <img src={thumb} alt={video.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-kbeige-border">No preview</div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-medium text-kcta line-clamp-1 mb-0.5">{video.title}</h3>
                    <p className="text-xs text-ktext mb-2">{video.category}</p>
                    <button
                      onClick={() => handleAnalyze(video.id)}
                      disabled={isAnalyzing && selectedVideoId === video.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-kblue text-white rounded-lg text-xs font-medium hover:bg-kblue-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full justify-center"
                    >
                      {isAnalyzing && selectedVideoId === video.id ? (
                        <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Analyzing…</>
                      ) : (
                        <><BarChart3 className="w-3.5 h-3.5" /> Analyze</>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Analysis results */}
      {analysisResult && (
        <div className="bg-white rounded-2xl border border-kbeige-border p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-kcta mb-1">
              Brand Mention Analysis
            </h2>
            <p className="text-sm text-ktext">
              &ldquo;{analysisResult.videoTitle}&rdquo; —{' '}
              {analysisResult.totalFrames} frames analyzed,{' '}
              {analysisResult.events.length} brand mention
              {analysisResult.events.length !== 1 ? 's' : ''} detected
            </p>
          </div>

          <Heatmap
            events={analysisResult.events}
            videoDuration={estimatedDuration}
            onBucketClick={handleHeatmapClick}
          />

          {analysisResult.events.length > 0 && (
            <div className="mt-6 pt-6 border-t border-kbeige-border">
              <h3 className="text-sm font-semibold text-kcta mb-3">
                Detected Events
              </h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {analysisResult.events.map((event, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-3 p-3 bg-kbeige-card rounded-lg cursor-pointer hover:bg-kbeige-hover transition-colors"
                    onClick={() => handleHeatmapClick(event.start_time)}
                  >
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${
                        event.prominence === 'high'
                          ? 'bg-kred/10 text-kred'
                          : event.prominence === 'medium'
                            ? 'bg-kyellow/10 text-kyellow'
                            : 'bg-kblue/10 text-kblue'
                      }`}
                    >
                      {event.prominence}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-kcta">
                        {event.brand}
                      </span>
                      <span className="text-xs text-ktext ml-2">
                        {Math.floor(event.start_time / 60)}:
                        {Math.floor(event.start_time % 60)
                          .toString()
                          .padStart(2, '0')}{' '}
                        -{' '}
                        {Math.floor(event.end_time / 60)}:
                        {Math.floor(event.end_time % 60)
                          .toString()
                          .padStart(2, '0')}
                      </span>
                      <p className="text-xs text-ktext/70 mt-0.5 truncate">
                        {event.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {modalVideo && (
        <VideoModal
          isOpen={true}
          onClose={() => setModalVideo(null)}
          videoUrl={modalVideo.url}
          title={modalVideo.title}
          startTime={modalVideo.startTime}
        />
      )}
    </div>
  )
}
