/**
 * Parameter Storage Service
 * Power Query / Tableau style parameter management for reports
 */

const { v4: uuidv4 } = require('uuid');
const redis = require('../../config/redis');
const { sequelize } = require('../../../config/database');
const reportVariableService = require('./reportVariableService');
const logger = require('../../../utils/logger');

class ParameterStorageService {
  constructor() {
    // Parameter types (similar to Power Query)
    this.parameterTypes = {
      TEXT: 'text',
      NUMBER: 'number',
      DATE: 'date',
      DATE_TIME: 'datetime',
      BOOLEAN: 'boolean',
      LIST: 'list',           // List of allowed values
      QUERY: 'query',         // Parameter populated from query
      CALCULATED: 'calculated' // Calculated from other parameters
    };

    // Storage scopes
    this.scopes = {
      GLOBAL: 'global',       // Available to all reports
      WORKSPACE: 'workspace', // Available within workspace
      REPORT: 'report',       // Specific to one report
      USER: 'user',          // User-specific values
      SESSION: 'session'      // Session-specific (temporary)
    };

    // In-memory parameter store (in production, use database)
    this.parameters = new Map();

    // Parameter values cache
    this.valueCache = new Map();

    // Dependencies graph (for calculated parameters)
    this.dependencies = new Map();
  }

  /**
   * Create parameter
   */
  async createParameter(parameterData, userId) {
    const parameter = {
      id: uuidv4(),
      name: parameterData.name,
      label: parameterData.label || parameterData.name,
      description: parameterData.description || '',
      type: parameterData.type,
      dataType: parameterData.dataType || 'string',

      // Scope and ownership
      scope: parameterData.scope || this.scopes.GLOBAL,
      createdBy: userId,
      workspaceId: parameterData.workspaceId || null,
      reportId: parameterData.reportId || null,

      // Value configuration
      defaultValue: parameterData.defaultValue,
      currentValue: parameterData.currentValue || parameterData.defaultValue,
      allowedValues: parameterData.allowedValues || null,
      allowMultiple: parameterData.allowMultiple || false,

      // List parameters
      listValues: parameterData.listValues || null, // Static list

      // Query parameters (dynamic list from query)
      query: parameterData.query || null,
      queryRefreshInterval: parameterData.queryRefreshInterval || 3600, // seconds

      // Calculated parameters
      expression: parameterData.expression || null, // JavaScript expression
      dependencies: parameterData.dependencies || [], // Parameters this depends on

      // Validation
      required: parameterData.required !== false,
      validation: {
        min: parameterData.validation?.min || null,
        max: parameterData.validation?.max || null,
        pattern: parameterData.validation?.pattern || null,
        customValidator: parameterData.validation?.customValidator || null
      },

      // Storage
      storeInCache: parameterData.storeInCache !== false,
      cacheTTL: parameterData.cacheTTL || 3600,
      storeHistory: parameterData.storeHistory || false,
      historyLimit: parameterData.historyLimit || 10,

      // Metadata
      tags: parameterData.tags || [],
      category: parameterData.category || 'general',
      order: parameterData.order || 0,

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Validate parameter
    const validation = this.validateParameter(parameter);
    if (!validation.valid) {
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    // Store parameter
    this.parameters.set(parameter.id, parameter);

    // Setup dependencies if calculated
    if (parameter.type === this.parameterTypes.CALCULATED && parameter.dependencies.length > 0) {
      this.setupDependencies(parameter.id, parameter.dependencies);
    }

    logger.info('Created parameter', {
      parameterId: parameter.id,
      name: parameter.name,
      type: parameter.type,
      scope: parameter.scope,
      userId
    });

    return parameter;
  }

  /**
   * Get parameter
   */
  getParameter(parameterId) {
    const parameter = this.parameters.get(parameterId);

    if (!parameter) {
      throw new Error(`Parameter not found: ${parameterId}`);
    }

    return parameter;
  }

  /**
   * Get parameter by name
   */
  getParameterByName(name, context = {}) {
    const { scope, reportId, workspaceId, userId } = context;

    for (const parameter of this.parameters.values()) {
      if (parameter.name !== name) {
        continue;
      }

      // Check scope match
      if (scope && parameter.scope !== scope) {
        continue;
      }

      // Check report match
      if (reportId && parameter.reportId && parameter.reportId !== reportId) {
        continue;
      }

      // Check workspace match
      if (workspaceId && parameter.workspaceId && parameter.workspaceId !== workspaceId) {
        continue;
      }

      return parameter;
    }

    throw new Error(`Parameter not found: ${name}`);
  }

  /**
   * List parameters
   */
  listParameters(filters = {}) {
    const { scope, reportId, workspaceId, userId, category, type } = filters;

    let parameters = Array.from(this.parameters.values());

    if (scope) {
      parameters = parameters.filter(p => p.scope === scope);
    }

    if (reportId) {
      parameters = parameters.filter(p => !p.reportId || p.reportId === reportId);
    }

    if (workspaceId) {
      parameters = parameters.filter(p => !p.workspaceId || p.workspaceId === workspaceId);
    }

    if (category) {
      parameters = parameters.filter(p => p.category === category);
    }

    if (type) {
      parameters = parameters.filter(p => p.type === type);
    }

    // Sort by order then name
    parameters.sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.name.localeCompare(b.name);
    });

    return parameters;
  }

  /**
   * Set parameter value
   */
  async setParameterValue(parameterId, value, context = {}) {
    const parameter = this.getParameter(parameterId);

    // Validate value
    const validation = await this.validateValue(parameter, value);
    if (!validation.valid) {
      throw new Error(`Invalid parameter value: ${validation.errors.join(', ')}`);
    }

    // Store previous value for history
    const previousValue = parameter.currentValue;

    // Update value
    parameter.currentValue = value;
    parameter.updatedAt = new Date().toISOString();

    // Store in cache
    if (parameter.storeInCache) {
      await this.cacheValue(parameterId, value, parameter.cacheTTL);
    }

    // Store in history
    if (parameter.storeHistory) {
      await this.addToHistory(parameterId, {
        value,
        previousValue,
        changedBy: context.userId,
        changedAt: parameter.updatedAt
      });
    }

    // Recalculate dependent parameters
    await this.recalculateDependents(parameterId);

    logger.info('Set parameter value', {
      parameterId,
      name: parameter.name,
      value: typeof value === 'object' ? JSON.stringify(value) : value,
      userId: context.userId
    });

    return parameter;
  }

  /**
   * Get parameter value
   */
  async getParameterValue(parameterId, context = {}) {
    const parameter = this.getParameter(parameterId);

    // Check cache first
    if (parameter.storeInCache) {
      const cached = await this.getCachedValue(parameterId);
      if (cached !== null) {
        return cached;
      }
    }

    // Handle different parameter types
    switch (parameter.type) {
      case this.parameterTypes.QUERY:
        return await this.resolveQueryParameter(parameter);

      case this.parameterTypes.CALCULATED:
        return await this.calculateParameterValue(parameter, context);

      default:
        return parameter.currentValue;
    }
  }

  /**
   * Resolve query parameter (execute query to get values)
   */
  async resolveQueryParameter(parameter) {
    if (!parameter.query) {
      throw new Error('Query parameter must have a query defined');
    }

    try {
      logger.debug('Resolving query parameter', { parameterId: parameter.id, name: parameter.name });

      const [results] = await sequelize.query(parameter.query);

      // Extract values from results
      let values;
      if (results.length === 0) {
        values = [];
      } else {
        // Use first column
        const firstColumn = Object.keys(results[0])[0];
        values = results.map(row => row[firstColumn]);
      }

      // Cache results
      if (parameter.storeInCache) {
        await this.cacheValue(parameter.id, values, parameter.queryRefreshInterval);
      }

      logger.debug('Query parameter resolved', {
        parameterId: parameter.id,
        valueCount: values.length
      });

      return values;
    } catch (err) {
      logger.error('Failed to resolve query parameter', {
        parameterId: parameter.id,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Calculate parameter value from expression
   */
  async calculateParameterValue(parameter, context = {}) {
    if (!parameter.expression) {
      throw new Error('Calculated parameter must have an expression');
    }

    try {
      // Get dependency values
      const dependencyValues = {};

      for (const depId of parameter.dependencies) {
        const depParam = this.getParameter(depId);
        dependencyValues[depParam.name] = await this.getParameterValue(depId, context);
      }

      // Create evaluation context
      const evalContext = {
        ...dependencyValues,
        ...context,
        // Helper functions
        date: (str) => new Date(str),
        now: () => new Date(),
        sum: (...args) => args.reduce((a, b) => a + b, 0),
        avg: (...args) => args.reduce((a, b) => a + b, 0) / args.length,
        min: (...args) => Math.min(...args),
        max: (...args) => Math.max(...args)
      };

      // Evaluate expression
      const func = new Function(...Object.keys(evalContext), `return ${parameter.expression};`);
      const result = func(...Object.values(evalContext));

      logger.debug('Calculated parameter value', {
        parameterId: parameter.id,
        expression: parameter.expression,
        result
      });

      return result;
    } catch (err) {
      logger.error('Failed to calculate parameter value', {
        parameterId: parameter.id,
        expression: parameter.expression,
        error: err.message
      });
      throw err;
    }
  }

  /**
   * Setup dependency tracking
   */
  setupDependencies(parameterId, dependencies) {
    for (const depId of dependencies) {
      if (!this.dependencies.has(depId)) {
        this.dependencies.set(depId, new Set());
      }

      this.dependencies.get(depId).add(parameterId);
    }
  }

  /**
   * Recalculate dependent parameters
   */
  async recalculateDependents(parameterId) {
    if (!this.dependencies.has(parameterId)) {
      return;
    }

    const dependents = this.dependencies.get(parameterId);

    logger.debug('Recalculating dependent parameters', {
      parameterId,
      dependentCount: dependents.size
    });

    for (const dependentId of dependents) {
      try {
        const dependent = this.getParameter(dependentId);

        if (dependent.type === this.parameterTypes.CALCULATED) {
          const newValue = await this.calculateParameterValue(dependent);
          dependent.currentValue = newValue;
          dependent.updatedAt = new Date().toISOString();

          // Recursively recalculate
          await this.recalculateDependents(dependentId);
        }
      } catch (err) {
        logger.error('Failed to recalculate dependent parameter', {
          dependentId,
          error: err.message
        });
      }
    }
  }

  /**
   * Validate parameter definition
   */
  validateParameter(parameter) {
    const errors = [];

    // Required fields
    if (!parameter.name || parameter.name.trim() === '') {
      errors.push('Parameter name is required');
    }

    if (!parameter.type) {
      errors.push('Parameter type is required');
    }

    if (!Object.values(this.parameterTypes).includes(parameter.type)) {
      errors.push(`Invalid parameter type: ${parameter.type}`);
    }

    // Query parameters must have a query
    if (parameter.type === this.parameterTypes.QUERY && !parameter.query) {
      errors.push('Query parameter must have a query defined');
    }

    // Calculated parameters must have an expression
    if (parameter.type === this.parameterTypes.CALCULATED && !parameter.expression) {
      errors.push('Calculated parameter must have an expression');
    }

    // Check for circular dependencies
    if (parameter.type === this.parameterTypes.CALCULATED && parameter.dependencies.length > 0) {
      if (this.hasCircularDependency(parameter.id, parameter.dependencies)) {
        errors.push('Circular dependency detected');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate parameter value
   */
  async validateValue(parameter, value) {
    const errors = [];

    // Required check
    if (parameter.required && (value === null || value === undefined || value === '')) {
      errors.push(`${parameter.label} is required`);
      return { valid: false, errors };
    }

    // Skip further validation if value is null/undefined and not required
    if (value === null || value === undefined) {
      return { valid: true, errors: [] };
    }

    // Type validation
    const dataType = parameter.dataType;

    switch (dataType) {
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push(`${parameter.label} must be a number`);
        } else {
          if (parameter.validation.min !== null && value < parameter.validation.min) {
            errors.push(`${parameter.label} must be at least ${parameter.validation.min}`);
          }
          if (parameter.validation.max !== null && value > parameter.validation.max) {
            errors.push(`${parameter.label} must be at most ${parameter.validation.max}`);
          }
        }
        break;

      case 'date':
        if (!(value instanceof Date) && !Date.parse(value)) {
          errors.push(`${parameter.label} must be a valid date`);
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${parameter.label} must be true or false`);
        }
        break;

      case 'string':
        if (typeof value !== 'string') {
          errors.push(`${parameter.label} must be text`);
        } else {
          if (parameter.validation.pattern) {
            const regex = new RegExp(parameter.validation.pattern);
            if (!regex.test(value)) {
              errors.push(`${parameter.label} does not match required pattern`);
            }
          }
        }
        break;
    }

    // Allowed values check
    if (parameter.allowedValues && parameter.allowedValues.length > 0) {
      const allowed = Array.isArray(value) ? value.every(v => parameter.allowedValues.includes(v))
        : parameter.allowedValues.includes(value);

      if (!allowed) {
        errors.push(`${parameter.label} must be one of: ${parameter.allowedValues.join(', ')}`);
      }
    }

    // Custom validation
    if (parameter.validation.customValidator) {
      try {
        const customResult = parameter.validation.customValidator(value);
        if (customResult !== true) {
          errors.push(customResult || 'Validation failed');
        }
      } catch (err) {
        errors.push(`Validation error: ${err.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check for circular dependencies
   */
  hasCircularDependency(parameterId, dependencies, visited = new Set()) {
    if (visited.has(parameterId)) {
      return true;
    }

    visited.add(parameterId);

    for (const depId of dependencies) {
      const depParam = this.parameters.get(depId);

      if (depParam && depParam.dependencies && depParam.dependencies.length > 0) {
        if (this.hasCircularDependency(depId, depParam.dependencies, new Set(visited))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Cache parameter value
   */
  async cacheValue(parameterId, value, ttl) {
    const cacheKey = `parameter:${parameterId}:value`;

    try {
      if (redis.enabled) {
        await redis.setex(cacheKey, ttl, JSON.stringify(value));
      } else {
        this.valueCache.set(cacheKey, {
          value,
          expiresAt: Date.now() + (ttl * 1000)
        });
      }

      logger.debug('Cached parameter value', { parameterId, ttl });
    } catch (err) {
      logger.warn('Failed to cache parameter value', { parameterId, error: err.message });
    }
  }

  /**
   * Get cached parameter value
   */
  async getCachedValue(parameterId) {
    const cacheKey = `parameter:${parameterId}:value`;

    try {
      if (redis.enabled) {
        const cached = await redis.get(cacheKey);
        return cached ? JSON.parse(cached) : null;
      } else {
        const cached = this.valueCache.get(cacheKey);

        if (cached && cached.expiresAt > Date.now()) {
          return cached.value;
        }

        // Remove expired
        if (cached) {
          this.valueCache.delete(cacheKey);
        }

        return null;
      }
    } catch (err) {
      logger.warn('Failed to get cached value', { parameterId, error: err.message });
      return null;
    }
  }

  /**
   * Add to parameter history
   */
  async addToHistory(parameterId, historyEntry) {
    const historyKey = `parameter:${parameterId}:history`;

    try {
      // Get existing history
      let history = [];
      if (redis.enabled) {
        const cached = await redis.get(historyKey);
        history = cached ? JSON.parse(cached) : [];
      }

      // Add new entry
      history.unshift(historyEntry);

      // Limit history size
      const parameter = this.getParameter(parameterId);
      if (history.length > parameter.historyLimit) {
        history = history.slice(0, parameter.historyLimit);
      }

      // Save history
      if (redis.enabled) {
        await redis.setex(historyKey, 86400 * 30, JSON.stringify(history)); // 30 days
      }

      logger.debug('Added to parameter history', { parameterId, historySize: history.length });
    } catch (err) {
      logger.warn('Failed to add to history', { parameterId, error: err.message });
    }
  }

  /**
   * Get parameter history
   */
  async getParameterHistory(parameterId) {
    const historyKey = `parameter:${parameterId}:history`;

    try {
      if (redis.enabled) {
        const cached = await redis.get(historyKey);
        return cached ? JSON.parse(cached) : [];
      }

      return [];
    } catch (err) {
      logger.warn('Failed to get history', { parameterId, error: err.message });
      return [];
    }
  }

  /**
   * Resolve all parameters in context
   */
  async resolveAllParameters(parameterIds, context = {}) {
    const resolved = {};

    for (const parameterId of parameterIds) {
      try {
        const parameter = this.getParameter(parameterId);
        resolved[parameter.name] = await this.getParameterValue(parameterId, context);
      } catch (err) {
        logger.error('Failed to resolve parameter', { parameterId, error: err.message });
        resolved[parameterId] = null;
      }
    }

    return resolved;
  }

  /**
   * Delete parameter
   */
  async deleteParameter(parameterId, userId) {
    const parameter = this.getParameter(parameterId);

    if (parameter.createdBy !== userId) {
      throw new Error('Unauthorized to delete this parameter');
    }

    // Check if parameter has dependents
    if (this.dependencies.has(parameterId)) {
      const dependents = this.dependencies.get(parameterId);
      if (dependents.size > 0) {
        throw new Error(`Cannot delete parameter with ${dependents.size} dependent parameters`);
      }
    }

    // Remove from dependencies
    for (const depId of parameter.dependencies) {
      if (this.dependencies.has(depId)) {
        this.dependencies.get(depId).delete(parameterId);
      }
    }

    // Delete parameter
    this.parameters.delete(parameterId);

    logger.info('Deleted parameter', { parameterId, name: parameter.name, userId });

    return { success: true };
  }
}

module.exports = new ParameterStorageService();
