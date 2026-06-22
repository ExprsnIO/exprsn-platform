/**
 * ═══════════════════════════════════════════════════════════
 * Attachment Model
 * Generic file attachments for posts and comments
 * Integrates with exprsn-filevault for storage
 * ═══════════════════════════════════════════════════════════
 */

const createAttachmentModel = require('@exprsn/shared/models/Attachment');

module.exports = (sequelize) => {
  const Attachment = createAttachmentModel(sequelize, {
    tableName: 'attachments',

    // Define which entity types are allowed in timeline service
    entityTypes: ['post', 'comment'],

    // No additional fields needed for timeline
    additionalFields: {}
  });

  return Attachment;
};
