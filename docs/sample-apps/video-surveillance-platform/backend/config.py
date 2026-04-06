import os

from dotenv import load_dotenv

load_dotenv(override=True)

APP_NAMESPACE = 'surveillance'

# Google Gemini
GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
GEMINI_EMBEDDING_MODEL = os.getenv('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-2-preview')

# DETR panoptic segmentation
DETR_MODEL = os.getenv('DETR_MODEL', 'facebook/detr-resnet-50-panoptic')

# Whisper (local transcription)
WHISPER_MODEL = os.getenv('WHISPER_MODEL', 'base.en')

# Video processing
FRAME_FPS = 1.0
SEGMENT_DURATION = 10.0
SEGMENT_OVERLAP = 2.0
MIN_SEGMENT_DURATION = 4.0
AUDIO_CHUNK_DURATION = 30.0

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

# -- Gemini Prompts ---------------------------------------------------------

VIDEO_SUMMARY_PROMPT = (
    'Analyze this surveillance footage from a utility/energy site. Provide a structured assessment:\n'
    '1. EQUIPMENT CONDITION: corrosion, overheating indicators (discoloration/heat shimmer), '
    'leaks, switch positions, gauge readings, indicator lights, damaged insulators, fallen lines\n'
    '2. WORKER SAFETY: PPE compliance (hardhats, safety vests, gloves, safety glasses), '
    'worker count, proximity to energized equipment, proper lockout/tagout procedures\n'
    '3. ENVIRONMENTAL HAZARDS: vegetation encroachment on lines/equipment, water pooling, '
    'debris near transformers, wildlife/animal intrusion, flooding risk\n'
    '4. SECURITY: unauthorized personnel, perimeter integrity, open gates/doors, '
    'vehicle access violations\n'
    '5. OVERALL RISK ASSESSMENT: summarize the most urgent finding.\n'
    'Be specific and concise. Reference visible equipment types by name.'
)

SEGMENT_ANALYSIS_PROMPT = (
    'Analyze this surveillance video segment from a utility/energy site. '
    'Return ONLY a JSON object (no markdown, no code fences) with this structure:\n'
    '{\n'
    '  "description": "2-3 sentence assessment of what is visible",\n'
    '  "severity": "CRITICAL" or "WARNING" or "INFO",\n'
    '  "severity_reason": "one-line justification",\n'
    '  "ppe_status": "COMPLIANT" or "PARTIAL" or "NON_COMPLIANT" or "N_A",\n'
    '  "ppe_details": "PPE details or N/A if no workers",\n'
    '  "equipment": ["list", "of", "visible", "equipment"],\n'
    '  "hazards": ["list", "of", "identified", "hazards"]\n'
    '}\n\n'
    'Severity criteria:\n'
    '- CRITICAL: fire, smoke, sparking, equipment failure, fallen lines, '
    'flood/water contact, active safety hazard\n'
    '- WARNING: corrosion, vegetation encroachment, missing PPE, degradation, '
    'water pooling, wildlife near lines\n'
    '- INFO: normal operations, no issues detected\n\n'
    'Respond with ONLY the JSON object.'
)

