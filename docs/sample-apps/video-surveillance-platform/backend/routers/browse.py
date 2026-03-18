"""Multi-medium browse endpoints: paginated access to frames, segments, scenes, audio, and on-demand detection."""
import base64
import io
import itertools
import logging
import os
from pathlib import Path
from uuid import UUID

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel
import pixeltable as pxt

import config
from functions import gemini_text
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
        'id': config.DETR_MODEL,
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


_PALETTE = [
    (255, 56, 56), (255, 157, 56), (255, 255, 56), (56, 255, 56), (56, 255, 255),
    (56, 157, 255), (56, 56, 255), (157, 56, 255), (255, 56, 255), (255, 56, 157),
    (128, 255, 0), (0, 255, 128), (0, 128, 255), (128, 0, 255), (255, 0, 128),
]


def _draw_boxes(img: Image.Image, items: list[dict], key: str = 'box') -> Image.Image:
    """Draw bounding boxes and labels on a copy of the image."""
    overlay = img.copy()
    draw = ImageDraw.Draw(overlay)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14)
    except (OSError, IOError):
        font = ImageFont.load_default()

    for i, item in enumerate(items):
        box = item[key]
        color = _PALETTE[i % len(_PALETTE)]
        coords = [box['x1'], box['y1'], box['x2'], box['y2']]
        draw.rectangle(coords, outline=color, width=3)
        label_text = f"{item['label']} {item['score']:.0%}"
        bbox = draw.textbbox((0, 0), label_text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        draw.rectangle([coords[0], coords[1] - th - 6, coords[0] + tw + 8, coords[1]], fill=color)
        draw.text((coords[0] + 4, coords[1] - th - 4), label_text, fill='white', font=font)
    return overlay


def _draw_masks(img: Image.Image, seg_array: np.ndarray, segments: list[dict]) -> Image.Image:
    """Overlay semi-transparent colored masks and bounding boxes."""
    overlay = img.copy().convert('RGBA')
    mask_layer = Image.new('RGBA', overlay.size, (0, 0, 0, 0))
    mask_draw = ImageDraw.Draw(mask_layer)

    for i, seg in enumerate(segments):
        color = _PALETTE[i % len(_PALETTE)]
        binary_mask = seg_array == seg['id']
        rgba = (*color, 80)
        mask_pixels = np.array(mask_layer)
        mask_pixels[binary_mask] = rgba
        mask_layer = Image.fromarray(mask_pixels)

    overlay = Image.alpha_composite(overlay, mask_layer).convert('RGB')
    return _draw_boxes(overlay, segments)


def _img_to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=90)
    return base64.b64encode(buf.getvalue()).decode()


def _persist_labels(uuid_val: UUID, frame_idx: int, labels: list[str]) -> None:
    """Save detected labels back to the frame row in Pixeltable."""
    try:
        frames = pxt.get_table(f'{config.APP_NAMESPACE}.video_frames')
        frames.where(
            (frames.uuid == uuid_val) & (frames.pos == frame_idx)
        ).update({'detected_labels': labels})
        logger.info(f'Persisted {len(labels)} labels for frame {uuid_val}:{frame_idx}')
    except Exception as e:
        logger.warning(f'Failed to persist labels: {e}')


class DetectRequest(BaseModel):
    uuid: str
    frame_idx: int
    model: str = 'detr-resnet-50-panoptic'
    threshold: float = 0.5


@router.post('/detect')
def detect_objects(body: DetectRequest):
    """Run on-demand object detection / panoptic segmentation on a single video frame.

    Models are loaded lazily and cached in-memory (runs on CPU).
    Returns annotated image with boxes/masks and persists labels as metadata.
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

        annotated = _draw_boxes(img, detections)
        labels = list({d['label'] for d in detections})
        _persist_labels(uuid_val, body.frame_idx, labels)

        return {
            'type': 'detection',
            'model': body.model,
            'image_width': img_width,
            'image_height': img_height,
            'count': len(detections),
            'detections': detections,
            'annotated_image': _img_to_b64(annotated),
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

        annotated = _draw_masks(img, seg_array, segments)
        labels = list({s['label'] for s in segments if s['is_thing']})
        _persist_labels(uuid_val, body.frame_idx, labels)

        return {
            'type': 'segmentation',
            'model': body.model,
            'image_width': img_width,
            'image_height': img_height,
            'count': len(segments),
            'segments': segments,
            'annotated_image': _img_to_b64(annotated),
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
                severity=frames.severity,
                ppe_assessment=frames.ppe_assessment,
                site_name=frames.site_name,
                camera_id=frames.camera_id,
                asset_id=frames.asset_id,
                detected_labels=frames.detected_labels,
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
            if label and label not in (r.get('detected_labels') or []):
                continue

            desc_text = gemini_text(r.get('frame_description'))
            sev_text = gemini_text(r.get('severity'))
            ppe_text = gemini_text(r.get('ppe_assessment'))

            items.append({
                'uuid': str(r.get('uuid', '')),
                'frame': r.get('frame', ''),
                'frame_description': desc_text,
                'severity': sev_text.strip().lower() if sev_text else None,
                'ppe_assessment': ppe_text,
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
            text = gemini_text(r.get('transcription'))
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
