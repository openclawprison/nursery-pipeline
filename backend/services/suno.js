const axios = require('axios');
const fs = require('fs');
const path = require('path');

class SunoService {
  constructor() {
    this.apiKey = process.env.SUNO_API_KEY;
    this.baseUrl = process.env.SUNO_API_BASE || 'https://api.sunoapi.org';
  }

  /**
   * Generate a song from lyrics using sunoapi.org
   * Docs: https://docs.sunoapi.org/suno-api/generate-music
   */
  async generateSong(lyrics, style, title, outputDir) {
    console.log('[SUNO] Generating song:', title);

    // Step 1: Submit generation request
    // customMode=true, instrumental=false → requires style, prompt (lyrics), title
    const response = await axios.post(
      `${this.baseUrl}/api/v1/generate`,
      {
        customMode: true,
        instrumental: false,
        model: 'V5',
        prompt: lyrics,
        style: style,
        title: title,
        callBackUrl: 'https://example.com/callback'  // Required by API, we poll instead
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Response: { code: 200, msg: "success", data: { taskId: "xxx" } }
    if (response.data?.code !== 200 || !response.data?.data?.taskId) {
      throw new Error(`Suno API error: ${response.data?.msg || JSON.stringify(response.data)}`);
    }

    const taskId = response.data.data.taskId;
    console.log('[SUNO] Task submitted, taskId:', taskId);

    // Step 2: Poll for completion
    // Stream URL available in ~30-40s, download URL in ~2-3 min
    const result = await this._pollForCompletion(taskId);

    // Step 3: Download audio file
    const audioPath = path.join(outputDir, 'song.mp3');
    await this._downloadFile(result.audioUrl, audioPath);

    console.log('[SUNO] Song saved:', audioPath, `(${result.duration}s)`);

    return {
      audioPath,
      duration: result.duration || null,
      sunoId: result.id,
      audioUrl: result.audioUrl,
      metadata: result
    };
  }

  async _pollForCompletion(taskId, maxAttempts = 120, interval = 5000) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(
          `${this.baseUrl}/api/v1/generate/record-info`,
          {
            params: { taskId },
            headers: {
              'Authorization': `Bearer ${this.apiKey}`
            }
          }
        );

        const data = response.data?.data;
        if (!data) {
          console.log(`[SUNO] Poll ${i + 1}: no data yet`);
          await this._sleep(interval);
          continue;
        }

        const status = data.status;

        if (status === 'SUCCESS') {
          // sunoData is an array — Suno returns 2 variations, use the first
          const songs = data.response?.sunoData;
          if (songs && songs.length > 0) {
            const song = songs[0];
            if (song.audioUrl) {
              console.log('[SUNO] Generation complete!');
              return {
                id: song.id,
                audioUrl: song.audioUrl,
                streamAudioUrl: song.streamAudioUrl,
                imageUrl: song.imageUrl,
                duration: song.duration,
                title: song.title,
                tags: song.tags
              };
            }
          }
          throw new Error('Suno returned SUCCESS but no audio URL');
        }

        if (status === 'FAILED' || status === 'ERROR') {
          throw new Error(`Suno generation failed: ${data.errorMessage || 'Unknown error'}`);
        }

        // Still running — RUNNING, PENDING, QUEUED, etc.
        console.log(`[SUNO] Poll ${i + 1}/${maxAttempts}, status: ${status}`);

      } catch (err) {
        if (err.response?.status === 429) {
          console.log('[SUNO] Rate limited, waiting...');
          await this._sleep(15000);
          continue;
        }
        // If it's our own thrown error, rethrow
        if (err.message.includes('failed') || err.message.includes('Failed') || err.message.includes('no audio')) {
          throw err;
        }
        console.log(`[SUNO] Poll error: ${err.message}, retrying...`);
      }

      await this._sleep(interval);
    }

    throw new Error('Suno generation timed out after ' + (maxAttempts * interval / 1000) + 's');
  }

  async _downloadFile(url, outputPath) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const response = await axios({ method: 'GET', url, responseType: 'stream' });
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

module.exports = SunoService;
