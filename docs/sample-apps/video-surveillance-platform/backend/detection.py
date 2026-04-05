"""On-demand DETR detection/segmentation — lazy-loaded, CPU-based, cached in-memory."""
import base64
import io
import logging
from uuid import UUID

import numpy as np
from PIL import Image, ImageDraw, ImageFont
import pixeltable as pxt

import config

logger = logging.getLogger(__name__)

MODELS: dict[str, dict] = {
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

_cache: dict[str, tuple] = {}

_PALETTE = [
    (255, 56, 56), (255, 157, 56), (255, 255, 56), (56, 255, 56), (56, 255, 255),
    (56, 157, 255), (56, 56, 255), (157, 56, 255), (255, 56, 255), (255, 56, 157),
    (128, 255, 0), (0, 255, 128), (0, 128, 255), (128, 0, 255), (255, 0, 128),
]


def _load_model(key: str):
    if key in _cache:
        return _cache[key]

    info = MODELS[key]
    model_id = info['id']

    if info['type'] == 'detection':
        from transformers import DetrForObjectDetection, DetrImageProcessor
        processor = DetrImageProcessor.from_pretrained(model_id)
        model = DetrForObjectDetection.from_pretrained(model_id)
    else:
        from transformers import DetrForSegmentation, DetrImageProcessor
        processor = DetrImageProcessor.from_pretrained(model_id)
        model = DetrForSegmentation.from_pretrained(model_id)

    _cache[key] = (processor, model)
    return processor, model


def _font():
    try:
        return ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 14)
    except (OSError, IOError):
        return ImageFont.load_default()


def _draw_boxes(img: Image.Image, items: list[dict], key: str = 'box') -> Image.Image:
    overlay = img.copy()
    draw = ImageDraw.Draw(overlay)
    font = _font()
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
    overlay = img.copy().convert('RGBA')
    mask_layer = Image.new('RGBA', overlay.size, (0, 0, 0, 0))
    for i, seg in enumerate(segments):
        color = _PALETTE[i % len(_PALETTE)]
        binary_mask = seg_array == seg['id']
        rgba = (*color, 80)
        pixels = np.array(mask_layer)
        pixels[binary_mask] = rgba
        mask_layer = Image.fromarray(pixels)
    overlay = Image.alpha_composite(overlay, mask_layer).convert('RGB')
    return _draw_boxes(overlay, segments)


def _img_to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=90)
    return base64.b64encode(buf.getvalue()).decode()


def _persist_labels(uuid_val: UUID, frame_idx: int, labels: list[str]) -> None:
    try:
        frames = pxt.get_table(f'{config.APP_NAMESPACE}.video_frames')
        frames.where(
            (frames.uuid == uuid_val) & (frames.pos == frame_idx)
        ).update({'detected_labels': labels})
    except Exception as e:
        logger.warning(f'Failed to persist labels: {e}')


def run_detection(
    img: Image.Image,
    model_key: str,
    threshold: float,
    uuid_val: UUID,
    frame_idx: int,
) -> dict:
    """Run DETR on an image. Returns result dict with annotated_image, detections/segments."""
    import torch

    if img.mode != 'RGB':
        img = img.convert('RGB')
    w, h = img.size
    processor, model = _load_model(model_key)
    model_info = MODELS[model_key]

    inputs = processor(images=img, return_tensors='pt')

    if model_info['type'] == 'detection':
        with torch.no_grad():
            outputs = model(**inputs)
        target_sizes = torch.tensor([[h, w]])
        results = processor.post_process_object_detection(outputs, target_sizes=target_sizes, threshold=threshold)[0]
        detections = sorted(
            [
                {
                    'label': model.config.id2label[lid],
                    'score': round(score, 3),
                    'box': {'x1': round(b[0], 1), 'y1': round(b[1], 1), 'x2': round(b[2], 1), 'y2': round(b[3], 1)},
                }
                for score, lid, b in zip(
                    results['scores'].tolist(), results['labels'].tolist(), results['boxes'].tolist()
                )
            ],
            key=lambda d: d['score'],
            reverse=True,
        )
        annotated = _draw_boxes(img, detections)
        _persist_labels(uuid_val, frame_idx, list({d['label'] for d in detections}))
        return {
            'type': 'detection', 'model': model_key,
            'image_width': w, 'image_height': h,
            'count': len(detections), 'detections': detections,
            'annotated_image': _img_to_b64(annotated),
        }

    # Panoptic segmentation
    with torch.no_grad():
        outputs = model(**inputs)
    result = processor.post_process_panoptic_segmentation(
        outputs, threshold=threshold, target_sizes=[(h, w)]
    )[0]
    seg_array = result['segmentation'].cpu().numpy()
    segments = []
    for seg_info in result.get('segments_info', []):
        sid = seg_info['id']
        mask = seg_array == sid
        ys, xs = mask.nonzero()
        if len(ys) == 0:
            continue
        segments.append({
            'id': int(sid),
            'label': model.config.id2label.get(seg_info['label_id'], f"class_{seg_info['label_id']}"),
            'score': round(seg_info.get('score', 0.0), 3),
            'is_thing': seg_info.get('isthing', True),
            'box': {'x1': round(float(xs.min()), 1), 'y1': round(float(ys.min()), 1),
                     'x2': round(float(xs.max()), 1), 'y2': round(float(ys.max()), 1)},
            'pixel_count': int(mask.sum()),
        })
    segments.sort(key=lambda s: s['score'], reverse=True)
    annotated = _draw_masks(img, seg_array, segments)
    _persist_labels(uuid_val, frame_idx, list({s['label'] for s in segments if s['is_thing']}))
    return {
        'type': 'segmentation', 'model': model_key,
        'image_width': w, 'image_height': h,
        'count': len(segments), 'segments': segments,
        'annotated_image': _img_to_b64(annotated),
    }
