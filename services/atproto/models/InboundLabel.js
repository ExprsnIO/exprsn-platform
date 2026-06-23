/**
 * ═══════════════════════════════════════════════════════════
 * InboundLabel model (table: inbound_labels)
 *
 * Labels we CONSUME from other labelers (Bluesky/Ozone or other Exprsn nodes)
 * via com.atproto.label.subscribeLabels. Kept separate from `labels` (which are
 * the labels WE issue and serve on our own firehose). Each row records whether
 * the signature verified against the issuer's resolved key.
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const InboundLabel = sequelize.define(
    'InboundLabel',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      // The labeler endpoint we received this from.
      labelerEndpoint: { type: DataTypes.STRING(512), allowNull: false, field: 'labeler_endpoint' },
      // The source labeler's frame seq (their cursor position for this label).
      srcSeq: { type: DataTypes.BIGINT, allowNull: true, field: 'src_seq' },

      // com.atproto.label.defs#label fields
      ver: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      src: { type: DataTypes.STRING(256), allowNull: false }, // issuer DID
      uri: { type: DataTypes.TEXT, allowNull: false },
      cid: { type: DataTypes.STRING(256), allowNull: true },
      val: { type: DataTypes.STRING(128), allowNull: false },
      neg: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      cts: { type: DataTypes.DATE, allowNull: true },
      exp: { type: DataTypes.DATE, allowNull: true },
      sig: { type: DataTypes.BLOB, allowNull: true },

      // Did the signature verify against the issuer's resolved #atproto_label key?
      verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: 'inbound_labels',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['uri'] },
        { fields: ['val'] },
        { fields: ['src', 'uri'] },
        { fields: ['labeler_endpoint'] },
        { fields: ['verified'] },
      ],
    }
  );

  return InboundLabel;
};
