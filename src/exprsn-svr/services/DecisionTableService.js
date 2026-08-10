/**
 * ═══════════════════════════════════════════════════════════
 * Decision Table Service
 * Evaluates business rules using DMN-style decision tables
 * ═══════════════════════════════════════════════════════════
 */

const DecisionTable = require('../models/DecisionTable');
const logger = require('../utils/logger');

class DecisionTableService {
  /**
   * Evaluate decision table with input data
   */
  async evaluate(tableId, inputData) {
    const table = await DecisionTable.findByPk(tableId);
    if (!table) {
      throw new Error('Decision table not found');
    }

    if (table.status !== 'active') {
      throw new Error(`Decision table is ${table.status}, must be active to evaluate`);
    }

    // Sort rules by priority if available
    const sortedRules = [...table.rules].sort((a, b) => (a.priority || 0) - (b.priority || 0));

    const matchedRules = [];

    // Evaluate each rule
    for (const rule of sortedRules) {
      if (this.evaluateRule(rule, inputData, table.inputs)) {
        matchedRules.push(rule);

        // Apply hit policy
        if (table.hitPolicy === 'first' || table.hitPolicy === 'unique') {
          break;
        }
      }
    }

    // Increment execution count
    await table.incrementExecutionCount();

    // Apply hit policy and return results
    return this.applyHitPolicy(table.hitPolicy, matchedRules, table.outputs, table.defaultOutput);
  }

  /**
   * Evaluate a single rule
   */
  evaluateRule(rule, inputData, inputs) {
    if (!rule.conditions || rule.conditions.length === 0) {
      return true; // Rule with no conditions matches everything
    }

    for (const condition of rule.conditions) {
      const input = inputs.find(i => i.name === condition.input);
      if (!input) continue;

      const inputValue = inputData[condition.input];
      const conditionValue = condition.value;

      if (!this.evaluateCondition(inputValue, condition.operator, conditionValue, input.type)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a condition
   */
  evaluateCondition(inputValue, operator, conditionValue, type) {
    // Handle null/undefined values
    if (inputValue === null || inputValue === undefined) {
      return operator === 'is_null' || operator === 'is_empty';
    }

    switch (operator) {
      case '==':
      case 'equals':
        return inputValue == conditionValue;

      case '!=':
      case 'not_equals':
        return inputValue != conditionValue;

      case '>':
      case 'greater_than':
        return Number(inputValue) > Number(conditionValue);

      case '>=':
      case 'greater_than_or_equal':
        return Number(inputValue) >= Number(conditionValue);

      case '<':
      case 'less_than':
        return Number(inputValue) < Number(conditionValue);

      case '<=':
      case 'less_than_or_equal':
        return Number(inputValue) <= Number(conditionValue);

      case 'contains':
        return String(inputValue).includes(String(conditionValue));

      case 'not_contains':
        return !String(inputValue).includes(String(conditionValue));

      case 'starts_with':
        return String(inputValue).startsWith(String(conditionValue));

      case 'ends_with':
        return String(inputValue).endsWith(String(conditionValue));

      case 'in':
      case 'in_list':
        return Array.isArray(conditionValue) && conditionValue.includes(inputValue);

      case 'not_in':
      case 'not_in_list':
        return Array.isArray(conditionValue) && !conditionValue.includes(inputValue);

      case 'between':
        return Array.isArray(conditionValue) &&
               inputValue >= conditionValue[0] &&
               inputValue <= conditionValue[1];

      case 'is_null':
        return inputValue === null || inputValue === undefined;

      case 'is_not_null':
        return inputValue !== null && inputValue !== undefined;

      case 'is_empty':
        return inputValue === '' || inputValue === null || inputValue === undefined;

      case 'is_not_empty':
        return inputValue !== '' && inputValue !== null && inputValue !== undefined;

      case 'matches':
      case 'regex':
        try {
          const regex = new RegExp(conditionValue);
          return regex.test(String(inputValue));
        } catch (err) {
          logger.error('Invalid regex pattern:', conditionValue);
          return false;
        }

      default:
        logger.warn('Unknown operator:', operator);
        return false;
    }
  }

  /**
   * Apply hit policy to matched rules
   */
  applyHitPolicy(hitPolicy, matchedRules, outputs, defaultOutput) {
    if (matchedRules.length === 0) {
      return {
        matched: false,
        outputs: defaultOutput || {},
        matchedRules: []
      };
    }

    switch (hitPolicy) {
      case 'first':
        // Return first matching rule
        return {
          matched: true,
          outputs: matchedRules[0].outputs,
          matchedRules: [matchedRules[0]]
        };

      case 'unique':
        // Only one rule should match (error if multiple)
        if (matchedRules.length > 1) {
          throw new Error('Multiple rules matched with UNIQUE hit policy');
        }
        return {
          matched: true,
          outputs: matchedRules[0].outputs,
          matchedRules: [matchedRules[0]]
        };

      case 'priority':
        // Return highest priority rule (first after sorting)
        return {
          matched: true,
          outputs: matchedRules[0].outputs,
          matchedRules: [matchedRules[0]]
        };

      case 'any':
        // Any matching rule (they should all return same output)
        return {
          matched: true,
          outputs: matchedRules[0].outputs,
          matchedRules: [matchedRules[0]]
        };

      case 'collect':
        // Collect all outputs from all matching rules
        const collected = {};
        for (const output of outputs) {
          collected[output.name] = matchedRules.map(r => r.outputs[output.name]);
        }
        return {
          matched: true,
          outputs: collected,
          matchedRules: matchedRules
        };

      default:
        return {
          matched: true,
          outputs: matchedRules[0].outputs,
          matchedRules: [matchedRules[0]]
        };
    }
  }

  /**
   * Create decision table
   */
  async create(data) {
    return await DecisionTable.create(data);
  }

  /**
   * Update decision table
   */
  async update(id, data) {
    const table = await DecisionTable.findByPk(id);
    if (!table) {
      throw new Error('Decision table not found');
    }

    await table.update(data);
    return table;
  }

  /**
   * Delete decision table
   */
  async delete(id) {
    const table = await DecisionTable.findByPk(id);
    if (!table) {
      throw new Error('Decision table not found');
    }

    await table.destroy();
  }

  /**
   * List decision tables
   */
  async list(where = {}) {
    return await DecisionTable.findAll({ where });
  }

  /**
   * Get decision table by ID
   */
  async getById(id) {
    return await DecisionTable.findByPk(id);
  }
}

module.exports = new DecisionTableService();
