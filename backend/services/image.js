const axios = require('axios');
const fs = require('fs');
const path = require('path');

class ImageService {
  constructor() {
    this.apiKey = process.env.FAL_KEY;
    this.baseUrl = 'https://queue.fal.run';
  }

  /**
   * Generate images for all scenes
   * @param {Array} scenes - Enriched scenes with imagePrompt
   * @param {string} outputDir - Directory to save images
   * @param {object} options - { width, height }
   * @returns {Array} scenes with added imagePath field
   */
  async generateImages(scenes, outputDir, options = {}) {
    const width = options.width || 1280;
    const height = options.height || 720;
    console.log(`[IMAGE] Generating ${scenes.length} images via Flux (${width}x${height})`);

    const imagesDir = path.join(outputDir, 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }

    const results = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      console.log(`[IMAGE] Generating image ${i + 1}/${scenes.length}`);

      try {
        const imagePath = await this._generateSingleImage(
          scene.imagePrompt,
          path.join(imagesDir, `scene_${String(i).padStart(3, '0')}.png`),
          i,
          width,
          height
        );

        results.push({
          ...scene,
          imagePath
        });

        // Small delay between requests to avoid rate limits
        if (i < scenes.length - 1) {
          await this._sleep(1000);
        }
      } catch (err) {
        console.error(`[IMAGE] Failed to generate image for scene ${i}:`, err.message);
        // Use a placeholder or retry
        results.push({
          ...scene,
          imagePath: null,
          imageError: err.message
        });
      }
    }

    const successCount = results.filter(r => r.imagePath).length;
    console.log(`[IMAGE] Generated ${successCount}/${scenes.length} images`);

    return results;
  }

  async _generateSingleImage(prompt, outputPath, seed, width = 1280, height = 720) {
    // Submit to Flux via fal.ai queue API
    const submitResponse = await axios.post(
      `${this.baseUrl}/fal-ai/flux-pro/v1.1`,
      {
        prompt: prompt,
        image_size: {
          width: width,
          height: height
        },
        num_images: 1,
        seed: seed + 42,  // Consistent seed offset for reproducibility
        enable_safety_checker: true,
        output_format: 'png'
      },
      {
        headers: {
          'Authorization': `Key ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // fal.ai queue returns a request_id for async processing
    const requestId = submitResponse.data?.request_id;

    if (requestId) {
      // Poll for result
      return await this._pollFalResult(
        `fal-ai/flux-pro/v1.1`,
        requestId,
        outputPath
      );
    }

    // If synchronous response (direct result)
    if (submitResponse.data?.images?.[0]?.url) {
      await this._downloadFile(submitResponse.data.images[0].url, outputPath);
      return outputPath;
    }

    throw new Error('Unexpected Flux API response format');
  }

  async _pollFalResult(modelId, requestId, outputPath, maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const statusResponse = await axios.get(
          `${this.baseUrl}/${modelId}/requests/${requestId}/status`,
          {
            headers: {
              'Authorization': `Key ${this.apiKey}`
            }
          }
        );

        const status = statusResponse.data?.status;

        if (status === 'COMPLETED') {
          // Fetch the result
          const resultResponse = await axios.get(
            `${this.baseUrl}/${modelId}/requests/${requestId}`,
            {
              headers: {
                'Authorization': `Key ${this.apiKey}`
              }
            }
          );

          const imageUrl = resultResponse.data?.images?.[0]?.url;
          if (imageUrl) {
            await this._downloadFile(imageUrl, outputPath);
            return outputPath;
          }
          throw new Error('No image URL in completed result');
        }

        if (status === 'FAILED') {
          throw new Error('Flux image generation failed');
        }

        console.log(`[IMAGE] Polling... attempt ${i + 1}, status: ${status}`);
      } catch (err) {
        if (err.response?.status === 429) {
          await this._sleep(10000);
          continue;
        }
        if (err.message.includes('failed') || err.message.includes('Failed')) {
          throw err;
        }
      }

      await this._sleep(3000);
    }

    throw new Error('Image generation timed out');
  }

  async _downloadFile(url, outputPath) {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = ImageService;
