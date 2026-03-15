"""Schema definition for SiteWatch video surveillance platform.

Run once to initialize the database schema:
    python setup_pixeltable.py

WARNING: This drops and recreates the namespace on every run.
"""
import config
import pixeltable as pxt

from pixeltable.functions import image as pxt_image
from pixeltable.functions.audio import audio_splitter
from pixeltable.functions.gemini import generate_content, generate_embedding
from pixeltable.functions.string import string_splitter
from pixeltable.functions.twelvelabs import embed as twelvelabs_embed
from pixeltable.functions.uuid import uuid7
from pixeltable.functions.video import (
    extract_audio,
    frame_iterator,
    get_duration,
    get_metadata,
    video_splitter,
)

pxt.drop_dir(config.APP_NAMESPACE, force=True)
pxt.create_dir(config.APP_NAMESPACE, if_exists='ignore')

# -- 1. Videos table --------------------------------------------------------

videos = pxt.create_table(
    f'{config.APP_NAMESPACE}.videos',
    {
        'video': pxt.Video,
        'site_name': pxt.String,
        'camera_id': pxt.String,
        'location': pxt.String,
        'recorded_at': pxt.Timestamp,
        'tags': pxt.Json,
        'uuid': uuid7(),
        'timestamp': pxt.Timestamp,
    },
    primary_key=['uuid'],
    if_exists='ignore',
)

videos.add_computed_column(
    duration=get_duration(videos.video),
    if_exists='ignore',
)

videos.add_computed_column(
    metadata=get_metadata(videos.video),
    if_exists='ignore',
)

videos.add_computed_column(
    video_summary=generate_content(
        [videos.video, 'Analyze this surveillance footage from a utility/energy site. '
         'Describe all activity: people, vehicles, equipment, environmental conditions, '
         'and any potential safety or security concerns. Be specific and concise.'],
        model=config.GEMINI_MODEL,
    ),
    if_exists='ignore',
)

print('  Videos: table + duration + metadata + Gemini video summary')

# -- 2. Video frames view ---------------------------------------------------

video_frames = pxt.create_view(
    f'{config.APP_NAMESPACE}.video_frames',
    videos,
    iterator=frame_iterator(video=videos.video, fps=config.FRAME_FPS),
    if_exists='ignore',
)

video_frames.add_computed_column(
    frame_thumbnail=pxt_image.b64_encode(
        pxt_image.thumbnail(video_frames.frame, size=(320, 320))
    ),
    if_exists='ignore',
)

video_frames.add_computed_column(
    frame_description=generate_content(
        [video_frames.frame,
         'Describe this surveillance camera frame from a utility/energy site. '
         'Focus on: people present, vehicles, equipment status, environmental conditions, '
         'and any safety or security observations. Be concise.'],
        model=config.GEMINI_MODEL,
    ),
    if_exists='ignore',
)

video_frames.add_embedding_index(
    'frame',
    embedding=twelvelabs_embed.using(model_name=config.TWELVELABS_MODEL),
    if_exists='ignore',
)

print('  Frames: view + Gemini description + Twelve Labs embedding (DETR detection is on-demand)')

# -- 3. Video segments view (for multimodal video search) -------------------

video_segments = pxt.create_view(
    f'{config.APP_NAMESPACE}.video_segments',
    videos,
    iterator=video_splitter(
        video=videos.video,
        duration=config.SEGMENT_DURATION,
        overlap=config.SEGMENT_OVERLAP,
        min_segment_duration=config.MIN_SEGMENT_DURATION,
        mode='fast',
    ),
    if_exists='ignore',
)

video_segments.add_embedding_index(
    'video_segment',
    embedding=twelvelabs_embed.using(model_name=config.TWELVELABS_MODEL),
    if_exists='ignore',
)

print('  Segments: view + Twelve Labs video embedding (multimodal search)')

# -- 4. Scene detection (computed column on videos) -------------------------

videos.add_computed_column(
    scene_cuts=videos.video.scene_detect_content(),
    if_exists='ignore',
)

print('  Scenes: computed column with content-based scene detection')

# -- 5. Audio transcription pipeline ----------------------------------------

videos.add_computed_column(
    audio=extract_audio(videos.video, format='mp3'),
    if_exists='ignore',
)

audio_chunks = pxt.create_view(
    f'{config.APP_NAMESPACE}.audio_chunks',
    videos,
    iterator=audio_splitter(audio=videos.audio, duration=config.AUDIO_CHUNK_DURATION),
    if_exists='ignore',
)

audio_chunks.add_computed_column(
    transcription=generate_content(
        [audio_chunks.audio_segment,
         'Transcribe this audio segment from a surveillance camera. '
         'Include any spoken words, alarms, machinery sounds, or notable audio events.'],
        model=config.GEMINI_MODEL,
    ),
    if_exists='ignore',
)

video_sentences = pxt.create_view(
    f'{config.APP_NAMESPACE}.video_sentences',
    audio_chunks.where(audio_chunks.transcription != None),
    iterator=string_splitter(
        text=audio_chunks.transcription.candidates[0].content.parts[0].text,
        separators='sentence',
    ),
    if_exists='ignore',
)

gemini_embed = generate_embedding.using(model=config.GEMINI_EMBEDDING_MODEL)

video_sentences.add_embedding_index(
    'text',
    string_embed=gemini_embed,
    if_exists='ignore',
)

print('  Audio: extraction -> Gemini transcription -> sentence embedding')

print('\nSchema setup complete.')
