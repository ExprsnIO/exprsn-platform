/**
 * ═══════════════════════════════════════════════════════════
 * UriCaseMap model (table: uri_case_map)
 *
 * Bridges an AT-URI to the moderator's ModerationCase. Needed because:
 *   - ModerationCase.userId is a UUID, but Bluesky authors are DIDs — we keep
 *     the real author DID here (and synthesize a UUIDv5 for moderator.userId).
 *   - Tracks emit state (last_label_seq) for dedup and label emission.
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UriCaseMap = sequelize.define(
    'UriCaseMap',
    {
      // at://did/app.bsky.feed.post/rkey
      uri: { type: DataTypes.STRING(512), primaryKey: true },
      cid: { type: DataTypes.STRING(256), allowNull: true },
      authorDid: { type: DataTypes.STRING(256), allowNull: false, field: 'author_did' },
      moderationCaseId: { type: DataTypes.UUID, allowNull: true, field: 'moderation_case_id' },
      lastLabelSeq: { type: DataTypes.BIGINT, allowNull: true, field: 'last_label_seq' },
      // 'pending' | 'moderated' | 'labeled' | 'skipped'
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'pending' },
    },
    {
      tableName: 'uri_case_map',
      timestamps: true,
      underscored: true,
      indexes: [
        { fields: ['author_did'] },
        { fields: ['status'] },
        { fields: ['moderation_case_id'] },
      ],
    }
  );

  return UriCaseMap;
};
