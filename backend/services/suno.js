const axios = require('axios');
const fs = require('fs');
const path = require('path');

class SunoService {
  constructor() {
    this.apiKey = process.env.SUNO_API_KEY;
    this.baseUrl = process.env.SUNO_API_BASE || 'https://api.sunoapi.org';
  }

  /**
   * Generate a song from lyrics using Suno API
   * @param {string} lyrics - The Urdu lyrics
   * @param {string} style - Music style tags (e.g., "children's nursery rhyme, female vocalist, happy, Urdu")
   * @param {string} title - Song title
   * @param {string} outputDir - Directory to save the audio file
   * @returns {object} { audioPath, duration, sunoId }
   */
  async generateSong(lyrics, style, title, outputDir) {
    console.log('[SUNO] Generating song:', title);

    // Step 1: Submit generation request
    const response = await axios.post(
      `${this.baseUrl}/api/custom_generate`,
      {
        prompt: lyrics,
        tags: style,
        title: title,
        make_instrumental: false,
        model: 'chirp-v4',  // Use latest available model
        wait_audio: false
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const taskIds = response.data;
    if (!taskIds || taskIds.length === 0) {
      throw new Error('Suno API returned no task IDs');
    }

    // Suno typically returns 2 variations - we'll use the first
    const taskId = Array.isArray(taskIds) ? taskIds[0].id || taskIds[0] : taskIds.id || taskIds;
    console.log('[SUNO] Task submitted, ID:', taskId);

    // Step 2: Poll for completion
    const audioData = await this._pollForCompletion(taskId);

    // Step 3: Download audio file
    const audioPath = path.join(outputDir, 'song.mp3');
    await this._downloadFile(audioData.audio_url, audioPath);

    console.log('[SUNO] Song generated and saved to:', audioPath);

    return {
      audioPath,
      duration: audioData.duration || null,
      sunoId: taskId,
      audioUrl: audioData.audio_url,
      metadata: audioData
    };
  }

  async _pollForCompletion(taskId, maxAttempts = 120, interval = 5000) {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(
          `${this.baseUrl}/api/get?ids=${taskId}`,
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`
            }
          }
        );

        const data = Array.isArray(response.data) ? response.data[0] : response.data;

        if (data.status === 'complete' || data.status === 'streaming') {
          if (data.audio_url) {
            console.log('[SUNO] Generation complete!');
            return data;
          }
        }

        if (data.status === 'error') {
          throw new Error(`Suno generation failed: ${data.error_message || 'Unknown error'}`);
        }

        console.log(`[SUNO] Polling... attempt ${i + 1}/${maxAttempts}, status: ${data.status}`);
      } catch (err) {
        if (err.response?.status === 429) {
          console.log('[SUNO] Rate limited, waiting longer...');
          await this._sleep(15000);
          continue;
        }
        throw err;
      }

      await this._sleep(interval);
    }

    throw new Error('Suno generation timed out after ' + (maxAttempts * interval / 1000) + ' seconds');
  }

  async _downloadFile(url, outputPath) {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

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
