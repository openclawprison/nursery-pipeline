const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);

class AssemblyService {
  constructor() {
    this.ffmpegPath = 'ffmpeg';
  }

  async assembleVideo(scenes, audioPath, audioDuration, outputDir, options = {}) {
    console.log('[ASSEMBLY] Starting video assembly...');

    const validScenes = scenes.filter(s => s.videoPath && fs.existsSync(s.videoPath));
    if (validScenes.length === 0) {
      throw new Error('No valid video clips to assemble');
    }

    console.log(`[ASSEMBLY] Assembling ${validScenes.length} clips with audio`);

    // Step 1: Process clips (loop short ones, trim long ones)
    const concatPath = path.join(outputDir, 'concat.txt');
    await this._createConcatFile(validScenes, concatPath, audioDuration);

    // Step 2: Concatenate video clips
    const rawVideoPath = path.join(outputDir, 'raw_concat.mp4');
    await this._concatenateClips(concatPath, rawVideoPath);

    // Step 3: Mix video + audio
    const finalPath = path.join(outputDir, `${this._sanitizeFilename(options.title || 'nursery_rhyme')}.mp4`);
    await this._finalMix(rawVideoPath, audioPath, finalPath, audioDuration);

    // Cleanup
    this._cleanup([concatPath, rawVideoPath]);

    console.log('[ASSEMBLY] Final video created:', finalPath);
    return finalPath;
  }

  async _createConcatFile(scenes, outputPath, targetDuration) {
    const processedDir = path.join(path.dirname(outputPath), 'processed_clips');
    if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

    const lines = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const clipPath = path.resolve(scene.videoPath);
      const sceneDuration = scene.end - scene.start;
      const processedPath = path.join(processedDir, `proc_${String(i).padStart(3, '0')}.mp4`);

      const clipDuration = await this._getMediaDuration(clipPath);
      console.log(`[ASSEMBLY] Scene ${i}: need ${sceneDuration.toFixed(1)}s, clip is ${clipDuration.toFixed(1)}s`);

      if (clipDuration <= 0) {
        console.log(`[ASSEMBLY] Skipping scene ${i} — invalid clip`);
        continue;
      }

      try {
        if (clipDuration >= sceneDuration) {
          // Clip is long enough — trim
          const cmd = [
            this.ffmpegPath, '-y',
            '-i', `"${clipPath}"`,
            '-t', sceneDuration.toFixed(3),
            '-c', 'copy',
            `"${processedPath}"`
          ].join(' ');
          await this._runFFmpeg(cmd);
        } else {
          // Clip is too short — loop to fill
          const loopCount = Math.ceil(sceneDuration / clipDuration);
          const cmd = [
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
          await this._runFFmpeg(cmd);
        }
        lines.push(`file '${path.resolve(processedPath)}'`);
      } catch (err) {
        console.error(`[ASSEMBLY] Failed clip ${i}:`, err.message);
        lines.push(`file '${clipPath}'`);
      }
    }

    if (lines.length > 0) {
      lines.push(lines[lines.length - 1]);
    }

    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
    console.log('[ASSEMBLY] Concat file created');
  }

  async _concatenateClips(concatPath, outputPath) {
    const cmd = [
      this.ffmpegPath, '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', `"${concatPath}"`,
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-an',
      `"${outputPath}"`
    ].join(' ');

    console.log('[ASSEMBLY] Concatenating clips...');
    await this._runFFmpeg(cmd);
  }

  async _finalMix(videoPath, audioPath, outputPath, audioDuration) {
    const videoDuration = await this._getMediaDuration(videoPath);
    const duration = Math.min(videoDuration, audioDuration);

    console.log('[ASSEMBLY] Final mix: video + audio');

    const cmd = [
      this.ffmpegPath, '-y',
      '-i', `"${videoPath}"`,
      '-i', `"${audioPath}"`,
      '-t', duration.toFixed(2),
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
    } catch { return 0; }
  }

  _sanitizeFilename(name) {
    return name
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100) || 'nursery_rhyme';
  }

  async _runFFmpeg(cmd) {
    try {
      const { stdout, stderr } = await execAsync(cmd, { maxBuffer: 50 * 1024 * 1024 });
      return { stdout, stderr };
    } catch (err) {
      console.error('[ASSEMBLY] FFmpeg error:', err.stderr?.substring(0, 1000) || err.message);
      throw new Error(`FFmpeg failed: ${err.message}`);
    }
  }

  _cleanup(files) {
    for (const f of files) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}

module.exports = AssemblyService;
