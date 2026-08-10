/**
 * Automation Service
 * Handles Business Rules and Decision Tables (DMN-style)
 */

const { BusinessRule, DecisionTable, Application } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

class AutomationService {
  /**
   * ═══════════════════════════════════════════════════════════
   * BUSINESS RULES
   * ═══════════════════════════════════════════════════════════
   */

  /**
   * Create a business rule
   */
  async createBusinessRule(applicationId, ruleData, userId) {
    try {
      // Validate application exists
      const app = await Application.findByPk(applicationId);
      if (!app) {
        return { success: false, error: 'Application not found' };
      }

      // If decision table is specified, validate it exists
      if (ruleData.decisionTableId) {
        const table = await DecisionTable.findByPk(ruleData.decisionTableId);
        if (!table || table.applicationId !== applicationId) {
          return { success: false, error: 'Decision table not found or belongs to different application' };
        }
      }

      const rule = await BusinessRule.create({
        applicationId,
        ...ruleData,
        enabled: ruleData.enabled !== undefined ? ruleData.enabled : true
      });

      logger.info('[Automation] Business rule created:', { ruleId: rule.id, userId });

      return { success: true, rule };
    } catch (error) {
      logger.error('[Automation] Create business rule error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get business rule by ID
   */
  async getBusinessRule(ruleId) {
    try {
      const rule = await BusinessRule.findByPk(ruleId, {
        include: [
          {
            model: Application,
            as: 'application',
            attributes: ['id', 'name', 'displayName']
          },
          {
            model: DecisionTable,
            as: 'decisionTable',
            attributes: ['id', 'name', 'displayName']
          }
        ]
      });

      if (!rule) {
        return { success: false, error: 'Business rule not found' };
      }

      return { success: true, rule };
    } catch (error) {
      logger.error('[Automation] Get business rule error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List business rules for an application
   */
  async listBusinessRules(applicationId, filters = {}, pagination = {}) {
    try {
      const { ruleType, enabled, decisionTableId, search } = filters;
      const { page = 1, limit = 50 } = pagination;
      const offset = (page - 1) * limit;

      const where = { applicationId };

      if (ruleType) where.ruleType = ruleType;
      if (enabled !== undefined) where.enabled = enabled;
      if (decisionTableId) where.decisionTableId = decisionTableId;
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await BusinessRule.findAndCountAll({
        where,
        include: [{
          model: DecisionTable,
          as: 'decisionTable',
          attributes: ['id', 'name', 'displayName']
        }],
        limit,
        offset,
        order: [['priority', 'DESC'], ['createdAt', 'DESC']]
      });

      return {
        success: true,
        rules: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('[Automation] List business rules error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update business rule
   */
  async updateBusinessRule(ruleId, updates, userId) {
    try {
      const rule = await BusinessRule.findByPk(ruleId);
      if (!rule) {
        return { success: false, error: 'Business rule not found' };
      }

      await rule.update(updates);

      logger.info('[Automation] Business rule updated:', { ruleId, userId });

      return { success: true, rule };
    } catch (error) {
      logger.error('[Automation] Update business rule error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete business rule
   */
  async deleteBusinessRule(ruleId, userId) {
    try {
      const rule = await BusinessRule.findByPk(ruleId);
      if (!rule) {
        return { success: false, error: 'Business rule not found' };
      }

      await rule.destroy();

      logger.info('[Automation] Business rule deleted:', { ruleId, userId });

      return { success: true, message: 'Business rule deleted successfully' };
    } catch (error) {
      logger.error('[Automation] Delete business rule error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute a business rule
   */
  async executeBusinessRule(ruleId, inputData) {
    try {
      const rule = await BusinessRule.findByPk(ruleId);
      if (!rule) {
        return { success: false, error: 'Business rule not found' };
      }

      if (!rule.enabled) {
        return { success: false, error: 'Business rule is disabled' };
      }

      // Evaluate condition (simple implementation)
      const conditionMet = this.evaluateCondition(rule.condition, inputData);

      if (conditionMet) {
        // Execute action
        const result = this.executeAction(rule.action, inputData);

        logger.info('[Automation] Business rule executed:', {
          ruleId,
          conditionMet: true,
          result
        });

        return {
          success: true,
          conditionMet: true,
          result,
          ruleId: rule.id,
          ruleName: rule.name
        };
      }

      return {
        success: true,
        conditionMet: false,
        ruleId: rule.id,
        ruleName: rule.name
      };
    } catch (error) {
      logger.error('[Automation] Execute business rule error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * DECISION TABLES
   * ═══════════════════════════════════════════════════════════
   */

  /**
   * Create a decision table
   */
  async createDecisionTable(applicationId, tableData, userId) {
    try {
      // Validate application exists
      const app = await Application.findByPk(applicationId);
      if (!app) {
        return { success: false, error: 'Application not found' };
      }

      // Check for duplicate name
      const existing = await DecisionTable.findOne({
        where: {
          applicationId,
          name: tableData.name,
          deletedAt: null
        }
      });

      if (existing) {
        return { success: false, error: 'Decision table with this name already exists' };
      }

      const table = await DecisionTable.create({
        applicationId,
        ...tableData,
        status: 'draft',
        version: '1.0.0'
      });

      logger.info('[Automation] Decision table created:', { tableId: table.id, userId });

      return { success: true, table };
    } catch (error) {
      logger.error('[Automation] Create decision table error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get decision table by ID
   */
  async getDecisionTable(tableId) {
    try {
      const table = await DecisionTable.findByPk(tableId, {
        include: [
          {
            model: Application,
            as: 'application',
            attributes: ['id', 'name', 'displayName']
          },
          {
            model: BusinessRule,
            as: 'businessRules'
          }
        ]
      });

      if (!table) {
        return { success: false, error: 'Decision table not found' };
      }

      return { success: true, table };
    } catch (error) {
      logger.error('[Automation] Get decision table error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List decision tables for an application
   */
  async listDecisionTables(applicationId, filters = {}, pagination = {}) {
    try {
      const { status, search } = filters;
      const { page = 1, limit = 50 } = pagination;
      const offset = (page - 1) * limit;

      const where = { applicationId };

      if (status) where.status = status;
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { displayName: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await DecisionTable.findAndCountAll({
        where,
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      });

      return {
        success: true,
        tables: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('[Automation] List decision tables error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update decision table
   */
  async updateDecisionTable(tableId, updates, userId) {
    try {
      const table = await DecisionTable.findByPk(tableId);
      if (!table) {
        return { success: false, error: 'Decision table not found' };
      }

      // Don't allow updating if active (must deactivate first)
      if (table.status === 'active' && (updates.inputs || updates.outputs || updates.rules)) {
        return { success: false, error: 'Cannot modify active decision table. Deactivate first.' };
      }

      await table.update(updates);

      logger.info('[Automation] Decision table updated:', { tableId, userId });

      return { success: true, table };
    } catch (error) {
      logger.error('[Automation] Update decision table error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Activate decision table
   */
  async activateDecisionTable(tableId, userId) {
    try {
      const table = await DecisionTable.findByPk(tableId);
      if (!table) {
        return { success: false, error: 'Decision table not found' };
      }

      if (table.status === 'active') {
        return { success: false, error: 'Decision table is already active' };
      }

      await table.activate();

      logger.info('[Automation] Decision table activated:', { tableId, userId });

      return { success: true, table };
    } catch (error) {
      logger.error('[Automation] Activate decision table error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Deactivate decision table
   */
  async deactivateDecisionTable(tableId, userId) {
    try {
      const table = await DecisionTable.findByPk(tableId);
      if (!table) {
        return { success: false, error: 'Decision table not found' };
      }

      table.status = 'inactive';
      await table.save();

      logger.info('[Automation] Decision table deactivated:', { tableId, userId });

      return { success: true, table };
    } catch (error) {
      logger.error('[Automation] Deactivate decision table error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete decision table
   */
  async deleteDecisionTable(tableId, userId) {
    try {
      const table = await DecisionTable.findByPk(tableId);
      if (!table) {
        return { success: false, error: 'Decision table not found' };
      }

      // Don't allow deleting if active
      if (table.status === 'active') {
        return { success: false, error: 'Cannot delete active decision table. Deactivate first.' };
      }

      await table.destroy();

      logger.info('[Automation] Decision table deleted:', { tableId, userId });

      return { success: true, message: 'Decision table deleted successfully' };
    } catch (error) {
      logger.error('[Automation] Delete decision table error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Add rule to decision table
   */
  async addRule(tableId, ruleData, userId) {
    try {
      const table = await DecisionTable.findByPk(tableId);
      if (!table) {
        return { success: false, error: 'Decision table not found' };
      }

      if (table.status === 'active') {
        return { success: false, error: 'Cannot modify active decision table' };
      }

      // Generate rule ID if not provided
      if (!ruleData.id) {
        ruleData.id = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }

      table.addRule(ruleData);
      await table.save();

      logger.info('[Automation] Rule added to decision table:', { tableId, ruleId: ruleData.id, userId });

      return { success: true, table, ruleId: ruleData.id };
    } catch (error) {
      logger.error('[Automation] Add rule error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove rule from decision table
   */
  async removeRule(tableId, ruleId, userId) {
    try {
      const table = await DecisionTable.findByPk(tableId);
      if (!table) {
        return { success: false, error: 'Decision table not found' };
      }

      if (table.status === 'active') {
        return { success: false, error: 'Cannot modify active decision table' };
      }

      table.removeRule(ruleId);
      await table.save();

      logger.info('[Automation] Rule removed from decision table:', { tableId, ruleId, userId });

      return { success: true, table };
    } catch (error) {
      logger.error('[Automation] Remove rule error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute decision table
   */
  async executeDecisionTable(tableId, inputData) {
    try {
      const table = await DecisionTable.findByPk(tableId);
      if (!table) {
        return { success: false, error: 'Decision table not found' };
      }

      if (table.status !== 'active') {
        return { success: false, error: 'Decision table must be active to execute' };
      }

      // Evaluate decision table based on hit policy
      const result = this.evaluateDecisionTable(table, inputData);

      // Increment execution count
      await table.incrementExecutionCount();

      logger.info('[Automation] Decision table executed:', {
        tableId,
        hitPolicy: table.hitPolicy,
        rulesMatched: result.matchedRules?.length || 0
      });

      return {
        success: true,
        result: result.output,
        matchedRules: result.matchedRules,
        tableId: table.id,
        tableName: table.name
      };
    } catch (error) {
      logger.error('[Automation] Execute decision table error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════
   * RULE ENGINE - Private Methods
   * ═══════════════════════════════════════════════════════════
   */

  /**
   * Evaluate a simple condition expression
   */
  evaluateCondition(condition, data) {
    if (!condition) return true;

    try {
      // Simple evaluation - in production, use a proper expression evaluator
      // This is a placeholder that returns true for demo purposes
      // In real implementation, parse and evaluate the condition string
      return true;
    } catch (error) {
      logger.error('[Automation] Condition evaluation error:', error);
      return false;
    }
  }

  /**
   * Execute an action
   */
  executeAction(action, data) {
    if (!action) return null;

    try {
      // Simple action execution - placeholder
      // In real implementation, this would execute the action logic
      return { executed: true, action };
    } catch (error) {
      logger.error('[Automation] Action execution error:', error);
      return null;
    }
  }

  /**
   * Evaluate decision table with hit policy
   */
  evaluateDecisionTable(table, inputData) {
    const { rules, hitPolicy, defaultOutput } = table;

    if (!rules || rules.length === 0) {
      return { output: defaultOutput, matchedRules: [] };
    }

    const matchedRules = [];

    // Evaluate each rule
    for (const rule of rules) {
      if (this.evaluateRuleConditions(rule.conditions, inputData)) {
        matchedRules.push(rule);

        // Apply hit policy
        if (hitPolicy === 'first' || hitPolicy === 'unique') {
          // Return first match
          return { output: rule.outputs, matchedRules: [rule] };
        }
      }
    }

    // Hit policy: any, priority, collect
    if (matchedRules.length > 0) {
      if (hitPolicy === 'priority') {
        // Return highest priority match
        matchedRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        return { output: matchedRules[0].outputs, matchedRules: [matchedRules[0]] };
      } else if (hitPolicy === 'collect') {
        // Collect all matched outputs
        return {
          output: matchedRules.map(r => r.outputs),
          matchedRules
        };
      } else {
        // 'any' - return first match
        return { output: matchedRules[0].outputs, matchedRules: [matchedRules[0]] };
      }
    }

    // No matches - return default
    return { output: defaultOutput, matchedRules: [] };
  }

  /**
   * Evaluate rule conditions
   */
  evaluateRuleConditions(conditions, inputData) {
    if (!conditions || !Array.isArray(conditions)) return false;

    // Simple evaluation - all conditions must match
    for (const condition of conditions) {
      const inputValue = inputData[condition.inputName];
      const conditionValue = condition.value;
      const operator = condition.operator || '==';

      if (!this.compareValues(inputValue, conditionValue, operator)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Compare values with operator
   */
  compareValues(inputValue, conditionValue, operator) {
    switch (operator) {
      case '==':
      case 'equals':
        return inputValue == conditionValue;
      case '!=':
      case 'not equals':
        return inputValue != conditionValue;
      case '>':
      case 'greater than':
        return inputValue > conditionValue;
      case '>=':
      case 'greater than or equal':
        return inputValue >= conditionValue;
      case '<':
      case 'less than':
        return inputValue < conditionValue;
      case '<=':
      case 'less than or equal':
        return inputValue <= conditionValue;
      case 'contains':
        return String(inputValue).includes(conditionValue);
      case 'in':
        return Array.isArray(conditionValue) && conditionValue.includes(inputValue);
      default:
        return false;
    }
  }
}

module.exports = new AutomationService();
