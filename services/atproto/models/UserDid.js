/**
 * ═══════════════════════════════════════════════════════════
 * UserDid model (table: user_dids)
 *
 * Per-user AT-Protocol identities, keyed by the platform user UUID
 * (auth.users.id). did:exprsn is platform-minted and self-certifying (derived
 * deterministically from a server secret + userId — the private key is NEVER
 * stored, only the resulting DID is cached). did:web / did:plc are linked by the
 * user and resolved to mark them verified.
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserDid = sequelize.define(
    'UserDid',
    {
      userId: { type: DataTypes.UUID, primaryKey: true, field: 'user_id' },
      didExprsn: { type: DataTypes.STRING(256), allowNull: true, field: 'did_exprsn' },
      didWeb: { type: DataTypes.STRING(256), allowNull: true, field: 'did_web' },
      didWebVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'did_web_verified' },
      // How control was proven, e.g. 'well-known' | 'profile' (null = unproven).
      didWebProof: { type: DataTypes.STRING(32), allowNull: true, field: 'did_web_proof' },
      didPlc: { type: DataTypes.STRING(256), allowNull: true, field: 'did_plc' },
      didPlcVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'did_plc_verified' },
      didPlcProof: { type: DataTypes.STRING(32), allowNull: true, field: 'did_plc_proof' },
      // One-time proof-of-control challenge the user must publish, then we verify.
      challenge: { type: DataTypes.STRING(64), allowNull: true },
      challengeExpiresAt: { type: DataTypes.DATE, allowNull: true, field: 'challenge_expires_at' },
    },
    {
      tableName: 'user_dids',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['did_exprsn'] },
        { fields: ['did_web'] },
        { fields: ['did_plc'] },
      ],
    }
  );

  return UserDid;
};
