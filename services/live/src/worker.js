/**
 * worker:live — the ffmpeg FANOUT + RECORDING worker. Consumes the RabbitMQ
 * live queues and spawns ffmpeg: fanout relays one ingest → a destination's RTMP
 * (codec copy, low CPU); recording muxes an ingest to a file. Long-running jobs
 * hold their message until the ffmpeg process exits; a non-zero exit or a spawn
 * failure (e.g. ffmpeg not installed) throws → bounded retry → dead-letter.
 *
 * Run separately from the gateway:  npm run worker:live
 */

const { spawn } = require('child_process');
const rabbit = require('@exprsn/shared/utils/rabbit');
const config = require('./config');
const logger = require('./utils/logger');
const { FANOUT, RECORDING } = require('./services/liveQueue');

const FFMPEG = (config.ffmpeg && config.ffmpeg.binaryPath) || process.env.FFMPEG_BINARY_PATH || 'ffmpeg';

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

async function handleFanout(job) {
  const dest = job.streamKey ? `${job.rtmpUrl}/${job.streamKey}` : job.rtmpUrl;
  logger.info('Fanout relay start', { streamId: job.streamId, destinationId: job.destinationId, platform: job.platform });
  await runFfmpeg(
    ['-hide_banner', '-loglevel', 'warning', '-re', '-i', job.inputUrl, '-c', 'copy', '-f', 'flv', dest],
    `fanout:${job.destinationId || job.platform}`
  );
  logger.info('Fanout relay ended cleanly', { streamId: job.streamId, destinationId: job.destinationId });
}

async function handleRecording(job) {
  if (!job.outputPath) throw new Error('recording job missing outputPath');
  logger.info('Recording start', { id: job.streamId || job.roomId, out: job.outputPath });
  await runFfmpeg(
    ['-hide_banner', '-loglevel', 'warning', '-i', job.inputUrl, '-c', 'copy', job.outputPath],
    `record:${job.streamId || job.roomId}`
  );
  logger.info('Recording ended cleanly', { id: job.streamId || job.roomId });
}

async function main() {
  rabbit.setLogger(logger);
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

main().catch((e) => { logger.error('worker:live fatal', { error: e.message }); process.exit(1); });

async function shutdown() {
  try { await rabbit.close(); } catch (_) { /* noop */ }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
