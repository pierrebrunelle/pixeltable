# SiteWatch — Open-Source AI Video Intelligence

**Build your own [Conntour](https://www.conntour.com/) with ~190 lines of Python.**

Full-stack video intelligence platform built on [Pixeltable](https://github.com/pixeltable/pixeltable). Natural language search across video feeds, automated threat detection, cross-modal incident investigation, and related-event discovery — the same capabilities that [raised $7M from General Catalyst and YC](https://techcrunch.com/2026/03/26/conntour-raises-7m-from-general-catalyst-yc-to-build-an-ai-search-engine-for-security-video-systems/), built entirely open-source.

No Kafka, no Spark, no vector database, no object store, no ETL orchestrator. Just Pixeltable.

## Why This Exists

Conntour's platform lets security teams search video feeds with natural language — *"Find instances of someone passing a bag in the lobby"* — and surfaces related events with confidence scores. It's powerful, proprietary, and priced for enterprise.

SiteWatch demonstrates that the same core architecture is achievable with open-source tools and a fraction of the code. Pixeltable handles multimodal storage, AI pipelines, embedding indexes, and cross-modal retrieval as declarative infrastructure — the hard problems Conntour is solving with a team and $7M.

| Capability | Conntour | SiteWatch |
|------------|----------|-----------|
| Natural language video search | ✅ Proprietary VLMs | ✅ Gemini via Pixeltable |
| Cross-modal retrieval (text→video, image→video, audio→video) | ✅ | ✅ Gemini multimodal embeddings |
| Confidence/similarity scores | ✅ | ✅ Cosine similarity from embedding index |
| Related events discovery | ✅ | ✅ `.similarity()` on any result |
| Automated alert detection | ✅ Preset rules | ✅ Gemini severity classification |
| Incident reports / work orders | ✅ | ✅ Generated from AI assessment + asset metadata |
| Object detection & segmentation | ✅ | ✅ On-demand DETR panoptic |
| PPE compliance monitoring | — | ✅ Per-frame Gemini assessment |
| Audio transcription | — | ✅ Local Whisper |
| Scene boundary detection | — | ✅ PySceneDetect |
| On-premises deployment | ✅ | ✅ Runs fully local |
| Scales to 1000s of cameras | ✅ Custom infra | Pixeltable incremental processing |
| **Infrastructure code** | **Proprietary** | **~190 lines of declarative Python** |

## What SiteWatch Does

### 1. Natural Language Video Search

Type any query — *"water pooling near transformer"*, *"vehicle at perimeter gate"*, *"person without hardhat"* — and SiteWatch returns matching video segments, frames, and transcripts with similarity scores. Upload a reference image, video clip, or audio file for cross-modal retrieval.

### 2. Related Events

Click any search result to see related events across your entire archive. Pixeltable's embedding indexes make this a single `.similarity()` call — the same capability Conntour highlights as a core differentiator.

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

### 6. Condition-Based Maintenance

Upload footage from the same angle across inspections to track degradation over time — corrosion progression, vegetation growth, equipment discoloration. Pixeltable's incremental architecture processes only new data, building a longitudinal view of asset health.

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
│    │     └── On-demand DETR panoptic segmentation │
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
| Object Segmentation | DETR ResNet-50 Panoptic | On-demand pixel-level segmentation with annotated overlays |
| Scene Detection | PySceneDetect | Content-based scene boundary detection |

## Quick Start

```bash
cd docs/sample-apps/video-surveillance-platform

# Environment
cp .env.example .env       # add your GEMINI_API_KEY

# Backend
cd backend
uv sync
uv run python setup_pixeltable.py
uv run python main.py      # terminal 1

# Frontend
cd ../frontend
npm install
npm run dev                 # terminal 2
```

Open [http://localhost:5173](http://localhost:5173).

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
│   ├── functions.py          # Shared helpers and custom UDFs
│   ├── setup_pixeltable.py   # Schema definition (~190 lines)
│   ├── pyproject.toml
│   └── routers/
│       ├── videos.py         # Upload, list, delete, frames, scenes
│       ├── search.py         # Cross-modal search + related events
│       ├── browse.py         # Multi-medium browsing + on-demand DETR
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
