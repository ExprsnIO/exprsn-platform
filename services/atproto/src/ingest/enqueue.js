/**
 * ═══════════════════════════════════════════════════════════
 * Enqueue firehose posts onto the moderation queue
 *
 * Normalizes a firehose event into the field shape moderationService actually
 * reads (contentText/contentUrl/contentMetadata), and sets jobId = hash(uri) so
 * duplicate enqueues collapse before reaching the DB (the moderator also dedups
 * on (sourceService, contentType, contentId)).
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const { moderationQueue } = require('./queue');

const JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 86400 },
  removeOnFail: { age: 604800 },
};

/** Best-effort thumbnail URL for the first embedded image (Bluesky CDN). */
function firstImageUrl(did, record) {
  try {
    const embed = record?.embed;
    const images =
      embed?.images ||
      (embed?.$type === 'app.bsky.embed.recordWithMedia' ? embed.media?.images : null);
    const ref = images?.[0]?.image?.ref;
    const link = ref?.$link || (typeof ref?.toString === 'function' ? ref.toString() : null);
    if (link) return `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${link}@jpeg`;
  } catch (_) { /* noop */ }
  return null;
}

async function enqueuePost(evt) {
  const jobId = `atp:${crypto.createHash('sha256').update(evt.uri).digest('hex')}`;
  return moderationQueue.add(
    'moderate-atproto',
    {
      uri: evt.uri,
      cid: evt.cid,
      did: evt.did,
      collection: evt.collection,
      rkey: evt.rkey,
      text: evt.record?.text || '',
      langs: evt.record?.langs || [],
      mediaUrl: firstImageUrl(evt.did, evt.record),
    },
    { jobId, ...JOB_OPTS }
  );
}

/**
 * Enqueue a label-negation job (firehose delete, appeal win, or manual). The
 * single-writer worker processes it so label `seq` ordering is preserved.
 */
async function enqueueNegation(uri, reason = 'deleted') {
  const jobId = `atpneg:${crypto.createHash('sha256').update(`${uri}:${reason}`).digest('hex')}`;
  return moderationQueue.add('negate-atproto', { uri, reason }, { jobId, ...JOB_OPTS });
}

/**
 * Enqueue an 'ingest-label-atproto' job: a trusted external labeler flagged a
 * URI, so we fetch the post and run our AI moderation + auto-action.
 */
async function enqueueTrustedLabel({ uri, src, val }) {
  const jobId = `atptl:${crypto.createHash('sha256').update(`${uri}:${src}:${val}`).digest('hex')}`;
  return moderationQueue.add('ingest-label-atproto', { uri, src, val }, { jobId, ...JOB_OPTS });
}

/** Backpressure signal: waiting + active + delayed jobs in the moderation queue. */
async function queueDepth() {
  const c = await moderationQueue.getJobCounts();
  return (c.waiting || 0) + (c.active || 0) + (c.delayed || 0);
}

module.exports = { enqueuePost, enqueueNegation, enqueueTrustedLabel, queueDepth, moderationQueue };
