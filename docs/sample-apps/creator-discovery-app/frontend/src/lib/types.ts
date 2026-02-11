export type VideoSource = 'brand' | 'creator'
export type SearchScope = 'all' | 'brand' | 'creator'

export interface Video {
  id: number
  title: string
  category: string
  video_url: string
  source: VideoSource
}

export interface MatchResult {
  id: number
  title: string
  category: string
  video_url: string
  score: number
  match_type: string
  source: VideoSource
}

export interface SearchResult {
  id: number
  title: string
  category: string
  video_url: string
  score: number
  source: VideoSource
}

export interface BrandMentionEvent {
  brand: string
  start_time: number
  end_time: number
  description: string
  prominence: 'high' | 'medium' | 'low' | 'none'
}

export interface BrandMentionResponse {
  video_title: string
  video_url: string
  video_id: number
  events: BrandMentionEvent[]
  total_frames_analyzed: number
  success: boolean
}
