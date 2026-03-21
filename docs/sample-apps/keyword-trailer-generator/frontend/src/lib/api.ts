import type { IngestResponse, SearchResponse, VideoInfo } from './types'

const API = 'http://localhost:8000'

export async function ingestVideo(url: string, title: string): Promise<IngestResponse> {
  const body = new FormData()
  body.append('url', url)
  body.append('title', title)
  const res = await fetch(`${API}/api/ingest`, { method: 'POST', body })
  if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText)
  return res.json()
}

export async function listVideos(): Promise<VideoInfo[]> {
  const res = await fetch(`${API}/api/videos`)
  if (!res.ok) throw new Error(res.statusText)
  const data = await res.json()
  return data.videos
}

export async function searchFrames(query: string, numResults: number): Promise<SearchResponse> {
  const body = new FormData()
  body.append('query', query)
  body.append('num_results', numResults.toString())
  const res = await fetch(`${API}/api/search`, { method: 'POST', body })
  if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText)
  return res.json()
}

export async function generateTrailer(query: string, numScenes: number): Promise<string> {
  const body = new FormData()
  body.append('query', query)
  body.append('num_scenes', numScenes.toString())
  const res = await fetch(`${API}/api/generate-trailer`, { method: 'POST', body })
  if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
