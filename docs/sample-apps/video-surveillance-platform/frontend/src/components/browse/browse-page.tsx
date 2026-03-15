import { useState, useEffect, useCallback } from 'react'
import { Frame, Film, Clapperboard, AudioLines, Loader2, Play, ScanEye, X, Zap } from 'lucide-react'
import { cn, toDataUrl, formatDuration } from '@/lib/utils'
import { FormattedText } from '@/components/ui/formatted-text'
import { Badge } from '@/components/ui/badge'
import * as api from '@/lib/api'
import type {
  BrowseFrameItem,
  BrowseSegmentItem,
  BrowseSceneItem,
  BrowseAudioItem,
  DetectionResult,
} from '@/types'

const MEDIUM_TABS = [
  { id: 'detections', label: 'Detections', icon: ScanEye },
  { id: 'frames', label: 'Frames', icon: Frame },
  { id: 'segments', label: 'Video Segments', icon: Film },
  { id: 'scenes', label: 'Scenes', icon: Clapperboard },
  { id: 'audio', label: 'Audio', icon: AudioLines },
] as const

type MediumTab = (typeof MEDIUM_TABS)[number]['id']

export function BrowsePage() {
  const [tab, setTab] = useState<MediumTab>('detections')

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4">
        <h2 className="text-lg font-semibold">Browse All Media</h2>
        <p className="text-sm text-muted-foreground">
          Explore detections, frames, video segments, scenes, and audio across all surveillance footage
        </p>
      </div>

      <div className="flex items-center gap-1 px-6 pb-3">
        {MEDIUM_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
              tab === id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {tab === 'detections' && <DetectionsView />}
        {tab === 'frames' && <FramesGrid />}
        {tab === 'segments' && <SegmentsList />}
        {tab === 'scenes' && <ScenesList />}
        {tab === 'audio' && <AudioList />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detections tab: browse frames and run DETR on-demand
// ---------------------------------------------------------------------------

function DetectionsView() {
  const [frames, setFrames] = useState<BrowseFrameItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFrame, setSelectedFrame] = useState<BrowseFrameItem | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    setIsLoading(true)
    api
      .browseFrames({ limit: 48 })
      .then(setFrames)
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading frames...
      </div>
    )
  }

  if (!frames.length) {
    return (
      <div className="text-center text-muted-foreground py-12 text-sm">
        No frames yet. Upload videos to start analyzing.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        DETR Panoptic Segmentation &mdash; Click a frame to run on-demand detection
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {frames.map((f, i) => (
          <button
            key={i}
            onClick={() => {
              setSelectedFrame(f)
              setSelectedIdx(i)
            }}
            className="relative group rounded-lg border overflow-hidden bg-card cursor-pointer text-left hover:ring-2 hover:ring-primary/50 transition-all"
          >
            <img
              src={toDataUrl(f.frame)}
              alt={`Frame ${i}`}
              className="w-full aspect-video object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <ScanEye className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="p-1.5">
              {f.site_name && (
                <p className="text-[10px] text-muted-foreground truncate">{f.site_name}</p>
              )}
            </div>
          </button>
        ))}
      </div>

      {selectedFrame && (
        <FrameDetailPanel
          frame={selectedFrame}
          frameIdx={selectedIdx}
          onClose={() => setSelectedFrame(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Frame detail panel with on-demand DETR detection
// ---------------------------------------------------------------------------

function FrameDetailPanel({
  frame,
  frameIdx,
  onClose,
}: {
  frame: BrowseFrameItem
  frameIdx: number
  onClose: () => void
}) {
  const [detection, setDetection] = useState<DetectionResult | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)

  const runDetection = useCallback(async (model: string) => {
    setIsDetecting(true)
    setDetectError(null)
    try {
      const result = await api.detectFrame({
        uuid: frame.uuid,
        frame_idx: frameIdx,
        model,
        threshold: 0.5,
      })
      setDetection(result)
    } catch (e) {
      setDetectError(e instanceof Error ? e.message : 'Detection failed')
    } finally {
      setIsDetecting(false)
    }
  }, [frame.uuid, frameIdx])

  const detectionItems = detection?.detections ?? detection?.segments ?? []

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card rounded-xl border shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-sm font-semibold">Frame Analysis</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="relative">
            <img
              src={toDataUrl(frame.frame)}
              alt="Frame detail"
              className="w-full rounded-lg border"
            />
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {frame.site_name && <span>{frame.site_name}</span>}
            {frame.camera_id && (
              <Badge variant="default" className="text-[10px]">{frame.camera_id}</Badge>
            )}
          </div>

          {/* On-demand detection buttons */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              DETR Object Detection
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => runDetection('detr-resnet-50-panoptic')}
                disabled={isDetecting}
                className="flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
              >
                {isDetecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                Panoptic Segmentation
              </button>
              <button
                onClick={() => runDetection('detr-resnet-50')}
                disabled={isDetecting}
                className="flex items-center gap-1.5 rounded-md bg-muted text-foreground px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50 cursor-pointer"
              >
                {isDetecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ScanEye className="h-3.5 w-3.5" />
                )}
                Object Detection
              </button>
            </div>
          </div>

          {detectError && (
            <p className="text-sm text-destructive">{detectError}</p>
          )}

          {/* Detection results */}
          {detection && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {detection.type === 'segmentation' ? 'Segmentation' : 'Detection'} Results
                ({detection.count} {detection.count === 1 ? 'object' : 'objects'})
              </div>
              {detectionItems.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {detectionItems.map((item, i) => (
                    <span
                      key={i}
                      className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full font-medium"
                    >
                      {item.label}
                      <span className="text-primary/60 ml-1">{(item.score * 100).toFixed(0)}%</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No objects detected above threshold.</p>
              )}
            </div>
          )}

          {/* Gemini frame description */}
          {frame.frame_description && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Gemini Frame Description
              </div>
              <div className="bg-muted/50 rounded-lg p-3 border">
                <FormattedText text={frame.frame_description} className="text-sm" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Frames grid
// ---------------------------------------------------------------------------

function FramesGrid() {
  const [frames, setFrames] = useState<BrowseFrameItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedFrame, setSelectedFrame] = useState<BrowseFrameItem | null>(null)
  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    setIsLoading(true)
    api
      .browseFrames({ limit: 60 })
      .then(setFrames)
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading frames...
      </div>
    )
  }

  if (!frames.length) {
    return <div className="text-center text-muted-foreground py-12 text-sm">No frames found</div>
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
        {frames.map((f, i) => (
          <button
            key={i}
            onClick={() => {
              setSelectedFrame(f)
              setSelectedIdx(i)
            }}
            className="relative group rounded-lg border overflow-hidden bg-card cursor-pointer text-left hover:ring-2 hover:ring-primary/50 transition-all"
          >
            <img
              src={toDataUrl(f.frame)}
              alt={`Frame ${i}`}
              className="w-full aspect-video object-cover"
            />
            <div className="p-1.5">
              {f.site_name && (
                <p className="text-[10px] text-muted-foreground truncate">{f.site_name}</p>
              )}
            </div>
          </button>
        ))}
      </div>
      {selectedFrame && (
        <FrameDetailPanel
          frame={selectedFrame}
          frameIdx={selectedIdx}
          onClose={() => setSelectedFrame(null)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Segments list
// ---------------------------------------------------------------------------

function SegmentsList() {
  const [segments, setSegments] = useState<BrowseSegmentItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [playingIdx, setPlayingIdx] = useState<number | null>(null)

  useEffect(() => {
    setIsLoading(true)
    api
      .browseSegments({ limit: 60 })
      .then(setSegments)
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading segments...
      </div>
    )
  }

  if (!segments.length) {
    return <div className="text-center text-muted-foreground py-12 text-sm">No segments found</div>
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {segments.map((s, i) => (
        <div key={i} className="rounded-lg border bg-card overflow-hidden">
          {playingIdx === i && s.video_url ? (
            <video
              src={s.video_url}
              controls
              autoPlay
              className="w-full aspect-video bg-black"
            />
          ) : (
            <button
              onClick={() => s.video_url && setPlayingIdx(i)}
              className={cn(
                'w-full aspect-video bg-muted/50 flex items-center justify-center',
                s.video_url ? 'cursor-pointer hover:bg-muted transition-colors' : 'cursor-default',
              )}
            >
              {s.video_url ? (
                <div className="flex flex-col items-center gap-1 text-muted-foreground">
                  <div className="rounded-full bg-primary/10 p-3">
                    <Play className="h-6 w-6 text-primary fill-primary" />
                  </div>
                  <span className="text-xs">Click to play</span>
                </div>
              ) : (
                <Film className="h-8 w-8 text-muted-foreground/40" />
              )}
            </button>
          )}

          <div className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">
                {s.segment_start.toFixed(1)}s &ndash; {s.segment_end.toFixed(1)}s
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDuration(s.segment_end - s.segment_start)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {s.site_name && (
                <span className="text-xs text-muted-foreground">{s.site_name}</span>
              )}
              {s.camera_id && (
                <Badge variant="default" className="text-[10px]">{s.camera_id}</Badge>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scenes list
// ---------------------------------------------------------------------------

function ScenesList() {
  const [scenes, setScenes] = useState<BrowseSceneItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    api
      .browseScenes({ limit: 60 })
      .then(setScenes)
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading scenes...
      </div>
    )
  }

  if (!scenes.length) {
    return <div className="text-center text-muted-foreground py-12 text-sm">No scenes detected</div>
  }

  return (
    <div className="space-y-2">
      {scenes.map((s, i) => {
        const duration = s.scene_end - s.scene_start
        return (
          <div key={i} className="flex items-center gap-4 rounded-lg border bg-card p-3">
            <Clapperboard className="h-5 w-5 text-purple-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium">
                Scene {i + 1}: {s.scene_start.toFixed(1)}s &ndash; {s.scene_end.toFixed(1)}s
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                ({formatDuration(duration)})
              </span>
            </div>
            <span className="text-xs text-muted-foreground truncate max-w-48">{s.source}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Audio list
// ---------------------------------------------------------------------------

function AudioList() {
  const [chunks, setChunks] = useState<BrowseAudioItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    api
      .browseAudio({ limit: 60 })
      .then(setChunks)
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading audio chunks...
      </div>
    )
  }

  if (!chunks.length) {
    return (
      <div className="text-center text-muted-foreground py-12 text-sm">
        No audio chunks found. Upload videos with audio to generate chunks.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {chunks.map((c, i) => (
        <div key={i} className="rounded-lg border bg-card overflow-hidden">
          {c.audio_url ? (
            <div className="bg-muted/30 px-4 py-3 border-b">
              <audio controls preload="none" className="w-full h-8" src={c.audio_url}>
                <track kind="captions" />
              </audio>
            </div>
          ) : (
            <div className="bg-muted/30 px-4 py-3 border-b flex items-center justify-center text-muted-foreground">
              <AudioLines className="h-5 w-5 mr-2" />
              <span className="text-xs">No audio file</span>
            </div>
          )}

          <div className="p-3 space-y-2">
            {c.transcription ? (
              <div className="text-sm text-muted-foreground line-clamp-4">
                <FormattedText text={c.transcription} className="text-sm" />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No transcription available</p>
            )}
            <div className="flex items-center gap-2">
              {c.site_name && (
                <span className="text-xs text-muted-foreground">{c.site_name}</span>
              )}
              {c.camera_id && (
                <Badge variant="default" className="text-[10px]">{c.camera_id}</Badge>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
