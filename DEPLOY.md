# Deployment Guide — Nursery Rhyme Video Pipeline

## PART 1: Get Your API Keys (15 minutes)

You need 4 API keys. Here's exactly where to get each one:

### 1. fal.ai — For Flux images + Kling video ($10 minimum top-up)
1. Go to https://fal.ai
2. Click "Sign Up" → sign in with GitHub or Google
3. Go to https://fal.ai/dashboard/keys
4. Click "Create Key" → copy the key
5. Add billing: Dashboard → Billing → add $10 credit
6. This key handles BOTH image generation (Flux) and video animation (Kling)

### 2. OpenAI — For Whisper timestamps ($5 minimum)
1. Go to https://platform.openai.com/signup
2. Create account → verify email
3. Go to https://platform.openai.com/api-keys
4. Click "Create new secret key" → copy it
5. Add billing: Settings → Billing → add $5 credit
6. Whisper is extremely cheap (~$0.006 per minute of audio)

### 3. Anthropic — For Claude scene descriptions ($5 minimum)
1. Go to https://console.anthropic.com
2. Create account → verify email
3. Go to Settings → API Keys → "Create Key" → copy it
4. Add billing: Settings → Billing → add $5 credit
5. Scene descriptions cost ~$0.02 per video

### 4. Suno API — For song generation
This is the trickiest one. Suno has no official public API.

**Option A: sunoapi.org (easiest)**
1. Go to https://sunoapi.org
2. Sign up → add credit
3. Get your API key from dashboard
4. Base URL: https://api.sunoapi.org

**Option B: Self-host the open-source wrapper (free, uses your Suno subscription)**
1. Get a Suno Pro subscription ($10/month) at https://suno.com
2. Clone https://github.com/gcui-art/suno-api
3. Extract your Suno cookie (instructions in their README)
4. Deploy it or run locally — it gives you a local API
5. Set SUNO_API_BASE to your self-hosted URL

**Option C: APIPASS (pay-per-generation)**
1. Go to https://apipass.io
2. Sign up → buy credits
3. Get API key

I recommend starting with Option A or C. If cost is a concern long-term, Option B.

---

## PART 2: Choose Your Deployment Method

### Option A: Run Locally on Your Machine (free, simplest)

Best for: Testing, small volume (1-5 videos per day)

**Prerequisites:**
- Node.js 18+ installed
- FFmpeg installed

**Install FFmpeg:**
```bash
# Mac
brew install ffmpeg

# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg -y

# Windows
# Download from https://ffmpeg.org/download.html
# Add to PATH
```

**Setup:**
```bash
# Unzip the project
unzip nursery-pipeline.zip
cd nursery-pipeline

# Setup backend
cd backend
cp .env.example .env
nano .env   # Paste all 4 API keys

npm install
npm start
# Server starts on http://localhost:3001

# In a new terminal — setup frontend
cd nursery-pipeline/frontend
npm install
npm run dev
# Frontend starts on http://localhost:3000
```

Open http://localhost:3000 in your browser. Done.

**For production-ready local use:**
```bash
# Build frontend once
cd frontend && npm run build

# Now just run the backend (it serves the built frontend)
cd ../backend && npm start
# Everything runs on http://localhost:3001
```

---

### Option B: Deploy to Render.com ($7-25/month)

Best for: Always-on, accessible from anywhere, no local machine needed

**Step 1: Push to GitHub**
```bash
cd nursery-pipeline
git init
git add .
git commit -m "Initial commit"

# Create a repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/nursery-pipeline.git
git branch -M main
git push -u origin main
```

**Step 2: Create Render account**
1. Go to https://render.com → Sign up with GitHub
2. Select "Starter" plan ($7/month) or "Standard" ($25/month, recommended)

**Step 3: Create Web Service**
1. Dashboard → New → Web Service
2. Connect your GitHub repo
3. Settings:
   - Name: nursery-pipeline
   - Runtime: Docker
   - Instance Type: Standard ($25/month) — Starter may not have enough RAM for FFmpeg
   - Region: Pick closest to you (Singapore or Frankfurt for Pakistan)

**Step 4: Add Environment Variables**
In the Render dashboard → your service → Environment:
```
SUNO_API_KEY = your_key_here
FAL_KEY = your_key_here
OPENAI_API_KEY = your_key_here
ANTHROPIC_API_KEY = your_key_here
PORT = 3001
OUTPUT_DIR = ./output
```

**Step 5: Add Disk (important!)**
Without a disk, generated videos disappear on restart.
1. Service → Disks → Add Disk
2. Name: video-output
3. Mount Path: /app/backend/output
4. Size: 10 GB ($2.50/month)

**Step 6: Deploy**
Click "Create Web Service". Render builds the Docker image and deploys.
Your app will be live at: https://nursery-pipeline.onrender.com

**Total Render cost: ~$27.50/month** (Standard instance + 10GB disk)

---

### Option C: Deploy to a VPS (cheapest for long-term, $5-10/month)

Best for: Maximum control, cheapest long-term, batch processing

**Recommended providers:**
- Hetzner: $4.50/month (2 vCPU, 4GB RAM) — best value
- DigitalOcean: $6/month (1 vCPU, 1GB RAM)
- Vultr: $6/month (1 vCPU, 1GB RAM)

**Step 1: Create VPS**
1. Sign up at hetzner.com (or your preferred provider)
2. Create a server: Ubuntu 24.04, 4GB RAM minimum
3. SSH into your server

**Step 2: Install dependencies**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install FFmpeg
sudo apt install -y ffmpeg

# Install Git
sudo apt install -y git

# Verify
node --version    # Should show v20.x
ffmpeg -version   # Should show ffmpeg version
```

**Step 3: Clone and setup**
```bash
cd /home
git clone https://github.com/YOUR_USERNAME/nursery-pipeline.git
cd nursery-pipeline

# Setup backend
cd backend
cp .env.example .env
nano .env    # Add your 4 API keys (press Ctrl+X, Y, Enter to save)
npm install

# Build frontend
cd ../frontend
npm install
npm run build
cd ..
```

**Step 4: Run with PM2 (keeps it alive)**
```bash
# Install PM2 process manager
sudo npm install -g pm2

# Start the server
cd /home/nursery-pipeline/backend
pm2 start server.js --name nursery-pipeline
pm2 save
pm2 startup   # Follow the printed command to enable auto-start on reboot
```

**Step 5: Setup domain + HTTPS (optional but recommended)**
```bash
# Install Nginx
sudo apt install -y nginx certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/nursery
```

Paste this config (replace YOUR_DOMAIN):
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN.com;

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 600s;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/nursery /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Get free HTTPS certificate
sudo certbot --nginx -d YOUR_DOMAIN.com
```

Your app is now live at https://YOUR_DOMAIN.com

**Total VPS cost: ~$5-10/month**

---

## PART 3: How to Use It

1. Open your app URL in a browser
2. Select language from dropdown
3. Enter song title
4. Paste complete lyrics
5. Pick song style (Classic Nursery, Upbeat, Lullaby, etc.)
6. Pick visual style (Cute Cartoon, 3D Pixar, Watercolor, etc.)
7. Pick resolution (720p for testing, 1080p for YouTube)
8. Click "Generate Video"
9. Watch the 6-step pipeline progress in real-time
10. When complete, click "Download Video"

**Video is saved at:** `output/{job-id}/your_title.mp4`

---

## PART 4: Timeline Per Video

| Step | What happens | Time |
|------|-------------|------|
| Suno | Generates song from lyrics | 30-60 sec |
| Whisper | Detects verse timing in audio | 5-10 sec |
| Claude | Writes image prompts per scene | 3-5 sec |
| Flux | Generates 10-15 scene images | 2-4 min |
| Kling | Animates each image to video | 20-40 min |
| FFmpeg | Stitches everything together | 30-60 sec |
| **Total** | | **~25-45 min** |

Kling (video animation) is the bottleneck. Each 5-10 second clip takes 2-4 minutes to generate, and they process sequentially. A typical nursery rhyme with 10 scenes takes about 30 minutes total.

**Tips to speed it up:**
- Use 720p for testing (faster Kling generation)
- Shorter lyrics = fewer scenes = faster generation
- You can queue multiple videos — they'll process back-to-back

---

## PART 5: Cost Per Video

| Service | What for | Cost |
|---------|----------|------|
| Suno | 1 song | $0.05-0.10 |
| Whisper | Timestamp detection | $0.01 |
| Claude | Scene descriptions | $0.02 |
| Flux | 10-15 images | $0.50-1.00 |
| Kling | 10-15 video clips | $1.50-5.00 |
| **Total** | | **$3-8 per video** |

At 3 videos per week = ~$12-24/week in API costs
At 5 videos per week = ~$20-40/week in API costs

---

## PART 6: Troubleshooting

**"Missing API keys" on startup**
→ Make sure .env file is in the backend/ folder with all 4 keys

**Suno generation fails**
→ Most common issue. Try regenerating. If persistent, switch Suno provider
→ Check if your Suno account/credits are active

**Kling video clips look weird**
→ AI artifacts happen. The motion prompts in scene.js can be tuned
→ Simpler motions ("gentle zoom in", "slight pan") produce better results

**FFmpeg assembly fails**
→ Make sure FFmpeg is installed: run `ffmpeg -version`
→ Check if video clips actually downloaded to the clips/ folder

**Videos are too short/long**
→ Video length = song length. Add more lyrics for longer videos
→ Suno generates 2-4 minute tracks depending on lyrics length

**Server crashes on Render**
→ Upgrade to Standard plan ($25/month) — Starter doesn't have enough RAM
→ Add a disk so output files don't fill the container

**Whisper timestamps are wrong for Urdu**
→ Try setting language to "auto" instead of "ur"
→ Whisper's Urdu support is decent but not perfect
