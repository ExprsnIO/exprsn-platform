const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

/**
 * ForgeSchemaChange Model
 *
 * Comprehensive audit log of all schema changes
 * Tracks who changed what, when, and from where
 */
const ForgeSchemaChange = sequelize.define('ForgeSchemaChange', {
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
    comment: 'Schema that was changed'
  },
  changeType: {
    type: DataTypes.ENUM('created', 'updated', 'activated', 'deprecated', 'archived', 'deleted'),
    allowNull: false,
    field: 'change_type',
    comment: 'Type of change'
  },
  fieldChanged: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'field_changed',
    comment: 'Specific field that was changed (for updates)'
  },
  oldValue: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'old_value',
    comment: 'Previous value (for updates)'
  },
  newValue: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'new_value',
    comment: 'New value (for updates)'
  },
  changeSummary: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'change_summary',
    comment: 'Summary of the change'
  },
  changedBy: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'changed_by',
    comment: 'User who made the change'
  },
  ipAddress: {
    type: DataTypes.STRING(45),
    allowNull: true,
    field: 'ip_address',
    comment: 'IP address of the user'
  },
  userAgent: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'user_agent',
    comment: 'User agent string'
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    comment: 'Additional change metadata'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  }
}, {
  tableName: 'forge_schema_changes',
  timestamps: false, // Using createdAt manually
  underscored: true,
  indexes: [
    {
      fields: ['schema_id']
    },
    {
      fields: ['change_type']
    },
    {
      fields: ['changed_by']
    },
    {
      fields: ['created_at']
    },
    {
      fields: ['field_changed']
    }
  ]
});

/**
 * Instance Methods
 */

/**
 * Get the schema this change belongs to
 */
ForgeSchemaChange.prototype.getSchema = async function() {
  const ForgeSchema = require('./ForgeSchema');
  return await ForgeSchema.findByPk(this.schemaId);
};

/**
 * Get the user who made the change
 */
ForgeSchemaChange.prototype.getUser = async function() {
  if (!this.changedBy) {
    return null;
  }

  // This would reference the users table from the main schema
  // Implementation depends on your user management system
  return null; // Placeholder
};

/**
 * Get change summary
 */
ForgeSchemaChange.prototype.getSummary = function() {
  if (this.changeSummary) {
    return this.changeSummary;
  }

  switch (this.changeType) {
    case 'created':
      return `Schema created`;
    case 'updated':
      return `Schema updated: ${this.fieldChanged || 'multiple fields'}`;
    case 'deprecated':
      return `Schema deprecated`;
    case 'archived':
      return `Schema archived`;
    case 'activated':
      return `Schema activated`;
    case 'deleted':
      return `Schema deleted`;
    default:
      return `Schema changed: ${this.changeType}`;
  }
};

/**
 * Get changed value info
 */
ForgeSchemaChange.prototype.getChangeInfo = function() {
  return {
    field: this.fieldChanged,
    oldValue: this.oldValue,
    newValue: this.newValue,
    summary: this.changeSummary
  };
};

/**
 * Class Methods
 */

/**
 * Get changes for a schema
 */
ForgeSchemaChange.getChangesForSchema = async function(schemaId, options = {}) {
  const { limit = 50, offset = 0, changeType = null } = options;

  const where = { schemaId };
  if (changeType) {
    where.changeType = changeType;
  }

  return await this.findAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });
};

/**
 * Get recent changes across all schemas
 */
ForgeSchemaChange.getRecentChanges = async function(limit = 100) {
  return await this.findAll({
    order: [['createdAt', 'DESC']],
    limit
  });
};

/**
 * Get changes by user
 */
ForgeSchemaChange.getChangesByUser = async function(userId, options = {}) {
  const { limit = 50, offset = 0 } = options;

  return await this.findAll({
    where: { changedBy: userId },
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });
};

/**
 * Get changes by type
 */
ForgeSchemaChange.getChangesByType = async function(changeType, options = {}) {
  const { limit = 50, offset = 0 } = options;

  return await this.findAll({
    where: { changeType },
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });
};

/**
 * Get changes in date range
 */
ForgeSchemaChange.getChangesByDateRange = async function(startDate, endDate, options = {}) {
  const { limit = 100, offset = 0 } = options;

  return await this.findAll({
    where: {
      createdAt: {
        [sequelize.Op.between]: [startDate, endDate]
      }
    },
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });
};

/**
 * Get change statistics
 */
ForgeSchemaChange.getStatistics = async function(schemaId = null) {
  let whereClause = '';
  if (schemaId) {
    whereClause = `WHERE schema_id = '${schemaId}'`;
  }

  const [typeCountsResult] = await sequelize.query(`
    SELECT
      change_type,
      COUNT(*) as count
    FROM forge_schema_changes
    ${whereClause}
    GROUP BY change_type
  `);

  const [userCountsResult] = await sequelize.query(`
    SELECT
      changed_by,
      COUNT(*) as count
    FROM forge_schema_changes
    ${whereClause}
    GROUP BY changed_by
    ORDER BY count DESC
    LIMIT 10
  `);

  const [activityResult] = await sequelize.query(`
    SELECT
      DATE_TRUNC('day', created_at) as date,
      COUNT(*) as count
    FROM forge_schema_changes
    ${whereClause}
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY date DESC
  `);

  return {
    typeCounts: typeCountsResult.reduce((acc, row) => {
      acc[row.change_type] = parseInt(row.count);
      return acc;
    }, {}),
    topUsers: userCountsResult.map(row => ({
      userId: row.changed_by,
      changeCount: parseInt(row.count)
    })),
    activityLast30Days: activityResult.map(row => ({
      date: row.date,
      count: parseInt(row.count)
    }))
  };
};

/**
 * Log a schema change
 */
ForgeSchemaChange.logChange = async function(data) {
  const {
    schemaId,
    changeType,
    fieldChanged = null,
    oldValue = null,
    newValue = null,
    changeSummary = null,
    changedBy = null,
    ipAddress = null,
    userAgent = null,
    metadata = {}
  } = data;

  return await this.create({
    schemaId,
    changeType,
    fieldChanged,
    oldValue,
    newValue,
    changeSummary,
    changedBy,
    ipAddress,
    userAgent,
    metadata
  });
};

/**
 * Search changes
 */
ForgeSchemaChange.searchChanges = async function(searchTerm, options = {}) {
  const { limit = 50, offset = 0 } = options;

  return await this.findAll({
    where: {
      [sequelize.Op.or]: [
        { changeSummary: { [sequelize.Op.iLike]: `%${searchTerm}%` } },
        { fieldChanged: { [sequelize.Op.iLike]: `%${searchTerm}%` } },
        sequelize.literal(`old_value::text ILIKE '%${searchTerm}%'`),
        sequelize.literal(`new_value::text ILIKE '%${searchTerm}%'`)
      ]
    },
    order: [['createdAt', 'DESC']],
    limit,
    offset
  });
};

module.exports = ForgeSchemaChange;
