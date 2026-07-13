/**
 * ═══════════════════════════════════════════════════════════
 * Organization Service
 * Multi-tenant organization management
 * ═══════════════════════════════════════════════════════════
 */

const { sequelize, Organization, User, Group, Application, OrganizationMember, Role, UserRole } = require('../models');
const { AppError } = require('@exprsn/shared');
const { Op } = require('sequelize');

/**
 * Collapse an arbitrary name into a valid slug: lowercase, non-alphanumeric
 * runs → a single '-', trimmed of leading/trailing dashes. Fixes the previous
 * non-collapsing `replace(/[^a-z0-9-]/g, '-')` which left runs of dashes.
 */
function normalizeSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Create organization.
 *
 * The three writes (Organization → owner OrganizationMember → owner UserRole)
 * are wrapped in ONE local transaction so a partial failure never orphans the
 * org (ADR-0003 S1). Backward-compatible: when the caller passes
 * `options.transaction` (the provisioning engine's S1 auth transaction) those
 * writes join it; otherwise one is opened internally.
 *
 * NOTE: `data` is spread into Organization.create — callers must pre-sanitize
 * it against an allowlist (the engine builds it from a template via
 * templates.buildOrgPayload; mass-assignment guard, ADR-0003 Decision 6).
 *
 * @param {Object} data - Organization attributes (pre-sanitized)
 * @param {string} ownerId - Owner user id
 * @param {Object} [options] - { transaction } to join a caller-owned transaction
 * @returns {Promise<Organization>}
 */
async function createOrganization(data, ownerId, options = {}) {
  // Reject missing/blank name up front with a 400 (previously fell through
  // to `data.name.toLowerCase()` and surfaced as a 500 TypeError).
  if (!data || typeof data.name !== 'string' || !data.name.trim()) {
    throw new AppError('Organization name is required', 400, 'VALIDATION_ERROR');
  }

  // Generate slug if not provided (collapsing normalizer).
  if (!data.slug) {
    data.slug = normalizeSlug(data.name);
  }

  const runInTransaction = async (transaction) => {
    // Check slug uniqueness
    const existing = await Organization.findOne({ where: { slug: data.slug }, transaction });
    if (existing) {
      throw new AppError('Organization slug already exists', 400, 'SLUG_EXISTS');
    }

    // Create organization
    const org = await Organization.create({
      ...data,
      ownerId,
      status: 'active'
    }, { transaction });

    // Add owner as member
    await OrganizationMember.create({
      organizationId: org.id,
      userId: ownerId,
      role: 'owner',
      status: 'active'
    }, { transaction });

    // Assign organization owner role
    const ownerRole = await Role.findOne({ where: { slug: 'org-owner', type: 'system' }, transaction });
    if (ownerRole) {
      await UserRole.create({
        userId: ownerId,
        roleId: ownerRole.id,
        scope: 'organization',
        organizationId: org.id,
        status: 'active'
      }, { transaction });
    }

    return org;
  };

  try {
    if (options.transaction) {
      return await runInTransaction(options.transaction);
    }
    return await sequelize.transaction(runInTransaction);
  } catch (error) {
    console.error('Error creating organization:', error);
    throw error;
  }
}

/**
 * Get organization by ID
 */
async function getOrganizationById(organizationId, options = {}) {
  const { includeMembers, includeGroups, includeApplications } = options;

  const include = [];

  if (includeMembers) {
    include.push({
      model: User,
      as: 'members',
      through: { attributes: ['role', 'joinedAt', 'status'] }
    });
  }

  if (includeGroups) {
    include.push({
      model: Group,
      as: 'groups'
    });
  }

  if (includeApplications) {
    include.push({
      model: Application,
      as: 'applications'
    });
  }

  const org = await Organization.findByPk(organizationId, { include });

  if (!org) {
    throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
  }

  return org;
}

/**
 * Update organization
 */
async function updateOrganization(organizationId, updates) {
  const org = await Organization.findByPk(organizationId);

  if (!org) {
    throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
  }

  // Prevent changing owner via this method
  delete updates.ownerId;

  await org.update(updates);
  return org;
}

/**
 * Delete organization (soft delete)
 */
async function deleteOrganization(organizationId) {
  const org = await Organization.findByPk(organizationId);

  if (!org) {
    throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
  }

  await org.destroy(); // Soft delete (paranoid: true)
  return { success: true };
}

/**
 * Add member to organization.
 *
 * Grants the ROLE-APPROPRIATE org-scoped system role (owner→org-owner /
 * admin→org-admin / member→org-member; guest → membership only, no elevated
 * UserRole) via memberProvisioningService.roleToSystemSlug. This fixes the prior
 * always-'org-member' grant, which silently under-privileged admin/owner members
 * added through this path (e.g. FEAT-035 import rows). Idempotent on the role
 * grant (findOrCreate + reactivate) so reactivating an inactive membership
 * re-asserts the matching role.
 */
async function addMember(organizationId, userId, options = {}) {
  const { role = 'member', invitedBy } = options;
  const { roleToSystemSlug } = require('./memberProvisioningService');

  try {
    // Check if already a member
    const existing = await OrganizationMember.findOne({
      where: { organizationId, userId }
    });

    let member;
    if (existing) {
      if (existing.status === 'active') {
        throw new AppError('User is already a member', 400, 'ALREADY_MEMBER');
      }

      // Reactivate if inactive
      existing.status = 'active';
      existing.role = role;
      await existing.save();
      member = existing;
    } else {
      // Create member
      member = await OrganizationMember.create({
        organizationId,
        userId,
        role,
        invitedBy,
        status: 'active'
      });
    }

    // Assign the org-scoped system role that MATCHES the member's role.
    // guest / unknown → null → membership only (least privilege).
    const roleSlug = roleToSystemSlug(role);
    if (roleSlug) {
      const systemRole = await Role.findOne({
        where: { slug: roleSlug, type: 'system' }
      });

      if (systemRole) {
        const [userRole] = await UserRole.findOrCreate({
          where: { userId, roleId: systemRole.id, scope: 'organization', organizationId },
          defaults: {
            userId,
            roleId: systemRole.id,
            scope: 'organization',
            organizationId,
            status: 'active'
          }
        });
        if (userRole.status !== 'active') {
          userRole.status = 'active';
          await userRole.save();
        }
      }
    }

    return member;
  } catch (error) {
    console.error('Error adding member:', error);
    throw error;
  }
}

/**
 * Remove member from organization
 */
async function removeMember(organizationId, userId) {
  const member = await OrganizationMember.findOne({
    where: { organizationId, userId, status: 'active' }
  });

  if (!member) {
    throw new AppError('Member not found', 404, 'MEMBER_NOT_FOUND');
  }

  // Prevent removing owner
  if (member.role === 'owner') {
    throw new AppError('Cannot remove organization owner', 400, 'CANNOT_REMOVE_OWNER');
  }

  member.status = 'inactive';
  await member.save();

  // Revoke organization-scoped roles
  await UserRole.update(
    { status: 'revoked' },
    {
      where: {
        userId,
        organizationId,
        scope: 'organization',
        status: 'active'
      }
    }
  );

  return { success: true };
}

/**
 * Update member role
 */
async function updateMemberRole(organizationId, userId, newRole) {
  const member = await OrganizationMember.findOne({
    where: { organizationId, userId, status: 'active' }
  });

  if (!member) {
    throw new AppError('Member not found', 404, 'MEMBER_NOT_FOUND');
  }

  member.role = newRole;
  await member.save();

  return member;
}

/**
 * Get organization members
 */
async function getMembers(organizationId, options = {}) {
  const { status = 'active', role } = options;

  const where = { organizationId, status };
  if (role) {
    where.role = role;
  }

  const members = await OrganizationMember.findAll({
    where,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'displayName', 'firstName', 'lastName', 'avatarUrl']
      }
    ],
    order: [['joinedAt', 'DESC']]
  });

  return members;
}

/**
 * Check if user is member of organization
 */
async function isMember(organizationId, userId) {
  const member = await OrganizationMember.findOne({
    where: {
      organizationId,
      userId,
      status: 'active'
    }
  });

  return member !== null;
}

/**
 * Check if user is owner or admin
 */
async function isOwnerOrAdmin(organizationId, userId) {
  const member = await OrganizationMember.findOne({
    where: {
      organizationId,
      userId,
      status: 'active',
      role: { [Op.in]: ['owner', 'admin'] }
    }
  });

  return member !== null;
}

/**
 * Get user's organizations
 */
async function getUserOrganizations(userId) {
  const user = await User.findByPk(userId, {
    include: [
      {
        model: Organization,
        as: 'organizations',
        through: {
          where: { status: 'active' },
          attributes: ['role', 'joinedAt']
        }
      }
    ]
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  return user.organizations;
}

/**
 * Transfer organization ownership
 */
async function transferOwnership(organizationId, currentOwnerId, newOwnerId) {
  const org = await Organization.findByPk(organizationId);

  if (!org) {
    throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
  }

  if (org.ownerId !== currentOwnerId) {
    throw new AppError('Only current owner can transfer ownership', 403, 'NOT_OWNER');
  }

  // Check new owner is a member
  const newOwnerMember = await OrganizationMember.findOne({
    where: { organizationId, userId: newOwnerId }
  });

  if (!newOwnerMember) {
    throw new AppError('New owner must be a member of the organization', 400, 'NOT_MEMBER');
  }

  // Update organization owner
  org.ownerId = newOwnerId;
  await org.save();

  // Update member roles
  await OrganizationMember.update(
    { role: 'admin' },
    { where: { organizationId, userId: currentOwnerId } }
  );

  await OrganizationMember.update(
    { role: 'owner' },
    { where: { organizationId, userId: newOwnerId } }
  );

  // Update roles
  const ownerRole = await Role.findOne({ where: { slug: 'org-owner', type: 'system' } });

  if (ownerRole) {
    // Revoke from current owner
    await UserRole.update(
      { status: 'revoked' },
      {
        where: {
          userId: currentOwnerId,
          roleId: ownerRole.id,
          organizationId,
          scope: 'organization'
        }
      }
    );

    // Assign to new owner
    await UserRole.findOrCreate({
      where: {
        userId: newOwnerId,
        roleId: ownerRole.id,
        organizationId,
        scope: 'organization'
      },
      defaults: {
        userId: newOwnerId,
        roleId: ownerRole.id,
        organizationId,
        scope: 'organization',
        status: 'active'
      }
    });
  }

  return org;
}

module.exports = {
  createOrganization,
  getOrganizationById,
  updateOrganization,
  deleteOrganization,
  addMember,
  removeMember,
  updateMemberRole,
  getMembers,
  isMember,
  isOwnerOrAdmin,
  getUserOrganizations,
  transferOwnership
};
