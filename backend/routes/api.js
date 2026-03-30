const express = require('express');
const path = require('path');
const fs = require('fs');

function createRoutes(pipeline) {
  const router = express.Router();

  // POST /api/generate - Start a new video generation job
  router.post('/generate', (req, res) => {
    const { lyrics, songTitle, songStyle, visualStyle, channelName, language, resolution, videoProvider } = req.body;

    if (!lyrics || !lyrics.trim()) {
      return res.status(400).json({ error: 'Lyrics are required' });
    }
    if (!songTitle || !songTitle.trim()) {
      return res.status(400).json({ error: 'Song title is required' });
    }

    try {
      const jobId = pipeline.startJob({
        lyrics: lyrics.trim(),
        songTitle: songTitle.trim(),
        songStyle: songStyle?.trim() || '',
        visualStyle: visualStyle?.trim() || '',
        channelName: channelName?.trim() || '',
        language: language?.trim() || 'auto',
        resolution: resolution?.trim() || '1280x720',
        videoProvider: videoProvider?.trim() || 'wan21'
      });

      res.json({
        success: true,
        jobId,
        message: 'Video generation started'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/jobs - List all jobs
  router.get('/jobs', (req, res) => {
    const jobs = pipeline.getAllJobs();
    res.json(jobs.map(j => ({
      id: j.id,
      title: j.input?.songTitle,
      status: j.status,
      progress: j.progress,
      currentStep: j.currentStep,
      steps: j.steps,
      error: j.error,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      hasVideo: !!j.finalVideoPath
    })));
  });

  // GET /api/jobs/:id - Get job status
  router.get('/jobs/:id', (req, res) => {
    const job = pipeline.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      id: job.id,
      input: job.input,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      steps: job.steps,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      hasVideo: !!job.finalVideoPath
    });
  });

  // GET /api/jobs/:id/video - Download final video
  router.get('/jobs/:id/video', (req, res) => {
    const job = pipeline.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    if (!job.finalVideoPath || !fs.existsSync(job.finalVideoPath)) {
      return res.status(404).json({ error: 'Video not ready yet' });
    }

    const filename = path.basename(job.finalVideoPath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'video/mp4');
    fs.createReadStream(job.finalVideoPath).pipe(res);
  });

  // GET /api/jobs/:id/scenes - Get scene breakdown (for debugging/preview)
  router.get('/jobs/:id/scenes', (req, res) => {
    const job = pipeline.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const scenesPath = path.join(job.outputDir, 'scenes.json');
    if (fs.existsSync(scenesPath)) {
      const scenes = JSON.parse(fs.readFileSync(scenesPath, 'utf-8'));
      res.json(scenes);
    } else {
      res.json([]);
    }
  });

  // GET /api/jobs/:id/images/:index - Preview a scene image
  router.get('/jobs/:id/images/:index', (req, res) => {
    const job = pipeline.getJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const idx = String(req.params.index).padStart(3, '0');
    const imagePath = path.join(job.outputDir, 'images', `scene_${idx}.png`);

    if (fs.existsSync(imagePath)) {
      res.setHeader('Content-Type', 'image/png');
      fs.createReadStream(imagePath).pipe(res);
    } else {
      res.status(404).json({ error: 'Image not found' });
    }
  });

  return router;
}

module.exports = createRoutes;
