'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Video-moderation pipeline (FEAT-073).
 *
 * Turn one stored video into a moderation verdict, fail-CLOSED. The heavy,
 * unbounded part of video moderation lives here — stream the bytes to disk
 * (never buffer a multi-GB recording), ffprobe the duration, extract a bounded
 * set of keyframes with ffmpeg, and run cortex's per-frame vision passes.
 *
 * Failure policy mirrors the image chokepoint:
 *   moderateFrames → FAIL CLOSED. A throw propagates to the worker, which leaves
 *                    the row hidden (`pending`) or terminal `failed` — NEVER
 *                    approved. A video we could not fully inspect is never served.
 *   describeFrames → FAIL SOFT. Tags/alt-text are a convenience; losing them
 *                    must never sink the verdict.
 *
 * ffmpeg/ffprobe are resolved from PATH (overridable via FFMPEG_PATH/FFPROBE_PATH).
 * A missing binary is a TRANSIENT failure — we throw so Bull retries and the row
 * stays `pending`, never approve-by-default a video we couldn't look at.
 *
 * The temp dir is 0700 and ALWAYS purged in a `finally`, even on throw.
 * ═══════════════════════════════════════════════════════════
 */

const os = require('os');
const path = require('path');
const fsp = require('fs').promises;
const { execFile } = require('child_process');
const { createLogger } = require('@exprsn/shared');

const cortex = require('../../../services/cortex/src/client');
const storage = require('../../../services/filevault/src/storage');
const imageModeration = require('../../../services/filevault/src/services/imageModerationService');

const logger = createLogger('filevault-video-pipeline');

const ffmpegBin = () => process.env.FFMPEG_PATH || 'ffmpeg';
const ffprobeBin = () => process.env.FFPROBE_PATH || 'ffprobe';

function envInt(name, def) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : def;
}

/** Tag an error as transient/permanent so the worker can split retry vs fail. */
function coded(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** Promisified execFile that normalizes a missing binary to a transient code. */
function run(bin, args, { timeoutMs = 0 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        if (err.code === 'ENOENT') {
          reject(coded('FFMPEG_UNAVAILABLE',
            `${bin} not found — install ffmpeg/ffprobe or set FFMPEG_PATH/FFPROBE_PATH`));
          return;
        }
        err.stderr = String(stderr || '').slice(0, 500);
        reject(err);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

/**
 * Container duration in seconds (0 if ffprobe can't determine it).
 * A missing binary stays TRANSIENT; a non-ENOENT ffprobe failure means the bytes
 * are not a decodable video — terminal UNSUPPORTED_VIDEO (retrying won't help).
 */
async function probeDuration(videoPath) {
  let stdout;
  try {
    ({ stdout } = await run(ffprobeBin(), [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ], { timeoutMs: envInt('VIDEO_FFPROBE_TIMEOUT_MS', 30000) }));
  } catch (err) {
    if (err.code === 'FFMPEG_UNAVAILABLE') throw err;
    throw coded('UNSUPPORTED_VIDEO', `ffprobe could not read the video: ${err.message}`);
  }
  const d = parseFloat(stdout.trim());
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/**
 * The timestamps (seconds) to sample: one every VIDEO_FRAME_INTERVAL_S, clamped
 * to [VIDEO_FRAMES_MIN, VIDEO_FRAMES_MAX], spread across the runtime (mid-bucket
 * to dodge black lead-in/out frames). If duration is unknown, fall back to a
 * fixed early-offset ladder.
 */
function frameTimestamps(duration) {
  const interval = envInt('VIDEO_FRAME_INTERVAL_S', 30);
  const min = envInt('VIDEO_FRAMES_MIN', 3);
  const max = envInt('VIDEO_FRAMES_MAX', 12);
  let count = duration > 0 ? Math.ceil(duration / interval) : min;
  count = Math.min(max, Math.max(min, count));
  const ts = [];
  for (let i = 0; i < count; i += 1) {
    ts.push(duration > 0 ? (duration * (i + 0.5)) / count : i * interval);
  }
  return ts;
}

/** Extract one JPEG per timestamp; return the readable frame Buffers. */
async function extractFrames(videoPath, tmpDir, timestamps) {
  const buffers = [];
  const perFrameTimeout = envInt('VIDEO_FRAME_EXTRACT_TIMEOUT_MS', 60000);
  for (let i = 0; i < timestamps.length; i += 1) {
    const outPath = path.join(tmpDir, `frame-${i}.jpg`);
    try {
      // Fast seek (-ss before -i) is cheap and accurate enough for moderation.
      // eslint-disable-next-line no-await-in-loop
      await run(ffmpegBin(), [
        '-nostdin',
        '-loglevel', 'error',
        '-ss', timestamps[i].toFixed(3),
        '-i', videoPath,
        '-frames:v', '1',
        '-q:v', '3',
        '-y', outPath,
      ], { timeoutMs: perFrameTimeout });
      // eslint-disable-next-line no-await-in-loop
      const buf = await fsp.readFile(outPath).catch(() => null);
      if (buf && buf.length) buffers.push(buf);
    } catch (err) {
      // A missing binary can't get better on the next timestamp — abort transiently.
      if (err.code === 'FFMPEG_UNAVAILABLE') throw err;
      logger.warn('keyframe extraction failed for one timestamp', { index: i, error: err.message });
    }
  }
  return buffers;
}

/**
 * The shared heavy pass: probe → extract keyframes into `framesDir` → per-frame
 * vision (fail CLOSED) + tags (fail SOFT). Returns { verdict, description }.
 * Does NOT manage `framesDir` or the source file — the caller owns both.
 */
async function runFramePasses(videoPath, framesDir, earlyExitRisk) {
  const duration = await probeDuration(videoPath);
  const timestamps = frameTimestamps(duration);
  const frames = await extractFrames(videoPath, framesDir, timestamps);
  if (!frames.length) {
    // Not a single frame to inspect → we CANNOT clear this video. Transient so
    // Bull retries; the row stays hidden meanwhile. Fail closed.
    throw coded('FFMPEG_NO_FRAMES', 'no keyframes could be extracted for inspection');
  }

  // --- verdict: FAIL CLOSED. A throw here propagates to the caller.
  const verdict = await cortex.moderateFrames(frames, { earlyExitAtRisk: earlyExitRisk });

  // --- tags/alt-text: FAIL SOFT. Never let this sink the verdict.
  let description = null;
  try {
    description = await cortex.describeFrames(frames);
  } catch (err) {
    logger.warn('video description unavailable (continuing without tags)', {
      code: err.code, error: err.message,
    });
  }
  return { verdict, description };
}

/**
 * Shape the moderation-row patch from a verdict + description, given the CALLER's
 * mode + risk threshold. Shared by the FileVault (FileModeration) and Live
 * (RecordingModeration) paths — identical enforce/shadow semantics.
 *   enforce + flagged -> `rejected` (HELD, escalated).
 *   shadow  + flagged -> `approved`/`shadow_flagged` (recorded, never held).
 *   clean (either)    -> `approved`.
 */
function buildPatch(verdict, description, mode, riskThreshold) {
  const flagged = verdict.riskScore >= riskThreshold;
  const enforcing = mode === 'enforce';
  let status;
  let reason;
  if (flagged) {
    status = enforcing ? 'rejected' : 'approved';
    reason = enforcing ? 'flagged' : 'shadow_flagged';
  } else {
    status = 'approved';
    reason = 'clean';
  }
  return {
    status,
    reason,
    riskScore: verdict.riskScore,
    verdict, // scores/flags/explanation/frameScores/framesInspected — no pixels
    provider: verdict.provider,
    backend: verdict.backend, // ignored by models without the column (FileModeration)
    model: verdict.model,
    altText: description ? description.altText : null,
    aiTags: description ? description.tags : [],
    textInImage: description ? description.textInImage : null,
    lastError: null,
  };
}

/**
 * Moderate one FileVault File row (FEAT-073). Streams the bytes to a temp dir
 * (NEVER storage.retrieve() — whole-buffer → OOM on big videos), moderates, and
 * ALWAYS purges the temp dir (which may hold the whole decrypted recording).
 * Throws (fail closed); the worker decides retry vs terminal by err.code.
 */
async function evaluateVideo(file) {
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'fv-vidmod-'));
  await fsp.chmod(tmpDir, 0o700).catch(() => {});
  try {
    const videoPath = path.join(tmpDir, 'source');
    await storage.retrieveToFile(file.storageKey, file.storageBackend, videoPath);
    const { verdict, description } = await runFramePasses(
      videoPath, tmpDir, envInt('VIDEO_EARLY_EXIT_RISK', 85),
    );
    return buildPatch(
      verdict, description,
      imageModeration.videoModerationMode(), imageModeration.videoRiskThreshold(),
    );
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch((err) =>
      logger.warn('failed to purge video moderation temp dir', { tmpDir, error: err.message }));
  }
}

/**
 * Moderate a recording ALREADY on local disk (FEAT-074). worker:live muxed the
 * recording to `localPath`; that file is NOT ours to delete — only the frames
 * temp dir is. `mode`/`riskThreshold` come from the LIVE flags, not FileVault's.
 * Throws (fail closed) on any moderation/infra failure.
 */
async function evaluateLocalVideo(localPath, { mode, riskThreshold, earlyExitRisk } = {}) {
  const framesDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'live-vidmod-'));
  await fsp.chmod(framesDir, 0o700).catch(() => {});
  try {
    const { verdict, description } = await runFramePasses(
      localPath, framesDir, earlyExitRisk || envInt('VIDEO_EARLY_EXIT_RISK', 85),
    );
    return buildPatch(verdict, description, mode, riskThreshold);
  } finally {
    // Purge the FRAMES temp dir only — never the source recording.
    await fsp.rm(framesDir, { recursive: true, force: true }).catch((err) =>
      logger.warn('failed to purge live frames temp dir', { framesDir, error: err.message }));
  }
}

module.exports = {
  evaluateVideo,
  evaluateLocalVideo,
  runFramePasses,
  buildPatch,
  frameTimestamps,
  probeDuration,
  extractFrames,
  ffmpegBin,
  ffprobeBin,
};
