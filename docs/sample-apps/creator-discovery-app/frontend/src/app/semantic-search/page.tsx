'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { searchText, searchImage } from '@/lib/api'
import { SearchBar } from '@/components/SearchBar'
import { VideoCard } from '@/components/VideoCard'
import { VideoModal } from '@/components/VideoModal'
import type { SearchResult, SearchScope } from '@/lib/types'

export default function SemanticSearchPage() {
  const [scope, setScope] = useState<SearchScope>('all')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastQuery, setLastQuery] = useState('')
  const [modalVideo, setModalVideo] = useState<{ url: string; title: string } | null>(null)

  const handleTextSearch = async (query: string) => {
    setIsLoading(true)
    setError(null)
    setLastQuery(query)
    try {
      const data = await searchText(query, scope)
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleImageSearch = async (file: File) => {
    setIsLoading(true)
    setError(null)
    setLastQuery(`Image: ${file.name}`)
    try {
      const data = await searchImage(file, scope)
      setResults(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image search failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-kcta mb-2 tracking-tight">
          Semantic Search
        </h1>
        <p className="text-ktext">
          Search across brand and creator video libraries using natural language
          or images. Twelve Labs&apos; cross-modal embeddings project text, images,
          and video into the same semantic space — and Pixeltable handles the
          indexing and retrieval.
        </p>
      </div>

      {/* Scope toggle */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-sm font-semibold text-kblue">Scope:</span>
        <div className="flex items-center gap-1 bg-kbeige-card rounded-lg p-1 border border-kbeige-border">
          {(['all', 'brand', 'creator'] as SearchScope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                scope === s
                  ? 'bg-white text-kcta shadow-sm'
                  : 'text-ktext hover:text-kcta'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-8">
        <SearchBar
          onTextSearch={handleTextSearch}
          onImageSearch={handleImageSearch}
          isLoading={isLoading}
        />
      </div>

      {error && (
        <div className="mb-6 p-4 bg-kred/5 border border-kred/20 rounded-xl text-sm text-kred">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-ktext">
          <RefreshCw className="w-5 h-5 animate-spin" />
          Searching...
        </div>
      )}

      {!isLoading && results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-kcta">
              Results for &ldquo;{lastQuery}&rdquo;
            </h2>
            <span className="text-sm text-ktext">
              {results.length} result{results.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {results.map((result, index) => (
              <VideoCard
                key={`${result.source}-${result.id}-${index}`}
                title={result.title}
                category={result.category}
                source={result.source}
                videoUrl={result.video_url}
                score={result.score}
                onClick={() =>
                  setModalVideo({ url: result.video_url, title: result.title })
                }
              />
            ))}
          </div>
        </div>
      )}

      {!isLoading && results.length === 0 && lastQuery && (
        <div className="text-center py-12 text-ktext">
          No results found for &ldquo;{lastQuery}&rdquo;
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
