const logger = require('../../utils/logger');
const workflowIntegration = require('./workflowIntegration');

/**
 * Task Routing Service
 *
 * Provides intelligent task assignment and routing based on:
 * - Workload balancing
 * - Skills matching
 * - Priority rules
 * - Round-robin distribution
 * - Geographic location
 * - Availability
 */
class TaskRoutingService {
  constructor() {
    this.routingRules = new Map();
  }

  /**
   * Route task to appropriate assignee
   */
  async routeTask(task, options = {}) {
    try {
      const {
        priority = 'medium',
        requiredSkills = [],
        departmentId = null,
        workflowId = null
      } = options;

      logger.info('Routing task', {
        taskId: task.id,
        priority,
        requiredSkills
      });

      // Get routing rule
      const rule = await this.getRoutingRule(task, options);

      if (!rule) {
        logger.warn('No routing rule found, using default assignment');
        return await this.defaultRouting(task);
      }

      // Apply routing strategy
      let assignees = [];

      switch (rule.strategy) {
        case 'round_robin':
          assignees = await this.roundRobinRouting(task, rule);
          break;

        case 'workload_balanced':
          assignees = await this.workloadBalancedRouting(task, rule);
          break;

        case 'skills_based':
          assignees = await this.skillsBasedRouting(task, rule, requiredSkills);
          break;

        case 'priority_based':
          assignees = await this.priorityBasedRouting(task, rule, priority);
          break;

        case 'geographic':
          assignees = await this.geographicRouting(task, rule);
          break;

        case 'custom':
          assignees = await this.customRouting(task, rule);
          break;

        default:
          assignees = await this.defaultRouting(task);
      }

      // Trigger workflow if configured
      if (workflowId) {
        await workflowIntegration.executeWorkflow(workflowId, {
          taskId: task.id,
          assignees,
          routingRule: rule.id
        });
      }

      return {
        success: true,
        assignees,
        rule: rule.name,
        strategy: rule.strategy
      };
    } catch (error) {
      logger.error('Task routing failed', {
        error: error.message,
        taskId: task.id
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Round-robin routing
   */
  async roundRobinRouting(task, rule) {
    const candidates = rule.candidates || [];
    if (candidates.length === 0) {
      return [];
    }

    // Get last assigned index from metadata
    const lastIndex = rule.metadata?.lastAssignedIndex || 0;
    const nextIndex = (lastIndex + 1) % candidates.length;

    // Update last assigned index
    rule.metadata = rule.metadata || {};
    rule.metadata.lastAssignedIndex = nextIndex;

    return [candidates[nextIndex]];
  }

  /**
   * Workload-balanced routing
   */
  async workloadBalancedRouting(task, rule) {
    const candidates = rule.candidates || [];
    if (candidates.length === 0) {
      return [];
    }

    // Get current workload for each candidate
    // In a real implementation, this would query the database
    const workloads = new Map();
    for (const userId of candidates) {
      // TODO: Query actual task count from database
      workloads.set(userId, Math.floor(Math.random() * 10)); // Placeholder
    }

    // Sort by workload (ascending)
    const sorted = candidates.sort((a, b) => {
      return (workloads.get(a) || 0) - (workloads.get(b) || 0);
    });

    // Return user with lowest workload
    return [sorted[0]];
  }

  /**
   * Skills-based routing
   */
  async skillsBasedRouting(task, rule, requiredSkills) {
    if (!requiredSkills || requiredSkills.length === 0) {
      return await this.defaultRouting(task);
    }

    const candidates = rule.candidates || [];
    if (candidates.length === 0) {
      return [];
    }

    // TODO: Query users with matching skills from database
    // For now, return first candidate
    logger.info('Skills-based routing', {
      requiredSkills,
      candidates: candidates.length
    });

    return [candidates[0]];
  }

  /**
   * Priority-based routing
   */
  async priorityBasedRouting(task, rule, priority) {
    const candidates = rule.candidates || [];
    if (candidates.length === 0) {
      return [];
    }

    // Route high/urgent priority to senior staff
    if (priority === 'urgent' || priority === 'high') {
      const seniorStaff = rule.metadata?.seniorStaff || [candidates[0]];
      return [seniorStaff[0]];
    }

    // Route normal priority using round-robin
    return await this.roundRobinRouting(task, rule);
  }

  /**
   * Geographic routing
   */
  async geographicRouting(task, rule) {
    const candidates = rule.candidates || [];
    if (candidates.length === 0) {
      return [];
    }

    // TODO: Route based on geographic location/timezone
    // For now, use default
    return [candidates[0]];
  }

  /**
   * Custom routing using workflow
   */
  async customRouting(task, rule) {
    if (!rule.workflowId) {
      return await this.defaultRouting(task);
    }

    const result = await workflowIntegration.executeWorkflow(rule.workflowId, {
      taskId: task.id,
      candidates: rule.candidates
    });

    if (result.success && result.result?.assignees) {
      return result.result.assignees;
    }

    return await this.defaultRouting(task);
  }

  /**
   * Default routing - assign to creator
   */
  async defaultRouting(task) {
    return [task.creatorId];
  }

  /**
   * Get routing rule for task
   */
  async getRoutingRule(task, options) {
    // TODO: Query routing rules from database
    // For now, return a mock rule
    return {
      id: 'rule-1',
      name: 'Default Routing',
      strategy: 'round_robin',
      candidates: options.candidates || [],
      metadata: {}
    };
  }

  /**
   * Create routing rule
   */
  async createRoutingRule(rule) {
    const {
      name,
      strategy,
      candidates = [],
      conditions = {},
      workflowId = null
    } = rule;

    // TODO: Save to database
    const newRule = {
      id: Date.now().toString(),
      name,
      strategy,
      candidates,
      conditions,
      workflowId,
      metadata: {},
      createdAt: new Date()
    };

    this.routingRules.set(newRule.id, newRule);

    logger.info('Routing rule created', {
      ruleId: newRule.id,
      name,
      strategy
    });

    return newRule;
  }

  /**
   * Auto-assign task based on criteria
   */
  async autoAssign(task, criteria = {}) {
    const result = await this.routeTask(task, criteria);

    if (result.success && result.assignees.length > 0) {
      // Create task assignments
      // TODO: Create TaskAssignment records in database
      logger.info('Task auto-assigned', {
        taskId: task.id,
        assignees: result.assignees
      });
    }

    return result;
  }

  /**
   * Reassign task
   */
  async reassignTask(taskId, fromUserId, toUserId, reason = null) {
    try {
      // TODO: Update TaskAssignment in database
      logger.info('Task reassigned', {
        taskId,
        from: fromUserId,
        to: toUserId,
        reason
      });

      return {
        success: true,
        taskId,
        newAssignee: toUserId
      };
    } catch (error) {
      logger.error('Task reassignment failed', {
        error: error.message,
        taskId
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get assignee availability
   */
  async getAvailability(userId) {
    // TODO: Check calendar, PTO, current workload
    return {
      available: true,
      currentTaskCount: 0,
      capacity: 10,
      utilizationPercent: 0
    };
  }
}

module.exports = new TaskRoutingService();
