# Creator Discovery App

AI-powered creator-brand matching platform built on [Pixeltable](https://github.com/pixeltable/pixeltable) and [Twelve Labs](https://twelvelabs.io/).

Pixeltable is the full data backend: storage, transformation, embedding, indexing, orchestration, and retrieval in one system. No Pinecone, no separate vector DB, no glue code.

## Features

| Feature | Pixeltable Concepts |
|---------|---------------------|
| **Creator-Brand Match** | `add_embedding_index`, `.similarity()`, `video_splitter` |
| **Semantic Search** | Cross-modal embeddings, text-to-video search |
| **Brand Mention Detection** | `frame_iterator`, computed columns, `openai.vision` |

## How It Works

### Feature 1: Creator-Brand Match

Insert a video and Pixeltable handles everything: storage, segmentation, embedding, and indexing. Query with one line.

```
INSERT video --> Pixeltable auto-pipeline:
                  |-- store video (managed storage)
                  |-- video_splitter (5s chunks)
                  |-- Twelve Labs embed (title -> 512-dim vector)
                  +-- pgvector index (automatic)

QUERY:
  sim = target.title.similarity(string=source_title)
  target.order_by(sim).limit(5).collect()
  ^-- storage + embedding + indexing + retrieval = one call
```

### Feature 2: Semantic Search

Same embedding index, different query modalities. marengo3.0 puts text, images, and video in the same space:

```
TEXT:   sim = table.title.similarity(string="luxury travel")
IMAGE:  sim = segments.video_segment.similarity(image=pil_image)
        segments.order_by(sim, asc=False).limit(10).collect()
```

### Feature 3: Brand Mention Detection

Declarative pipeline: insert triggers frame extraction + vision analysis automatically. The API endpoint does zero AI work.

```
INSERT video --> Pixeltable auto-pipeline:
                  |-- frame_iterator (1 frame / 5s)
                  |-- openai.vision(prompt, frame)        <-- computed column
                  +-- parse_brand_mentions(response)       <-- @pxt.udf

API reads pre-computed results:
  fv.where(fv.title == title).select(fv.pos, fv.brand_analysis).collect()
```

## Project Structure

```
config.py              Settings, model IDs, YouTube sample data
functions.py           @pxt.udf: parse_brand_mentions, gemini_analyze_frame
setup_pixeltable.py    Schema: tables, views, indexes, computed columns (idempotent)
app.py                 FastAPI routes: thin read layer over Pixeltable
frontend/              Next.js 15 + TypeScript + Tailwind CSS
```

## Setup

### Backend

```bash
cd docs/sample-apps/creator-discovery-app
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pip uninstall uvloop -y   # incompatible with Pixeltable nest_asyncio

export TWELVELABS_API_KEY=your_key
export OPENAI_API_KEY=your_key   # optional, for brand mentions

python app.py   # auto-seeds YouTube sample videos on first run
```

### Frontend

```bash
cd frontend && npm install && npm run dev
```

### Verify

- API docs: http://localhost:8000/docs
- Frontend: http://localhost:3000

## Notes

- Always run `python app.py` (single process). Do NOT use `fastapi dev`.
- Switch vision provider: `export VISION_PROVIDER=gemini`
- Stack: Python, FastAPI, Pixeltable (full backend), Twelve Labs, Next.js, Tailwind
