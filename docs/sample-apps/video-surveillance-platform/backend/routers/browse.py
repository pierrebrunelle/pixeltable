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
from models import BrowseAudioItem, BrowseFrameItem, BrowseSegmentItem

logger = logging.getLogger(__name__)
router = APIRouter(prefix='/api/browse', tags=['browse'])

# ---------------------------------------------------------------------------
# On-demand DETR detection (lazy-loaded model, like pixelbot)
# ---------------------------------------------------------------------------

DETECTION_MODELS: dict[str, dict] = {
    'detr-resnet-50': {
        'id': 'facebook/detr-resnet-50',
        'type': 'detection',
        'label': 'DETR ResNet-50 (Object Detection)',
    },
    'detr-resnet-50-panoptic': {
        'id': 'facebook/detr-resnet-50-panoptic',
        'type': 'segmentation',
        'label': 'DETR ResNet-50 Panoptic (Segmentation)',
    },
}

_model_cache: dict[str, tuple] = {}


def _get_detection_model(model_key: str):
    """Load and cache a HuggingFace detection model + processor."""
    if model_key in _model_cache:
        return _model_cache[model_key]

    info = DETECTION_MODELS[model_key]
    model_id = info['id']

    if info['type'] == 'detection':
        from transformers import DetrForObjectDetection, DetrImageProcessor

        processor = DetrImageProcessor.from_pretrained(model_id)
        model = DetrForObjectDetection.from_pretrained(model_id)
    else:
        from transformers import DetrForSegmentation, DetrImageProcessor

        processor = DetrImageProcessor.from_pretrained(model_id)
        model = DetrForSegmentation.from_pretrained(model_id)

    _model_cache[model_key] = (processor, model)
    return processor, model


class DetectRequest(BaseModel):
    uuid: str
    frame_idx: int
    model: str = 'detr-resnet-50-panoptic'
    threshold: float = 0.5


@router.post('/detect')
def detect_objects(body: DetectRequest):
    """Run on-demand object detection / panoptic segmentation on a single video frame.

    Models are loaded lazily and cached in-memory (runs on CPU like pixelbot).
    """
    import torch

    model_info = DETECTION_MODELS.get(body.model)
    if not model_info:
        raise HTTPException(status_code=400, detail=f'Unknown model: {body.model}')

    frames = pxt.get_table(f'{config.APP_NAMESPACE}.video_frames')
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
    target_row = rows[0]

    img = target_row['frame']
    if img.mode != 'RGB':
        img = img.convert('RGB')
    img_width, img_height = img.size

    processor, model = _get_detection_model(body.model)

    if model_info['type'] == 'detection':
        inputs = processor(images=img, return_tensors='pt')
        with torch.no_grad():
            outputs = model(**inputs)

        target_sizes = torch.tensor([[img_height, img_width]])
        results = processor.post_process_object_detection(outputs, target_sizes=target_sizes, threshold=body.threshold)[0]

        detections = []
        for score, label_id, box in zip(
            results['scores'].tolist(),
            results['labels'].tolist(),
            results['boxes'].tolist(),
        ):
            detections.append({
                'label': model.config.id2label[label_id],
                'score': round(score, 3),
                'box': {'x1': round(box[0], 1), 'y1': round(box[1], 1), 'x2': round(box[2], 1), 'y2': round(box[3], 1)},
            })
        detections.sort(key=lambda d: d['score'], reverse=True)
        return {
            'type': 'detection',
            'model': body.model,
            'image_width': img_width,
            'image_height': img_height,
            'count': len(detections),
            'detections': detections,
        }

    else:
        inputs = processor(images=img, return_tensors='pt')
        with torch.no_grad():
            outputs = model(**inputs)

        result = processor.post_process_panoptic_segmentation(
            outputs, threshold=body.threshold, target_sizes=[(img_height, img_width)]
        )[0]

        seg_array = result['segmentation'].cpu().numpy()
        segments = []
        for seg_info in result.get('segments_info', []):
            seg_id = seg_info['id']
            label_id = seg_info['label_id']
            label_text = model.config.id2label.get(label_id, f'class_{label_id}')
            score = round(seg_info.get('score', 0.0), 3)

            mask = seg_array == seg_id
            ys, xs = mask.nonzero()
            if len(ys) == 0:
                continue

            segments.append({
                'id': int(seg_id),
                'label': label_text,
                'score': score,
                'is_thing': seg_info.get('isthing', True),
                'box': {
                    'x1': round(float(xs.min()), 1),
                    'y1': round(float(ys.min()), 1),
                    'x2': round(float(xs.max()), 1),
                    'y2': round(float(ys.max()), 1),
                },
                'pixel_count': int(mask.sum()),
            })
        segments.sort(key=lambda s: s['score'], reverse=True)
        return {
            'type': 'segmentation',
            'model': body.model,
            'image_width': img_width,
            'image_height': img_height,
            'count': len(segments),
            'segments': segments,
        }


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
        frames = pxt.get_table(f'{config.APP_NAMESPACE}.video_frames')
        rows = list(
            frames.select(
                uuid=frames.uuid,
                frame=frames.frame_thumbnail,
                frame_description=frames.frame_description,
                site_name=frames.site_name,
                camera_id=frames.camera_id,
            )
            .collect()
        )

        by_video: dict[str, list[dict]] = {}
        for r in rows:
            vid = str(r.get('uuid', ''))
            by_video.setdefault(vid, []).append(r)
        interleaved = list(itertools.chain.from_iterable(itertools.zip_longest(*by_video.values())))
        interleaved = [r for r in interleaved if r is not None]

        items: list[dict] = []
        for r in interleaved[offset:]:
            if site_name and r.get('site_name') != site_name:
                continue
            desc_text = None
            if r.get('frame_description'):
                try:
                    desc_text = r['frame_description']['candidates'][0]['content']['parts'][0]['text']
                except (KeyError, IndexError, TypeError):
                    desc_text = str(r['frame_description'])
            items.append({
                'uuid': str(r.get('uuid', '')),
                'frame': r.get('frame', ''),
                'frame_description': desc_text,
                'site_name': r.get('site_name'),
                'camera_id': r.get('camera_id'),
            })
            if len(items) >= limit:
                break
        return items
    except Exception as e:
        logger.warning(f'Browse frames failed: {e}')
        return []


@router.get('/segments', response_model=list[BrowseSegmentItem])
def browse_segments(
    site_name: str | None = None,
    limit: int = 48,
    offset: int = 0,
):
    """Paginated video segment browser."""
    try:
        segs = pxt.get_table(f'{config.APP_NAMESPACE}.video_segments')
        rows = list(
            segs.select(
                uuid=segs.uuid,
                segment_start=segs.segment_start,
                segment_end=segs.segment_end,
                video_segment=segs.video_segment,
                site_name=segs.site_name,
                camera_id=segs.camera_id,
            )
            .collect()
        )

        by_video: dict[str, list[dict]] = {}
        for r in rows:
            vid = str(r.get('uuid', ''))
            by_video.setdefault(vid, []).append(r)
        interleaved = list(itertools.chain.from_iterable(itertools.zip_longest(*by_video.values())))
        interleaved = [r for r in interleaved if r is not None]

        items: list[dict] = []
        for r in interleaved[offset:]:
            if site_name and r.get('site_name') != site_name:
                continue
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
    media_type = 'video/mp4'
    if file_path.suffix in ('.mp3',):
        media_type = 'audio/mpeg'
    elif file_path.suffix in ('.wav',):
        media_type = 'audio/wav'
    return FileResponse(file_path, media_type=media_type)


@router.get('/scenes', response_model=list[dict])
def browse_scenes(limit: int = 48, offset: int = 0):
    """Browse scenes extracted from all videos."""
    try:
        videos = pxt.get_table(f'{config.APP_NAMESPACE}.videos')
        rows = list(
            videos.select(
                uuid=videos.uuid,
                scene_cuts=videos.scene_cuts,
                source=videos.video,
            )
            .collect()
        )
        items: list[dict] = []
        for r in rows:
            cuts = r.get('scene_cuts') or []
            for sc in cuts:
                start = sc.get('start_time', 0)
                duration = sc.get('duration', 0)
                items.append({
                    'uuid': str(r.get('uuid', '')),
                    'scene_start': start,
                    'scene_end': start + duration,
                    'source': os.path.basename(str(r.get('source', ''))),
                })
        return items[offset:offset + limit]
    except Exception as e:
        logger.warning(f'Browse scenes failed: {e}')
        return []


@router.get('/audio', response_model=list[BrowseAudioItem])
def browse_audio(
    site_name: str | None = None,
    limit: int = 48,
    offset: int = 0,
):
    """Browse audio chunks with transcription text and playable audio."""
    try:
        chunks = pxt.get_table(f'{config.APP_NAMESPACE}.audio_chunks')
        rows = list(
            chunks.select(
                uuid=chunks.uuid,
                audio_segment=chunks.audio_segment,
                transcription=chunks.transcription,
                site_name=chunks.site_name,
                camera_id=chunks.camera_id,
            )
            .limit(limit + offset)
            .collect()
        )
        items: list[dict] = []
        for r in rows[offset:]:
            if site_name and r.get('site_name') != site_name:
                continue
            text = ''
            try:
                text = r['transcription']['candidates'][0]['content']['parts'][0]['text']
            except (KeyError, IndexError, TypeError):
                pass
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
