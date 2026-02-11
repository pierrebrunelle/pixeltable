"""
Creator Discovery App — FastAPI endpoints.

    python app.py              # http://localhost:8000
    python app.py              # auto-seeds sample data on first run

Do NOT use `fastapi dev` — its --reload spawns a child process
that breaks Pixeltable's event loop patching.
"""

import io
import os
import tempfile
from typing import Literal

import PIL.Image
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import config

if config.TWELVELABS_API_KEY:
    os.environ.setdefault('TWELVELABS_API_KEY', config.TWELVELABS_API_KEY)
if config.OPENAI_API_KEY:
    os.environ.setdefault('OPENAI_API_KEY', config.OPENAI_API_KEY)

# --- Pixeltable init (module-level, single process) ---
import pixeltable as pxt
import setup_pixeltable  # noqa: F401  idempotent schema

_brand_tbl = pxt.get_table(config.BRAND_VIDEOS_TABLE)
if _brand_tbl.count() == 0:
    print('First run — seeding sample data (~60 s) …')
    setup_pixeltable.seed_sample_data()

# --- FastAPI ---

app = FastAPI(title='Creator Discovery API')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=True, allow_methods=['*'], allow_headers=['*'])

TEMP_DIR = tempfile.mkdtemp()


class MatchRequest(BaseModel):
    video_id: int
    source: Literal['brand', 'creator']
    num_results: int = 5


class TextSearchRequest(BaseModel):
    query: str
    scope: Literal['all', 'brand', 'creator'] = 'all'
    num_results: int = 10


# ----- helpers -----

def _rows(data, source: str) -> list[dict]:
    """Convert a Pixeltable collect() result to a list of dicts."""
    return [
        {
            'id': i,
            'title': data['title'][i],
            'category': data['category'][i],
            'video_url': data['video_url'][i],
            'source': source,
        }
        for i in range(len(data))
    ]


def _search(table_path: str, query: str, limit: int, source: str) -> list[dict]:
    """Run a .similarity() text search on a table's title column."""
    t = pxt.get_table(table_path)
    sim = t.title.similarity(string=query)
    data = t.order_by(sim, asc=False).limit(limit).select(t.title, t.category, t.video_url, score=sim).collect()
    return [
        {
            'id': i,
            'title': data['title'][i],
            'category': data['category'][i],
            'video_url': data['video_url'][i],
            'score': round(float(data['score'][i]), 4),
            'source': source,
        }
        for i in range(len(data))
    ]


# ----- routes -----

@app.get('/')
def root():
    return {'message': 'Creator Discovery API', 'status': 'running'}


@app.post('/api/videos/upload')
def upload_video(
    file: UploadFile = File(...),  # noqa: B008
    title: str = Form(...),
    category: str = Form(''),
    source: str = Form('brand'),
):
    """Upload a video to the brand or creator library. Pixeltable handles storage, segmentation, and embedding."""
    from pathlib import Path

    path = Path(TEMP_DIR) / file.filename
    path.write_bytes(file.file.read())
    video_path = str(path)

    table_path = config.BRAND_VIDEOS_TABLE if source == 'brand' else config.CREATOR_VIDEOS_TABLE
    t = pxt.get_table(table_path)
    t.insert([{'video': video_path, 'title': title, 'category': category, 'video_url': video_path}])

    return {'message': f'Video uploaded to {source} library', 'title': title, 'success': True}


@app.get('/api/videos')
def list_videos(source: str | None = None):
    results: list[dict] = []
    if source in (None, 'brand'):
        bt = pxt.get_table(config.BRAND_VIDEOS_TABLE)
        results += _rows(bt.select(bt.title, bt.category, bt.video_url).collect(), 'brand')
    if source in (None, 'creator'):
        ct = pxt.get_table(config.CREATOR_VIDEOS_TABLE)
        results += _rows(ct.select(ct.title, ct.category, ct.video_url).collect(), 'creator')
    return {'videos': results, 'success': True}


@app.post('/api/match/find')
def find_matches(request: MatchRequest):
    """Pixeltable handles storage, embedding, indexing, and retrieval — one .similarity() call does it all."""
    if request.source == 'brand':
        src_path, tgt_path, tgt_source = config.BRAND_VIDEOS_TABLE, config.CREATOR_VIDEOS_TABLE, 'creator'
    else:
        src_path, tgt_path, tgt_source = config.CREATOR_VIDEOS_TABLE, config.BRAND_VIDEOS_TABLE, 'brand'

    src = pxt.get_table(src_path)
    src_data = src.select(src.title).collect()
    if request.video_id >= len(src_data):
        raise HTTPException(404, 'Video not found')

    source_title = src_data['title'][request.video_id]
    matches = _search(tgt_path, source_title, request.num_results, tgt_source)
    for m in matches:
        m['match_type'] = 'text_similarity'
    return {'matches': matches, 'source_title': source_title, 'success': True}


@app.post('/api/search/text')
def search_text(request: TextSearchRequest):
    """Semantic search — marengo3.0 understands meaning, not just keywords."""
    results: list[dict] = []
    if request.scope in ('all', 'brand'):
        results += _search(config.BRAND_VIDEOS_TABLE, request.query, request.num_results, 'brand')
    if request.scope in ('all', 'creator'):
        results += _search(config.CREATOR_VIDEOS_TABLE, request.query, request.num_results, 'creator')
    results.sort(key=lambda x: x['score'], reverse=True)
    return {'results': results[:request.num_results], 'success': True}


@app.post('/api/search/image')
def search_image(
    file: UploadFile = File(...),  # noqa: B008
    scope: str = Form('all'),
    num_results: int = Form(10),
):
    """Cross-modal image-to-video search via Twelve Labs embeddings."""
    query_image = PIL.Image.open(io.BytesIO(file.file.read()))
    results: list[dict] = []

    for view_path, source in [(config.BRAND_SEGMENTS_VIEW, 'brand'), (config.CREATOR_SEGMENTS_VIEW, 'creator')]:
        if scope not in ('all', source):
            continue
        v = pxt.get_table(view_path)
        sim = v.video_segment.similarity(image=query_image)
        data = v.order_by(sim, asc=False).limit(num_results).select(v.title, v.category, v.video_url, score=sim).collect()
        seen: set[str] = set()
        for i in range(len(data)):
            title = data['title'][i]
            if title not in seen:
                seen.add(title)
                results.append({
                    'id': len(results), 'title': title,
                    'category': data['category'][i], 'video_url': data['video_url'][i],
                    'score': round(float(data['score'][i]), 4), 'source': source,
                })

    results.sort(key=lambda x: x['score'], reverse=True)
    return {'results': results[:num_results], 'success': True}


@app.get('/api/mentions/videos')
def list_creator_videos_for_mentions():
    ct = pxt.get_table(config.CREATOR_VIDEOS_TABLE)
    data = ct.select(ct.title, ct.category, ct.video_url).collect()
    return {'videos': _rows(data, 'creator'), 'success': True}


@app.post('/api/mentions/analyze')
def analyze_brand_mentions(video_id: int = Form(0)):
    """Read pre-computed brand analysis from the frames view (openai.vision computed column)."""
    fv = pxt.get_table(config.CREATOR_FRAMES_VIEW)
    ct = pxt.get_table(config.CREATOR_VIDEOS_TABLE)

    video_data = ct.select(ct.title, ct.video_url).collect()
    if video_id >= len(video_data):
        raise HTTPException(404, 'Video not found')

    video_title = video_data['title'][video_id]
    video_url = video_data['video_url'][video_id]

    frame_data = fv.where(fv.title == video_title).select(fv.pos, fv.brand_analysis).collect()

    events: list[dict] = []
    for i in range(len(frame_data)):
        analysis = frame_data['brand_analysis'][i]
        if analysis is None:
            continue
        pos = float(frame_data['pos'][i])
        for brand in analysis.get('brands', []):
            events.append({
                'brand': brand, 'start_time': pos, 'end_time': pos + 5.0,
                'description': analysis.get('description', ''),
                'prominence': analysis.get('prominence', 'low'),
            })

    return {
        'video_title': video_title, 'video_url': video_url, 'video_id': video_id,
        'events': events, 'total_frames_analyzed': len(frame_data), 'success': True,
    }


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)
