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

    const validScenes = scenes.filter(s => s.videoPath && fs.existsSync(s.videoPath));

    if (validScenes.length === 0) {
      throw new Error('No valid video clips to assemble');
    }

    console.log(`[ASSEMBLY] Assembling ${validScenes.length} clips with audio`);

    // Step 1: Create subtitle file (ASS format for styled Urdu subtitles)
    const subtitlePath = path.join(outputDir, 'subtitles.ass');
    await this._createSubtitleFile(scenes, subtitlePath, width, height);

    // Step 2: Create a concat file for FFmpeg
    const concatPath = path.join(outputDir, 'concat.txt');
    await this._createConcatFile(validScenes, concatPath, audioDuration);

    // Step 3: Concatenate video clips
    const rawVideoPath = path.join(outputDir, 'raw_concat.mp4');
    await this._concatenateClips(concatPath, rawVideoPath, width, height);

    // Step 4: Get actual video duration
    const videoDuration = await this._getMediaDuration(rawVideoPath);

    // Step 5: Overlay audio + subtitles and produce final output
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
   * Create FFmpeg concat demuxer file
   * Handles timing by adjusting clip durations to match scene timings
   */
  async _createConcatFile(scenes, outputPath, targetDuration) {
    const lines = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const clipPath = path.resolve(scene.videoPath);

      // Calculate how long this clip should play
      const sceneDuration = scene.end - scene.start;

      lines.push(`file '${clipPath}'`);
      // Use outpoint to trim clips to desired duration
      lines.push(`duration ${sceneDuration.toFixed(3)}`);
    }

    // Add the last file again (FFmpeg concat quirk)
    if (scenes.length > 0) {
      const lastClip = path.resolve(scenes[scenes.length - 1].videoPath);
      lines.push(`file '${lastClip}'`);
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
    // Use the shorter of video/audio duration to avoid blank frames
    const videoDuration = await this._getMediaDuration(videoPath);
    const duration = Math.min(videoDuration, audioDuration);

    const cmd = [
      this.ffmpegPath,
      '-y',
      '-i', `"${videoPath}"`,
      '-i', `"${audioPath}"`,
      '-t', duration.toFixed(2),
      // Burn subtitles into video
      '-vf', `"ass='${subtitlePath.replace(/'/g, "'\\''").replace(/\\/g, '/')}'",scale=${width}:${height}`,
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

    console.log('[ASSEMBLY] Final mix: video + audio + subtitles...');
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
      .replace(/[^a-zA-Z0-9\u0600-\u06FF_\- ]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);
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
