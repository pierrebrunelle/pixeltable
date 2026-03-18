import os

from dotenv import load_dotenv

load_dotenv(override=True)

APP_NAMESPACE = 'surveillance'

# Google Gemini
GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')
GEMINI_EMBEDDING_MODEL = os.getenv('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-001')

# DETR panoptic segmentation
DETR_MODEL = os.getenv('DETR_MODEL', 'facebook/detr-resnet-50-panoptic')

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

FRAME_DESCRIPTION_PROMPT = (
    'Analyze this surveillance frame from a utility/energy site. Report on:\n'
    '- EQUIPMENT: condition (corrosion, discoloration, leaks, damage), '
    'switch positions, gauge readings, indicator lights, asset type\n'
    '- WORKERS: count, PPE status (hardhat, vest, gloves, safety glasses), '
    'proximity to hazards\n'
    '- ENVIRONMENT: vegetation encroachment, water pooling, debris, '
    'wildlife/animal presence\n'
    '- SECURITY: unauthorized access, perimeter breach, open gates\n'
    '- SEVERITY: rate as CRITICAL / WARNING / INFO with one-line justification\n'
    'Be concise. Use utility industry terminology.'
)

SEVERITY_PROMPT = (
    'Classify this surveillance frame into exactly one severity level:\n'
    '- CRITICAL: fire, smoke, active sparking, equipment failure, fallen lines, '
    'active safety hazard, unauthorized person in restricted area, flood/water contact with equipment\n'
    '- WARNING: corrosion, vegetation encroachment, missing PPE, equipment degradation, '
    'water pooling near equipment, open access panels, wildlife near lines\n'
    '- INFO: normal operations, no issues detected, routine activity\n'
    'Respond with ONLY one word: CRITICAL, WARNING, or INFO'
)

PPE_ASSESSMENT_PROMPT = (
    'If workers are visible in this frame, assess PPE compliance:\n'
    '- List each visible person and whether they wear: hardhat, safety vest, safety glasses, gloves\n'
    '- Rate overall: COMPLIANT, PARTIAL, NON-COMPLIANT, or N/A (no workers visible)\n'
    'Be concise. If no workers visible, respond "N/A - no workers visible."'
)

AUDIO_TRANSCRIPTION_PROMPT = (
    'Transcribe this audio from a utility/energy site surveillance camera. Include:\n'
    '- Spoken words and radio communications verbatim\n'
    '- Alarm tones, warning sirens, equipment alerts\n'
    '- Machinery sounds: hum changes, grinding, sparking, pressure releases\n'
    '- Verbal safety callouts (e.g., "clear!", "energized", "lockout")\n'
    '- Environmental sounds: wind, rain, animal activity near equipment\n'
    'Note any anomalous sounds that could indicate equipment malfunction.'
)
