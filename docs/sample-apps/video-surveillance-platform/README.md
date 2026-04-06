# SiteWatch — Open-Source AI Video Intelligence for Utilities

**Enterprise-grade video intelligence in ~190 lines of declarative Python.**

Full-stack video intelligence platform built on [Pixeltable](https://github.com/pixeltable/pixeltable) for utility and energy companies. Natural language search across drone and CCTV feeds, automated threat detection, cross-modal incident investigation, and related-event discovery — capabilities that proprietary platforms charge six figures for, built entirely open-source.

No Kafka, no Spark, no vector database, no object store, no ETL orchestrator. Just Pixeltable.

## The Problem

Major utilities conduct over **100,000 drone flights per year** — hundreds of assessments daily across substations, transmission lines, generation sites, and rights-of-way. Each flight produces hours of video, thermal imaging, and audio.

- **Human review doesn't scale.** No team can watch 400 flights a day and reliably catch vegetation encroachment, corrosion, missing PPE, or flood damage.
- **Data lives in silos.** Video in one system, thermal data in another, audio in a third, text reports in SharePoint. None of it is cross-searchable.
- **Insights are reactive.** Corrosion on a transformer may have been visible for months in archived footage nobody reviewed.
- **Proprietary platforms are expensive.** Enterprise video intelligence solutions require specialized hardware, vendor lock-in, and six-figure contracts.

SiteWatch shows there's another way. Pixeltable treats video, audio, images, and text as first-class citizens in a unified, queryable data layer — giving utility teams the same AI-powered capabilities in an open-source stack they fully control.

| Capability | Proprietary Platforms | SiteWatch + Pixeltable |
|------------|----------------------|------------------------|
| Natural language video search | ✅ Proprietary VLMs | ✅ Gemini via Pixeltable |
| Cross-modal retrieval (text→video, image→video, audio→video) | ✅ | ✅ Gemini multimodal embeddings |
| Confidence / similarity scores | ✅ | ✅ Cosine similarity from embedding index |
| Related events discovery | ✅ | ✅ `.similarity()` on any result |
| Automated alert detection | ✅ Preset rules | ✅ Gemini severity classification |
| Incident reports / work orders | ✅ | ✅ Generated from AI assessment + asset metadata |
| Object detection & segmentation | ✅ | ✅ Auto DETR panoptic (computed column) |
| PPE compliance monitoring | Limited | ✅ Per-frame Gemini assessment |
| Audio transcription | Limited | ✅ Local Whisper |
| Scene boundary detection | Varies | ✅ PySceneDetect |
| On-premises / air-gapped deployment | ✅ (at cost) | ✅ Runs fully local |
| Scales to 1000s of cameras | ✅ Custom infra | Pixeltable incremental processing |
| **Infrastructure code** | **Proprietary** | **~190 lines of declarative Python** |

## What SiteWatch Does

### 1. Natural Language Video Search

Type any query — *"water pooling near transformer"*, *"vehicle at perimeter gate"*, *"person without hardhat"* — and SiteWatch returns matching video segments, frames, and transcripts with similarity scores. Upload a reference image, video clip, or audio file for cross-modal retrieval.

### 2. Related Events

Click any search result to see related events across your entire archive. Pixeltable's embedding indexes make this a single `.similarity()` call — turning months of footage into a searchable knowledge graph.

### 3. Automated Equipment Audit

Upload a video — Pixeltable's computed columns trigger a full AI pipeline automatically:

- **Gemini whole-video analysis** — equipment condition, worker safety, environmental hazards, security events
- **Frame-level inspection** — corrosion, overheating indicators, vegetation encroachment, switch positions, gauge readings
- **Severity classification** — CRITICAL / WARNING / INFO per frame
- **PPE compliance** — hardhat, vest, gloves, safety glasses check per worker
- **Audio transcription** — Whisper-based local speech-to-text on extracted audio chunks

### 4. Alerting and Work Order Generation

CRITICAL/WARNING frames surface automatically. From any flagged frame, generate a mock work order combining AI assessment, asset ID, GPS coordinates, and severity — demonstrating integration with ServiceNow or SAP.

### 5. Cross-Modal Incident Investigation

Gemini multimodal embeddings project text, images, audio, and video into a single semantic space:

| Query Type | Searches | Example |
|------------|----------|---------|
| Text | Frames, segments, transcripts | *"water pooling near transformer"* |
| Image | Frames, segments | Upload a photo of corrosion to find similar conditions |
| Video clip | Segments, frames | Upload sparking equipment to find other incidents |
| Audio | Segments | Upload an alarm sample to find matching events |

After a hurricane, search *"downed lines near substation"* — the system returns exact timestamps, frames, and clips across every flight in the archive.

### 6. Condition-Based Maintenance

Upload footage from the same angle across inspections to track degradation over time — corrosion progression, vegetation growth, equipment discoloration. Pixeltable's incremental architecture processes only new data, building a longitudinal view of asset health. This replaces fixed inspection schedules with data-driven maintenance decisions.

## The Pixeltable Advantage

What makes this possible in ~190 lines:

```python
# Cross-modal search in 3 lines
sim = frames.frame.similarity(string="person near transformer")
results = frames.order_by(sim, asc=False).limit(10).collect()

# Related events in 2 lines
sim = segments.video_segment.similarity(video=result_path)
related = segments.order_by(sim, asc=False).limit(8).collect()

# Automated AI pipeline: just declare it
t.add_computed_column(severity=gemini(t.frame, prompt=SEVERITY_PROMPT))
t.add_computed_column(ppe=gemini(t.frame, prompt=PPE_PROMPT))
# Runs automatically on every new row. No DAGs, no queues.
```

Replaces five+ infrastructure services (object store, video pipeline, orchestrator, vector DB, LLM gateway) with one declarative framework:

- **Computed columns** — AI analysis runs automatically on insert. No DAGs, no queues, no schedulers.
- **Multimodal iterators** — `frame_iterator`, `video_splitter`, `audio_splitter`, `string_splitter` decompose video into frames, clips, audio chunks, sentences as materialized views.
- **Multimodal embeddings** — `embed_content` indexes frames, segments, and text in one space. Cross-modal search with a single `similarity()` call.
- **Incremental processing** — only new data is processed. Second inspection of the same asset computes only the delta.
- **Idempotent schema** — `if_exists='ignore'` everywhere. Safe to re-run at any time.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    Frontend                      │
│  React 19 + TypeScript + Tailwind CSS + Vite    │
│  Operations │ Inspections │ Investigate │ Alerts │
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
│    │     ├── Gemini condition assessment          │
│    │     ├── Gemini severity classification       │
│    │     ├── Gemini PPE compliance check          │
│    │     ├── Gemini multimodal image embeddings   │
│    │     ├── DETR panoptic segmentation (auto)     │
│    │     └── Segmentation overlay visualization    │
│    ├── video_segments         (video_splitter)    │
│    │     └── Gemini multimodal video embeddings   │
│    ├── scene_cuts             (scene_detect)      │
│    ├── audio_chunks           (audio_splitter)    │
│    │     └── Whisper local transcription            │
│    └── video_sentences        (string_splitter)   │
│          └── Gemini text embeddings               │
└───────────────────────────────────────────────────┘
```

## AI Stack

| Component | Model | Purpose |
|-----------|-------|---------|
| Video Analysis | Gemini 2.5 Flash | Whole-video assessment, frame condition reports, severity, PPE |
| Audio Transcription | OpenAI Whisper (local) | Speech-to-text on extracted audio chunks |
| Multimodal Embeddings | Gemini Embedding 2 | Text, image, audio, video in one shared semantic space |
| Object Segmentation | DETR ResNet-50 Panoptic | Auto per-frame panoptic segmentation + overlay (computed column) |
| Scene Detection | PySceneDetect | Content-based scene boundary detection |

## Quick Start

```bash
cd docs/sample-apps/video-surveillance-platform

# Environment
cp .env.example .env       # add your GEMINI_API_KEY

# Backend
cd backend
uv sync
uv run python setup_pixeltable.py   # create Pixeltable schema
uv run python main.py               # start server (terminal 1)

# Load sample data (12 utility/energy videos from Pexels, CC0 licensed)
pip install yt-dlp                   # one-time install
uv run python seed_data.py           # downloads + uploads + triggers AI pipeline

# Frontend (optional — backend also serves the built frontend)
cd ../frontend
npm install
npm run dev                          # terminal 2
```

Open [http://localhost:5173](http://localhost:5173) (dev) or [http://localhost:8000](http://localhost:8000) (production build).

## Docker

```bash
cp .env.example .env       # add your GEMINI_API_KEY
docker compose up --build
```

Available at [http://localhost:8000](http://localhost:8000).

## Project Structure

```
├── backend/
│   ├── main.py               # FastAPI app
│   ├── config.py             # Configuration and Gemini prompts
│   ├── models.py             # Pydantic response models
│   ├── functions.py          # Shared helpers (severity parsing, text extraction)
│   ├── setup_pixeltable.py   # Schema definition (Pixeltable primitives only)
│   ├── seed_data.py          # Download & upload 12 sample videos
│   ├── pyproject.toml
│   └── routers/
│       ├── videos.py         # Upload, list, delete, frames, scenes
│       ├── search.py         # Cross-modal search + related events
│       ├── browse.py         # Multi-medium browsing + pre-computed detections
│       └── dashboard.py      # ROI metrics, alerts, activity
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/       # dashboard, videos, browse, search, alerts
│   │   ├── lib/api.ts
│   │   └── types/index.ts
│   └── package.json
├── .env.example
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## License

Apache 2.0 — same as Pixeltable.
