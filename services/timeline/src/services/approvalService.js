/**
 * ═══════════════════════════════════════════════════════════
 * Post approval service — implements "Require Approval for New Posts".
 *
 * When the moderation config enables requireApproval, new posts are held
 * (visibility forced to 'private', metadata.approval = { status: 'pending',
 * requestedVisibility }) and an approval request is dispatched to the
 * configured mechanism (see moderationConfig for the vocabulary):
 *
 *   lowcode_workflow — POST the lowcode flow's webhook trigger
 *   lowcode_app      — emit on the in-process plugin hook bus
 *   webhook          — HMAC-signed POST to an arbitrary URL
 *   manual           — nothing to dispatch; an admin decides
 *
 * Decisions come back through POST /api/webhooks/approval (HMAC-signed with
 * the configured approvalSecret) or the admin route POST /api/posts/:id/approval,
 * both of which call applyDecision().
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const moderationConfig = require('./moderationConfig');
const { getInternalHttpsAgent } = require('@exprsn/shared/utils/httpAgent');

const GATEWAY_BASE = (process.env.TIMELINE_SERVICE_URL || 'https://localhost:8443/timeline').replace(/\/+$/, '');
const LOWCODE_BASE = (process.env.LOWCODE_SERVICE_URL || GATEWAY_BASE.replace(/\/timeline$/, '/lowcode')).replace(/\/+$/, '');

/** The moderation section, resolved once per call site. */
async function getPolicy() {
  return moderationConfig.getModeration();
}

/** Compact, side-effect-free projection of a post for outbound payloads. */
function postPayload(post) {
  const json = post.toJSON ? post.toJSON() : post;
  return {
    id: json.id,
    userId: json.userId,
    content: json.content,
    contentType: json.contentType,
    visibility: json.visibility,
    groupId: json.groupId ?? null,
    createdAt: json.createdAt
  };
}

/**
 * Hold a freshly-created post for approval: force it private and record the
 * requested visibility so an approval can restore it.
 */
async function holdForApproval(post, requestedVisibility, mechanism) {
  await post.update({
    visibility: 'private',
    metadata: {
      ...(post.metadata || {}),
      approval: {
        status: 'pending',
        mechanism,
        requestedVisibility: requestedVisibility || 'public',
        requestedAt: new Date().toISOString()
      }
    }
  });
  return post;
}

/**
 * Fire-and-forget dispatch of the approval request to the configured
 * mechanism. Never throws into the request path — callers .catch() anyway,
 * and every branch here logs its own failure.
 */
async function dispatchApprovalRequest(post) {
  const policy = await getPolicy();
  const mechanism = policy.approvalMechanism || 'manual';
  const target = (policy.approvalTarget || '').trim();

  const body = {
    event: 'timeline.post.approval.requested',
    post: postPayload(post),
    callback: {
      url: `${GATEWAY_BASE}/api/webhooks/approval`,
      method: 'POST',
      body: { postId: post.id, decision: 'approved | rejected' },
      signature: 'x-webhook-signature: sha256 HMAC (hex) of the raw JSON body, keyed with the configured approval secret'
    }
  };

  try {
    switch (mechanism) {
      case 'lowcode_workflow': {
        // approvalTarget = "<appKey>/<flowKey>"; the flow's webhook trigger
        // authenticates via its shared secret (X-Hook-Token).
        if (!/^[^/\s]+\/[^/\s]+$/.test(target)) {
          logger.warn('Approval dispatch skipped: approvalTarget is not "<appKey>/<flowKey>"', { target });
          return false;
        }
        await axios.post(`${LOWCODE_BASE}/api/hooks/flows/${target}`, body, {
          httpsAgent: getInternalHttpsAgent(),
          timeout: 10000,
          headers: policy.approvalSecret ? { 'X-Hook-Token': policy.approvalSecret } : {}
        });
        return true;
      }

      case 'lowcode_app': {
        // In-process hook bus — event-triggered lowcode flows (in the target
        // app or any listener) pick this up. Inert unless LOWCODE_ENABLED /
        // PLUGINS_ENABLED; lazily required and wrapped so a missing plugins
        // module can't affect post creation.
        const pluginHost = require('../../../plugins/src/services/pluginHost');
        await pluginHost.emit('timeline.post.approval.requested', {
          module: 'timeline',
          appKey: target || null,
          ...body
        });
        return true;
      }

      case 'webhook': {
        if (!/^https?:\/\//.test(target)) {
          logger.warn('Approval dispatch skipped: approvalTarget is not a URL', { target });
          return false;
        }
        const raw = JSON.stringify(body);
        const secret = policy.approvalSecret || process.env.TIMELINE_APPROVAL_WEBHOOK_SECRET;
        const headers = { 'Content-Type': 'application/json' };
        if (secret) {
          headers['X-Webhook-Signature'] = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
        }
        await axios.post(target, raw, { headers, timeout: 10000, httpsAgent: getInternalHttpsAgent() });
        return true;
      }

      case 'manual':
      default:
        // Nothing to dispatch — the post waits for an admin decision.
        return true;
    }
  } catch (error) {
    logger.error('Approval dispatch failed', { mechanism, postId: post.id, error: error.message });
    return false;
  }
}

/**
 * Apply an approval decision to a held post.
 *
 * @param {string} postId
 * @param {string} decision - 'approved' | 'rejected' (accepts approve/reject)
 * @param {Object} [meta] - { decidedBy, reason }
 * @returns {Object} the updated post
 * @throws {Error} with .status when the post is missing or not pending
 */
async function applyDecision(postId, decision, meta = {}) {
  const { Post } = require('../models');
  const normalized = /^approve/i.test(decision) ? 'approved' : /^reject/i.test(decision) ? 'rejected' : null;
  if (!normalized) {
    const err = new Error(`Invalid decision "${decision}" — expected approved|rejected`);
    err.status = 400;
    throw err;
  }

  const post = await Post.findByPk(postId);
  if (!post || post.deleted) {
    const err = new Error('Post not found');
    err.status = 404;
    throw err;
  }

  const approval = (post.metadata || {}).approval;
  if (!approval || approval.status !== 'pending') {
    const err = new Error('Post is not awaiting approval');
    err.status = 409;
    throw err;
  }

  const updates = {
    metadata: {
      ...(post.metadata || {}),
      approval: {
        ...approval,
        status: normalized,
        decidedAt: new Date().toISOString(),
        decidedBy: meta.decidedBy || null,
        reason: meta.reason || null
      }
    }
  };
  if (normalized === 'approved') {
    updates.visibility = approval.requestedVisibility || 'public';
  }

  await post.update(updates);
  logger.info('Post approval decision applied', { postId, decision: normalized });
  return post;
}

module.exports = {
  getPolicy,
  holdForApproval,
  dispatchApprovalRequest,
  applyDecision
};
