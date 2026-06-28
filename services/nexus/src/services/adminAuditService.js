/**
 * Admin Audit Service
 *
 * Best-effort, non-throwing recorder for privileged platform-admin actions.
 * Writes a row to nexus.admin_audit. Failures are logged and swallowed so an
 * audit-write problem never breaks the underlying admin action.
 */

const { AdminAudit } = require('../models');
const logger = require('../utils/logger');

/**
 * Record a privileged admin action.
 *
 * @param {Object}  params
 * @param {string}  [params.actor]            - Acting user id.
 * @param {string}  params.action             - Dotted action name, e.g. 'group.update'.
 * @param {string}  [params.targetType]       - Entity type (group, event, subgroup, member, config, flag).
 * @param {string}  [params.targetId]         - Entity identifier.
 * @param {string}  [params.groupId]          - Group context, when applicable.
 * @param {Object}  [params.metadata]         - Extra details (reason, changes, etc.).
 * @param {boolean} [params.isPlatformAdmin]  - Whether the actor used the platform-admin override.
 * @returns {Promise<void>}
 */
async function record({
  actor,
  action,
  targetType = null,
  targetId = null,
  groupId = null,
  metadata = {},
  isPlatformAdmin = false
} = {}) {
  try {
    if (!action) {
      logger.warn('adminAuditService.record called without an action; skipping');
      return;
    }

    await AdminAudit.create({
      actorUserId: actor || null,
      action,
      targetType,
      targetId: targetId != null ? String(targetId) : null,
      groupId: groupId || null,
      metadata: { ...(metadata || {}), platformAdmin: isPlatformAdmin === true }
    });
  } catch (error) {
    // Never throw — auditing must not break the action it describes.
    logger.warn('Failed to write admin audit row', {
      action,
      error: error.message
    });
  }
}

module.exports = { record };
