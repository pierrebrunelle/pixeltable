"""Custom UDFs for the SiteWatch surveillance platform."""
import pixeltable as pxt

import config


@pxt.udf
def extract_segment_labels(segments_info: list) -> list:
    """Pull label_text values from DETR panoptic segmentation output."""
    if not segments_info:
        return []
    return [seg.get('label_text', 'unknown') for seg in segments_info if seg.get('score', 0) > 0.5]


@pxt.udf
def format_segment_summary(segments_info: list) -> str:
    """Produce a human-readable summary from DETR segmentation output."""
    if not segments_info:
        return 'No segments detected'
    parts: list[str] = []
    for seg in sorted(segments_info, key=lambda s: s.get('score', 0), reverse=True):
        label = seg.get('label_text', 'unknown')
        score = seg.get('score', 0)
        if score > 0.5:
            parts.append(f'{label} ({score:.0%})')
    return ', '.join(parts) if parts else 'No confident detections'
