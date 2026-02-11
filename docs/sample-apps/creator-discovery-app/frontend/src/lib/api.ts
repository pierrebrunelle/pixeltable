import type {
  Video,
  MatchResult,
  SearchResult,
  SearchScope,
  VideoSource,
  BrandMentionResponse,
} from './types'

const API_BASE = 'http://localhost:8000'

export async function fetchVideos(source?: VideoSource): Promise<Video[]> {
  const params = source ? `?source=${source}` : ''
  const response = await fetch(`${API_BASE}/api/videos${params}`)
  if (!response.ok) throw new Error(`Failed to fetch videos: ${response.statusText}`)
  const data = await response.json()
  return data.videos
}

export async function findMatches(
  videoId: number,
  source: VideoSource,
  numResults: number = 5
): Promise<{ matches: MatchResult[]; source_title: string }> {
  const response = await fetch(`${API_BASE}/api/match/find`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_id: videoId,
      source,
      num_results: numResults,
    }),
  })
  if (!response.ok) throw new Error(`Match search failed: ${response.statusText}`)
  return response.json()
}

export async function searchText(
  query: string,
  scope: SearchScope = 'all',
  numResults: number = 10
): Promise<SearchResult[]> {
  const response = await fetch(`${API_BASE}/api/search/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, scope, num_results: numResults }),
  })
  if (!response.ok) throw new Error(`Text search failed: ${response.statusText}`)
  const data = await response.json()
  return data.results
}

export async function searchImage(
  file: File,
  scope: SearchScope = 'all',
  numResults: number = 10
): Promise<SearchResult[]> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('scope', scope)
  formData.append('num_results', numResults.toString())

  const response = await fetch(`${API_BASE}/api/search/image`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw new Error(`Image search failed: ${response.statusText}`)
  const data = await response.json()
  return data.results
}

export async function analyzeBrandMentions(
  videoId: number
): Promise<BrandMentionResponse> {
  const formData = new FormData()
  formData.append('video_id', videoId.toString())

  const response = await fetch(`${API_BASE}/api/mentions/analyze`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw new Error(`Brand mention analysis failed: ${response.statusText}`)
  return response.json()
}

export async function uploadVideo(
  file: File,
  title: string,
  category: string,
  source: VideoSource
): Promise<{ message: string; success: boolean }> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('title', title)
  formData.append('category', category)
  formData.append('source', source)

  const response = await fetch(`${API_BASE}/api/videos/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`)
  return response.json()
}

export async function fetchCreatorVideosForMentions(): Promise<Video[]> {
  const response = await fetch(`${API_BASE}/api/mentions/videos`)
  if (!response.ok) throw new Error(`Failed to fetch creator videos: ${response.statusText}`)
  const data = await response.json()
  return data.videos
}
