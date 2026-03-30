const axios = require('axios');
const fs = require('fs');
const path = require('path');

const IMAGE_MODELS = {
  schnell: { id: 'fal-ai/flux/schnell', name: 'Flux Schnell', cost: 0.003 },
  dev: { id: 'fal-ai/flux/dev', name: 'Flux Dev', cost: 0.025 },
  pro: { id: 'fal-ai/flux-pro/v1.1', name: 'Flux Pro', cost: 0.05 }
};

class ImageService {
  constructor() {
    this.apiKey = process.env.FAL_KEY;
    this.baseUrl = 'https://queue.fal.run';
  }

  async generateImages(scenes, outputDir, options = {}) {
    const modelKey = options.imageModel || 'dev';
    const model = IMAGE_MODELS[modelKey] || IMAGE_MODELS.dev;
    console.log(`[IMAGE] Using ${model.name} (~$${model.cost}/image) — ${scenes.length} images`);

    const imagesDir = path.join(outputDir, 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

    const results = [];
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`[IMAGE] Image ${i + 1}/${scenes.length}`);
      try {
        const imagePath = await this._generateSingleImage(
          scene.imagePrompt,
          path.join(imagesDir, `scene_${String(i).padStart(3, '0')}.png`),
          i, model.id
        );
        results.push({ ...scene, imagePath });
        if (i < scenes.length - 1) await this._sleep(500);
      } catch (err) {
        console.error(`[IMAGE] Failed scene ${i}:`, err.message);
        results.push({ ...scene, imagePath: null, imageError: err.message });
      }
    }
    const ok = results.filter(r => r.imagePath).length;
    console.log(`[IMAGE] Generated ${ok}/${scenes.length} images`);
    return results;
  }

  async _generateSingleImage(prompt, outputPath, seed, modelId) {
    const submitUrl = `${this.baseUrl}/${modelId}`;
    const body = {
      prompt: prompt,
      image_size: "landscape_16_9",
      num_images: 1,
      seed: seed + 42,
      enable_safety_checker: true
    };

    console.log(`[IMAGE] POST ${submitUrl}`);
    const submitRes = await axios.post(submitUrl, body, {
      headers: { 'Authorization': `Key ${this.apiKey}`, 'Content-Type': 'application/json' }
    });

    const data = submitRes.data;
    console.log(`[IMAGE] Submit: status=${data.status}, id=${data.request_id}`);

    const statusUrl = data.status_url;
    const responseUrl = data.response_url;

    if (statusUrl && responseUrl) {
      return await this._pollForResult(statusUrl, responseUrl, outputPath);
    }

    const imageUrl = this._extractImageUrl(data);
    if (imageUrl) { await this._download(imageUrl, outputPath); return outputPath; }

    throw new Error('No URLs in response: ' + JSON.stringify(data).substring(0, 300));
  }

  async _pollForResult(statusUrl, responseUrl, outputPath) {
    for (let i = 0; i < 30; i++) {
      try {
        const statusRes = await axios.get(statusUrl, {
          headers: { 'Authorization': `Key ${this.apiKey}` }
        });
        const status = statusRes.data?.status;

        if (status === 'COMPLETED') {
          const resultRes = await axios.get(responseUrl, {
            headers: { 'Authorization': `Key ${this.apiKey}` }
          });
          const imageUrl = this._extractImageUrl(resultRes.data);
          if (imageUrl) { await this._download(imageUrl, outputPath); return outputPath; }
          throw new Error('Completed but no image. Data: ' + JSON.stringify(resultRes.data).substring(0, 500));
        }

        if (status === 'FAILED') {
          throw new Error('Failed: ' + JSON.stringify(statusRes.data).substring(0, 300));
        }
        console.log(`[IMAGE] Poll ${i + 1}: ${status}`);
      } catch (err) {
        if (err.response) {
          console.error(`[IMAGE] HTTP ${err.response.status} ${err.config?.method} ${err.config?.url}`);
          console.error(`[IMAGE] Body: ${JSON.stringify(err.response.data).substring(0, 500)}`);
        }
        if (err.response?.status === 429) { await this._sleep(10000); continue; }
        if (err.message.includes('Failed') || err.message.includes('Completed') || err.message.includes('no image')) throw err;
      }
      await this._sleep(2000);
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
module.exports.IMAGE_MODELS = IMAGE_MODELS;
