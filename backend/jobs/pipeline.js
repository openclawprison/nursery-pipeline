const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const SunoService = require('../services/suno');
const WhisperService = require('../services/whisper');
const SceneService = require('../services/scene');
const ImageService = require('../services/image');
const VideoService = require('../services/video');
const AssemblyService = require('../services/assembly');

// In-memory job store (replace with Redis/DB for production)
const jobs = new Map();

class Pipeline {
  constructor() {
    // Services initialized lazily when first job runs
    this._services = null;
    this.outputBase = process.env.OUTPUT_DIR || './output';
  }

  get services() {
    if (!this._services) {
      this._services = {
        suno: new SunoService(),
        whisper: new WhisperService(),
        scene: new SceneService(),
        image: new ImageService(),
        video: new VideoService(),
        assembly: new AssemblyService()
      };
    }
    return this._services;
  }

  /**
   * Start a new video generation job
   * @param {object} input - { lyrics, songTitle, songStyle, visualStyle, channelName }
   * @returns {string} jobId
   */
  startJob(input) {
    const jobId = uuidv4();
    const jobDir = path.join(this.outputBase, jobId);
    fs.mkdirSync(jobDir, { recursive: true });

    const job = {
      id: jobId,
      input,
      status: 'queued',
      currentStep: null,
      progress: 0,
      steps: {
        suno: { status: 'pending', message: '' },
        whisper: { status: 'pending', message: '' },
        scene: { status: 'pending', message: '' },
        image: { status: 'pending', message: '' },
        video: { status: 'pending', message: '' },
        assembly: { status: 'pending', message: '' }
      },
      outputDir: jobDir,
      finalVideoPath: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    jobs.set(jobId, job);

    // Run pipeline asynchronously
    this._runPipeline(jobId).catch(err => {
      console.error(`[PIPELINE] Job ${jobId} fatal error:`, err);
      this._updateJob(jobId, {
        status: 'failed',
        error: err.message
      });
    });

    return jobId;
  }

  getJob(jobId) {
    return jobs.get(jobId) || null;
  }

  getAllJobs() {
    return Array.from(jobs.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async _runPipeline(jobId) {
    const job = jobs.get(jobId);
    if (!job) return;

    const { lyrics, songTitle, songStyle, visualStyle, channelName, language, resolution, videoProvider } = job.input;
    const dir = job.outputDir;

    // Parse resolution (e.g., "1920x1080" or default)
    const RESOLUTIONS = {
      '1280x720': { width: 1280, height: 720, label: '720p' },
      '1920x1080': { width: 1920, height: 1080, label: '1080p' },
      '2560x1440': { width: 2560, height: 1440, label: '1440p' }
    };
    const res = RESOLUTIONS[resolution] || RESOLUTIONS['1280x720'];

    // Language code for Whisper
    const lang = language || 'auto';

    this._updateJob(jobId, { status: 'processing' });

    try {
      // ========== STEP 1: SUNO - Generate Song ==========
      this._updateStep(jobId, 'suno', 'processing', 'Generating song audio...');
      this._updateJob(jobId, { currentStep: 'suno', progress: 5 });

      const defaultStyle = "children's nursery rhyme, female vocalist, happy, warm, simple melody";
      const songResult = await this.services.suno.generateSong(
        lyrics,
        songStyle || defaultStyle,
        songTitle,
        dir
      );

      this._updateStep(jobId, 'suno', 'complete', `Song generated (${songResult.duration || '?'}s)`);
      this._updateJob(jobId, { progress: 15 });

      // ========== STEP 2: WHISPER - Extract Timestamps ==========
      this._updateStep(jobId, 'whisper', 'processing', `Extracting timestamps (${lang})...`);
      this._updateJob(jobId, { currentStep: 'whisper', progress: 20 });

      const timestamps = await this.services.whisper.extractTimestamps(songResult.audioPath, lyrics, lang);

      this._updateStep(jobId, 'whisper', 'complete',
        `Extracted ${timestamps.sceneSegments.length} scenes (${timestamps.duration.toFixed(1)}s total)`
      );
      this._updateJob(jobId, { progress: 30 });

      // ========== STEP 3: CLAUDE - Scene Descriptions ==========
      this._updateStep(jobId, 'scene', 'processing', 'Generating scene descriptions...');
      this._updateJob(jobId, { currentStep: 'scene', progress: 35 });

      const enrichedScenes = await this.services.scene.generateSceneDescriptions(
        timestamps.sceneSegments,
        lyrics,
        visualStyle,
        songTitle
      );

      this._updateStep(jobId, 'scene', 'complete',
        `Generated ${enrichedScenes.length} scene descriptions`
      );
      this._updateJob(jobId, { progress: 40 });

      // Save scene data for debugging
      fs.writeFileSync(
        path.join(dir, 'scenes.json'),
        JSON.stringify(enrichedScenes, null, 2)
      );

      // ========== STEP 4: FLUX - Generate Images ==========
      this._updateStep(jobId, 'image', 'processing', `Generating images (${res.label})...`);
      this._updateJob(jobId, { currentStep: 'image', progress: 45 });

      const scenesWithImages = await this.services.image.generateImages(enrichedScenes, dir, {
        width: res.width,
        height: res.height
      });

      const imageCount = scenesWithImages.filter(s => s.imagePath).length;
      this._updateStep(jobId, 'image', 'complete',
        `Generated ${imageCount}/${enrichedScenes.length} images`
      );
      this._updateJob(jobId, { progress: 60 });

      // ========== STEP 5: KLING - Animate Images ==========
      this._updateStep(jobId, 'video', 'processing', 'Animating scenes...');
      this._updateJob(jobId, { currentStep: 'video', progress: 65 });

      const scenesWithVideo = await this.services.video.generateVideos(scenesWithImages, dir, videoProvider || 'wan21');

      const videoCount = scenesWithVideo.filter(s => s.videoPath).length;
      this._updateStep(jobId, 'video', 'complete',
        `Generated ${videoCount}/${scenesWithImages.length} clips`
      );
      this._updateJob(jobId, { progress: 85 });

      // ========== STEP 6: FFMPEG - Assemble Final Video ==========
      this._updateStep(jobId, 'assembly', 'processing', 'Assembling final video...');
      this._updateJob(jobId, { currentStep: 'assembly', progress: 90 });

      const finalPath = await this.services.assembly.assembleVideo(
        scenesWithVideo,
        songResult.audioPath,
        timestamps.duration,
        dir,
        {
          title: songTitle,
          channelName: channelName || 'Nursery Rhymes',
          width: res.width,
          height: res.height
        }
      );

      this._updateStep(jobId, 'assembly', 'complete', 'Final video ready!');
      this._updateJob(jobId, {
        status: 'complete',
        currentStep: null,
        progress: 100,
        finalVideoPath: finalPath
      });

      console.log(`[PIPELINE] Job ${jobId} COMPLETE: ${finalPath}`);

    } catch (err) {
      console.error(`[PIPELINE] Job ${jobId} failed at step ${job.currentStep}:`, err);

      // Mark current step as failed
      if (job.currentStep) {
        this._updateStep(jobId, job.currentStep, 'failed', err.message);
      }

      this._updateJob(jobId, {
        status: 'failed',
        error: `Failed at ${job.currentStep}: ${err.message}`
      });
    }
  }

  _updateJob(jobId, updates) {
    const job = jobs.get(jobId);
    if (job) {
      Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    }
  }

  _updateStep(jobId, step, status, message) {
    const job = jobs.get(jobId);
    if (job && job.steps[step]) {
      job.steps[step].status = status;
      job.steps[step].message = message;
      job.updatedAt = new Date().toISOString();
    }
  }
}

module.exports = Pipeline;
