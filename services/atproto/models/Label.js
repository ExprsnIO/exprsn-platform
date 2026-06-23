/**
 * ═══════════════════════════════════════════════════════════
 * Label model (table: labels)
 *
 * The signed AT-Protocol labels this service emits. The source of truth for
 * both com.atproto.label.subscribeLabels (backfill + live) and queryLabels.
 *
 * `seq` is a monotonic, gapless-enough cursor: a BIGSERIAL assigned at INSERT.
 * Correctness of subscribeLabels backfill relies on a SINGLE writer (the
 * single-instance atproto worker) so commits land in seq order — see the plan's
 * "monotonic seq" risk. Do not emit labels from multiple processes concurrently.
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Label = sequelize.define(
    'Label',
    {
      // Monotonic stream cursor. Primary key doubles as the subscribeLabels seq.
      seq: {
        type: DataTypes.BIGINT,
        primaryKey: true,
        autoIncrement: true,
      },

      // com.atproto.label.defs#label fields ────────────────────────────────
      ver: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      // Issuer DID (our labeler).
      src: { type: DataTypes.STRING(256), allowNull: false },
      // Subject: an at:// record URI, or a did: for account-level labels.
      uri: { type: DataTypes.TEXT, allowNull: false },
      // Optional CID pinning the label to a specific record version.
      cid: { type: DataTypes.STRING(256), allowNull: true },
      // Label value (kebab-case, ≤128 bytes). `!hide`/`!warn` are system values.
      val: { type: DataTypes.STRING(128), allowNull: false },
      // Negation: retracts a prior label with the same (src, uri, val).
      neg: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Created-at (ISO). Stored as timestamptz; serialized to ISO on emit.
      cts: { type: DataTypes.DATE, allowNull: false },
      // Optional expiry.
      exp: { type: DataTypes.DATE, allowNull: true },
      // Raw signature bytes over the dag-cbor of this label minus `sig`.
      sig: { type: DataTypes.BLOB, allowNull: true },

      // Provenance / ops ───────────────────────────────────────────────────
      // Which signing key produced `sig` (supports rotation).
      signingKeyId: { type: DataTypes.STRING(128), allowNull: true, field: 'signing_key_id' },
      // The moderation case this label was derived from (nullable for manual labels).
      moderationCaseId: { type: DataTypes.UUID, allowNull: true, field: 'moderation_case_id' },
    },
    {
      tableName: 'labels',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['uri'] },
        { fields: ['val'] },
        { fields: ['src', 'uri'] },
      ],
    }
  );

  return Label;
};
