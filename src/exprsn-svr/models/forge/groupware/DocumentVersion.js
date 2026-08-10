const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const DocumentVersion = sequelize.define('DocumentVersion', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    documentId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'documents',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    versionNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Sequential version number (1, 2, 3, ...)'
    },
    filename: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Snapshot of document content at this version'
    },
    mimeType: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    size: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: 'File size in bytes'
    },
    checksum: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: 'SHA-256 hash of content for integrity verification'
    },
    changeType: {
      type: DataTypes.ENUM('created', 'content_updated', 'metadata_updated', 'renamed', 'moved', 'restored'),
      defaultValue: 'content_updated',
      comment: 'Type of change that created this version'
    },
    changeDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'User-provided description of changes'
    },
    changedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'User who created this version'
    },
    changedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    fileLocation: {
      type: DataTypes.STRING(1000),
      allowNull: true,
      comment: 'Storage location of version file (if stored separately)'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional metadata (tags, custom fields, etc.)'
    },
    isCurrentVersion: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Whether this is the current/latest version'
    }
  }, {
    tableName: 'document_versions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['document_id', 'version_number'],
        unique: true
      },
      {
        fields: ['document_id', 'is_current_version']
      },
      {
        fields: ['changed_by']
      },
      {
        fields: ['changed_at']
      },
      {
        fields: ['checksum']
      }
    ]
  });

  DocumentVersion.associate = (models) => {
    // Belongs to Document
    DocumentVersion.belongsTo(models.Document, {
      foreignKey: 'documentId',
      as: 'document'
    });
  };

  return DocumentVersion;
};
