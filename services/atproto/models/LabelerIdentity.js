/**
 * ═══════════════════════════════════════════════════════════
 * LabelerIdentity model (table: labeler_identity)
 *
 * The labeler's DID + signing-key metadata + service-record publish state.
 * Supports key rotation (multiple rows; one `active`). The raw private key is
 * NEVER stored here — only a reference (`private_key_ref`) to an env var / vault
 * / KMS handle that labelSigner resolves at sign time.
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LabelerIdentity = sequelize.define(
    'LabelerIdentity',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      did: { type: DataTypes.STRING(256), allowNull: false, unique: true },
      // 'web' | 'plc'
      didMethod: { type: DataTypes.STRING(16), allowNull: false, field: 'did_method' },
      // Fragment id of the signing verification method (e.g. 'atproto_label').
      signingKeyId: { type: DataTypes.STRING(128), allowNull: false, field: 'signing_key_id' },
      // did:key form of the public signing key, published in the DID document.
      publicKeyMultibase: { type: DataTypes.STRING(256), allowNull: false, field: 'public_key_multibase' },
      // Reference to the private key (env var name / vault id) — not the key itself.
      privateKeyRef: { type: DataTypes.STRING(256), allowNull: true, field: 'private_key_ref' },
      // app.bsky.labeler.service record CID once published.
      serviceRecordCid: { type: DataTypes.STRING(256), allowNull: true, field: 'service_record_cid' },
      publishedAt: { type: DataTypes.DATE, allowNull: true, field: 'published_at' },
      active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'labeler_identity',
      timestamps: true,
      underscored: true,
      indexes: [{ fields: ['active'] }],
    }
  );

  return LabelerIdentity;
};
