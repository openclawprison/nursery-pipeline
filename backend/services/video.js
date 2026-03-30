const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PROVIDERS = {
  wan21: { name: 'WAN 2.1 (cheapest)', endpoint: 'fal-ai/wan-i2v', type: 'fal', costPerClip: 0.20 },
  seedance1: { name: 'Seedance 1.0 Lite', endpoint: 'fal-ai/bytedance/seedance/v1/lite/image-to-video', type: 'fal', costPerClip: 0.15 },
  seedance2: { name: 'Seedance 2.0 (best value)', type: 'modelslab', costPerClip: 0.05 },
  kling: { name: 'Kling 2.5 Turbo (premium)', endpoint: 'fal-ai/kling-video/v2/standard/image-to-video', type: 'fal', costPerClip: 0.35 }
};

class VideoService {
  constructor() {
    this.falKey = process.env.FAL_KEY;
    this.modelslabKey = process.env.MODELSLAB_API_KEY || null;
    this.falBaseUrl = 'https://queue.fal.run';
  }

  async generateVideos(scenes, outputDir, provider = 'wan21') {
    const config = PROVIDERS[provider] || PROVIDERS.wan21;
    console.log(`[VIDEO] Using ${config.name} — ${scenes.length} clips`);

    const videosDir = path.join(outputDir, 'clips');
    if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

    const results = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (!scene.imagePath) { results.push({ ...scene, videoPath: null }); continue; }

      console.log(`[VIDEO] Clip ${i + 1}/${scenes.length} via ${config.name}`);
      try {
        const outPath = path.join(videosDir, `clip_${String(i).padStart(3, '0')}.mp4`);
        let videoPath;

        if (config.type === 'fal') {
          videoPath = await this._generateViaFal(scene, config, outPath);
        } else if (config.type === 'modelslab') {
          videoPath = await this._generateViaModelsLab(scene, outPath);
        }
        results.push({ ...scene, videoPath });
        if (i < scenes.length - 1) await this._sleep(2000);
      } catch (err) {
        console.error(`[VIDEO] Failed scene ${i}:`, err.message);
        results.push({ ...scene, videoPath: null, videoError: err.message });
      }
    }

    const ok = results.filter(r => r.videoPath).length;
    console.log(`[VIDEO] Done: ${ok}/${scenes.length} clips (~$${(ok * config.costPerClip).toFixed(2)})`);
    return results;
  }

  // ─── fal.ai (WAN 2.1, Seedance 1.0, Kling) ────────────────────
  async _generateViaFal(scene, config, outputPath) {
    const imageUrl = await this._uploadImageToFal(scene.imagePath);
    let body = { prompt: scene.motionPrompt };

    if (config.endpoint.includes('wan')) {
      body.image_url = imageUrl;
      body.resolution = '720p';
      body.enable_safety_checker = true;
    } else if (config.endpoint.includes('seedance')) {
      body.image_url = imageUrl;
    } else if (config.endpoint.includes('kling')) {
      body.image_url = imageUrl;
      body.duration = scene.duration > 7 ? '10' : '5';
      body.aspect_ratio = '16:9';
      body.cfg_scale = 0.5;
    }

    const res = await axios.post(`${this.falBaseUrl}/${config.endpoint}`, body, {
      headers: { 'Authorization': `Key ${this.falKey}`, 'Content-Type': 'application/json' }
    });

    const reqId = res.data?.request_id;
    if (reqId) return await this._pollFal(config.endpoint, reqId, outputPath);

    const url = res.data?.video?.url || res.data?.video_url || res.data?.output?.video;
    if (url) { await this._download(url, outputPath); return outputPath; }
    throw new Error('Unexpected fal.ai response');
  }

  // ─── ModelsLab (Seedance 2.0) ──────────────────────────────────
  async _generateViaModelsLab(scene, outputPath) {
    if (!this.modelslabKey) {
      throw new Error('MODELSLAB_API_KEY not set. Sign up at modelslab.com and add your key to .env');
    }

    const imageBase64 = fs.readFileSync(scene.imagePath).toString('base64');

    const res = await axios.post('https://modelslab.com/api/v6/video/seedance-i2v', {
      key: this.modelslabKey,
      model_id: 'seedance-i2v',
      prompt: scene.motionPrompt,
      init_image: `data:image/png;base64,${imageBase64}`,
      height: 720,
      width: 1280,
      num_frames: 120,
      fps: 24,
      output_type: 'mp4',
      webhook: null,
      track_id: null
    }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });

    // Direct result
    if (res.data?.status === 'success' && res.data?.output?.[0]) {
      await this._download(res.data.output[0], outputPath);
      return outputPath;
    }

    // Async — poll
    const fetchUrl = res.data?.fetch_result
      || (res.data?.id ? `https://modelslab.com/api/v6/video/fetch/${res.data.id}` : null);

    if (fetchUrl) return await this._pollModelsLab(fetchUrl, outputPath);

    throw new Error('Unexpected ModelsLab response');
  }

  async _pollModelsLab(fetchUrl, outputPath, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await axios.post(fetchUrl, { key: this.modelslabKey });
        if (res.data?.status === 'success' && res.data?.output?.[0]) {
          await this._download(res.data.output[0], outputPath);
          return outputPath;
        }
        if (res.data?.status === 'failed' || res.data?.status === 'error') {
          throw new Error('ModelsLab failed: ' + (res.data?.message || 'Unknown'));
        }
        console.log(`[VIDEO] ModelsLab poll ${i + 1}... status: ${res.data?.status}`);
      } catch (err) {
        if (err.message.includes('failed') || err.message.includes('Failed')) throw err;
      }
      await this._sleep(5000);
    }
    throw new Error('ModelsLab timed out');
  }

  // ─── fal.ai polling ────────────────────────────────────────────
  async _pollFal(modelId, requestId, outputPath, maxAttempts = 120) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const sRes = await axios.get(
          `${this.falBaseUrl}/${modelId}/requests/${requestId}/status`,
          { headers: { 'Authorization': `Key ${this.falKey}` } }
        );
        const status = sRes.data?.status;

        if (status === 'COMPLETED') {
          const rRes = await axios.get(
            `${this.falBaseUrl}/${modelId}/requests/${requestId}`,
            { headers: { 'Authorization': `Key ${this.falKey}` } }
          );
          const url = rRes.data?.video?.url || rRes.data?.video_url || rRes.data?.output?.video;
          if (url) { await this._download(url, outputPath); return outputPath; }
          throw new Error('No video URL in result');
        }
        if (status === 'FAILED') throw new Error('fal.ai generation failed');
        console.log(`[VIDEO] fal.ai poll ${i + 1}... status: ${status}`);
      } catch (err) {
        if (err.response?.status === 429) { await this._sleep(15000); continue; }
        if (err.message.includes('failed') || err.message.includes('Failed')) throw err;
      }
      await this._sleep(5000);
    }
    throw new Error('fal.ai generation timed out');
  }

  // ─── Utilities ─────────────────────────────────────────────────
  async _uploadImageToFal(imagePath) {
    const buf = fs.readFileSync(imagePath);
    try {
      const res = await axios.post('https://fal.run/fal-ai/file-upload', buf, {
        headers: { 'Authorization': `Key ${this.falKey}`, 'Content-Type': 'image/png', 'X-Fal-File-Name': path.basename(imagePath) }
      });
      return res.data?.url || res.data?.file_url;
    } catch { return `data:image/png;base64,${buf.toString('base64')}`; }
  }

  async _download(url, outPath) {
    const res = await axios({ method: 'GET', url, responseType: 'stream' });
    const w = fs.createWriteStream(outPath);
    res.data.pipe(w);
    return new Promise((ok, fail) => { w.on('finish', ok); w.on('error', fail); });
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = VideoService;
module.exports.PROVIDERS = PROVIDERS;
