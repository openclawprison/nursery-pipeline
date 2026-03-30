# 🎬 Nursery Rhyme Video Pipeline

Fully automated Urdu nursery rhyme video generation.
Paste lyrics → Get a complete animated music video.

## Pipeline

```
Urdu Lyrics
  → Suno AI (generates song audio)
  → Whisper (auto-detects verse timestamps)
  → Claude (generates scene descriptions)
  → Flux (generates scene images)
  → Kling (animates images into video clips)
  → FFmpeg (assembles final video with audio + subtitles)
  → Final MP4 ✅
```

## Cost Per Video

| Service | Purpose | ~Cost |
|---------|---------|-------|
| Suno | Song audio | $0.05-0.10 |
| Whisper | Timestamps | $0.01 |
| Claude | Scene prompts | $0.02 |
| Flux | Images (10-15) | $0.50-1.00 |
| Kling | Video clips (10-15) | $1.50-5.00 |
| FFmpeg | Assembly | Free |
| **Total** | | **~$3-8** |

## Setup

### 1. Get API Keys

| Service | Sign Up | What For |
|---------|---------|----------|
| Suno API | https://sunoapi.org | Song generation |
| fal.ai | https://fal.ai | Flux images + Kling video |
| OpenAI | https://platform.openai.com | Whisper timestamps |
| Anthropic | https://console.anthropic.com | Claude scene descriptions |

### 2. Install Dependencies

```bash
# Install FFmpeg (required for video assembly)
# Ubuntu/Debian:
sudo apt install ffmpeg

# macOS:
brew install ffmpeg

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Configure API Keys

```bash
cd backend
cp .env.example .env
# Edit .env and add your API keys
```

### 4. Run

```bash
# Terminal 1: Backend
cd backend
npm start

# Terminal 2: Frontend (dev mode)
cd frontend
npm run dev
```

Open http://localhost:3000 in your browser.

### 5. Build for Production

```bash
# Build frontend
cd frontend
npm run build

# The backend will serve the built frontend automatically
cd ../backend
npm start
# Everything runs on http://localhost:3001
```

## Deploy to Render

1. Push this repo to GitHub
2. Create a new Web Service on Render
3. Set build command: `cd frontend && npm install && npm run build && cd ../backend && npm install`
4. Set start command: `cd backend && npm start`
5. Add environment variables (all 4 API keys)
6. Make sure FFmpeg is available (Render includes it by default)

## Usage

1. Open the web UI
2. Enter your Urdu lyrics (RTL supported)
3. Choose song style (Classic Nursery, Upbeat, Lullaby, etc.)
4. Choose visual style (Cute Cartoon, 3D Pixar, Watercolor, etc.)
5. Click "Generate Video"
6. Wait ~15-30 minutes for the pipeline to complete
7. Download your finished MP4

## Project Structure

```
nursery-pipeline/
├── backend/
│   ├── server.js              # Express server
│   ├── routes/api.js          # API endpoints
│   ├── jobs/pipeline.js       # Main orchestrator
│   └── services/
│       ├── suno.js            # Suno music generation
│       ├── whisper.js         # Whisper timestamp extraction
│       ├── scene.js           # Claude scene descriptions
│       ├── image.js           # Flux image generation (fal.ai)
│       ├── video.js           # Kling video generation (fal.ai)
│       └── assembly.js        # FFmpeg final assembly
├── frontend/
│   ├── src/App.jsx            # React dashboard
│   └── vite.config.js         # Vite dev config
└── README.md
```

## Customization

### Visual Style
Edit the system prompt in `backend/services/scene.js` to change the default art style.
Add more presets in `frontend/src/App.jsx` under `VISUAL_PRESETS`.

### Subtitle Styling
Edit the ASS subtitle template in `backend/services/assembly.js` to change font, size, colors, position.

### Video Quality
Adjust FFmpeg settings in `backend/services/assembly.js`:
- `-crf` lower = better quality (18-23 recommended)
- `-preset` slower = better compression
- `-s` resolution (1280x720 default)

### Batch Processing
The pipeline supports multiple concurrent jobs. Submit multiple songs and they'll process in parallel (limited by API rate limits).
