import os

from dotenv import load_dotenv

load_dotenv(override=True)

APP_NAMESPACE = 'surveillance'

# Google Gemini
GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
GEMINI_EMBEDDING_MODEL = os.getenv('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-001')

# Twelve Labs (multimodal video/image/audio embeddings)
TWELVELABS_MODEL = os.getenv('TWELVELABS_MODEL', 'marengo3.0')

# DETR panoptic segmentation
DETR_MODEL = os.getenv('DETR_MODEL', 'facebook/detr-resnet-50-panoptic')

# Video processing
FRAME_FPS = 1.0
SEGMENT_DURATION = 10.0
SEGMENT_OVERLAP = 2.0
MIN_SEGMENT_DURATION = 4.0
AUDIO_CHUNK_DURATION = 30.0

# Severity classification
CRITICAL_LABELS = {'person', 'fire hydrant', 'stop sign', 'truck', 'bus'}
WARNING_LABELS = {'car', 'motorcycle', 'bicycle', 'backpack', 'suitcase', 'handbag'}
INFO_LABELS = {'bird', 'cat', 'dog', 'tree', 'bench'}

# File upload
UPLOAD_FOLDER = 'data'
ALLOWED_EXTENSIONS = {'mp4', 'mov', 'avi', 'mkv', 'webm'}

# CORS
CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv(
        'CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173'
    ).split(',')
    if origin.strip()
]
