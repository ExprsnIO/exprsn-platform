/**
 * Process Service
 * Handles BPMN 2.0 process definitions and workflow management
 */

const { Process, ProcessInstance, Application } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const ProcessExecutionService = require('./ProcessExecutionService');

class ProcessService {
  /**
   * Create a new process definition
   */
  async createProcess(applicationId, processData, userId) {
    try {
      // Validate application exists
      const app = await Application.findByPk(applicationId);
      if (!app) {
        return { success: false, error: 'Application not found' };
      }

      // Check for duplicate name
      const existing = await Process.findOne({
        where: {
          applicationId,
          name: processData.name,
          deletedAt: null
        }
      });

      if (existing) {
        return { success: false, error: 'Process with this name already exists' };
      }

      const process = await Process.create({
        applicationId,
        ...processData,
        status: 'draft',
        version: '1.0.0'
      });

      logger.info('[Process] Created:', { processId: process.id, userId });

      return { success: true, process };
    } catch (error) {
      logger.error('[Process] Create error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get process by ID
   */
  async getProcess(processId) {
    try {
      const process = await Process.findByPk(processId, {
        include: [
          {
            model: Application,
            as: 'application',
            attributes: ['id', 'name', 'displayName']
          }
        ]
      });

      if (!process) {
        return { success: false, error: 'Process not found' };
      }

      return { success: true, process };
    } catch (error) {
      logger.error('[Process] Get error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * List processes for an application
   */
  async listProcesses(applicationId, filters = {}, pagination = {}) {
    try {
      const { status, category, search } = filters;
      const { page = 1, limit = 50 } = pagination;
      const offset = (page - 1) * limit;

      const where = { applicationId };

      if (status) where.status = status;
      if (category) where.category = category;
      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { displayName: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await Process.findAndCountAll({
        where,
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      });

      return {
        success: true,
        processes: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      };
    } catch (error) {
      logger.error('[Process] List error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update process
   */
  async updateProcess(processId, updates, userId) {
    try {
      const process = await Process.findByPk(processId);
      if (!process) {
        return { success: false, error: 'Process not found' };
      }

      // Don't allow updating if active (must deprecate first)
      if (process.status === 'active' && updates.definition) {
        return { success: false, error: 'Cannot modify active process definition. Create new version or deprecate first.' };
      }

      await process.update(updates);

      logger.info('[Process] Updated:', { processId, userId });

      return { success: true, process };
    } catch (error) {
      logger.error('[Process] Update error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Activate/publish a process
   */
  async activateProcess(processId, userId) {
    try {
      const process = await Process.findByPk(processId);
      if (!process) {
        return { success: false, error: 'Process not found' };
      }

      if (process.status === 'active') {
        return { success: false, error: 'Process is already active' };
      }

      await process.activate();

      logger.info('[Process] Activated:', { processId, version: process.publishedVersion, userId });

      return { success: true, process };
    } catch (error) {
      logger.error('[Process] Activate error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Deprecate a process
   */
  async deprecateProcess(processId, userId) {
    try {
      const process = await Process.findByPk(processId);
      if (!process) {
        return { success: false, error: 'Process not found' };
      }

      await process.deprecate();

      logger.info('[Process] Deprecated:', { processId, userId });

      return { success: true, process };
    } catch (error) {
      logger.error('[Process] Deprecate error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a process
   */
  async deleteProcess(processId, userId) {
    try {
      const process = await Process.findByPk(processId);
      if (!process) {
        return { success: false, error: 'Process not found' };
      }

      // Don't allow deleting if active or has instances
      if (process.status === 'active') {
        return { success: false, error: 'Cannot delete active process. Deprecate first.' };
      }

      if (process.instanceCount > 0) {
        return { success: false, error: 'Cannot delete process with execution instances' };
      }

      await process.destroy();

      logger.info('[Process] Deleted:', { processId, userId });

      return { success: true, message: 'Process deleted successfully' };
    } catch (error) {
      logger.error('[Process] Delete error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start a process instance with execution
   */
  async startProcess(processId, inputData = {}, userId) {
    try {
      const process = await Process.findByPk(processId);
      if (!process) {
        return { success: false, error: 'Process not found' };
      }

      if (process.status !== 'active') {
        return { success: false, error: 'Process must be active to start' };
      }

      // Delegate to execution service
      const result = await ProcessExecutionService.startProcess(processId, inputData, userId);

      if (result.success) {
        await process.incrementInstanceCount();
        logger.info('[Process] Instance started:', { processId, instanceId: result.instance.id, userId });
      }

      return result;
    } catch (error) {
      logger.error('[Process] Start error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get process instance
   */
  async getProcessInstance(instanceId) {
    return await ProcessExecutionService.getProcessInstance(instanceId);
  }

  /**
   * List process instances
   */
  async listProcessInstances(processId, filters = {}) {
    return await ProcessExecutionService.listProcessInstances(processId, filters);
  }

  /**
   * Complete a user task
   */
  async completeUserTask(instanceId, taskData, userId) {
    return await ProcessExecutionService.completeUserTask(instanceId, taskData, userId);
  }

  /**
   * Cancel process instance
   */
  async cancelProcessInstance(instanceId, userId, reason = 'Cancelled by user') {
    return await ProcessExecutionService.cancelProcessInstance(instanceId, userId, reason);
  }

  /**
   * Get process statistics
   */
  async getProcessStatistics(processId) {
    try {
      const process = await Process.findByPk(processId);
      if (!process) {
        return { success: false, error: 'Process not found' };
      }

      // Count instances by status
      const [completed, running, waiting, error, cancelled] = await Promise.all([
        ProcessInstance.count({ where: { processId, status: 'completed' } }),
        ProcessInstance.count({ where: { processId, status: 'running' } }),
        ProcessInstance.count({ where: { processId, status: 'waiting' } }),
        ProcessInstance.count({ where: { processId, status: 'error' } }),
        ProcessInstance.count({ where: { processId, status: 'cancelled' } })
      ]);

      // Calculate average execution time for completed instances
      const completedInstances = await ProcessInstance.findAll({
        where: { processId, status: 'completed' },
        attributes: ['createdAt', 'completedAt'],
        limit: 100,
        order: [['completedAt', 'DESC']]
      });

      let avgExecutionTime = 0;
      if (completedInstances.length > 0) {
        const totalTime = completedInstances.reduce((sum, instance) => {
          const duration = new Date(instance.completedAt) - new Date(instance.createdAt);
          return sum + duration;
        }, 0);
        avgExecutionTime = Math.round(totalTime / completedInstances.length);
      }

      return {
        success: true,
        statistics: {
          total: process.instanceCount,
          byStatus: {
            completed,
            running,
            waiting,
            error,
            cancelled
          },
          averageExecutionTime: avgExecutionTime,
          successRate: process.instanceCount > 0
            ? Math.round((completed / process.instanceCount) * 100)
            : 0
        }
      };
    } catch (error) {
      logger.error('[Process] Statistics error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new ProcessService();
