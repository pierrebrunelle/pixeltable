"""Multimodal search across video segments, frames, and transcripts.

Twelve Labs Marengo embeddings project text, images, audio, and video into the same
semantic space, enabling true cross-modal search:
- Text query  -> returns video segments, frames, AND transcripts
- Image query -> returns frames AND video segments
- Video query -> returns video segments AND frames
- Audio query -> returns video segments
"""
import logging
import os
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
import pixeltable as pxt

import config
from models import SearchResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/search', tags=['search'])

UPLOAD_DIR = Path(config.UPLOAD_FOLDER)


class TextSearchRequest(BaseModel):
    query: str
    types: list[str] = ['video_segment', 'frame', 'transcript']
    limit: int = 20
    threshold: float = 0.2


def _search_segments(*, limit: int, threshold: float, **sim_kwargs: str) -> list[dict]:
    """Search video_segments with any modality kwarg (string=, image=, video=, audio=)."""
    results: list[dict] = []
    try:
        segs = pxt.get_table(f'{config.APP_NAMESPACE}.video_segments')
        sim = segs.video_segment.similarity(**sim_kwargs)
        rows = list(
            segs.where(sim > threshold)
            .order_by(sim, asc=False)
            .select(
                uuid=segs.uuid,
                sim=sim,
                segment_start=segs.segment_start,
                segment_end=segs.segment_end,
                video_segment=segs.video_segment,
                source=segs.video,
            )
            .limit(limit)
            .collect()
        )
        for r in rows:
            video_path = str(r.get('video_segment', ''))
            results.append({
                'type': 'video_segment',
                'uuid': str(r.get('uuid', '')),
                'similarity': round(r.get('sim', 0), 3),
                'text': f"Segment {r.get('segment_start', 0):.1f}s - {r.get('segment_end', 0):.1f}s",
                'video_url': f'/api/browse/media?path={video_path}' if video_path else None,
                'metadata': {
                    'segment_start': r.get('segment_start'),
                    'segment_end': r.get('segment_end'),
                    'source': os.path.basename(str(r.get('source', ''))),
                },
            })
    except Exception as e:
        logger.warning(f'Video segment search failed: {e}')
    return results


def _search_frames(*, limit: int, threshold: float, **sim_kwargs: str) -> list[dict]:
    """Search video_frames with any modality kwarg (string=, image=)."""
    results: list[dict] = []
    try:
        frames = pxt.get_table(f'{config.APP_NAMESPACE}.video_frames')
        sim = frames.frame.similarity(**sim_kwargs)
        rows = list(
            frames.where(sim > threshold)
            .order_by(sim, asc=False)
            .select(
                uuid=frames.uuid,
                sim=sim,
                thumbnail=frames.frame_thumbnail,
                segment_labels=frames.segment_labels,
                severity=frames.severity,
                source=frames.video,
            )
            .limit(limit)
            .collect()
        )
        for r in rows:
            results.append({
                'type': 'frame',
                'uuid': str(r.get('uuid', '')),
                'similarity': round(r.get('sim', 0), 3),
                'thumbnail': r.get('thumbnail'),
                'metadata': {
                    'segment_labels': r.get('segment_labels', []),
                    'severity': r.get('severity'),
                    'source': os.path.basename(str(r.get('source', ''))),
                },
            })
    except Exception as e:
        logger.warning(f'Frame search failed: {e}')
    return results


def _search_transcripts(*, query: str, limit: int, threshold: float) -> list[dict]:
    """Search video_sentences via Gemini text embeddings."""
    results: list[dict] = []
    try:
        sents = pxt.get_table(f'{config.APP_NAMESPACE}.video_sentences')
        sim = sents.text.similarity(string=query)
        rows = list(
            sents.where(sim > max(threshold, 0.3))
            .order_by(sim, asc=False)
            .select(text=sents.text, uuid=sents.uuid, sim=sim)
            .limit(limit * 3)
            .collect()
        )
        seen_texts: set[str] = set()
        for r in rows:
            text = r.get('text', '')
            if text in seen_texts:
                continue
            seen_texts.add(text)
            results.append({
                'type': 'transcript',
                'uuid': str(r.get('uuid', '')),
                'similarity': round(r.get('sim', 0), 3),
                'text': text,
            })
    except Exception as e:
        logger.warning(f'Transcript search failed: {e}')
    return results


@router.post('', response_model=SearchResponse)
def search_text(body: TextSearchRequest):
    """Text search across ALL modalities: video segments, frames, and transcripts."""
    results: list[dict] = []

    if 'video_segment' in body.types:
        results.extend(_search_segments(
            string=body.query, limit=body.limit, threshold=body.threshold,
        ))

    if 'frame' in body.types:
        results.extend(_search_frames(
            string=body.query, limit=body.limit, threshold=body.threshold,
        ))

    if 'transcript' in body.types:
        results.extend(_search_transcripts(
            query=body.query, limit=body.limit, threshold=body.threshold,
        ))

    results.sort(key=lambda x: x.get('similarity', 0), reverse=True)
    return {'query': body.query, 'results': results[:body.limit]}


def _save_upload(file: UploadFile) -> Path:
    ts = int(datetime.now().timestamp() * 1000)
    file_path = UPLOAD_DIR / f'query_{ts}_{file.filename}'
    with open(file_path, 'wb') as f:
        shutil.copyfileobj(file.file, f)
    return file_path


@router.post('/by-image', response_model=SearchResponse)
def search_by_image(file: UploadFile = File(...), limit: int = Form(20)):
    """Image search -> returns matching frames AND video segments (cross-modal)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail='No file provided')

    file_path = _save_upload(file)
    results: list[dict] = []

    results.extend(_search_frames(
        image=str(file_path), limit=limit, threshold=0.15,
    ))
    results.extend(_search_segments(
        image=str(file_path), limit=limit, threshold=0.15,
    ))

    file_path.unlink(missing_ok=True)
    results.sort(key=lambda x: x.get('similarity', 0), reverse=True)
    return {'query': f'[image: {file.filename}]', 'results': results[:limit]}


@router.post('/by-video', response_model=SearchResponse)
def search_by_video(file: UploadFile = File(...), limit: int = Form(20)):
    """Video clip search -> returns matching video segments AND frames (cross-modal)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail='No file provided')

    file_path = _save_upload(file)
    results: list[dict] = []

    results.extend(_search_segments(
        video=str(file_path), limit=limit, threshold=0.15,
    ))
    results.extend(_search_frames(
        image=str(file_path), limit=limit // 2, threshold=0.15,
    ))

    file_path.unlink(missing_ok=True)
    results.sort(key=lambda x: x.get('similarity', 0), reverse=True)
    return {'query': f'[video: {file.filename}]', 'results': results[:limit]}


@router.post('/by-audio', response_model=SearchResponse)
def search_by_audio(file: UploadFile = File(...), limit: int = Form(20)):
    """Audio search -> returns matching video segments (cross-modal audio-to-video)."""
    if not file.filename:
        raise HTTPException(status_code=400, detail='No file provided')

    file_path = _save_upload(file)
    results: list[dict] = []

    results.extend(_search_segments(
        audio=str(file_path), limit=limit, threshold=0.15,
    ))

    file_path.unlink(missing_ok=True)
    results.sort(key=lambda x: x.get('similarity', 0), reverse=True)
    return {'query': f'[audio: {file.filename}]', 'results': results[:limit]}
