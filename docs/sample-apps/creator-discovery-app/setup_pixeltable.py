"""
Pixeltable Schema Definition — idempotent, re-runnable.

    python setup_pixeltable.py            # schema only
    python setup_pixeltable.py --seed     # schema + sample data
"""

import argparse
import os

import config

if config.TWELVELABS_API_KEY:
    os.environ.setdefault('TWELVELABS_API_KEY', config.TWELVELABS_API_KEY)
if config.OPENAI_API_KEY:
    os.environ.setdefault('OPENAI_API_KEY', config.OPENAI_API_KEY)

import pixeltable as pxt
from pixeltable.functions.twelvelabs import embed as tl_embed
from pixeltable.functions.video import frame_iterator, video_splitter

from functions import gemini_analyze_frame, parse_brand_mentions

# -- namespace --
pxt.drop_dir(config.APP_NAMESPACE, force=True)
pxt.create_dir(config.APP_NAMESPACE, if_exists='ignore')

# -- tables --
brand_videos = pxt.create_table(
    config.BRAND_VIDEOS_TABLE,
    {'video': pxt.Video, 'title': pxt.String, 'category': pxt.String, 'video_url': pxt.String},
    if_exists='ignore',
)
creator_videos = pxt.create_table(
    config.CREATOR_VIDEOS_TABLE,
    {'video': pxt.Video, 'title': pxt.String, 'category': pxt.String, 'video_url': pxt.String},
    if_exists='ignore',
)

# -- embedding indexes on titles (text similarity search) --
brand_videos.add_embedding_index('title', embedding=tl_embed.using(model_name=config.TWELVELABS_EMBED_MODEL), if_exists='ignore')
creator_videos.add_embedding_index('title', embedding=tl_embed.using(model_name=config.TWELVELABS_EMBED_MODEL), if_exists='ignore')

# -- video segment views (video-to-video & image-to-video search) --
brand_segments = pxt.create_view(
    config.BRAND_SEGMENTS_VIEW, brand_videos,
    iterator=video_splitter(video=brand_videos.video, duration=config.VIDEO_SEGMENT_DURATION, min_segment_duration=config.VIDEO_MIN_SEGMENT_DURATION),
    if_exists='ignore',
)
creator_segments = pxt.create_view(
    config.CREATOR_SEGMENTS_VIEW, creator_videos,
    iterator=video_splitter(video=creator_videos.video, duration=config.VIDEO_SEGMENT_DURATION, min_segment_duration=config.VIDEO_MIN_SEGMENT_DURATION),
    if_exists='ignore',
)

# -- embedding indexes on video segments --
brand_segments.add_embedding_index('video_segment', embedding=tl_embed.using(model_name=config.TWELVELABS_EMBED_MODEL), if_exists='ignore')
creator_segments.add_embedding_index('video_segment', embedding=tl_embed.using(model_name=config.TWELVELABS_EMBED_MODEL), if_exists='ignore')

# -- frame extraction view (brand mention detection) --
creator_frames = pxt.create_view(
    config.CREATOR_FRAMES_VIEW, creator_videos,
    iterator=frame_iterator(video=creator_videos.video, fps=config.FRAME_EXTRACTION_FPS),
    if_exists='ignore',
)

# -- brand detection computed columns (openai.vision or gemini) --
if config.VISION_PROVIDER == 'gemini':
    vision_expr = gemini_analyze_frame(config.BRAND_DETECTION_PROMPT, creator_frames.frame, model=config.GEMINI_VISION_MODEL)
else:
    from pixeltable.functions.openai import vision as openai_vision
    vision_expr = openai_vision(config.BRAND_DETECTION_PROMPT, creator_frames.frame, model=config.OPENAI_VISION_MODEL)

creator_frames.add_computed_column(brand_analysis_raw=vision_expr, if_exists='ignore', on_error='ignore')
creator_frames.add_computed_column(brand_analysis=parse_brand_mentions(creator_frames.brand_analysis_raw), if_exists='ignore')


def _download_yt(url: str) -> str:
    """Download a YouTube video to a temp file, return the path."""
    import tempfile
    from pathlib import Path
    from pytubefix import YouTube

    yt = YouTube(url)
    stream = yt.streams.filter(progressive=True, file_extension='mp4').order_by('resolution').desc().first()
    if stream is None:
        stream = yt.streams.filter(file_extension='mp4').first()
    path = tempfile.mktemp(suffix='.mp4')
    stream.download(filename=Path(path).name, output_path=str(Path(path).parent))
    return path


def seed_sample_data() -> None:
    for label, videos, table in [
        ('brand', config.SAMPLE_BRAND_VIDEOS, brand_videos),
        ('creator', config.SAMPLE_CREATOR_VIDEOS, creator_videos),
    ]:
        print(f'Downloading & inserting {label} videos …')
        for v in videos:
            try:
                print(f'  ↓ {v["title"]}')
                path = _download_yt(v['url'])
                table.insert([{
                    'video': path,
                    'title': v['title'],
                    'category': v['category'],
                    'video_url': v['url'],
                }])
            except Exception as e:
                print(f'  ⚠ Skipped {v["title"]}: {e}')
    print('Done.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Set up Pixeltable schema')
    parser.add_argument('--seed', action='store_true', help='Insert sample data')
    args = parser.parse_args()
    if args.seed:
        seed_sample_data()
    else:
        print('Schema created. Run with --seed to insert sample data.')
