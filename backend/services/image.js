const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ImageService {
  constructor() {
    this.apiKey = process.env.FAL_KEY;
    this.baseUrl = 'https://queue.fal.run';
    this.modelId = 'fal-ai/flux-pro/v1.1';
  }

  async generateImages(scenes, outputDir, options = {}) {
    const width = options.width || 1280;
    const height = options.height || 720;
    console.log(`[IMAGE] Generating ${scenes.length} images via Flux (${width}x${height})`);

    const imagesDir = path.join(outputDir, 'images');
    if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

    const results = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`[IMAGE] Generating image ${i + 1}/${scenes.length}`);

      try {
        const imagePath = await this._generateSingleImage(
          scene.imagePrompt,
          path.join(imagesDir, `scene_${String(i).padStart(3, '0')}.png`),
          i, width, height
        );
        results.push({ ...scene, imagePath });
        if (i < scenes.length - 1) await this._sleep(1500);
      } catch (err) {
        console.error(`[IMAGE] Failed scene ${i}:`, err.message);
        results.push({ ...scene, imagePath: null, imageError: err.message });
      }
    }

    const ok = results.filter(r => r.imagePath).length;
    console.log(`[IMAGE] Generated ${ok}/${scenes.length} images`);
    return results;
  }

  async _generateSingleImage(prompt, outputPath, seed, width, height) {
    const submitResponse = await axios.post(
      `${this.baseUrl}/${this.modelId}`,
      {
        input: {
          prompt: prompt,
          image_size: { width: width, height: height },
          num_images: 1,
          seed: seed + 42,
          enable_safety_checker: true,
          output_format: 'png'
        }
      },
      {
        headers: {
          'Authorization': `Key ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = submitResponse.data;
    console.log(`[IMAGE] Submit OK. Status: ${data.status}, request_id: ${data.request_id}`);

    // Use the URLs that fal.ai gives us directly
    const statusUrl = data.status_url;
    const responseUrl = data.response_url;

    if (!statusUrl || !responseUrl) {
      throw new Error('No status_url/response_url in submit response');
    }

    // Poll using fal.ai's provided URLs
    return await this._pollForResult(statusUrl, responseUrl, outputPath);
  }

  async _pollForResult(statusUrl, responseUrl, outputPath, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const statusRes = await axios.get(statusUrl, {
          headers: { 'Authorization': `Key ${this.apiKey}` }
        });

        const status = statusRes.data?.status;

        if (status === 'COMPLETED') {
          // Fetch the actual result
          const resultRes = await axios.get(responseUrl, {
            headers: { 'Authorization': `Key ${this.apiKey}` }
          });

          const imageUrl = this._extractImageUrl(resultRes.data);
          if (imageUrl) {
            await this._download(imageUrl, outputPath);
            return outputPath;
          }
          throw new Error('Completed but no image URL. Keys: ' + Object.keys(resultRes.data || {}).join(', '));
        }

        if (status === 'FAILED') {
          throw new Error('Flux generation failed: ' + JSON.stringify(statusRes.data?.error || 'Unknown'));
        }

        console.log(`[IMAGE] Poll ${i + 1}... status: ${status}`);
      } catch (err) {
        if (err.response?.status === 429) { await this._sleep(10000); continue; }
        if (err.message.includes('failed') || err.message.includes('Failed') || err.message.includes('Completed')) throw err;
      }

      await this._sleep(3000);
    }
    throw new Error('Image generation timed out');
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