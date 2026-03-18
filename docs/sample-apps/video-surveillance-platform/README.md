
# SiteWatch — Video Surveillance Analysis Platform

A full-stack video surveillance analysis platform for utility and energy companies, powered by [Pixeltable](https://docs.pixeltable.com). Upload hundreds of surveillance videos and get automated AI analysis, multimodal search, severity-based alerting, and a rich multi-medium browsing experience.

## What It Does

- **Automated Video Analysis** — Each uploaded video is automatically processed through a Pixeltable pipeline: frame extraction, Gemini vision descriptions, scene detection, audio transcription, and severity classification
- **Multimodal Search** — Search your entire video library by text, reference image, video clip, or audio using Gemini multimodal embeddings (text-to-video, video-to-video, image-to-video, audio-to-video)
- **Multi-Medium Browsing** — Browse all extracted media independently: video segments, frames, scenes, audio, and on-demand DETR object detection
- **Smart Alerting** — Frames are automatically classified by severity based on AI descriptions
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
│    │     ├── Gemini vision descriptions          │
│    │     ├── Gemini multimodal image embeddings  │
│    │     └── On-demand DETR detection            │
│    ├── video_segments         (video_splitter)   │
│    │     └── Gemini multimodal video embeddings  │
│    ├── scene_cuts             (scene_detect)     │
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
| Multimodal Embeddings | Gemini Embedding 001 | Text, image, audio, and video embeddings in one shared space |
| Object Segmentation | DETR (facebook/detr-resnet-50-panoptic) | On-demand pixel-level panoptic segmentation on frames |
| Scene Detection | PySceneDetect | Content-based scene boundary detection |

## Prerequisites

- Python 3.10+
- Node.js 20+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- A Google API key ([get one here](https://aistudio.google.com/apikey))

## Quick Start

```bash
# 1. Clone and navigate
cd docs/sample-apps/video-surveillance-platform

# 2. Set up environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

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
# Edit .env with your API key
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
│       ├── search.py         # Multimodal search (text/image/video/audio)
│       ├── browse.py         # Multi-medium browsing + on-demand DETR
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
- **On-demand DETR** — Panoptic segmentation and object detection via API endpoint (no precomputed overhead)
- **Scene detection** — `scene_detect_content` finds scene boundaries automatically
- **Gemini multimodal embeddings** — `embed_content` indexes frames, video segments, and text in one shared embedding space
- **Cross-modal search** — Search by text, image, video clip, or audio against all media using `similarity()`
- **Audio pipeline** — `extract_audio` → `audio_splitter` → Gemini transcription → `string_splitter` → Gemini text embeddings
- **Computed columns** — All analysis runs automatically when new videos are inserted

## License

Apache 2.0 — same as Pixeltable.
