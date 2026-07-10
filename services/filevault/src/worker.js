'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * FileVault image-moderation worker (FEAT-031)
 * Run with: npm run worker:filevault-moderation
 *
 * Drains `filevault-image-moderation`. Fetches the object's bytes, runs the
 * cortex vision passes, and writes the verdict + tags. Uploads never wait on
 * this; images stay hidden from other users until it produces a verdict.
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { createLogger } = require('@exprsn/shared');
const models = require('./models');
const storage = require('./storage');
const imageModeration = require('./services/imageModerationService');
const { initQueues, closeQueues, queues } = require('./queues/imageModeration');

const logger = createLogger('filevault-moderation-worker');

const { File, FileModeration } = models;

// A permanent client error: the bytes are not a decodable image. Retrying will
// never change that, so fail the job immediately instead of burning 4 attempts
// and 90s of backoff.
const PERMANENT = new Set(['UNSUPPORTED_IMAGE']);

async function processFile(fileId) {
  const file = await File.findByPk(fileId);
  if (!file) {
    logger.warn('file vanished before moderation', { fileId });
    return { skipped: true };
  }

  const [record] = await FileModeration.findOrCreate({
    where: { fileId },
    defaults: { fileId, status: 'pending' },
  });

  // Re-check: the flag may have been turned off, or the row may already be
  // resolved by an earlier attempt (jobs are idempotent, so this is a no-op).
  const initial = imageModeration.initialState(file);
  if (initial.status === 'skipped') {
    await record.update({ ...initial, attempts: record.attempts + 1 });
    return { status: initial.status, reason: initial.reason };
  }
  if (record.status === 'approved' || record.status === 'rejected') {
    return { status: record.status, alreadyResolved: true };
  }

  const buffer = await storage.retrieve(file.storageKey, file.storageBackend);

  let patch;
  try {
    patch = await imageModeration.evaluate(buffer);
  } catch (err) {
    const permanent = PERMANENT.has(err.code);
    await record.update({
      // Fail CLOSED: the image stays hidden either way. A permanent decode
      // failure is terminal; a transient one will be retried by Bull.
      status: permanent ? 'failed' : 'pending',
      reason: permanent ? 'unsupported_image' : 'error',
      attempts: record.attempts + 1,
      lastError: String(err.message).slice(0, 500), // never image bytes
    });
    if (permanent) {
      logger.warn('permanent moderation failure; not retrying', { fileId, code: err.code });
      return { status: 'failed', reason: 'unsupported_image' };
    }
    throw err; // let Bull retry with backoff
  }

  await record.update({ ...patch, attempts: record.attempts + 1 });

  if (patch.status === 'rejected') {
    // Escalate-only: hand the verdict to moderator so its rules, review queue,
    // and audit trail own the outcome. Never delete the object here.
    await escalate(file, patch).catch((err) =>
      logger.error('failed to escalate flagged image for review', { fileId, error: err.message }));
  }

  logger.info('image moderated', {
    fileId, status: patch.status, riskScore: patch.riskScore, tags: (patch.aiTags || []).length,
  });
  return { status: patch.status, riskScore: patch.riskScore };
}

/**
 * Route a flagged image into moderator's existing pipeline — its rules, review
 * queue, and audit trail — rather than re-implementing any of that here.
 *
 * The image verdict is passed as `precomputedResult`, so moderator scores the
 * IMAGE, not a text analysis of its alt-text. That distinction is the whole bug
 * in BUG-019: routing through the text analyzer meant the image's own
 * nsfw/violence scores never reached `requiresManualReview`, so a flagged image
 * was held from view but never actually reached a human.
 *
 * `contentType: 'image'` is a valid `moderation_items.content_type` enum value
 * (verified against the live DB); an invalid one throws inside moderator's dedup
 * query — the silent-failure shape of BUG-015 — so this is asserted, not assumed.
 */
async function escalate(file, patch) {
  // Required late: pulls in moderator's models. Keeping it out of module scope
  // means a filevault worker without moderator configured still boots.
  // eslint-disable-next-line global-require
  const moderationService = require('../../moderator/services/moderationService');
  const item = await moderationService.moderateContent({
    contentType: 'image',
    contentId: String(file.id),
    sourceService: 'filevault',
    userId: file.userId,
    contentText: [patch.altText, patch.textInImage].filter(Boolean).join('\n') || 'image',
    precomputedResult: patch.verdict, // the real image scores
    contentMetadata: {
      mimetype: file.mimetype,
      escalatedBy: 'cortex-vision',
    },
  });
  const moderationItemId = item && (item.moderationId || item.id);
  if (moderationItemId) {
    await FileModeration.update({ moderationItemId }, { where: { fileId: file.id } });
  }
}

async function startWorker() {
  try {
    logger.info('Starting FileVault image-moderation worker');
    await models.sequelize.authenticate();
    initQueues();

    const concurrency = Math.max(1, Number(process.env.FILEVAULT_MODERATION_CONCURRENCY) || 1);
    queues.imageModeration.process('moderate-image', concurrency, async (job) => {
      const { fileId } = job.data;
      logger.info('moderating image', { fileId, attempt: job.attemptsMade + 1 });
      return processFile(fileId);
    });

    logger.info('FileVault image-moderation worker started', {
      concurrency,
      featureEnabled: imageModeration.featureEnabled(),
      riskThreshold: imageModeration.imageRiskThreshold(),
    });
  } catch (error) {
    logger.error('Failed to start worker', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully`);
  try {
    await closeQueues();
    await models.sequelize.close();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) {
  startWorker();
}

module.exports = { startWorker, processFile, escalate };
