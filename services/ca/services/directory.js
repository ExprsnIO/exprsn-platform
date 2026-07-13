/**
 * ═══════════════════════════════════════════════════════════════════════
 * CA Directory Service — published façade for org directory groups
 * ═══════════════════════════════════════════════════════════════════════
 * FEAT-032 / ADR-0003 (Decision 1b, required change 5). `routes/groups.js` is a
 * stub with no service surface, so the CA publishes this small directory-group
 * façade for the org-provisioning engine to compose in-process. The engine must
 * NOT reach into ca.models directly.
 *
 * Each method owns its own ca-local transaction (the ca models are one Sequelize
 * instance). Membership rows carry the AUTH user id and are written via
 * UserGroup.create — never the `user.addGroup` mixin, which would write a CA
 * User.id (the CA `users` table is a separate identity store; Token.userId /
 * UserGroup.userId are bare UUIDs holding auth user ids).
 */

const { sequelize, Group, UserGroup } = require('../models');
const logger = require('../utils/logger');

const ORGANIZATIONAL_UNIT = 'organizational_unit';

class CaDirectoryService {
  /**
   * Find-or-create the org's directory group (type organizational_unit). Idempotent
   * by the globally-unique slug. Used by saga step S2.
   * @param {Object} params - { name, slug, description?, parentId? }
   * @returns {Promise<{ group: Group, created: boolean }>}
   */
  async ensureOrgDirectoryGroup({ name, slug, description = null, parentId = null }) {
    return sequelize.transaction(async (transaction) => {
      const [group, created] = await Group.findOrCreate({
        where: { slug },
        defaults: {
          name,
          slug,
          description,
          parentId,
          type: ORGANIZATIONAL_UNIT,
          status: 'active'
        },
        transaction
      });
      logger.info('Ensured org directory group', { groupId: group.id, slug, created });
      return { group, created };
    });
  }

  /**
   * Find-or-create a membership row binding an AUTH user id to a CA directory
   * group with a per-membership role. Idempotent by the (userId, groupId)
   * composite PK. Used by saga step S2 (owner) and the FEAT-035 member hook.
   * @param {string} authUserId - AUTH user id (matches Token.userId space)
   * @param {string} groupId - ca.groups id
   * @param {string} [role='owner'] - 'member' | 'admin' | 'owner'
   * @returns {Promise<{ membership: UserGroup, created: boolean }>}
   */
  async addOrgGroupMember(authUserId, groupId, role = 'owner') {
    return sequelize.transaction(async (transaction) => {
      const [membership, created] = await UserGroup.findOrCreate({
        where: { userId: authUserId, groupId },
        defaults: { userId: authUserId, groupId, role },
        transaction
      });
      logger.info('Ensured org group membership', { authUserId, groupId, role, created });
      return { membership, created };
    });
  }

  /**
   * Compensation: delete a directory group and all its membership rows.
   * @param {string} groupId - ca.groups id
   * @returns {Promise<void>}
   */
  async deleteOrgDirectoryGroup(groupId) {
    return sequelize.transaction(async (transaction) => {
      await UserGroup.destroy({ where: { groupId }, transaction });
      await Group.destroy({ where: { id: groupId }, transaction });
      logger.info('Deleted org directory group (compensation)', { groupId });
    });
  }

  /**
   * Compensation: remove a single membership row.
   * @param {string} authUserId - AUTH user id
   * @param {string} groupId - ca.groups id
   * @returns {Promise<void>}
   */
  async removeOrgGroupMember(authUserId, groupId) {
    return sequelize.transaction(async (transaction) => {
      await UserGroup.destroy({ where: { userId: authUserId, groupId }, transaction });
      logger.info('Removed org group membership (compensation)', { authUserId, groupId });
    });
  }
}

module.exports = new CaDirectoryService();
