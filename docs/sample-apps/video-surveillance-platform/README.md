# SiteWatch — Video Surveillance Analysis Platform

A full-stack video surveillance analysis platform for utility and energy companies, powered by [Pixeltable](https://docs.pixeltable.com). Upload hundreds of surveillance videos and get automated AI analysis, multimodal search, severity-based alerting, and a rich multi-medium browsing experience.

## What It Does

- **Automated Video Analysis** — Each uploaded video is automatically processed through a Pixeltable pipeline: frame extraction, DETR panoptic segmentation, Gemini vision descriptions, scene detection, audio transcription, and severity classification
- **Multimodal Search** — Search your entire video library by text, reference image, or reference video clip using Twelve Labs Marengo embeddings (text-to-video, video-to-video, image-to-video)
- **Multi-Medium Browsing** — Browse all extracted media independently: video segments, frames, scenes, and transcripts with filtering and sorting
- **Smart Alerting** — Frames are automatically classified by severity (critical/warning/info) based on detected objects and AI descriptions
- **Per-Site Triage** — Filter everything by site, camera, severity, and date for efficient monitoring of multiple locations

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    Frontend                      │
│  React 19 + TypeScript + Tailwind CSS + Vite    │
│  Dashboard │ Videos │ Browse │ Search │ Alerts   │
└──────────────────────┬──────────────────────────┘
                       │ /api/*
┌──────────────────────┴──────────────────────────┐
│                FastAPI Backend                    │
│  routers: videos, search, browse, dashboard      │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│              Pixeltable (data layer)             │
│                                                  │
│  surveillance.videos          (source table)     │
│    ├── video_frames           (frame_iterator)   │
│    │     ├── DETR segmentation                   │
│    │     ├── Gemini vision descriptions          │
│    │     ├── Severity classification             │
│    │     └── Twelve Labs image embeddings        │
│    ├── video_segments         (video_splitter)   │
│    │     └── Twelve Labs video embeddings        │
│    ├── video_scenes           (scene_detect)     │
│    ├── audio_chunks           (audio_splitter)   │
│    │     └── Gemini transcription                │
│    └── video_sentences        (string_splitter)  │
│          └── Gemini text embeddings              │
└──────────────────────────────────────────────────┘
```

## AI Stack

| Component | Model | Purpose |
|-----------|-------|---------|
| Video Analysis | Gemini 2.5 Flash | Native whole-video analysis, frame descriptions, audio transcription |
| Text Embeddings | Gemini Embedding 001 | Semantic search on transcripts |
| Multimodal Embeddings | Twelve Labs Marengo 3.0 | Video/image/text/audio embeddings in one space |
| Object Segmentation | DETR (facebook/detr-resnet-50-panoptic) | Pixel-level panoptic segmentation on frames |
| Scene Detection | PySceneDetect | Content-based scene boundary detection |

## Prerequisites

- Python 3.10+
- Node.js 20+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- A Google API key ([get one here](https://aistudio.google.com/apikey))
- A Twelve Labs API key ([get one here](https://dashboard.twelvelabs.io/))

## Quick Start

```bash
# 1. Clone and navigate
cd docs/sample-apps/video-surveillance-platform

# 2. Set up environment
cp .env.example .env
# Edit .env and add your GOOGLE_API_KEY and TWELVELABS_API_KEY

# 3. Install backend dependencies
cd backend
uv sync
cd ..

# 4. Initialize the Pixeltable schema
cd backend
uv run python setup_pixeltable.py
cd ..

# 5. Install frontend dependencies
cd frontend
npm install
cd ..

# 6. Start the backend (terminal 1)
cd backend
uv run python main.py

# 7. Start the frontend dev server (terminal 2)
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Docker

```bash
cp .env.example .env
# Edit .env with your API keys
docker compose up --build
```

The app will be available at [http://localhost:8000](http://localhost:8000).

## Project Structure

```
├── backend/
│   ├── main.py               # FastAPI app
│   ├── config.py             # Configuration
│   ├── models.py             # Pydantic models
│   ├── functions.py          # Custom Pixeltable UDFs
│   ├── setup_pixeltable.py   # Schema definition
│   ├── pyproject.toml        # Python dependencies
│   └── routers/
│       ├── videos.py         # Upload, list, delete, frames, scenes
│       ├── search.py         # Multimodal search (text/image/video)
│       ├── browse.py         # Multi-medium browsing
│       └── dashboard.py      # Stats and alerts
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # 5-tab navigation
│   │   ├── components/
│   │   │   ├── dashboard/    # Overview stats and alerts
│   │   │   ├── videos/       # Upload and manage videos
│   │   │   ├── browse/       # Multi-medium explorer
│   │   │   ├── search/       # Multimodal search
│   │   │   └── alerts/       # Alert feed
│   │   ├── lib/api.ts        # Typed API client
│   │   └── types/index.ts    # TypeScript interfaces
│   └── package.json
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## Key Pixeltable Features Demonstrated

- **Native video input to Gemini** — Pass whole videos directly to `generate_content` for analysis
- **Frame extraction** — `frame_iterator(fps=1)` creates a view that extracts frames at 1 FPS
- **Video segmentation** — `video_splitter(duration=10)` creates overlapping 10-second clips
- **Panoptic segmentation** — `detr_for_segmentation` returns pixel-level scene understanding
- **Scene detection** — `scene_detect_content` finds scene boundaries automatically
- **Multimodal embeddings** — Twelve Labs `embed` indexes both video segments and frame images in one embedding space
- **Cross-modal search** — Search by text, image, or video clip against video segments using `similarity()`
- **Audio pipeline** — `extract_audio` → `audio_splitter` → Gemini transcription → `string_splitter` → Gemini text embeddings
- **Custom UDFs** — Severity classification and alert detection as `@pxt.udf` functions
- **Computed columns** — All analysis runs automatically when new videos are inserted

## License

Apache 2.0 — same as Pixeltable.
