const axios = require('axios');
const fs = require('fs');
const path = require('path');

const MAX_IMAGES = 10;

class ImageService {
  constructor() {
    this.apiKey = process.env.FAL_KEY;
    this.baseUrl = 'https://queue.fal.run';
    this.modelId = 'fal-ai/flux-pro/v1.1';
  }

  async generateImages(scenes, outputDir, options = {}) {
    console.log(`[IMAGE] Generating images via Flux`);

    // Cap at MAX_IMAGES
    let scenesToProcess = scenes;
    if (scenes.length > MAX_IMAGES) {
      console.log(`[IMAGE] Capping from ${scenes.length} to ${MAX_IMAGES} scenes`);
      scenesToProcess = scenes.slice(0, MAX_IMAGES);
    }

    const imagesDir = path.join(outputDir, 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

    const results = [];
    for (let i = 0; i < scenesToProcess.length; i++) {
      const scene = scenesToProcess[i];
      console.log(`[IMAGE] Generating image ${i + 1}/${scenesToProcess.length}`);
      try {
        const imagePath = await this._generateSingleImage(
          scene.imagePrompt,
          path.join(imagesDir, `scene_${String(i).padStart(3, '0')}.png`),
          i
        );
        results.push({ ...scene, imagePath });
        if (i < scenesToProcess.length - 1) await this._sleep(1500);
      } catch (err) {
        console.error(`[IMAGE] Failed scene ${i}:`, err.message);
        results.push({ ...scene, imagePath: null, imageError: err.message });
      }
    }
    const ok = results.filter(r => r.imagePath).length;
    console.log(`[IMAGE] Generated ${ok}/${scenesToProcess.length} images`);
    return results;
  }

  async _generateSingleImage(prompt, outputPath, seed) {
    const submitUrl = `${this.baseUrl}/${this.modelId}`;

    const body = {
      prompt: prompt,
      image_size: "landscape_16_9",
      num_images: 1,
      seed: seed + 42,
      enable_safety_checker: true
    };

    console.log(`[IMAGE] POST ${submitUrl}`);

    const submitRes = await axios.post(submitUrl, body, {
      headers: {
        'Authorization': `Key ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const data = submitRes.data;
    console.log(`[IMAGE] Submit: status=${data.status}, request_id=${data.request_id}`);
    console.log(`[IMAGE] status_url=${data.status_url}`);
    console.log(`[IMAGE] response_url=${data.response_url}`);

    const statusUrl = data.status_url;
    const responseUrl = data.response_url;

    if (!statusUrl || !responseUrl) {
      throw new Error('No status_url/response_url from fal.ai');
    }

    return await this._pollForResult(statusUrl, responseUrl, outputPath);
  }

  async _pollForResult(statusUrl, responseUrl, outputPath) {
    for (let i = 0; i < 60; i++) {
      try {
        const statusRes = await axios.get(statusUrl, {
          headers: { 'Authorization': `Key ${this.apiKey}` }
        });
        const status = statusRes.data?.status;

        if (status === 'COMPLETED') {
          console.log(`[IMAGE] Completed! Fetching result from response_url`);
          const resultRes = await axios.get(responseUrl, {
            headers: { 'Authorization': `Key ${this.apiKey}` }
          });

          console.log(`[IMAGE] Result keys: ${Object.keys(resultRes.data || {}).join(', ')}`);

          const imageUrl = this._extractImageUrl(resultRes.data);
          if (imageUrl) {
            console.log(`[IMAGE] Downloading: ${imageUrl.substring(0, 80)}...`);
            await this._download(imageUrl, outputPath);
            return outputPath;
          }
          throw new Error('Completed but no image. Data: ' + JSON.stringify(resultRes.data).substring(0, 500));
        }

        if (status === 'FAILED') {
          throw new Error('Failed: ' + JSON.stringify(statusRes.data).substring(0, 300));
        }

        console.log(`[IMAGE] Poll ${i + 1}: ${status}`);
      } catch (err) {
        if (err.response) {
          console.error(`[IMAGE] HTTP ${err.response.status} on ${err.config?.method?.toUpperCase()} ${err.config?.url}`);
          console.error(`[IMAGE] Response body: ${JSON.stringify(err.response.data).substring(0, 500)}`);
        }
        if (err.response?.status === 429) { await this._sleep(10000); continue; }
        if (err.message.includes('Failed') || err.message.includes('Completed') || err.message.includes('no image')) throw err;
      }
      await this._sleep(3000);
    }
    throw new Error('Timed out');
  }

  _extractImageUrl(data) {
    if (!data) return null;
    if (data.images?.[0]?.url) return data.images[0].url;
    if (data.output?.images?.[0]?.url) return data.output.images[0].url;
    if (data.data?.images?.[0]?.url) return data.data.images[0].url;
    if (data.image?.url) return data.image.url;
    if (data.image_url) return data.image_url;
    return null;
  }

  async _download(url, outPath) {
    const res = await axios({ method: 'GET', url, responseType: 'stream' });
    const w = fs.createWriteStream(outPath);
    res.data.pipe(w);
    return new Promise((ok, fail) => { w.on('finish', ok); w.on('error', fail); });
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

module.exports = ImageService;
