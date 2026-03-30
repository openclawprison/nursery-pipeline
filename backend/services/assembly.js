const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);

class AssemblyService {
  constructor() {
    this.ffmpegPath = 'ffmpeg';
  }

  /**
   * @param {Array} scenes - Scenes with videoPath, start, end, subtitleText
   * @param {string} audioPath - Path to the song audio file
   * @param {number} audioDuration - Total audio duration in seconds
   * @param {string} outputDir - Output directory
   * @param {object} options - { title, channelName, width, height }
   */
  async assembleVideo(scenes, audioPath, audioDuration, outputDir, options = {}) {
    console.log('[ASSEMBLY] Starting video assembly...');
    const width = options.width || 1280;
    const height = options.height || 720;
    const enableSubtitles = options.subtitles !== false; // default ON

    const validScenes = scenes.filter(s => s.videoPath && fs.existsSync(s.videoPath));

    if (validScenes.length === 0) {
      throw new Error('No valid video clips to assemble');
    }

    console.log(`[ASSEMBLY] Assembling ${validScenes.length} clips, subtitles: ${enableSubtitles ? 'ON' : 'OFF'}`);

    // Step 1: Create subtitle file (only if enabled)
    let subtitlePath = null;
    if (enableSubtitles) {
      subtitlePath = path.join(outputDir, 'subtitles.ass');
      await this._createSubtitleFile(scenes, subtitlePath, width, height);
    }

    // Step 2: Create a concat file for FFmpeg
    const concatPath = path.join(outputDir, 'concat.txt');
    await this._createConcatFile(validScenes, concatPath, audioDuration);

    // Step 3: Concatenate video clips
    const rawVideoPath = path.join(outputDir, 'raw_concat.mp4');
    await this._concatenateClips(concatPath, rawVideoPath, width, height);

    // Step 4: Get actual video duration
    const videoDuration = await this._getMediaDuration(rawVideoPath);

    // Step 5: Overlay audio (+ subtitles if enabled) and produce final output
    const finalPath = path.join(outputDir, `${this._sanitizeFilename(options.title || 'nursery_rhyme')}.mp4`);
    await this._finalMix(rawVideoPath, audioPath, subtitlePath, finalPath, audioDuration, width, height);

    // Cleanup temp files
    this._cleanup([concatPath, rawVideoPath]);

    console.log('[ASSEMBLY] Final video created:', finalPath);
    return finalPath;
  }

  /**
   * Create ASS subtitle file with Urdu styling
   */
  async _createSubtitleFile(scenes, outputPath, width = 1280, height = 720) {
    const fontSize = Math.round(height * 0.072);  // ~52px at 720p
    const highlightSize = Math.round(height * 0.078);
    const outline = Math.round(height * 0.004);
    const marginV = Math.round(height * 0.056);

    const header = `[Script Info]
Title: Nursery Rhyme Subtitles
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,2,2,30,30,${marginV},1
Style: Highlight,Arial,${highlightSize},&H0000FFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,4,2,2,30,30,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const events = scenes
      .filter(s => s.subtitleText && s.start !== undefined)
      .map(scene => {
        const start = this._formatAssTime(scene.start);
        const end = this._formatAssTime(scene.end);
        // Escape special ASS characters and add RTL mark for Urdu
        const text = scene.subtitleText
          .replace(/\\/g, '\\\\')
          .replace(/\{/g, '\\{')
          .replace(/\}/g, '\\}');
        return `Dialogue: 0,${start},${end},Default,,0,0,0,,{\\an2}${text}`;
      })
      .join('\n');

    fs.writeFileSync(outputPath, header + events, 'utf-8');
    console.log('[ASSEMBLY] Subtitle file created');
  }

  /**
   * Pre-process clips: loop short clips to fill scene duration, trim long ones
   * Then create concat file from processed clips
   */
  async _createConcatFile(scenes, outputPath, targetDuration) {
    const processedDir = path.join(path.dirname(outputPath), 'processed_clips');
    if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

    const lines = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const clipPath = path.resolve(scene.videoPath);
      const sceneDuration = scene.end - scene.start;
      const processedPath = path.join(processedDir, `proc_${String(i).padStart(3, '0')}.mp4`);

      // Get actual clip duration
      const clipDuration = await this._getMediaDuration(clipPath);
      console.log(`[ASSEMBLY] Scene ${i}: need ${sceneDuration.toFixed(1)}s, clip is ${clipDuration.toFixed(1)}s`);

      if (clipDuration <= 0) {
        console.log(`[ASSEMBLY] Skipping scene ${i} — invalid clip`);
        continue;
      }

      try {
        if (clipDuration >= sceneDuration) {
          // Clip is long enough — just trim it
          const trimCmd = [
            this.ffmpegPath, '-y',
            '-i', `"${clipPath}"`,
            '-t', sceneDuration.toFixed(3),
            '-c', 'copy',
            `"${processedPath}"`
          ].join(' ');
          await this._runFFmpeg(trimCmd);
        } else {
          // Clip is too short — loop it to fill the duration
          const loopCount = Math.ceil(sceneDuration / clipDuration);
          const loopCmd = [
            this.ffmpegPath, '-y',
            '-stream_loop', String(loopCount - 1),
            '-i', `"${clipPath}"`,
            '-t', sceneDuration.toFixed(3),
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-an',
            `"${processedPath}"`
          ].join(' ');
          await this._runFFmpeg(loopCmd);
        }

        lines.push(`file '${path.resolve(processedPath)}'`);
      } catch (err) {
        console.error(`[ASSEMBLY] Failed to process clip ${i}:`, err.message);
        // Fallback: use original clip as-is
        lines.push(`file '${clipPath}'`);
        lines.push(`duration ${sceneDuration.toFixed(3)}`);
      }
    }

    // Add last file again (FFmpeg concat quirk)
    if (lines.length > 0) {
      lines.push(lines[lines.length - 1]);
    }

    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
    console.log('[ASSEMBLY] Concat file created');
  }

  /**
   * Concatenate video clips using FFmpeg concat demuxer
   */
  async _concatenateClips(concatPath, outputPath, width = 1280, height = 720) {
    const cmd = [
      this.ffmpegPath,
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', `"${concatPath}"`,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-s', `${width}x${height}`,
      '-an',  // No audio yet
      `"${outputPath}"`
    ].join(' ');

    console.log('[ASSEMBLY] Concatenating clips...');
    await this._runFFmpeg(cmd);
  }

  /**
   * Final mix: video + audio + subtitles
   */
  async _finalMix(videoPath, audioPath, subtitlePath, outputPath, audioDuration, width = 1280, height = 720) {
    const videoDuration = await this._getMediaDuration(videoPath);
    const duration = Math.min(videoDuration, audioDuration);

    // Build video filter: subtitles + scale, or just scale
    let vf;
    if (subtitlePath) {
      vf = `"ass='${subtitlePath.replace(/'/g, "'\\''").replace(/\\/g, '/')}'",scale=${width}:${height}`;
      console.log('[ASSEMBLY] Final mix: video + audio + subtitles');
    } else {
      vf = `scale=${width}:${height}`;
      console.log('[ASSEMBLY] Final mix: video + audio (no subtitles)');
    }

    const cmd = [
      this.ffmpegPath,
      '-y',
      '-i', `"${videoPath}"`,
      '-i', `"${audioPath}"`,
      '-t', duration.toFixed(2),
      '-vf', vf,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-shortest',
      '-movflags', '+faststart',
      `"${outputPath}"`
    ].join(' ');

    await this._runFFmpeg(cmd);
  }

  async _getMediaDuration(filePath) {
    try {
      const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
      const { stdout } = await execAsync(cmd);
      return parseFloat(stdout.trim()) || 0;
    } catch {
      return 0;
    }
  }

  _formatAssTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  }

  _sanitizeFilename(name) {
    return name
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100) || 'nursery_rhyme';
  }

  async _runFFmpeg(cmd) {
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        maxBuffer: 50 * 1024 * 1024  // 50MB buffer for FFmpeg output
      });
      return { stdout, stderr };
    } catch (err) {
      console.error('[ASSEMBLY] FFmpeg error:', err.stderr?.substring(0, 1000) || err.message);
      throw new Error(`FFmpeg failed: ${err.message}`);
    }
  }

  _cleanup(files) {
    for (const f of files) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch { /* ignore cleanup errors */ }
    }
  }
}

module.exports = AssemblyService;
