# SiteWatch — AI-Powered Asset Monitoring for Utilities

Full-stack video intelligence platform built on [Pixeltable](https://github.com/pixeltable/pixeltable). Transforms raw drone and CCTV footage into a proactive maintenance engine — auditing every frame for equipment condition, safety compliance, environmental hazards, and security events, then making the entire archive searchable across modalities.

**~190 lines of declarative Python** (`setup_pixeltable.py` + `config.py`). No Kafka, no Spark, no vector database, no object store, no ETL orchestrator. Just Pixeltable.

## The Problem

Major utilities conduct over **100,000 drone flights per year** — hundreds of assessments daily across substations, transmission lines, generation sites, and rights-of-way. Each flight produces hours of video, thermal imaging, and audio.

- **Human review doesn't scale.** No team can watch 400 flights a day and reliably catch vegetation encroachment, corrosion, missing PPE, or flood damage.
- **Data lives in silos.** Video in one system, thermal data in another, audio in a third, text reports in SharePoint. None of it is cross-searchable.
- **Insights are reactive.** Corrosion on a transformer may have been visible for months in archived footage nobody reviewed.

Pixeltable eliminates this by treating video, audio, images, and text as first-class citizens in a unified, queryable data layer.

## What SiteWatch Does

### 1. Automated Equipment Audit

Upload a video — Pixeltable's computed columns trigger a full AI pipeline automatically:

- **Gemini whole-video analysis** — equipment condition, worker safety, environmental hazards, security events
- **Frame-level inspection** — corrosion, overheating indicators, vegetation encroachment, switch positions, gauge readings
- **Severity classification** — CRITICAL / WARNING / INFO per frame
- **PPE compliance** — hardhat, vest, gloves, safety glasses check per worker
- **Audio transcription** — radio comms, alarm tones, equipment sounds, safety callouts

### 2. Alerting and Work Order Generation

CRITICAL/WARNING frames surface automatically. From any flagged frame, generate a mock work order combining AI assessment, asset ID, GPS coordinates, and severity — demonstrating integration with ServiceNow or SAP.

### 3. PPE Compliance Monitoring

Every frame is evaluated for PPE compliance: each visible worker checked for required gear, rated COMPLIANT / PARTIAL / NON-COMPLIANT. Continuous automated safety auditing across all sites.

### 4. Cross-Modal Incident Investigation

Gemini multimodal embeddings project text, images, audio, and video into a single semantic space:

| Query Type | Searches | Example |
|------------|----------|---------|
| Text | Frames, segments, transcripts | *"water pooling near transformer"* |
| Image | Frames, segments | Upload a photo of corrosion to find similar conditions |
| Video clip | Segments, frames | Upload sparking equipment to find other incidents |
| Audio | Segments | Upload an alarm sample to find matching events |

After a hurricane, search *"downed lines near substation"* — the system returns exact timestamps, frames, and clips across every flight in the archive.

### 5. Condition-Based Maintenance

Upload footage from the same angle across inspections to track degradation over time — corrosion progression, vegetation growth, equipment discoloration. Pixeltable's incremental architecture processes only new data, building a longitudinal view of asset health. This replaces fixed inspection schedules with data-driven maintenance decisions.

## Demo Walkthrough

### Act 1: Operations Overview

**Operations** tab. Dashboard shows ROI metrics:

- **Anomalies Detected** — CRITICAL + WARNING frames
- **Critical Alerts** — most urgent findings
- **Sites Monitored** — distinct locations
- **Estimated Cost Savings** — ~$300/remote inspection vs. truck roll
- **Severity Breakdown** — CRITICAL / WARNING / INFO distribution

*"Every upload triggers a complete automated audit. Hours of analyst review reduced to minutes, every finding categorized and searchable."*

### Act 2: Automated Dispatch

**Inspections** tab. Browse frames. Find a WARNING — vegetation encroachment, corrosion, missing hardhat.

1. Open frame detail — full AI condition assessment
2. Review severity and PPE compliance
3. Note asset ID and GPS linking to specific equipment
4. Click **"Generate Work Order"** — structured dispatch from all findings

*"Raw drone footage to an actionable ServiceNow ticket in seconds. Corrosion detected on XFMR-SUB-B-014 at 37.77, -122.42 — maintenance dispatched without a human watching the video."*

### Act 3: Post-Storm Triage

**Investigate** tab. The incident investigation tool.

1. Text search *"water pooling near equipment"* — matching frames, segments, transcripts across all videos
2. Upload a flood photo — finds visually similar conditions
3. Upload alarm audio — finds segments with matching events

*"After hurricane season, search by text, photo, clip, or audio — find the exact moment across your entire archive."*

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
│    │     └── Gemini transcription                 │
│    └── video_sentences        (string_splitter)   │
│          └── Gemini text embeddings               │
└───────────────────────────────────────────────────┘
```

## AI Stack

| Component | Model | Purpose |
|-----------|-------|---------|
| Video Analysis | Gemini 2.5 Flash | Whole-video assessment, frame condition reports, severity, PPE, transcription |
| Multimodal Embeddings | Gemini Embedding 001 | Text, image, audio, video in one shared semantic space |
| Object Segmentation | DETR ResNet-50 Panoptic | On-demand pixel-level segmentation with annotated overlays |
| Scene Detection | PySceneDetect | Content-based scene boundary detection |

## Why Pixeltable

Replaces five+ infrastructure services (object store, video pipeline, orchestrator, vector DB, LLM gateway) with one declarative framework:

- **Computed columns** — AI analysis runs automatically on insert. No DAGs, no queues, no schedulers.
- **Multimodal iterators** — `frame_iterator`, `video_splitter`, `audio_splitter`, `string_splitter` decompose video into frames, clips, audio chunks, sentences as materialized views.
- **Multimodal embeddings** — `embed_content` indexes frames, segments, and text in one space. Cross-modal search with a single `similarity()` call.
- **Incremental processing** — only new data is processed. Second inspection of the same asset computes only the delta.
- **Idempotent schema** — `if_exists='ignore'` everywhere. Safe to re-run at any time.

A single source of truth for multimodal data — a digital twin where raw media, AI insights, and operational metadata coexist in one queryable system.

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
│       ├── search.py         # Cross-modal search (text/image/video/audio)
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
