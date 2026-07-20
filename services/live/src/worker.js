/**
 * worker:live — the ffmpeg FANOUT + RECORDING worker. Consumes the RabbitMQ
 * live queues and spawns ffmpeg: fanout relays one ingest → a destination's RTMP
 * (codec copy, low CPU); recording muxes an ingest to a file. Long-running jobs
 * hold their message until the ffmpeg process exits; a non-zero exit or a spawn
 * failure (e.g. ffmpeg not installed) throws → bounded retry → dead-letter.
 *
 * Run separately from the gateway:  npm run worker:live
 */

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const rabbit = require('@exprsn/shared/utils/rabbit');
const config = require('./config');
const logger = require('./utils/logger');
const { FANOUT, RECORDING } = require('./services/liveQueue');
const { sequelize } = require('./config/database');
const { Recording } = require('./models');
const recordingModeration = require('./services/recordingModeration');

const FFMPEG = (config.ffmpeg && config.ffmpeg.binaryPath) || process.env.FFMPEG_BINARY_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || (config.ffmpeg && config.ffmpeg.ffprobePath) || 'ffprobe';

function runFfmpeg(args, label) {
  return new Promise((resolve, reject) => {
    logger.info('ffmpeg spawn', { label, cmd: `${FFMPEG} ${args.join(' ')}` });
    let proc;
    try {
      proc = spawn(FFMPEG, args);
    } catch (e) {
      return reject(new Error(`ffmpeg spawn failed: ${e.message}`));
    }
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr = (stderr + d.toString()).slice(-2000); });
    proc.on('error', (e) => reject(new Error(`ffmpeg spawn failed: ${e.message}`)));
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`))));
  });
}

/** Container duration in whole seconds via ffprobe; 0 if it can't be read. */
function probeDurationSeconds(filePath) {
  return new Promise((resolve) => {
    execFile(
      FFPROBE,
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { timeout: 30000 },
      (err, stdout) => {
        if (err) { logger.warn('ffprobe duration failed', { error: err.message }); return resolve(0); }
        const d = parseFloat(String(stdout).trim());
        return resolve(Number.isFinite(d) && d > 0 ? Math.round(d) : 0);
      },
    );
  });
}

async function handleFanout(job) {
  const dest = job.streamKey ? `${job.rtmpUrl}/${job.streamKey}` : job.rtmpUrl;
  logger.info('Fanout relay start', { streamId: job.streamId, destinationId: job.destinationId, platform: job.platform });
  await runFfmpeg(
    ['-hide_banner', '-loglevel', 'warning', '-re', '-i', job.inputUrl, '-c', 'copy', '-f', 'flv', dest],
    `fanout:${job.destinationId || job.platform}`
  );
  logger.info('Fanout relay ended cleanly', { streamId: job.streamId, destinationId: job.destinationId });
}

/**
 * Mark a recording terminal-failed (TASK-041). Best-effort — a DB miss here must
 * not mask the original ffmpeg failure. Rethrow is the caller's job.
 */
async function markRecordingFailed(recordingId, message) {
  if (!recordingId) return;
  try {
    const rec = await Recording.findByPk(recordingId);
    if (!rec) return;
    await rec.update({
      status: 'failed',
      metadata: { ...(rec.metadata || {}), error: String(message).slice(0, 500) },
    });
  } catch (e) {
    logger.warn('could not mark recording failed', { recordingId, error: e.message });
  }
}

async function handleRecording(job) {
  if (!job.outputPath) throw new Error('recording job missing outputPath');
  logger.info('Recording start', { id: job.streamId || job.roomId, recordingId: job.recordingId, out: job.outputPath });
  try {
    await runFfmpeg(
      ['-hide_banner', '-loglevel', 'warning', '-i', job.inputUrl, '-c', 'copy', job.outputPath],
      `record:${job.streamId || job.roomId}`
    );
  } catch (err) {
    // ffmpeg failed/spawn-failed. Mark the row failed so it isn't stuck
    // 'processing' forever, then rethrow so rabbit retries / dead-letters. A
    // later successful retry finalizes it to 'ready', self-correcting.
    await markRecordingFailed(job.recordingId, err.message);
    throw err;
  }
  logger.info('Recording ended cleanly', { id: job.streamId || job.roomId });

  // TASK-041: the worker is the authority for "the bytes are finalized". Write
  // back the location/size/duration and flip the row to 'ready', then hand off
  // to moderation (FEAT-074). Without a recordingId there is no row to finalize
  // (older jobs); the recording still exists on disk but is untracked.
  if (!job.recordingId) {
    logger.warn('recording job has no recordingId — cannot finalize DB row', { out: job.outputPath });
    return;
  }
  try {
    const size = fs.statSync(job.outputPath).size;
    const duration = await probeDurationSeconds(job.outputPath);
    const recording = await Recording.findByPk(job.recordingId);
    if (!recording) {
      logger.warn('recording row vanished before finalize', { recordingId: job.recordingId });
      return;
    }
    await recording.update({
      status: 'ready',
      storage_url: job.outputPath,
      file_size_bytes: size,
      duration_seconds: duration,
      completed_at: new Date(),
    });
    logger.info('Recording finalized', { recordingId: job.recordingId, size, duration });

    // FEAT-074: enqueue moderation (no-op when LIVE_RECORDING_MODERATION=off).
    // A moderation failure must not fail the recording job — it is best-effort
    // here; the reconcile sweep re-queues anything stranded.
    try {
      await recordingModeration.establishAndEnqueue(recording);
    } catch (e) {
      logger.error('could not enqueue recording moderation', { recordingId: job.recordingId, error: e.message });
    }
  } catch (err) {
    // The bytes exist but we could not finalize the row. Mark failed so it is not
    // stuck 'processing'; the file is on disk for manual recovery.
    logger.error('recording finalize failed', { recordingId: job.recordingId, error: err.message });
    await markRecordingFailed(job.recordingId, `finalize: ${err.message}`);
  }
}

async function main() {
  rabbit.setLogger(logger);
  // TASK-041: the worker now writes back to the recordings table on completion,
  // so it needs a live DB connection.
  await sequelize.authenticate();
  logger.info('worker:live DB connection established');
  if (!rabbit.isEnabled()) {
    logger.error('RabbitMQ disabled/unavailable — worker:live has nothing to consume');
    process.exit(1);
  }
  await rabbit.assertTopology({ exchange: FANOUT.exchange, routingKey: FANOUT.routingKey, queue: FANOUT.queue, deadLetter: true });
  await rabbit.assertTopology({ exchange: RECORDING.exchange, routingKey: RECORDING.routingKey, queue: RECORDING.queue, deadLetter: true });
  await rabbit.consume(FANOUT.queue, handleFanout, { prefetch: 4, maxAttempts: 2 });
  await rabbit.consume(RECORDING.queue, handleRecording, { prefetch: 2, maxAttempts: 2 });
  logger.info('worker:live consuming fanout + recording queues', { ffmpeg: FFMPEG });
}

async function shutdown() {
  try { await rabbit.close(); } catch (_) { /* noop */ }
  process.exit(0);
}

// Only boot (connect DB, open Rabbit consumers) when run as a script — guarding
// this lets the handlers be required in unit tests without side effects.
if (require.main === module) {
  main().catch((e) => { logger.error('worker:live fatal', { error: e.message }); process.exit(1); });
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { handleRecording, handleFanout, markRecordingFailed, probeDurationSeconds };
