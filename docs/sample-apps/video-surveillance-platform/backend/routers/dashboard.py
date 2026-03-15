"""Dashboard endpoints: stats, alerts, activity."""
import logging

from fastapi import APIRouter
import pixeltable as pxt

import config
from datetime import datetime

from models import ActivityItem, AlertItem, AlertsResponse, DashboardStats

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/dashboard', tags=['dashboard'])


@router.get('/stats', response_model=DashboardStats)
def get_stats():
    """Aggregate statistics for the dashboard."""
    stats: dict = {
        'total_videos': 0,
        'total_frames': 0,
        'total_segments': 0,
        'total_audio_chunks': 0,
        'total_transcripts': 0,
        'total_alerts': 0,
        'sites': [],
        'severity_counts': {'critical': 0, 'warning': 0, 'info': 0},
        'recent_transcripts': [],
        'top_labels': [],
    }

    try:
        videos = pxt.get_table(f'{config.APP_NAMESPACE}.videos')
        all_videos = list(videos.select(videos.site_name).collect())
        stats['total_videos'] = len(all_videos)
        stats['sites'] = list({r.get('site_name', '') for r in all_videos if r.get('site_name')})
    except Exception as e:
        logger.warning(f'Could not count videos: {e}')

    try:
        frames = pxt.get_table(f'{config.APP_NAMESPACE}.video_frames')
        frame_rows = list(frames.select(frames.frame_description).collect())
        stats['total_frames'] = len(frame_rows)
    except Exception as e:
        logger.warning(f'Could not count frames: {e}')

    try:
        segs = pxt.get_table(f'{config.APP_NAMESPACE}.video_segments')
        seg_rows = list(segs.select(segs.segment_start).collect())
        stats['total_segments'] = len(seg_rows)
    except Exception as e:
        logger.warning(f'Could not count segments: {e}')

    try:
        audio = pxt.get_table(f'{config.APP_NAMESPACE}.audio_chunks')
        audio_rows = list(audio.select(audio.audio_segment).collect())
        stats['total_audio_chunks'] = len(audio_rows)
    except Exception as e:
        logger.warning(f'Could not count audio chunks: {e}')

    try:
        sentences = pxt.get_table(f'{config.APP_NAMESPACE}.video_sentences')
        sent_rows = list(sentences.select(sentences.text).limit(200).collect())
        stats['total_transcripts'] = len(sent_rows)
        stats['recent_transcripts'] = [
            r['text'] for r in sent_rows[:8] if r.get('text')
        ]
    except Exception as e:
        logger.warning(f'Could not count transcripts: {e}')

    return stats


@router.get('/alerts', response_model=AlertsResponse)
def get_alerts(
    site_name: str | None = None,
    limit: int = 50,
):
    """Latest alerts across all videos (based on Gemini frame descriptions)."""
    try:
        frames = pxt.get_table(f'{config.APP_NAMESPACE}.video_frames')
        rows = list(
            frames.select(
                uuid=frames.uuid,
                frame=frames.frame_thumbnail,
                frame_description=frames.frame_description,
                site_name=frames.site_name,
                camera_id=frames.camera_id,
            )
            .limit(limit * 3)
            .collect()
        )

        alert_keywords = {'fire', 'smoke', 'damage', 'danger', 'emergency', 'unauthorized', 'suspicious', 'breach'}
        items: list[dict] = []
        for r in rows:
            if site_name and r.get('site_name') != site_name:
                continue
            desc = ''
            try:
                desc = r['frame_description']['candidates'][0]['content']['parts'][0]['text']
            except (KeyError, IndexError, TypeError):
                continue
            if not any(kw in desc.lower() for kw in alert_keywords):
                continue
            items.append({
                'uuid': str(r.get('uuid', '')),
                'frame': r.get('frame', ''),
                'segment_labels': [],
                'severity': 'warning',
                'frame_description': desc,
                'site_name': r.get('site_name'),
                'camera_id': r.get('camera_id'),
            })
            if len(items) >= limit:
                break

        return AlertsResponse(alerts=items, total=len(items))
    except Exception as e:
        logger.warning(f'Could not fetch alerts: {e}')
        return AlertsResponse(alerts=[], total=0)


@router.get('/activity', response_model=list[ActivityItem])
def get_activity(limit: int = 20):
    """Recent processing activity: uploads, frame analysis, transcriptions."""
    items: list[dict] = []

    try:
        videos = pxt.get_table(f'{config.APP_NAMESPACE}.videos')
        rows = list(
            videos.select(
                site_name=videos.site_name,
                camera_id=videos.camera_id,
                timestamp=videos.timestamp,
                duration=videos.duration,
            )
            .order_by(videos.timestamp, asc=False)
            .limit(limit)
            .collect()
        )
        for r in rows:
            ts = r.get('timestamp')
            items.append({
                'type': 'upload',
                'label': f"Video uploaded ({r.get('camera_id', 'unknown')})",
                'detail': f"Duration: {r.get('duration', 0):.1f}s" if r.get('duration') else None,
                'site_name': r.get('site_name'),
                'timestamp': ts.isoformat() if isinstance(ts, datetime) else None,
            })
    except Exception as e:
        logger.warning(f'Could not fetch video activity: {e}')

    try:
        frames = pxt.get_table(f'{config.APP_NAMESPACE}.video_frames')
        frame_rows = list(frames.select(frames.frame_description).collect())
        total_frames = len(frame_rows)
        described = sum(1 for r in frame_rows if r.get('frame_description'))
        if total_frames > 0:
            items.append({
                'type': 'analysis',
                'label': f'{total_frames} frames analyzed',
                'detail': f'{described} frames described by Gemini',
            })
    except Exception as e:
        logger.warning(f'Could not fetch frame activity: {e}')

    try:
        segs = pxt.get_table(f'{config.APP_NAMESPACE}.video_segments')
        seg_count = len(list(segs.select(segs.segment_start).collect()))
        if seg_count > 0:
            items.append({
                'type': 'segments',
                'label': f'{seg_count} video segments indexed',
                'detail': 'Twelve Labs multimodal embeddings',
            })
    except Exception as e:
        logger.warning(f'Could not fetch segment activity: {e}')

    try:
        chunks = pxt.get_table(f'{config.APP_NAMESPACE}.audio_chunks')
        chunk_count = len(list(chunks.select(chunks.audio_segment).collect()))
        if chunk_count > 0:
            items.append({
                'type': 'audio',
                'label': f'{chunk_count} audio chunks transcribed',
                'detail': 'Gemini audio transcription',
            })
    except Exception as e:
        logger.warning(f'Could not fetch audio activity: {e}')

    return items[:limit]
