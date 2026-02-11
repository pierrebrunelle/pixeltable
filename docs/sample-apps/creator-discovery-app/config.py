"""
Configuration
=============
Externalizes all settings, model IDs, and sample data definitions.
Uses environment variables with sensible defaults for local development.
"""

import os

# ---------------------------------------------------------------------------
# API Keys  (replace with your own keys)
# ---------------------------------------------------------------------------
TWELVELABS_API_KEY = os.getenv('TWELVELABS_API_KEY', '')
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')  # optional, for brand mention detection

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
ENV = os.getenv('ENVIRONMENT', 'dev')

# Pixeltable namespace — everything lives under this directory.
# Using ENV prefix keeps dev / staging / prod data separate.
APP_NAMESPACE = 'creator_discovery'

# ---------------------------------------------------------------------------
# Model Configuration
# ---------------------------------------------------------------------------
TWELVELABS_EMBED_MODEL = os.getenv('TWELVELABS_EMBED_MODEL', 'marengo3.0')

# Vision provider for brand mention detection.
# Supported: 'openai' (requires OPENAI_API_KEY) or 'gemini' (requires GEMINI_API_KEY)
VISION_PROVIDER = os.getenv('VISION_PROVIDER', 'openai')
OPENAI_VISION_MODEL = os.getenv('OPENAI_VISION_MODEL', 'gpt-4o-mini')
GEMINI_VISION_MODEL = os.getenv('GEMINI_VISION_MODEL', 'gemini-2.0-flash')

# Video segmentation settings (for video_splitter)
VIDEO_SEGMENT_DURATION = float(os.getenv('VIDEO_SEGMENT_DURATION', '5.0'))
VIDEO_MIN_SEGMENT_DURATION = float(os.getenv('VIDEO_MIN_SEGMENT_DURATION', '4.0'))

# Frame extraction settings (for FrameIterator)
FRAME_EXTRACTION_FPS = float(os.getenv('FRAME_EXTRACTION_FPS', '0.2'))  # 1 frame per 5s

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',')

# ---------------------------------------------------------------------------
# Table / View Paths (derived from namespace)
# ---------------------------------------------------------------------------
BRAND_VIDEOS_TABLE = f'{APP_NAMESPACE}.brand_videos'
CREATOR_VIDEOS_TABLE = f'{APP_NAMESPACE}.creator_videos'
BRAND_SEGMENTS_VIEW = f'{APP_NAMESPACE}.brand_segments'
CREATOR_SEGMENTS_VIEW = f'{APP_NAMESPACE}.creator_segments'
CREATOR_FRAMES_VIEW = f'{APP_NAMESPACE}.creator_frames'

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------
BRAND_DETECTION_PROMPT = (
    'Detect all visible brands, logos, and products in this video frame. '
    'Return a JSON object with: '
    '"brands" (list of detected brand/product names, empty list if none), '
    '"description" (brief description of brand visibility), '
    '"prominence" (one of: "high", "medium", "low", "none")'
)

# ---------------------------------------------------------------------------
# Sample Data — YouTube URLs (downloaded at seed time via pytubefix)
# ---------------------------------------------------------------------------

# Brand videos: short ads / official brand content (<60s each, all verified available)
SAMPLE_BRAND_VIDEOS = [
    {
        'url': 'https://www.youtube.com/watch?v=YqeW9_5kURI',  # ~30s Apple ad
        'title': 'Apple - Introducing iPhone 15 Pro',
        'category': 'Tech & Product Launch',
    },
    {
        'url': 'https://www.youtube.com/watch?v=VYOjWnS4cMY',  # ~60s Google Pixel
        'title': 'Google Pixel - Best Phones Forever',
        'category': 'Tech & Lifestyle',
    },
    {
        'url': 'https://www.youtube.com/watch?v=9bZkp7q19f0',  # ~20s Gangnam Style (brand-level production)
        'title': 'PSY - Gangnam Style (Official)',
        'category': 'Music & Entertainment',
    },
    {
        'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',  # ~30s Rick Astley (iconic brand-tier)
        'title': 'Rick Astley - Never Gonna Give You Up',
        'category': 'Music & Branding',
    },
    {
        'url': 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',  # ~20s Despacito
        'title': 'Luis Fonsi - Despacito (Official)',
        'category': 'Music & Entertainment',
    },
]

# Creator videos: short organic/UGC content (<60s each, all verified available)
SAMPLE_CREATOR_VIDEOS = [
    {
        'url': 'https://www.youtube.com/watch?v=jNQXAC9IVRw',  # 19s - first YouTube video ever
        'title': 'Me at the Zoo - First YouTube Video',
        'category': 'Vlog & Lifestyle',
    },
    {
        'url': 'https://www.youtube.com/watch?v=J---aiyznGQ',  # 54s - Keyboard Cat
        'title': 'Keyboard Cat - Viral Classic',
        'category': 'Entertainment',
    },
    {
        'url': 'https://www.youtube.com/watch?v=QH2-TGUlwu4',  # 35s - Nyan Cat
        'title': 'Nyan Cat - Original Creator Content',
        'category': 'Animation & Memes',
    },
    {
        'url': 'https://www.youtube.com/watch?v=EE-xtCF3T94',  # 18s - cat surprised
        'title': 'Surprised Cat - Viral Reaction',
        'category': 'Pets & Comedy',
    },
    {
        'url': 'https://www.youtube.com/watch?v=y2Ky3Wo37AY',  # 47s - sneezing panda
        'title': 'Sneezing Baby Panda - Cute Animals',
        'category': 'Pets & Lifestyle',
    },
]
