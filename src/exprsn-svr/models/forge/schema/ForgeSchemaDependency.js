const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

/**
 * ForgeSchemaDependency Model
 *
 * Tracks dependencies between schemas
 * Used for safe migration ordering and integrity checking
 */
const ForgeSchemaDependency = sequelize.define('ForgeSchemaDependency', {
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
    comment: 'Schema that has the dependency'
  },
  dependsOnSchemaId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'depends_on_schema_id',
    references: {
      model: 'forge_schemas',
      key: 'id'
    },
    onDelete: 'CASCADE',
    comment: 'Schema that is depended upon (may be null if external)'
  },
  dependsOnModelId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'depends_on_model_id',
    comment: 'Model ID of the dependency (for lookup if schema not found)'
  },
  dependencyType: {
    type: DataTypes.ENUM('foreign_key', 'reference', 'inheritance', 'composition'),
    allowNull: false,
    field: 'dependency_type',
    comment: 'Type of dependency relationship'
  },
  fieldName: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'field_name',
    comment: 'Field name that has the dependency (for foreign keys)'
  },
  constraintConfig: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'constraint_config',
    comment: 'Additional constraint configuration (onDelete, onUpdate, etc.)'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  }
}, {
  tableName: 'forge_schema_dependencies',
  timestamps: false, // Only createdAt, no updatedAt
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['schema_id', 'depends_on_model_id', 'field_name']
    },
    {
      fields: ['schema_id']
    },
    {
      fields: ['depends_on_schema_id']
    },
    {
      fields: ['depends_on_model_id']
    },
    {
      fields: ['dependency_type']
    },
    {
      fields: ['field_name']
    }
  ],
  hooks: {
    beforeCreate: async (dependency) => {
      // Prevent self-dependencies
      if (dependency.schemaId === dependency.dependsOnSchemaId) {
        throw new Error('Schema cannot depend on itself');
      }

      // Check for circular dependencies
      const hasCircle = await checkCircularDependency(
        dependency.schemaId,
        dependency.dependsOnSchemaId
      );

      if (hasCircle) {
        throw new Error('Cannot create dependency: would create circular dependency');
      }
    }
  }
});

/**
 * Helper function to check for circular dependencies
 */
async function checkCircularDependency(fromSchemaId, toSchemaId) {
  if (!toSchemaId) return false;

  const visited = new Set();
  const stack = [toSchemaId];

  while (stack.length > 0) {
    const currentId = stack.pop();

    if (currentId === fromSchemaId) {
      return true; // Found a cycle
    }

    if (visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);

    // Get all dependencies of current schema
    const dependencies = await ForgeSchemaDependency.findAll({
      where: { schemaId: currentId },
      attributes: ['dependsOnSchemaId']
    });

    for (const dep of dependencies) {
      if (dep.dependsOnSchemaId && !visited.has(dep.dependsOnSchemaId)) {
        stack.push(dep.dependsOnSchemaId);
      }
    }

    // Prevent infinite loops
    if (visited.size > 1000) {
      throw new Error('Dependency check exceeded maximum depth');
    }
  }

  return false;
}

/**
 * Instance Methods
 */

/**
 * Get the schema this dependency belongs to
 */
ForgeSchemaDependency.prototype.getSchema = async function() {
  const ForgeSchema = require('./ForgeSchema');
  return await ForgeSchema.findByPk(this.schemaId);
};

/**
 * Get the schema this depends on
 */
ForgeSchemaDependency.prototype.getDependsOnSchema = async function() {
  if (!this.dependsOnSchemaId) {
    return null;
  }

  const ForgeSchema = require('./ForgeSchema');
  return await ForgeSchema.findByPk(this.dependsOnSchemaId);
};

/**
 * Check if this is a foreign key dependency
 */
ForgeSchemaDependency.prototype.isForeignKey = function() {
  return this.dependencyType === 'foreign_key';
};

/**
 * Get constraint details
 */
ForgeSchemaDependency.prototype.getConstraintDetails = function() {
  return this.constraintConfig || {};
};

/**
 * Class Methods
 */

/**
 * Get all dependencies for a schema
 */
ForgeSchemaDependency.getDependencies = async function(schemaId) {
  return await this.findAll({
    where: { schemaId },
    order: [['dependencyType', 'ASC']]
  });
};

/**
 * Get all schemas that depend on a given schema
 */
ForgeSchemaDependency.getDependents = async function(schemaId) {
  return await this.findAll({
    where: { dependsOnSchemaId: schemaId },
    order: [['dependencyType', 'ASC']]
  });
};

/**
 * Get dependency graph for a schema (recursive)
 */
ForgeSchemaDependency.getDependencyGraph = async function(schemaId, maxDepth = 10) {
  const graph = {
    schema: schemaId,
    dependencies: [],
    depth: 0
  };

  await buildDependencyGraph(graph, schemaId, 0, maxDepth, new Set());
  return graph;
};

async function buildDependencyGraph(node, schemaId, depth, maxDepth, visited) {
  if (depth >= maxDepth || visited.has(schemaId)) {
    return;
  }

  visited.add(schemaId);

  const dependencies = await ForgeSchemaDependency.findAll({
    where: { schemaId },
    include: [{
      model: require('./ForgeSchema'),
      as: 'dependsOnSchema'
    }]
  });

  for (const dep of dependencies) {
    const childNode = {
      schema: dep.dependsOnSchemaId,
      modelId: dep.dependsOnModelId,
      dependencyType: dep.dependencyType,
      fieldName: dep.fieldName,
      dependencies: [],
      depth: depth + 1
    };

    node.dependencies.push(childNode);

    if (dep.dependsOnSchemaId) {
      await buildDependencyGraph(childNode, dep.dependsOnSchemaId, depth + 1, maxDepth, visited);
    }
  }
}

/**
 * Get topologically sorted list of schemas for migration
 */
ForgeSchemaDependency.getTopologicalOrder = async function(schemaIds) {
  const graph = new Map();
  const inDegree = new Map();

  // Initialize graph
  for (const schemaId of schemaIds) {
    graph.set(schemaId, []);
    inDegree.set(schemaId, 0);
  }

  // Build graph
  for (const schemaId of schemaIds) {
    const dependencies = await this.findAll({
      where: { schemaId }
    });

    for (const dep of dependencies) {
      if (dep.dependsOnSchemaId && schemaIds.includes(dep.dependsOnSchemaId)) {
        graph.get(dep.dependsOnSchemaId).push(schemaId);
        inDegree.set(schemaId, inDegree.get(schemaId) + 1);
      }
    }
  }

  // Kahn's algorithm for topological sort
  const queue = [];
  const result = [];

  // Add all nodes with no dependencies to queue
  for (const [schemaId, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(schemaId);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift();
    result.push(current);

    for (const dependent of graph.get(current)) {
      inDegree.set(dependent, inDegree.get(dependent) - 1);

      if (inDegree.get(dependent) === 0) {
        queue.push(dependent);
      }
    }
  }

  // Check for cycles
  if (result.length !== schemaIds.length) {
    throw new Error('Circular dependency detected in schemas');
  }

  return result;
};

/**
 * Check if removing a schema would break dependencies
 */
ForgeSchemaDependency.checkRemovalSafety = async function(schemaId) {
  const dependents = await this.getDependents(schemaId);

  return {
    safe: dependents.length === 0,
    dependentCount: dependents.length,
    dependents: dependents.map(d => ({
      schemaId: d.schemaId,
      dependencyType: d.dependencyType,
      fieldName: d.fieldName
    }))
  };
};

module.exports = ForgeSchemaDependency;
