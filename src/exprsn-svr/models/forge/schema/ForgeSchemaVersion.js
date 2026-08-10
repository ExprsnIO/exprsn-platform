const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

/**
 * ForgeSchemaVersion Model
 *
 * Tracks version history for schemas with change details
 * Uses JSON Patch (RFC 6902) format for change tracking
 */
const ForgeSchemaVersion = sequelize.define('ForgeSchemaVersion', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  schemaId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'schema_id',
    references: {
      model: 'forge_schemas',
      key: 'id'
    },
    onDelete: 'CASCADE',
    comment: 'Reference to the schema this version belongs to'
  },
  versionNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'version_number',
    validate: {
      min: 1
    },
    comment: 'Sequential version number (1, 2, 3, ...)'
  },
  previousVersionId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'previous_version_id',
    references: {
      model: 'forge_schema_versions',
      key: 'id'
    },
    comment: 'Reference to the previous version in the chain'
  },
  schemaSnapshot: {
    type: DataTypes.JSONB,
    allowNull: false,
    field: 'schema_snapshot',
    comment: 'Complete snapshot of the schema at this version'
  },
  changes: {
    type: DataTypes.JSONB,
    allowNull: false,
    comment: 'JSON Patch (RFC 6902) describing changes from previous version'
  },
  changeSummary: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'change_summary',
    comment: 'Human-readable summary of changes'
  },
  isBreaking: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_breaking',
    comment: 'Whether this version contains breaking changes'
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'created_by',
    comment: 'User who created this version'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  }
}, {
  tableName: 'forge_schema_versions',
  timestamps: false, // Only createdAt, no updatedAt
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['schema_id', 'version_number']
    },
    {
      fields: ['schema_id']
    },
    {
      fields: ['version_number']
    },
    {
      fields: ['previous_version_id']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['is_breaking']
    },
    {
      using: 'gin',
      fields: ['changes']
    }
  ]
});

/**
 * Instance Methods
 */

/**
 * Get the previous version
 */
ForgeSchemaVersion.prototype.getPreviousVersion = async function() {
  if (!this.previousVersionId) {
    return null;
  }

  return await ForgeSchemaVersion.findByPk(this.previousVersionId);
};

/**
 * Get the next version
 */
ForgeSchemaVersion.prototype.getNextVersion = async function() {
  return await ForgeSchemaVersion.findOne({
    where: {
      previousVersionId: this.id
    }
  });
};

/**
 * Check if this is the first version
 */
ForgeSchemaVersion.prototype.isFirstVersion = function() {
  return this.versionNumber === 1 || !this.previousVersionId;
};

/**
 * Get change count
 */
ForgeSchemaVersion.prototype.getChangeCount = function() {
  if (Array.isArray(this.changes)) {
    return this.changes.length;
  }
  return 0;
};

/**
 * Get change types
 */
ForgeSchemaVersion.prototype.getChangeTypes = function() {
  if (!Array.isArray(this.changes)) {
    return [];
  }

  return [...new Set(this.changes.map(change => change.op))];
};

/**
 * Class Methods
 */

/**
 * Get all versions for a schema
 */
ForgeSchemaVersion.getVersionsForSchema = async function(schemaId, options = {}) {
  const { order = 'DESC', limit = null } = options;

  const queryOptions = {
    where: { schemaId },
    order: [['versionNumber', order]]
  };

  if (limit) {
    queryOptions.limit = limit;
  }

  return await this.findAll(queryOptions);
};

/**
 * Get latest version for a schema
 */
ForgeSchemaVersion.getLatestVersion = async function(schemaId) {
  return await this.findOne({
    where: { schemaId },
    order: [['versionNumber', 'DESC']],
    limit: 1
  });
};

/**
 * Get version history chain
 */
ForgeSchemaVersion.getVersionChain = async function(versionId) {
  const chain = [];
  let currentVersion = await this.findByPk(versionId);

  while (currentVersion) {
    chain.push(currentVersion);
    if (!currentVersion.previousVersionId) {
      break;
    }
    currentVersion = await currentVersion.getPreviousVersion();
  }

  return chain;
};

/**
 * Count versions for schema
 */
ForgeSchemaVersion.countVersions = async function(schemaId) {
  return await this.count({
    where: { schemaId }
  });
};

/**
 * Get breaking changes for schema
 */
ForgeSchemaVersion.getBreakingChanges = async function(schemaId) {
  return await this.findAll({
    where: {
      schemaId,
      isBreaking: true
    },
    order: [['versionNumber', 'DESC']]
  });
};

module.exports = ForgeSchemaVersion;
