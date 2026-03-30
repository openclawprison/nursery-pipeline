require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const Pipeline = require('./jobs/pipeline');
const createRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static frontend files (after build)
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// Create output directory
const outputDir = process.env.OUTPUT_DIR || './output';
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Initialize pipeline
const pipeline = new Pipeline();

// API routes
app.use('/api', createRoutes(pipeline));

// Health check
app.get('/api/health', (req, res) => {
  const apiStatus = {
    suno: !!process.env.SUNO_API_KEY,
    fal: !!process.env.FAL_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY
  };

  res.json({
    status: 'ok',
    apis: apiStatus,
    allConfigured: Object.values(apiStatus).every(v => v),
    missingApis: Object.entries(apiStatus).filter(([, v]) => !v).map(([k]) => k)
  });
});

// Serve frontend for any non-API route (SPA)
app.get('*', (req, res) => {
  if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
    res.sendFile(path.join(frontendDist, 'index.html'));
  } else {
    res.json({
      message: 'Nursery Rhyme Video Pipeline API',
      docs: {
        'POST /api/generate': 'Start video generation',
        'GET /api/jobs': 'List all jobs',
        'GET /api/jobs/:id': 'Get job status',
        'GET /api/jobs/:id/video': 'Download final video',
        'GET /api/health': 'Check API key status'
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎬 Nursery Rhyme Video Pipeline`);
  console.log(`   Server running on http://localhost:${PORT}`);
  console.log(`   Output directory: ${path.resolve(outputDir)}\n`);

  // Check API keys
  const missing = [];
  if (!process.env.SUNO_API_KEY) missing.push('SUNO_API_KEY');
  if (!process.env.FAL_KEY) missing.push('FAL_KEY');
  if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');

  if (missing.length > 0) {
    console.log(`   ⚠️  Missing API keys: ${missing.join(', ')}`);
    console.log(`   Copy .env.example to .env and add your keys\n`);
  } else {
    console.log(`   ✅ All API keys configured\n`);
  }
});
