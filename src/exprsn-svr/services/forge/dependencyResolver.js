const { ForgeSchemaDependency, ForgeSchema } = require('../models');
const logger = require('../../utils/logger');

/**
 * Dependency Resolver Service
 *
 * Resolves schema dependencies and determines safe execution order
 * Implements topological sorting for dependency graphs
 * Detects circular dependencies
 */

class DependencyResolverService {
  /**
   * Get topologically sorted list of schemas
   */
  async getExecutionOrder(schemaIds) {
    try {
      // Build dependency graph
      const graph = await this.buildDependencyGraph(schemaIds);

      // Perform topological sort
      const sorted = this.topologicalSort(graph);

      logger.info('Schemas sorted for execution', {
        count: sorted.length,
        order: sorted
      });

      return sorted;
    } catch (error) {
      logger.error('Failed to resolve execution order', {
        error: error.message,
        schemaIds
      });
      throw error;
    }
  }

  /**
   * Build dependency graph from schema IDs
   */
  async buildDependencyGraph(schemaIds) {
    const graph = new Map();

    // Initialize nodes
    for (const schemaId of schemaIds) {
      graph.set(schemaId, {
        id: schemaId,
        dependencies: [],
        dependents: []
      });
    }

    // Build edges
    for (const schemaId of schemaIds) {
      const dependencies = await ForgeSchemaDependency.findAll({
        where: { schemaId }
      });

      const node = graph.get(schemaId);

      for (const dep of dependencies) {
        if (dep.dependsOnSchemaId && schemaIds.includes(dep.dependsOnSchemaId)) {
          node.dependencies.push(dep.dependsOnSchemaId);

          const depNode = graph.get(dep.dependsOnSchemaId);
          if (depNode) {
            depNode.dependents.push(schemaId);
          }
        }
      }
    }

    return graph;
  }

  /**
   * Topological sort using Kahn's algorithm
   */
  topologicalSort(graph) {
    const sorted = [];
    const inDegree = new Map();
    const queue = [];

    // Calculate in-degrees
    for (const [schemaId, node] of graph.entries()) {
      inDegree.set(schemaId, node.dependencies.length);

      if (node.dependencies.length === 0) {
        queue.push(schemaId);
      }
    }

    // Process nodes with no dependencies
    while (queue.length > 0) {
      const current = queue.shift();
      sorted.push(current);

      const node = graph.get(current);

      for (const dependent of node.dependents) {
        const currentDegree = inDegree.get(dependent);
        inDegree.set(dependent, currentDegree - 1);

        if (inDegree.get(dependent) === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check for cycles
    if (sorted.length !== graph.size) {
      const remaining = Array.from(graph.keys()).filter(id => !sorted.includes(id));

      throw new Error(
        `Circular dependency detected. Unresolved schemas: ${remaining.join(', ')}`
      );
    }

    return sorted;
  }

  /**
   * Check for circular dependencies
   */
  async hasCircularDependency(schemaId, dependsOnSchemaId) {
    if (!dependsOnSchemaId) {
      return false;
    }

    const visited = new Set();
    const recursionStack = new Set();

    const dfs = async (currentId) => {
      if (recursionStack.has(currentId)) {
        return true; // Found a cycle
      }

      if (visited.has(currentId)) {
        return false;
      }

      visited.add(currentId);
      recursionStack.add(currentId);

      // Get dependencies of current schema
      const dependencies = await ForgeSchemaDependency.findAll({
        where: { schemaId: currentId }
      });

      for (const dep of dependencies) {
        if (dep.dependsOnSchemaId) {
          if (await dfs(dep.dependsOnSchemaId)) {
            return true;
          }
        }
      }

      recursionStack.delete(currentId);
      return false;
    };

    // Start DFS from the dependency we want to add
    const hasCircle = await dfs(dependsOnSchemaId);

    return hasCircle;
  }

  /**
   * Get dependency chain for a schema
   */
  async getDependencyChain(schemaId, options = {}) {
    const { maxDepth = 10, includeSchemaDetails = false } = options;

    const chain = [];
    const visited = new Set();

    const traverse = async (currentId, depth = 0) => {
      if (depth >= maxDepth || visited.has(currentId)) {
        return;
      }

      visited.add(currentId);

      const schema = includeSchemaDetails
        ? await ForgeSchema.findByPk(currentId)
        : null;

      const dependencies = await ForgeSchemaDependency.findAll({
        where: { schemaId: currentId }
      });

      const node = {
        schemaId: currentId,
        depth,
        dependencies: []
      };

      if (schema) {
        node.modelId = schema.modelId;
        node.version = schema.version;
        node.name = schema.name;
      }

      chain.push(node);

      for (const dep of dependencies) {
        if (dep.dependsOnSchemaId) {
          node.dependencies.push({
            schemaId: dep.dependsOnSchemaId,
            modelId: dep.dependsOnModelId,
            dependencyType: dep.dependencyType,
            fieldName: dep.fieldName
          });

          await traverse(dep.dependsOnSchemaId, depth + 1);
        }
      }
    };

    await traverse(schemaId);

    return chain;
  }

  /**
   * Get dependent schemas (schemas that depend on the given schema)
   */
  async getDependentSchemas(schemaId, options = {}) {
    const { recursive = false, maxDepth = 10 } = options;

    const dependents = [];
    const visited = new Set();

    const traverse = async (currentId, depth = 0) => {
      if (depth >= maxDepth || visited.has(currentId)) {
        return;
      }

      visited.add(currentId);

      const deps = await ForgeSchemaDependency.findAll({
        where: { dependsOnSchemaId: currentId },
        include: [{
          model: ForgeSchema,
          as: 'schema'
        }]
      });

      for (const dep of deps) {
        dependents.push({
          schemaId: dep.schemaId,
          modelId: dep.schema?.modelId,
          version: dep.schema?.version,
          name: dep.schema?.name,
          dependencyType: dep.dependencyType,
          fieldName: dep.fieldName,
          depth
        });

        if (recursive) {
          await traverse(dep.schemaId, depth + 1);
        }
      }
    };

    await traverse(schemaId);

    return dependents;
  }

  /**
   * Check if a schema can be safely deleted
   */
  async canDeleteSchema(schemaId) {
    const dependents = await this.getDependentSchemas(schemaId, { recursive: false });

    if (dependents.length > 0) {
      return {
        safe: false,
        reason: `${dependents.length} schema(s) depend on this schema`,
        dependents: dependents.map(d => ({
          schemaId: d.schemaId,
          modelId: d.modelId,
          dependencyType: d.dependencyType
        }))
      };
    }

    return {
      safe: true,
      reason: 'No dependencies found'
    };
  }

  /**
   * Get schema dependency tree (hierarchical representation)
   */
  async getDependencyTree(schemaId, options = {}) {
    const { maxDepth = 10, direction = 'dependencies' } = options;

    const schema = await ForgeSchema.findByPk(schemaId);

    if (!schema) {
      throw new Error(`Schema not found: ${schemaId}`);
    }

    const tree = {
      schemaId: schema.id,
      modelId: schema.modelId,
      version: schema.version,
      name: schema.name,
      children: []
    };

    const visited = new Set();

    const buildTree = async (node, currentId, depth = 0) => {
      if (depth >= maxDepth || visited.has(currentId)) {
        return;
      }

      visited.add(currentId);

      let dependencies;

      if (direction === 'dependencies') {
        // Get schemas this one depends on
        dependencies = await ForgeSchemaDependency.findAll({
          where: { schemaId: currentId },
          include: [{
            model: ForgeSchema,
            as: 'dependsOnSchema'
          }]
        });
      } else {
        // Get schemas that depend on this one
        dependencies = await ForgeSchemaDependency.findAll({
          where: { dependsOnSchemaId: currentId },
          include: [{
            model: ForgeSchema,
            as: 'schema'
          }]
        });
      }

      for (const dep of dependencies) {
        const childSchema = direction === 'dependencies'
          ? dep.dependsOnSchema
          : dep.schema;

        if (!childSchema) continue;

        const childNode = {
          schemaId: childSchema.id,
          modelId: childSchema.modelId,
          version: childSchema.version,
          name: childSchema.name,
          dependencyType: dep.dependencyType,
          fieldName: dep.fieldName,
          children: []
        };

        node.children.push(childNode);

        await buildTree(childNode, childSchema.id, depth + 1);
      }
    };

    await buildTree(tree, schemaId);

    return tree;
  }

  /**
   * Validate dependency graph for all schemas
   */
  async validateDependencyGraph() {
    try {
      // Get all active schemas
      const schemas = await ForgeSchema.findAll({
        where: { status: 'active' }
      });

      const schemaIds = schemas.map(s => s.id);

      // Try to build execution order (will throw if circular dependency)
      await this.getExecutionOrder(schemaIds);

      // Check for missing dependencies
      const missingDeps = [];

      for (const schema of schemas) {
        const dependencies = await ForgeSchemaDependency.findAll({
          where: { schemaId: schema.id }
        });

        for (const dep of dependencies) {
          if (dep.dependsOnSchemaId) {
            const depSchema = await ForgeSchema.findByPk(dep.dependsOnSchemaId);

            if (!depSchema || depSchema.status !== 'active') {
              missingDeps.push({
                schemaId: schema.id,
                modelId: schema.modelId,
                missingDependency: dep.dependsOnModelId
              });
            }
          }
        }
      }

      return {
        valid: missingDeps.length === 0,
        issues: missingDeps.length > 0
          ? [`${missingDeps.length} missing or inactive dependencies found`]
          : [],
        missingDependencies: missingDeps
      };
    } catch (error) {
      return {
        valid: false,
        issues: [error.message],
        missingDependencies: []
      };
    }
  }

  /**
   * Get dependency statistics
   */
  async getDependencyStatistics() {
    const schemas = await ForgeSchema.findAll({
      where: { status: 'active' }
    });

    const stats = {
      totalSchemas: schemas.length,
      schemasWithDependencies: 0,
      schemasWithDependents: 0,
      totalDependencies: 0,
      averageDependencies: 0,
      mostDependent: null,
      mostDependedOn: null
    };

    const dependencyCounts = new Map();
    const dependentCounts = new Map();

    for (const schema of schemas) {
      // Count dependencies
      const dependencies = await ForgeSchemaDependency.count({
        where: { schemaId: schema.id }
      });

      dependencyCounts.set(schema.id, dependencies);
      stats.totalDependencies += dependencies;

      if (dependencies > 0) {
        stats.schemasWithDependencies++;
      }

      // Count dependents
      const dependents = await ForgeSchemaDependency.count({
        where: { dependsOnSchemaId: schema.id }
      });

      dependentCounts.set(schema.id, dependents);

      if (dependents > 0) {
        stats.schemasWithDependents++;
      }
    }

    // Calculate averages
    if (stats.totalSchemas > 0) {
      stats.averageDependencies = stats.totalDependencies / stats.totalSchemas;
    }

    // Find most dependent schema
    const maxDependencies = Math.max(...dependencyCounts.values());
    const mostDependentId = Array.from(dependencyCounts.entries())
      .find(([_, count]) => count === maxDependencies)?.[0];

    if (mostDependentId) {
      const schema = schemas.find(s => s.id === mostDependentId);
      stats.mostDependent = {
        schemaId: schema.id,
        modelId: schema.modelId,
        dependencyCount: maxDependencies
      };
    }

    // Find most depended on schema
    const maxDependents = Math.max(...dependentCounts.values());
    const mostDependedOnId = Array.from(dependentCounts.entries())
      .find(([_, count]) => count === maxDependents)?.[0];

    if (mostDependedOnId) {
      const schema = schemas.find(s => s.id === mostDependedOnId);
      stats.mostDependedOn = {
        schemaId: schema.id,
        modelId: schema.modelId,
        dependentCount: maxDependents
      };
    }

    return stats;
  }
}

module.exports = new DependencyResolverService();
