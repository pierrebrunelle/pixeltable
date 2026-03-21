# Keyword Trailer Generator

Generate on-demand video trailers by searching scenes with natural language keywords. No generative AI needed — just Pixeltable, CLIP embeddings, and ffmpeg.

## How It Works

```
Video → scene_detect → video_splitter → frame_iterator → CLIP index
                                                             ↓
                         trailer.mp4 ← concat_videos ← similarity("keyword")
```

1. **Ingest**: paste a video URL. Pixeltable detects scene boundaries (PySceneDetect), splits the video into clips (ffmpeg), and extracts representative frames.
2. **Index**: each frame is embedded with [OpenAI CLIP](https://huggingface.co/openai/clip-vit-base-patch32). An embedding index enables instant text-to-image similarity search.
3. **Search**: type a keyword like "sunset", "people dancing", or "city at night". CLIP finds the most visually similar frames.
4. **Trailer**: the top matching scenes are concatenated into a single playable video.

Everything runs locally. No API keys required.

## Pixeltable Features Used

| Feature | Purpose |
|---------|---------|
| `scene_detect_content()` | Detect scene boundaries in the source video |
| `video_splitter()` | Split the video into scene clips |
| `FrameIterator` | Extract representative frames from each clip |
| `add_embedding_index()` | Build a CLIP vector index on frames |
| `.similarity(string=...)` | Text-to-image similarity search |
| `concat_videos()` | Stitch matching clips into a trailer |

## Prerequisites

- Python 3.10+
- Node.js 18+
- ffmpeg (`brew install ffmpeg` on macOS, `apt install ffmpeg` on Linux)

## Setup

### Backend

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The server starts at `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

## Usage

1. Paste a video URL and click **Add Video**. The pipeline runs automatically:
   - Scene detection (~5s per minute of video)
   - Frame extraction and CLIP embedding (~30s per minute of video)

2. Type a keyword and click **Search**. You'll see matching frames with their scene timestamps and similarity scores.

3. Adjust the number of scenes and click **Build Trailer**. The trailer plays inline.

## Sample Videos

Try these free Pexels videos:

- [Real estate walkthrough](https://videos.pexels.com/video-files/7347880/7347880-hd_1920_1080_25fps.mp4)
- [City timelapse](https://videos.pexels.com/video-files/3129671/3129671-uhd_2560_1440_30fps.mp4)
- [Nature montage](https://videos.pexels.com/video-files/857251/857251-hd_1920_1080_25fps.mp4)

## Architecture

```
keyword-trailer-generator/
├── backend/
│   ├── app.py              # FastAPI + Pixeltable pipeline
│   └── requirements.txt
├── frontend/
│   ├── src/app/page.tsx    # React UI (Next.js + Tailwind)
│   ├── src/lib/api.ts      # API client
│   └── src/lib/types.ts    # TypeScript types
└── README.md
```

## Related

- [Video Scene Detection cookbook](../../release/howto/cookbooks/video/video-scene-detection.ipynb)
- [Text & Image Similarity Search app](../text-and-image-similarity-search-nextjs-fastapi/)
- [AI Video Ad Generator cookbook](../../release/howto/cookbooks/video/video-ad-generator.ipynb)
- [Pixeltable Docs](https://docs.pixeltable.com)
