/**
 * ═══════════════════════════════════════════════════════════
 * Moderation bridge — the 'moderate-atproto' job processor
 *
 * Reuses the moderator's in-process engine (no logic duplication): calls
 * moderationService.moderateContent() with the firehose post mapped into its
 * field shape, then emits signed labels from the verdict. Runs inside the
 * atproto worker process (which both produces and consumes these jobs).
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../../utils/logger');
const config = require('../../config');
const models = require('../../models');
const { moderationQueue } = require('./queue');
const { didToUuid, parseAtUri } = require('../util/identifiers');
const labelService = require('../labeler/labelService');
const appviewClient = require('./appviewClient');

// The moderator's verdict engine, required in-process (same pattern its own
// bull-worker uses). This pulls up the moderator's DB pool + AI providers.
const moderationService = require('../../../moderator/services/moderationService');
const aiProviderFactory = require('../../../moderator/src/ai-providers');

const CONCURRENCY = parseInt(process.env.ATPROTO_BRIDGE_CONCURRENCY, 10) || 4;

let warnedNoProvider = false;

/**
 * True when at least one AI provider (Claude/OpenAI/DeepSeek) is configured.
 * With none, moderationService.moderateContent throws on every call, so the
 * firehose path would retry-storm and fill the queue. We skip cleanly instead.
 */
function hasAiProvider() {
  return aiProviderFactory.getAvailableProviders().length > 0;
}

async function processJob(job) {
  const { uri, cid, did, collection, rkey, text, langs, mediaUrl } = job.data;

  // No AI provider → the moderation engine can't run. Skip (job completes, so it
  // doesn't retry-storm) and warn once per process rather than per event.
  if (!hasAiProvider()) {
    if (!warnedNoProvider) {
      warnedNoProvider = true;
      logger.error('Skipping atproto moderation — no AI provider configured (set CLAUDE_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY)');
    }
    return { uri, skipped: 'no_ai_provider' };
  }

  // Map AT-URI ↔ case; keep the real author DID (moderator.userId is a UUID).
  await models.UriCaseMap.upsert({ uri, cid, authorDid: did, status: 'pending' });

  const result = await moderationService.moderateContent({
    contentType: 'post',
    contentId: uri,
    sourceService: 'bluesky',
    userId: didToUuid(did),
    contentText: text,
    contentUrl: mediaUrl || undefined,
    contentMetadata: { authorDid: did, cid, collection, rkey, langs, source: 'atproto-firehose' },
  });

  await models.UriCaseMap.update(
    { moderationCaseId: result.moderationId, status: 'moderated' },
    { where: { uri } }
  );

  // Verdict → signed labels (no-op when the content is clean / no identity yet).
  const labels = await labelService.emitForCase(result, {
    uri,
    cid,
    moderationCaseId: result.moderationId,
  });

  return { uri, action: result.action, riskScore: result.riskScore, labels: labels.length };
}

/** Process a 'negate-atproto' job — retract our labels for a URI. */
async function processNegation(job) {
  const { uri, reason } = job.data;
  const created = await labelService.negateForUri(uri, { reason });
  return { uri, negated: created.length, reason };
}

/**
 * Process an 'ingest-label-atproto' job — a TRUSTED external labeler flagged a
 * URI. We fetch the post from the AppView and run our AI moderation (which emits
 * our own labels + creates a ModerationCase), then auto-hide for severe values.
 */
async function processTrustedLabel(job) {
  const { uri, src, val } = job.data;
  const parsed = parseAtUri(uri);
  const authorDid = parsed ? parsed.did : null;

  // AI pass is BEST-EFFORT: if the AppView is unreachable or AI is unconfigured
  // / errors, we still record + auto-action below (trusted labelers are
  // authoritative). Never let the AI step block the moderation outcome.
  let aiModerated = false;
  try {
    const post = await appviewClient.getPost(uri);
    if (post && post.text && authorDid) {
      await models.UriCaseMap.upsert({ uri, authorDid, status: 'pending' });
      const result = await moderationService.moderateContent({
        contentType: 'post',
        contentId: uri,
        sourceService: 'bluesky',
        userId: didToUuid(authorDid),
        contentText: post.text,
        contentUrl: post.image || undefined,
        contentMetadata: { authorDid, source: 'trusted-label', trustedLabeler: src, externalVal: val },
      });
      await models.UriCaseMap.update(
        { moderationCaseId: result.moderationId, status: 'moderated' },
        { where: { uri } }
      );
      await labelService.emitForCase(result, { uri, moderationCaseId: result.moderationId });
      aiModerated = true;
    }
  } catch (err) {
    logger.warn('trusted-label AI pass failed (continuing to auto-action)', { uri, error: err.message });
  }

  // Auto-action: trusted labelers are authoritative for severe values → hide.
  const severe = config.consume.autoActionValues.includes(val);
  if (severe) {
    await labelService.createLabel({ uri, val: '!hide' });
  }

  return { uri, aiModerated, autoHidden: severe, trustedLabeler: src, externalVal: val };
}

/** Register the processor on the shared moderation queue. Call once at startup. */
function register() {
  labelService.init(models);
  if (!hasAiProvider()) {
    logger.error('atproto bridge started with NO AI provider configured — moderate-atproto jobs will be skipped until one is set (CLAUDE_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY)');
  }
  moderationQueue.process('moderate-atproto', CONCURRENCY, processJob);
  moderationQueue.process('negate-atproto', CONCURRENCY, processNegation);
  moderationQueue.process('ingest-label-atproto', CONCURRENCY, processTrustedLabel);

  const ours = new Set(['moderate-atproto', 'negate-atproto', 'ingest-label-atproto']);
  moderationQueue.on('failed', (job, err) => {
    if (job && ours.has(job.name)) {
      logger.warn(`${job.name} job failed`, { jobId: job.id, error: err.message });
    }
  });

  logger.info('Registered atproto processors', { concurrency: CONCURRENCY, jobs: [...ours] });
  return moderationQueue;
}

module.exports = { register, processJob, processNegation, processTrustedLabel, CONCURRENCY };
