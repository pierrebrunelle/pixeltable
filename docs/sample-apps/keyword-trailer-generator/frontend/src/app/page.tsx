'use client'

import React, { useState, useCallback } from 'react'
import { ingestVideo, listVideos, searchFrames, generateTrailer } from '@/lib/api'
import type { FrameResult, VideoInfo } from '@/lib/types'

export default function Home() {
  // Ingest state
  const [videoUrl, setVideoUrl] = useState('')
  const [videoTitle, setVideoTitle] = useState('')
  const [videoList, setVideoList] = useState<VideoInfo[]>([])
  const [isIngesting, setIsIngesting] = useState(false)

  // Search state
  const [query, setQuery] = useState('')
  const [numResults, setNumResults] = useState(12)
  const [searchResults, setSearchResults] = useState<FrameResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Trailer state
  const [numScenes, setNumScenes] = useState(5)
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const [status, setStatus] = useState('')

  const handleIngest = useCallback(async () => {
    if (!videoUrl) return
    setIsIngesting(true)
    setStatus('Ingesting video: detecting scenes, extracting frames, building CLIP index...')
    try {
      const res = await ingestVideo(videoUrl, videoTitle)
      setStatus(res.message)
      setVideoUrl('')
      setVideoTitle('')
      const vids = await listVideos()
      setVideoList(vids)
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Ingest failed'}`)
    } finally {
      setIsIngesting(false)
    }
  }, [videoUrl, videoTitle])

  const handleSearch = useCallback(async () => {
    if (!query) return
    setIsSearching(true)
    setStatus('Searching frames by keyword...')
    setTrailerUrl(null)
    try {
      const res = await searchFrames(query, numResults)
      setSearchResults(res.results)
      setStatus(`Found ${res.results.length} matching frames for "${query}"`)
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Search failed'}`)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [query, numResults])

  const handleGenerate = useCallback(async () => {
    if (!query) return
    setIsGenerating(true)
    setStatus('Generating trailer: finding scenes, concatenating clips...')
    try {
      const url = await generateTrailer(query, numScenes)
      setTrailerUrl(url)
      setStatus('Trailer ready!')
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : 'Generation failed'}`)
    } finally {
      setIsGenerating(false)
    }
  }, [query, numScenes])

  const formatTime = (seconds: number | null) => {
    if (seconds == null) return '—'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const isLoading = isIngesting || isSearching || isGenerating

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Keyword Trailer Generator
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Ingest a video, search scenes by keyword, and generate on-demand trailers — powered by Pixeltable + CLIP
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* Status bar */}
        {status && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              status.startsWith('Error')
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}
          >
            {isLoading && (
              <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {status}
          </div>
        )}

        {/* Step 1: Ingest */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold">1. Add a Video</h2>
            <p className="text-sm text-gray-500">
              Paste a video URL. Pixeltable will detect scenes, extract frames, and build a CLIP embedding index.
            </p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://example.com/video.mp4"
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
              />
              <input
                type="text"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="Title (optional)"
                className="w-48 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
              />
              <button
                onClick={handleIngest}
                disabled={!videoUrl || isLoading}
                className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isIngesting ? 'Processing...' : 'Add Video'}
              </button>
            </div>

            {videoList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {videoList.map((v, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    {v.title} — {v.num_scenes} scenes
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Step 2: Search */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold">2. Search by Keyword</h2>
            <p className="text-sm text-gray-500">
              Describe what you want in the trailer. CLIP finds the most visually similar scenes.
            </p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder='e.g. "car chase at night", "sunset over ocean", "people laughing"'
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
              />
              <button
                onClick={handleSearch}
                disabled={!query || isLoading}
                className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </button>
            </div>

            <div className="flex items-center gap-6 text-sm text-gray-600">
              <label className="flex items-center gap-2">
                Results:
                <input
                  type="range"
                  min={4}
                  max={24}
                  value={numResults}
                  onChange={(e) => setNumResults(Number(e.target.value))}
                  className="w-24"
                />
                <span className="w-6 text-center font-medium">{numResults}</span>
              </label>
            </div>

            {/* Frame grid */}
            {searchResults.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {searchResults.map((r, i) => (
                  <div
                    key={i}
                    className="group relative aspect-video rounded-lg overflow-hidden bg-gray-100 shadow-sm hover:shadow-md transition-shadow"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.frame}
                      alt={`Match ${i + 1}`}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6">
                      <p className="text-xs text-white/90 font-medium truncate">{r.title}</p>
                      <p className="text-[10px] text-white/70">
                        {formatTime(r.segment_start)} – {formatTime(r.segment_end)} · {(r.similarity * 100).toFixed(0)}% match
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Step 3: Generate trailer */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-semibold">3. Generate Trailer</h2>
            <p className="text-sm text-gray-500">
              Concatenate the top matching scenes into a single trailer video.
            </p>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                Scenes to include:
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={numScenes}
                  onChange={(e) => setNumScenes(Number(e.target.value))}
                  className="w-24"
                />
                <span className="w-6 text-center font-medium">{numScenes}</span>
              </label>
              <button
                onClick={handleGenerate}
                disabled={!query || isLoading}
                className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? 'Building trailer...' : 'Build Trailer'}
              </button>
            </div>

            {trailerUrl && (
              <div className="rounded-lg overflow-hidden bg-black">
                <video
                  src={trailerUrl}
                  controls
                  autoPlay
                  className="mx-auto max-h-[480px] w-full"
                />
              </div>
            )}
          </div>
        </section>

        {/* How it works */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm px-6 py-5">
          <h2 className="text-lg font-semibold mb-3">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600">
            <div className="space-y-1">
              <p className="font-medium text-gray-900">Scene Detection</p>
              <p>Pixeltable detects scene boundaries locally using PySceneDetect. No API calls.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-gray-900">Frame Extraction</p>
              <p>3 representative frames per scene are extracted and stored as a Pixeltable view.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-gray-900">CLIP Embeddings</p>
              <p>Each frame is embedded with OpenAI CLIP. An embedding index enables instant text-to-image search.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-gray-900">On-Demand Trailers</p>
              <p>Matching scenes are concatenated with ffmpeg into a playable trailer — no generative AI needed.</p>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-gray-50 text-xs text-gray-500 font-mono">
            Video → scene_detect → video_splitter → frame_iterator → CLIP index → similarity(keyword) → concat_videos → trailer.mp4
          </div>
        </section>
      </main>
    </div>
  )
}
