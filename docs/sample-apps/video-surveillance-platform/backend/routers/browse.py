"""Multi-medium browse endpoints: paginated access to frames, segments, scenes, audio, and on-demand detection."""
import itertools
import logging
import os
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import pixeltable as pxt

import config
from detection import MODELS as DETECTION_MODELS, run_detection
from functions import gemini_text, parse_severity
from models import BrowseAudioItem, BrowseFrameItem, BrowseSegmentItem

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/browse', tags=['browse'])


def _table(name: str):
    return pxt.get_table(f'{config.APP_NAMESPACE}.{name}')


def _interleave_by_video(rows: list[dict]) -> list[dict]:
    """Round-robin interleave rows so consecutive items come from different videos."""
    by_video: dict[str, list[dict]] = {}
    for r in rows:
        by_video.setdefault(str(r.get('uuid', '')), []).append(r)
    return [r for r in itertools.chain.from_iterable(itertools.zip_longest(*by_video.values())) if r is not None]


# ---------------------------------------------------------------------------
# On-demand DETR detection
# ---------------------------------------------------------------------------

class DetectRequest(BaseModel):
    uuid: str
    frame_idx: int
    model: str = 'detr-resnet-50-panoptic'
    threshold: float = 0.5


@router.post('/detect')
def detect_objects(body: DetectRequest):
    """Run on-demand object detection / panoptic segmentation on a single video frame."""
    if body.model not in DETECTION_MODELS:
        raise HTTPException(status_code=400, detail=f'Unknown model: {body.model}')

    frames = _table('video_frames')
    uuid_val = UUID(body.uuid)
    rows = list(
        frames.where((frames.uuid == uuid_val) & (frames.pos == body.frame_idx))
        .select(frame=frames.frame)
        .limit(1)
        .collect()
    )
    if not rows:
        rows = list(
            frames.where(frames.uuid == uuid_val)
            .select(frame=frames.frame)
            .limit(1)
            .collect()
        )
    if not rows:
        raise HTTPException(status_code=404, detail='Frame not found')

    return run_detection(rows[0]['frame'], body.model, body.threshold, uuid_val, body.frame_idx)


# ---------------------------------------------------------------------------
# Frame / segment / scene / audio browsing
# ---------------------------------------------------------------------------

@router.get('/frames', response_model=list[BrowseFrameItem])
def browse_frames(
    site_name: str | None = None,
    severity: str | None = None,
    label: str | None = None,
    alerts_only: bool = False,
    limit: int = 48,
    offset: int = 0,
):
    """Paginated frame browser with filters."""
    try:
        frames = _table('video_frames')
        base = frames.where(frames.site_name == site_name) if site_name else frames
        rows = list(
            base.select(
                uuid=frames.uuid, frame=frames.frame_thumbnail,
                frame_description=frames.frame_description,
                severity=frames.severity, ppe_assessment=frames.ppe_assessment,
                site_name=frames.site_name, camera_id=frames.camera_id,
                asset_id=frames.asset_id, detected_labels=frames.detected_labels,
            ).collect()
        )
        interleaved = _interleave_by_video(rows)

        items: list[dict] = []
        for r in interleaved[offset:]:
            if label and label not in (r.get('detected_labels') or []):
                continue
            sev = parse_severity(r.get('severity'))
            if alerts_only and sev == 'info':
                continue
            items.append({
                'uuid': str(r.get('uuid', '')),
                'frame': r.get('frame', ''),
                'frame_description': gemini_text(r.get('frame_description')),
                'severity': sev,
                'ppe_assessment': gemini_text(r.get('ppe_assessment')),
                'site_name': r.get('site_name'),
                'camera_id': r.get('camera_id'),
                'asset_id': r.get('asset_id'),
                'detected_labels': r.get('detected_labels'),
            })
            if len(items) >= limit:
                break
        return items
    except Exception as e:
        logger.warning(f'Browse frames failed: {e}')
        return []


@router.get('/segments', response_model=list[BrowseSegmentItem])
def browse_segments(site_name: str | None = None, limit: int = 48, offset: int = 0):
    """Paginated video segment browser."""
    try:
        segs = _table('video_segments')
        base = segs.where(segs.site_name == site_name) if site_name else segs
        rows = list(
            base.select(
                uuid=segs.uuid, segment_start=segs.segment_start,
                segment_end=segs.segment_end, video_segment=segs.video_segment,
                site_name=segs.site_name, camera_id=segs.camera_id,
            ).collect()
        )
        interleaved = _interleave_by_video(rows)
        items: list[dict] = []
        for r in interleaved[offset:]:
            video_path = str(r.get('video_segment', ''))
            items.append({
                'uuid': str(r.get('uuid', '')),
                'segment_start': r.get('segment_start', 0),
                'segment_end': r.get('segment_end', 0),
                'video_url': f'/api/browse/media?path={video_path}' if video_path else None,
                'site_name': r.get('site_name'),
                'camera_id': r.get('camera_id'),
            })
            if len(items) >= limit:
                break
        return items
    except Exception as e:
        logger.warning(f'Browse segments failed: {e}')
        return []


@router.get('/media')
def serve_media(path: str):
    """Serve a Pixeltable-managed media file (video segment, audio chunk)."""
    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail='File not found')
    media_types = {'.mp3': 'audio/mpeg', '.wav': 'audio/wav'}
    return FileResponse(file_path, media_type=media_types.get(file_path.suffix, 'video/mp4'))


@router.get('/scenes', response_model=list[dict])
def browse_scenes(site_name: str | None = None, limit: int = 48, offset: int = 0):
    """Browse scenes extracted from all videos, with playable video URLs."""
    try:
        videos = _table('videos')
        base = videos.where(videos.site_name == site_name) if site_name else videos
        rows = list(
            base.select(
                uuid=videos.uuid, scene_cuts=videos.scene_cuts,
                source=videos.video, site_name=videos.site_name,
                camera_id=videos.camera_id,
            ).collect()
        )
        items: list[dict] = []
        for r in rows:
            video_path = str(r.get('source', ''))
            for sc in r.get('scene_cuts') or []:
                start = sc.get('start_time', 0)
                duration = sc.get('duration', 0)
                items.append({
                    'uuid': str(r.get('uuid', '')),
                    'scene_start': start,
                    'scene_end': start + duration,
                    'source': os.path.basename(video_path),
                    'video_url': f'/api/browse/media?path={video_path}#t={start:.1f},{start + duration:.1f}' if video_path else None,
                    'site_name': r.get('site_name'),
                    'camera_id': r.get('camera_id'),
                })
        return items[offset:offset + limit]
    except Exception as e:
        logger.warning(f'Browse scenes failed: {e}')
        return []


@router.get('/audio', response_model=list[BrowseAudioItem])
def browse_audio(site_name: str | None = None, limit: int = 48, offset: int = 0):
    """Browse audio chunks with transcription text and playable audio."""
    try:
        chunks = _table('audio_chunks')
        base = chunks.where(chunks.site_name == site_name) if site_name else chunks
        rows = list(
            base.select(
                uuid=chunks.uuid, audio_segment=chunks.audio_segment,
                transcription=chunks.transcription,
                site_name=chunks.site_name, camera_id=chunks.camera_id,
            )
            .limit(limit + offset)
            .collect()
        )
        items: list[dict] = []
        for r in rows[offset:]:
            raw = r.get('transcription')
            text = raw.get('text', '') if isinstance(raw, dict) else ''
            audio_path = str(r.get('audio_segment', ''))
            items.append({
                'uuid': str(r.get('uuid', '')),
                'audio_url': f'/api/browse/media?path={audio_path}' if audio_path else None,
                'transcription': text.strip() if text else None,
                'site_name': r.get('site_name'),
                'camera_id': r.get('camera_id'),
            })
        return items[:limit]
    except Exception as e:
        logger.warning(f'Browse audio failed: {e}')
        return []
