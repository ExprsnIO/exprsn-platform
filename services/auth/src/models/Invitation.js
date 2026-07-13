/**
 * ═══════════════════════════════════════════════════════════
 * Invitation Model — single-use invite / activation tokens (FEAT-034)
 * ═══════════════════════════════════════════════════════════
 * A dedicated table for org-member invites and account-activation links.
 * The raw token is emailed ONCE and never stored; only its sha256 hash lives
 * here (mirroring the repo's OAuth2Token / MFA-backup-code hashing convention).
 * Tokens are single-use (status flips to 'accepted' on consume), expiring
 * (`expiresAt`, epoch-ms — same convention as User.resetPasswordExpires), and
 * superseded on re-invite (a fresh invite for the same email+kind revokes the
 * prior pending one, so only one active link exists per email/kind).
 *
 * NEW table → safe under the sync-based `db:migrate` (it creates new tables; it
 * only fails to ALTER existing ones). Lands in the `auth` schema automatically
 * via the instance-level `define.schema:'auth'` — do NOT set a per-model schema.
 *
 * `organizationId` is a bare UUID (no DB FK) carrying the org/role context for
 * the FEAT-032 member-provisioning hook the accept flow calls — kept soft to
 * stay parallel to the CA id-space convention and avoid import-teardown coupling.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Invitation = sequelize.define('Invitation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // sha256(rawToken) hex — the raw token is emailed, never persisted.
    tokenHash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true
      }
    },

    // 'invite' = new org member; 'activation' = pre-created (import) user.
    kind: {
      type: DataTypes.ENUM('invite', 'activation'),
      allowNull: false,
      defaultValue: 'invite'
    },

    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'revoked', 'expired'),
      allowNull: false,
      defaultValue: 'pending'
    },

    // Org/role context payload for accept → provisionMemberCredentials.
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true
    },

    role: {
      type: DataTypes.ENUM('owner', 'admin', 'member', 'guest'),
      allowNull: true,
      defaultValue: 'member'
    },

    // auth users.id of the admin who created it (null = system/import).
    invitedBy: {
      type: DataTypes.UUID,
      allowNull: true
    },

    // Set when a pre-created (import) user is being activated.
    userId: {
      type: DataTypes.UUID,
      allowNull: true
    },

    // epoch-ms, matches User.resetPasswordExpires convention.
    expiresAt: {
      type: DataTypes.BIGINT,
      allowNull: false
    },

    acceptedAt: {
      type: DataTypes.BIGINT,
      allowNull: true
    },

    revokedAt: {
      type: DataTypes.BIGINT,
      allowNull: true
    },

    metadata: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {}
    }
  }, {
    tableName: 'invitations',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['tokenHash'] },
      { fields: ['email'] },
      { fields: ['organizationId'] },
      { fields: ['status'] },
      { fields: ['expiresAt'] }
    ]
  });

  return Invitation;
};
