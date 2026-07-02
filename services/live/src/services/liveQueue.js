/**
 * Live RabbitMQ queues — ffmpeg FANOUT (relay one ingest → N RTMP destinations)
 * and RECORDING jobs. The gateway PUBLISHES; the separate `worker:live` process
 * CONSUMES and spawns ffmpeg. Uses the shared amqp helper (assert/publish/DLQ).
 */

const rabbit = require('@exprsn/shared/utils/rabbit');
const logger = require('../utils/logger');

const FANOUT = { exchange: 'exprsn.live.fanout', queue: 'exprsn.live.fanout', routingKey: 'fanout' };
const RECORDING = { exchange: 'exprsn.live.recording', queue: 'exprsn.live.recording', routingKey: 'record' };

let asserted = false;

async function ensureTopology() {
  if (asserted || !rabbit.isEnabled()) return rabbit.isEnabled();
  rabbit.setLogger(logger);
  await rabbit.assertTopology({ exchange: FANOUT.exchange, routingKey: FANOUT.routingKey, queue: FANOUT.queue, deadLetter: true });
  await rabbit.assertTopology({ exchange: RECORDING.exchange, routingKey: RECORDING.routingKey, queue: RECORDING.queue, deadLetter: true });
  asserted = true;
  return true;
}

/**
 * Enqueue one fanout job per destination for a stream. Each job tells the worker
 * to relay `inputUrl` → the destination's RTMP ingest. Returns the count queued.
 */
async function enqueueFanout(streamId, inputUrl, destinations = []) {
  if (!(await ensureTopology())) { logger.warn('RabbitMQ disabled — fanout not queued', { streamId }); return 0; }
  let n = 0;
  for (const d of destinations) {
    const rtmpUrl = d.rtmpUrl || d.ingestUrl || (d.rtmp_url);
    if (!rtmpUrl) continue;
    await rabbit.publish(FANOUT.exchange, FANOUT.routingKey, {
      streamId,
      destinationId: d.id || d.destinationId || null,
      platform: d.platform || 'rtmp',
      inputUrl,
      rtmpUrl,
      streamKey: d.streamKey || d.stream_key || '',
      options: d.options || {},
      queuedAt: new Date().toISOString()
    });
    n += 1;
  }
  logger.info('Fanout jobs queued', { streamId, count: n });
  return n;
}

/** Enqueue a recording job for a stream/room. */
async function enqueueRecording(job) {
  if (!(await ensureTopology())) { logger.warn('RabbitMQ disabled — recording not queued', job); return false; }
  await rabbit.publish(RECORDING.exchange, RECORDING.routingKey, { ...job, queuedAt: new Date().toISOString() });
  logger.info('Recording job queued', { streamId: job.streamId, roomId: job.roomId });
  return true;
}

/** Queue depths for the admin Workers view. */
async function stats() {
  if (!rabbit.isEnabled()) return { enabled: false };
  return {
    enabled: true,
    fanout: { depth: await rabbit.queueDepth(FANOUT.queue), dlq: await rabbit.queueDepth(`${FANOUT.queue}.dlq`) },
    recording: { depth: await rabbit.queueDepth(RECORDING.queue), dlq: await rabbit.queueDepth(`${RECORDING.queue}.dlq`) }
  };
}

module.exports = { FANOUT, RECORDING, ensureTopology, enqueueFanout, enqueueRecording, stats };
