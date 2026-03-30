const OpenAI = require('openai');
const fs = require('fs');

class WhisperService {
  constructor() {
    this._client = null;
  }

  get client() {
    if (!this._client) {
      if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
      this._client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this._client;
  }

  /**
   * Extract word-level timestamps from audio using Whisper
   * @param {string} audioPath - Path to the audio file
   * @param {string} originalLyrics - Original lyrics for reference/alignment
   * @returns {object} { segments, words, duration }
   */
  /**
   * @param {string} audioPath - Path to the audio file
   * @param {string} originalLyrics - Original lyrics for reference/alignment
   * @param {string} language - ISO 639-1 language code (e.g., 'ur', 'en', 'hi', 'ar')
   */
  async extractTimestamps(audioPath, originalLyrics, language = 'ur') {
    console.log(`[WHISPER] Extracting timestamps (lang: ${language}) from:`, audioPath);

    const audioFile = fs.createReadStream(audioPath);

    const whisperOptions = {
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment']
    };

    // Only set language if specified (let Whisper auto-detect if 'auto')
    if (language && language !== 'auto') {
      whisperOptions.language = language;
    }

    const transcription = await this.client.audio.transcriptions.create(whisperOptions);

    console.log('[WHISPER] Raw transcription received, processing...');

    // Extract segments (verse-level chunks)
    const segments = (transcription.segments || []).map(seg => ({
      id: seg.id,
      text: seg.text.trim(),
      start: seg.start,
      end: seg.end,
      duration: seg.end - seg.start
    }));

    // Extract word-level timestamps
    const words = (transcription.words || []).map(w => ({
      word: w.word,
      start: w.start,
      end: w.end
    }));

    // Create scene segments by grouping Whisper segments into verse-sized chunks
    const sceneSegments = this._createSceneSegments(segments, originalLyrics);

    console.log(`[WHISPER] Extracted ${segments.length} segments, ${words.length} words, ${sceneSegments.length} scenes`);

    return {
      segments,
      words,
      sceneSegments,
      fullText: transcription.text,
      duration: transcription.duration || segments[segments.length - 1]?.end || 0
    };
  }

  /**
   * Group segments into scene-sized chunks (aim for 5-10 second scenes)
   * Each scene will become one image + one video clip
   */
  _createSceneSegments(segments, originalLyrics) {
    if (!segments || segments.length === 0) {
      return this._fallbackSegmentation(originalLyrics);
    }

    const scenes = [];
    let currentScene = {
      text: '',
      start: 0,
      end: 0,
      segmentIds: []
    };

    const TARGET_SCENE_DURATION = 7; // seconds - ideal scene length
    const MIN_SCENE_DURATION = 4;
    const MAX_SCENE_DURATION = 12;

    for (const seg of segments) {
      const currentDuration = currentScene.end - currentScene.start;

      // If adding this segment would exceed max, or current scene is long enough
      // and there's a natural break, finalize current scene
      if (
        currentScene.text &&
        (currentDuration >= TARGET_SCENE_DURATION || currentDuration + seg.duration > MAX_SCENE_DURATION)
      ) {
        scenes.push({ ...currentScene });
        currentScene = {
          text: seg.text,
          start: seg.start,
          end: seg.end,
          segmentIds: [seg.id]
        };
      } else {
        // Add to current scene
        if (!currentScene.text) {
          currentScene.start = seg.start;
        }
        currentScene.text += (currentScene.text ? ' ' : '') + seg.text;
        currentScene.end = seg.end;
        currentScene.segmentIds.push(seg.id);
      }
    }

    // Don't forget the last scene
    if (currentScene.text) {
      scenes.push(currentScene);
    }

    // If scenes are too few, return what we have
    // If no scenes at all, use fallback
    if (scenes.length === 0) {
      return this._fallbackSegmentation(originalLyrics);
    }

    return scenes.map((scene, idx) => ({
      id: idx,
      text: scene.text.trim(),
      start: scene.start,
      end: scene.end,
      duration: scene.end - scene.start
    }));
  }

  /**
   * Fallback: split lyrics into equal-time segments if Whisper fails
   */
  _fallbackSegmentation(lyrics, totalDuration = 120) {
    console.log('[WHISPER] Using fallback segmentation from lyrics');

    const lines = lyrics
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('['));

    // Group lines into verses of 2-4 lines
    const verses = [];
    for (let i = 0; i < lines.length; i += 2) {
      verses.push(lines.slice(i, i + 2).join(' '));
    }

    const segDuration = totalDuration / Math.max(verses.length, 1);

    return verses.map((text, idx) => ({
      id: idx,
      text,
      start: idx * segDuration,
      end: (idx + 1) * segDuration,
      duration: segDuration
    }));
  }
}

module.exports = WhisperService;
