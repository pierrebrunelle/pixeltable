import { useState, useRef } from 'react'
import { Search, ImageIcon, Video, FileText, Film, AudioLines, Loader2, Upload, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SeverityBadge } from '@/components/ui/severity-badge'
import { cn, toDataUrl } from '@/lib/utils'
import * as api from '@/lib/api'
import type { SearchResult } from '@/types'

type SearchMode = 'text' | 'image' | 'video' | 'audio'

const TYPE_OPTIONS = [
  { id: 'video_segment', label: 'Video Segments', icon: Film },
  { id: 'frame', label: 'Frames', icon: ImageIcon },
  { id: 'transcript', label: 'Transcripts', icon: FileText },
]

export function SearchPage() {
  const [mode, setMode] = useState<SearchMode>('text')
  const [query, setQuery] = useState('')
  const [selectedTypes, setSelectedTypes] = useState(['video_segment', 'frame', 'transcript'])
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchInfo, setSearchInfo] = useState('')
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  const toggleType = (typeId: string) => {
    setSelectedTypes((prev) =>
      prev.includes(typeId) ? prev.filter((t) => t !== typeId) : [...prev, typeId],
    )
  }

  const handleTextSearch = async () => {
    if (!query.trim()) return
    setIsSearching(true)
    try {
      const res = await api.searchText({ query, types: selectedTypes, limit: 30 })
      setResults(res.results)
      setSearchInfo(`${res.results.length} results for "${res.query}"`)
    } catch {
      setSearchInfo('Search failed')
    } finally {
      setIsSearching(false)
    }
  }

  const handleImageSearch = async (file: File) => {
    setIsSearching(true)
    try {
      const res = await api.searchByImage(file, 30)
      setResults(res.results)
      setSearchInfo(`${res.results.length} results for image: ${file.name}`)
    } catch {
      setSearchInfo('Image search failed')
    } finally {
      setIsSearching(false)
    }
  }

  const handleVideoSearch = async (file: File) => {
    setIsSearching(true)
    try {
      const res = await api.searchByVideo(file, 30)
      setResults(res.results)
      setSearchInfo(`${res.results.length} results for video: ${file.name}`)
    } catch {
      setSearchInfo('Video search failed')
    } finally {
      setIsSearching(false)
    }
  }

  const handleAudioSearch = async (file: File) => {
    setIsSearching(true)
    try {
      const res = await api.searchByAudio(file, 30)
      setResults(res.results)
      setSearchInfo(`${res.results.length} results for audio: ${file.name}`)
    } catch {
      setSearchInfo('Audio search failed')
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Multimodal Search</h2>
          <p className="text-sm text-muted-foreground">
            Search by text, reference image, video clip, or audio across all surveillance footage.
            Powered by Twelve Labs cross-modal embeddings.
          </p>
        </div>

        {/* Search mode tabs */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Search by:</span>
          {([
            { id: 'text' as const, label: 'Text', icon: Search, desc: 'segments + frames + transcripts' },
            { id: 'image' as const, label: 'Image', icon: ImageIcon, desc: 'frames + segments' },
            { id: 'video' as const, label: 'Video Clip', icon: Video, desc: 'segments + frames' },
            { id: 'audio' as const, label: 'Audio', icon: AudioLines, desc: 'segments' },
          ]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
                mode === id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Text search input */}
        {mode === 'text' && (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder='Search all media... (e.g. "person near transformer", "vehicle at gate", "alarm sound")'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTextSearch()}
                className="w-full border rounded-md pl-9 pr-3 py-2 text-sm bg-background"
              />
            </div>
            <Button onClick={handleTextSearch} disabled={isSearching || !query.trim()}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </Button>
          </div>
        )}

        {/* Image search upload */}
        {mode === 'image' && (
          <DropZone
            inputRef={imageInputRef}
            accept="image/*"
            isSearching={isSearching}
            searchingLabel="Searching frames & video segments by image..."
            icon={ImageIcon}
            label="Upload a reference image to find similar frames and video segments"
            sublabel="Cross-modal: image → frames + video segments via Twelve Labs"
            onFile={handleImageSearch}
          />
        )}

        {/* Video search upload */}
        {mode === 'video' && (
          <DropZone
            inputRef={videoInputRef}
            accept="video/*"
            isSearching={isSearching}
            searchingLabel="Searching segments & frames by video..."
            icon={Video}
            label="Upload a reference video clip to find similar segments and frames"
            sublabel="Cross-modal: video → video segments + frames via Twelve Labs"
            onFile={handleVideoSearch}
          />
        )}

        {/* Audio search upload */}
        {mode === 'audio' && (
          <DropZone
            inputRef={audioInputRef}
            accept="audio/*"
            isSearching={isSearching}
            searchingLabel="Searching video segments by audio..."
            icon={AudioLines}
            label="Upload a reference audio clip to find matching video segments"
            sublabel="Cross-modal: audio → video segments via Twelve Labs Marengo"
            onFile={handleAudioSearch}
          />
        )}

        {/* Type toggles (text mode only) */}
        {mode === 'text' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Search in:</span>
            {TYPE_OPTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => toggleType(id)}
                className={cn(
                  'flex items-center gap-1 text-xs px-2 py-1 rounded-md cursor-pointer transition-colors',
                  selectedTypes.includes(id)
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-6">
        {searchInfo && (
          <p className="text-sm text-muted-foreground mb-4">{searchInfo}</p>
        )}

        {results.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {results.map((r, i) => (
              <SearchResultCard key={i} result={r} />
            ))}
          </div>
        ) : !isSearching && searchInfo ? (
          <div className="text-center text-muted-foreground py-12 text-sm">
            No results found. Try a different query or search mode.
          </div>
        ) : !searchInfo ? (
          <div className="text-center text-muted-foreground py-12 text-sm">
            Enter a search query, upload a reference image, video clip, or audio file to search your surveillance footage.
          </div>
        ) : null}
      </div>
    </div>
  )
}

function DropZone({
  inputRef,
  accept,
  isSearching,
  searchingLabel,
  icon: _Icon,
  label,
  sublabel,
  onFile,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  accept: string
  isSearching: boolean
  searchingLabel: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  sublabel: string
  onFile: (file: File) => void
}) {
  return (
    <div
      className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
        }}
      />
      {isSearching ? (
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {searchingLabel}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          <Upload className="h-6 w-6" />
          <span className="text-sm">{label}</span>
          <span className="text-xs">{sublabel}</span>
        </div>
      )}
    </div>
  )
}

function SearchResultCard({ result }: { result: SearchResult }) {
  const [isPlaying, setIsPlaying] = useState(false)

  const typeLabel =
    result.type === 'video_segment'
      ? 'Video Segment'
      : result.type === 'frame'
        ? 'Frame'
        : 'Transcript'

  const typeVariant =
    result.type === 'video_segment'
      ? 'purple'
      : result.type === 'frame'
        ? 'blue'
        : ('green' as const)

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Media area */}
      {result.type === 'video_segment' && result.video_url ? (
        isPlaying ? (
          <video
            src={result.video_url}
            controls
            autoPlay
            className="w-full aspect-video bg-black"
          />
        ) : (
          <button
            onClick={() => setIsPlaying(true)}
            className="w-full aspect-video bg-muted/50 flex items-center justify-center cursor-pointer hover:bg-muted transition-colors"
          >
            <div className="flex flex-col items-center gap-1 text-muted-foreground">
              <div className="rounded-full bg-primary/10 p-2">
                <Play className="h-5 w-5 text-primary fill-primary" />
              </div>
              <span className="text-[10px]">{result.text}</span>
            </div>
          </button>
        )
      ) : result.type === 'frame' && result.thumbnail ? (
        <img
          src={toDataUrl(result.thumbnail)}
          alt="frame"
          className="w-full aspect-video object-cover"
        />
      ) : null}

      {/* Info */}
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={typeVariant}>{typeLabel}</Badge>
          <span className="text-xs text-muted-foreground">
            {(result.similarity * 100).toFixed(0)}%
          </span>
          {typeof result.metadata?.severity === 'string' && result.metadata.severity !== 'info' && (
            <SeverityBadge severity={result.metadata.severity} />
          )}
        </div>

        {result.type === 'transcript' && result.text && (
          <p className="text-xs line-clamp-3 text-muted-foreground mt-1">{result.text}</p>
        )}

        {Array.isArray(result.metadata?.segment_labels) &&
          (result.metadata.segment_labels as string[]).length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1 truncate">
              {(result.metadata.segment_labels as string[]).slice(0, 4).join(', ')}
            </p>
          )}

        {typeof result.metadata?.source === 'string' && (
          <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
            {result.metadata.source}
          </p>
        )}
      </div>
    </div>
  )
}
