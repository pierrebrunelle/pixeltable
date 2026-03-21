import base64
import io
import tempfile
from pathlib import Path

import pixeltable as pxt
from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pixeltable.functions.huggingface import clip
from pixeltable.functions.video import concat_videos, video_splitter
from pixeltable.iterators import FrameIterator

app = FastAPI(title='Keyword Trailer Generator')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

TEMP_DIR = tempfile.mkdtemp()
CLIP_MODEL = 'openai/clip-vit-base-patch32'


# --- Pixeltable Pipeline ---

@pxt.udf
def scene_split_times(scenes: list[dict]) -> list[float]:
    """Extract split timestamps from scene detection results."""
    if not scenes or len(scenes) <= 1:
        return []
    return [s['start_time'] for s in scenes[1:]]


pxt.drop_dir('trailer', force=True)
pxt.create_dir('trailer')

videos = pxt.create_table(
    'trailer.videos',
    {'video': pxt.Video, 'title': pxt.String},
)

# Scene detection → split boundaries (all local, no API calls)
videos.add_computed_column(scenes=videos.video.scene_detect_content())
videos.add_computed_column(split_times=scene_split_times(videos.scenes))

# Split video into scene clips using detected boundaries
clips = pxt.create_view(
    'trailer.clips',
    videos,
    iterator=video_splitter(videos.video, segment_times=videos.split_times),
)

# Extract representative frames from each clip (3 per scene)
frames = pxt.create_view(
    'trailer.frames',
    clips,
    iterator=FrameIterator.create(video=clips.video_segment, num_frames=3),
)

# CLIP embedding index enables text-to-image similarity search
frames.add_embedding_index('frame', embedding=clip.using(model_id=CLIP_MODEL))


# --- API Endpoints ---

@app.post('/api/ingest')
async def ingest_video(url: str = Form(...), title: str = Form('')):
    """Ingest a video by URL. Triggers scene detection, frame extraction, and CLIP embedding."""
    try:
        if not title:
            title = url.rsplit('/', 1)[-1].rsplit('.', 1)[0]
        videos.insert([{'video': url, 'title': title}])
        scene_count = videos.select(videos.scenes).collect()['scenes'].iloc[-1]
        return {
            'message': f'Video ingested: {len(scene_count)} scenes detected.',
            'title': title,
            'num_scenes': len(scene_count),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get('/api/videos')
async def list_videos():
    """List all ingested videos with scene counts."""
    try:
        results = videos.select(videos.title, videos.scenes).collect()
        return {
            'videos': [
                {
                    'title': row['title'],
                    'num_scenes': len(row['scenes']) if row['scenes'] else 0,
                }
                for _, row in results.iterrows()
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post('/api/search')
async def search_frames(query: str = Form(...), num_results: int = Form(10)):
    """Search video frames by text keyword using CLIP similarity."""
    try:
        sim = frames.frame.similarity(string=query)
        results = (
            frames.order_by(sim, asc=False)
            .limit(num_results)
            .select(
                encoded_frame=frames.frame.b64_encode('jpeg'),
                segment_start=clips.segment_start,
                segment_end=clips.segment_end,
                title=videos.title,
                similarity=sim,
            )
            .collect()
        )

        return {
            'results': [
                {
                    'frame': f'data:image/jpeg;base64,{row["encoded_frame"]}',
                    'segment_start': row['segment_start'],
                    'segment_end': row['segment_end'],
                    'title': row['title'],
                    'similarity': float(row['similarity']),
                }
                for _, row in results.iterrows()
            ],
            'query': query,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post('/api/generate-trailer')
async def generate_trailer(query: str = Form(...), num_scenes: int = Form(5)):
    """Search for matching scenes and concatenate them into a trailer video."""
    try:
        sim = frames.frame.similarity(string=query)

        # Get top matching frames with their scene clip references
        results = (
            frames.order_by(sim, asc=False)
            .limit(num_scenes * 3)  # oversample to deduplicate scenes
            .select(
                segment_start=clips.segment_start,
                video_segment=clips.video_segment,
            )
            .collect()
        )

        if results.empty:
            raise HTTPException(status_code=404, detail='No matching scenes found.')

        # Deduplicate by scene (keep first match per unique segment_start)
        seen_starts = set()
        unique_clips = []
        for _, row in results.iterrows():
            start = row['segment_start']
            if start not in seen_starts and len(unique_clips) < num_scenes:
                seen_starts.add(start)
                unique_clips.append(str(row['video_segment']))

        if not unique_clips:
            raise HTTPException(status_code=404, detail='No clips to concatenate.')

        trailer_path = concat_videos(unique_clips)

        return FileResponse(
            path=str(trailer_path),
            media_type='video/mp4',
            filename=f'trailer-{query.replace(" ", "-")[:30]}.mp4',
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)
