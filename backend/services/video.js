const axios = require('axios');
const fs = require('fs');
const path = require('path');

const PROVIDERS = {
  wan26: { name: 'WAN 2.6 (recommended)', endpoint: 'wan/v2.6/image-to-video', type: 'fal', costPerClip: 0.40 },
  wan21: { name: 'WAN 2.1 (cheapest)', endpoint: 'fal-ai/wan-i2v', type: 'fal', costPerClip: 0.20 },
  seedance1: { name: 'Seedance 1.0 Lite', endpoint: 'fal-ai/bytedance/seedance/v1/lite/image-to-video', type: 'fal', costPerClip: 0.15 },
  kling: { name: 'Kling 2.5 Turbo (premium)', endpoint: 'fal-ai/kling-video/v2/standard/image-to-video', type: 'fal', costPerClip: 0.35 }
};

class VideoService {
  constructor() {
    this.falKey = process.env.FAL_KEY;
    this.falBaseUrl = 'https://queue.fal.run';
  }

  async generateVideos(scenes, outputDir, provider = 'wan26') {
    const config = PROVIDERS[provider] || PROVIDERS.wan26;
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
        const videoPath = await this._generateViaFal(scene, config, outPath);
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

  async _generateViaFal(scene, config, outputPath) {
    const imageUrl = await this._uploadImageToFal(scene.imagePath);
    let body = { prompt: scene.motionPrompt };

    if (config.endpoint.includes('wan/v2.6')) {
      // WAN 2.6 params
      body.image_url = imageUrl;
      body.duration = '10';
      body.resolution = '720p';
      body.enable_safety_checker = true;
      body.enable_prompt_expansion = false;
    } else if (config.endpoint.includes('wan-i2v')) {
      // WAN 2.1 params
      body.image_url = imageUrl;
      body.resolution = '720p';
      body.enable_safety_checker = true;
    } else if (config.endpoint.includes('seedance')) {
      body.image_url = imageUrl;
    } else if (config.endpoint.includes('kling')) {
      body.image_url = imageUrl;
      body.duration = '10';
      body.aspect_ratio = '16:9';
      body.cfg_scale = 0.5;
    }

    const submitUrl = `${this.falBaseUrl}/${config.endpoint}`;
    console.log(`[VIDEO] POST ${submitUrl}`);

    const res = await axios.post(submitUrl, body, {
      headers: { 'Authorization': `Key ${this.falKey}`, 'Content-Type': 'application/json' }
    });

    const data = res.data;
    console.log(`[VIDEO] Submit: status=${data.status}, id=${data.request_id}`);

    const statusUrl = data.status_url;
    const responseUrl = data.response_url;

    if (statusUrl && responseUrl) {
      return await this._pollFal(statusUrl, responseUrl, outputPath);
    }

    // Direct response
    const url = data?.video?.url || data?.video_url;
    if (url) { await this._download(url, outputPath); return outputPath; }

    throw new Error('Unexpected response: ' + JSON.stringify(data).substring(0, 300));
  }

  async _pollFal(statusUrl, responseUrl, outputPath) {
    for (let i = 0; i < 120; i++) {
      try {
        const sRes = await axios.get(statusUrl, {
          headers: { 'Authorization': `Key ${this.falKey}` }
        });
        const status = sRes.data?.status;

        if (status === 'COMPLETED') {
          const rRes = await axios.get(responseUrl, {
            headers: { 'Authorization': `Key ${this.falKey}` }
          });
          const url = rRes.data?.video?.url || rRes.data?.video_url;
          if (url) { await this._download(url, outputPath); return outputPath; }
          throw new Error('No video URL. Keys: ' + Object.keys(rRes.data || {}).join(', '));
        }
        if (status === 'FAILED') throw new Error('Failed: ' + JSON.stringify(sRes.data).substring(0, 300));
        console.log(`[VIDEO] Poll ${i + 1}: ${status}`);
      } catch (err) {
        if (err.response) {
          console.error(`[VIDEO] HTTP ${err.response.status} ${err.config?.url}`);
          console.error(`[VIDEO] Body: ${JSON.stringify(err.response.data).substring(0, 300)}`);
        }
        if (err.response?.status === 429) { await this._sleep(15000); continue; }
        if (err.message.includes('Failed') || err.message.includes('No video')) throw err;
      }
      await this._sleep(5000);
    }
    throw new Error('Video generation timed out');
  }

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
