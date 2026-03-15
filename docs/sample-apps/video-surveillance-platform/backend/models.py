from datetime import datetime
from typing import Any

from pydantic import BaseModel


# -- Video endpoints --------------------------------------------------------

class VideoItem(BaseModel):
    uuid: str
    name: str
    site_name: str
    camera_id: str
    location: str
    duration: float | None = None
    recorded_at: str | None = None
    timestamp: str | None = None
    tags: list[str] | None = None
    video_summary: str | None = None
    alert_count: int = 0


class VideoDetail(BaseModel):
    uuid: str
    name: str
    site_name: str
    camera_id: str
    location: str
    duration: float | None = None
    recorded_at: str | None = None
    tags: list[str] | None = None
    video_summary: str | None = None
    metadata: dict[str, Any] | None = None


class UploadResponse(BaseModel):
    message: str
    filename: str
    uuid: str


class DeleteResponse(BaseModel):
    message: str
    num_deleted: int


# -- Frame endpoints --------------------------------------------------------

class FrameItem(BaseModel):
    frame: str
    segment_labels: list[str] | None = None
    segment_summary: str | None = None
    frame_description: str | None = None
    severity: str | None = None
    is_alert: bool = False
    position: float | None = None


class FramesResponse(BaseModel):
    uuid: str
    frames: list[FrameItem]
    total: int


# -- Segment endpoints ------------------------------------------------------

class SegmentItem(BaseModel):
    segment_start: float
    segment_end: float
    uuid: str


class SegmentsResponse(BaseModel):
    uuid: str
    segments: list[SegmentItem]
    total: int


# -- Scene endpoints --------------------------------------------------------

class SceneItem(BaseModel):
    scene_start: float
    scene_end: float


class ScenesResponse(BaseModel):
    uuid: str
    scenes: list[SceneItem]
    total: int


# -- Transcription endpoints ------------------------------------------------

class TranscriptionResponse(BaseModel):
    uuid: str
    sentences: list[str]
    full_text: str


# -- Search endpoints -------------------------------------------------------

class SearchResult(BaseModel):
    type: str
    uuid: str
    similarity: float
    text: str | None = None
    thumbnail: str | None = None
    video_url: str | None = None
    metadata: dict[str, Any] | None = None


class SearchResponse(BaseModel):
    query: str
    results: list[SearchResult]


# -- Dashboard endpoints ----------------------------------------------------

class DashboardStats(BaseModel):
    total_videos: int = 0
    total_frames: int = 0
    total_segments: int = 0
    total_audio_chunks: int = 0
    total_transcripts: int = 0
    total_alerts: int = 0
    sites: list[str] = []
    severity_counts: dict[str, int] = {}
    recent_transcripts: list[str] = []
    top_labels: list[dict[str, Any]] = []


class AlertItem(BaseModel):
    uuid: str
    frame: str
    segment_labels: list[str]
    severity: str
    frame_description: str | None = None
    site_name: str | None = None
    camera_id: str | None = None
    timestamp: str | None = None


class AlertsResponse(BaseModel):
    alerts: list[AlertItem]
    total: int


# -- Browse endpoints -------------------------------------------------------

class BrowseFrameItem(BaseModel):
    uuid: str
    frame: str
    segment_labels: list[str] | None = None
    segment_summary: str | None = None
    frame_description: str | None = None
    severity: str | None = None
    site_name: str | None = None
    camera_id: str | None = None


class BrowseSegmentItem(BaseModel):
    uuid: str
    segment_start: float
    segment_end: float
    video_url: str | None = None
    site_name: str | None = None
    camera_id: str | None = None


class BrowseAudioItem(BaseModel):
    uuid: str
    audio_url: str | None = None
    duration: float | None = None
    transcription: str | None = None
    site_name: str | None = None
    camera_id: str | None = None


class BrowseTranscriptItem(BaseModel):
    uuid: str
    text: str
    audio_url: str | None = None
    site_name: str | None = None
    camera_id: str | None = None


# -- Activity ---------------------------------------------------------------

class ActivityItem(BaseModel):
    type: str
    label: str
    detail: str | None = None
    site_name: str | None = None
    timestamp: str | None = None
