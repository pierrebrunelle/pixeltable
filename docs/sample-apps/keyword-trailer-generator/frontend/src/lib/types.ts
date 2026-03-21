export type FrameResult = {
  frame: string
  segment_start: number
  segment_end: number
  title: string
  similarity: number
}

export type SearchResponse = {
  results: FrameResult[]
  query: string
}

export type VideoInfo = {
  title: string
  num_scenes: number
}

export type IngestResponse = {
  message: string
  title: string
  num_scenes: number
}
