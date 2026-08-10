const { Workflow, WorkflowStep } = require('../models');
const auditService = require('./auditService');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Import/Export Service
 * Handles workflow import/export operations with validation and conflict resolution
 */
class ImportExportService {
  /**
   * Export a single workflow to JSON
   */
  async exportWorkflow(workflowId, options = {}) {
    try {
      const workflow = await Workflow.findByPk(workflowId, {
        include: [
          {
            model: WorkflowStep,
            as: 'steps',
            order: [['order', 'ASC']]
          }
        ]
      });

      if (!workflow) {
        throw new Error('Workflow not found');
      }

      const exportData = {
        exportVersion: '1.0.0',
        exportedAt: new Date().toISOString(),
        workflow: this._serializeWorkflow(workflow, options)
      };

      logger.info('Workflow exported', {
        workflowId,
        workflowName: workflow.name
      });

      return exportData;
    } catch (error) {
      logger.error('Failed to export workflow', {
        error: error.message,
        workflowId
      });
      throw error;
    }
  }

  /**
   * Export multiple workflows to JSON
   */
  async exportWorkflows(workflowIds, options = {}) {
    try {
      const workflows = await Workflow.findAll({
        where: {
          id: workflowIds
        },
        include: [
          {
            model: WorkflowStep,
            as: 'steps',
            order: [['order', 'ASC']]
          }
        ]
      });

      const exportData = {
        exportVersion: '1.0.0',
        exportedAt: new Date().toISOString(),
        count: workflows.length,
        workflows: workflows.map(w => this._serializeWorkflow(w, options))
      };

      logger.info('Multiple workflows exported', {
        count: workflows.length
      });

      return exportData;
    } catch (error) {
      logger.error('Failed to export workflows', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Import a single workflow from JSON
   */
  async importWorkflow(importData, userId, options = {}) {
    try {
      // Validate import data
      this._validateImportData(importData);

      const workflowData = importData.workflow;

      // Handle conflicts
      const conflictResolution = options.conflictResolution || 'rename'; // rename, replace, skip
      const existingWorkflow = await this._checkConflicts(workflowData);

      if (existingWorkflow) {
        switch (conflictResolution) {
          case 'skip':
            logger.info('Workflow import skipped due to conflict', {
              workflowName: workflowData.name
            });
            return {
              success: true,
              skipped: true,
              message: 'Workflow already exists'
            };

          case 'replace':
            await this._replaceWorkflow(existingWorkflow, workflowData, userId);
            return {
              success: true,
              replaced: true,
              workflowId: existingWorkflow.id,
              message: 'Workflow replaced successfully'
            };

          case 'rename':
          default:
            workflowData.name = this._generateUniqueName(workflowData.name);
            break;
        }
      }

      // Create new workflow
      const workflow = await this._createWorkflowFromImport(workflowData, userId, options);

      // Log audit event
      await auditService.log({
        eventType: 'workflow_import',
        workflowId: workflow.id,
        userId,
        success: true,
        metadata: {
          originalName: importData.workflow.name,
          importedName: workflow.name,
          stepCount: workflowData.steps?.length || 0
        }
      });

      logger.info('Workflow imported successfully', {
        workflowId: workflow.id,
        workflowName: workflow.name,
        userId
      });

      return {
        success: true,
        workflowId: workflow.id,
        workflow,
        message: 'Workflow imported successfully'
      };
    } catch (error) {
      logger.error('Failed to import workflow', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Import multiple workflows from JSON
   */
  async importWorkflows(importData, userId, options = {}) {
    try {
      // Validate import data
      if (!importData.workflows || !Array.isArray(importData.workflows)) {
        throw new Error('Invalid import data: workflows array required');
      }

      const results = [];
      const errors = [];

      for (const workflowData of importData.workflows) {
        try {
          const result = await this.importWorkflow(
            { workflow: workflowData },
            userId,
            options
          );
          results.push(result);
        } catch (error) {
          errors.push({
            workflowName: workflowData.name,
            error: error.message
          });
        }
      }

      logger.info('Bulk workflow import completed', {
        total: importData.workflows.length,
        successful: results.length,
        failed: errors.length,
        userId
      });

      return {
        success: true,
        total: importData.workflows.length,
        imported: results.length,
        failed: errors.length,
        results,
        errors
      };
    } catch (error) {
      logger.error('Failed to import workflows', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Serialize workflow for export
   */
  _serializeWorkflow(workflow, options = {}) {
    const includeMetadata = options.includeMetadata !== false;
    const includeStatistics = options.includeStatistics === true;

    const serialized = {
      name: workflow.name,
      description: workflow.description,
      version: workflow.version,
      trigger_type: workflow.trigger_type,
      trigger_config: workflow.trigger_config,
      definition: workflow.definition,
      variables: workflow.variables,
      jsonlex_schema: workflow.jsonlex_schema,
      tags: workflow.tags,
      category: workflow.category,
      is_template: workflow.is_template,
      template_category: workflow.template_category,
      settings: workflow.settings
    };

    // Include steps
    if (workflow.steps) {
      serialized.steps = workflow.steps.map(step => ({
        step_id: step.step_id,
        step_type: step.step_type,
        name: step.name,
        description: step.description,
        comment: step.comment,
        position: step.position,
        config: step.config,
        inputs: step.inputs,
        outputs: step.outputs,
        conditions: step.conditions,
        next_steps: step.next_steps,
        error_handler: step.error_handler,
        timeout: step.timeout,
        retry_config: step.retry_config,
        flags: step.flags,
        order: step.order,
        is_enabled: step.is_enabled
      }));
    }

    // Include metadata
    if (includeMetadata) {
      serialized.metadata = {
        id: workflow.id,
        owner_id: workflow.owner_id,
        created_at: workflow.created_at,
        updated_at: workflow.updated_at
      };
    }

    // Include statistics
    if (includeStatistics) {
      serialized.statistics = {
        execution_count: workflow.execution_count,
        success_count: workflow.success_count,
        failure_count: workflow.failure_count,
        average_duration: workflow.average_duration,
        last_executed_at: workflow.last_executed_at
      };
    }

    return serialized;
  }

  /**
   * Validate import data structure
   */
  _validateImportData(importData) {
    if (!importData || typeof importData !== 'object') {
      throw new Error('Invalid import data: must be an object');
    }

    if (!importData.workflow && !importData.workflows) {
      throw new Error('Invalid import data: workflow or workflows required');
    }

    const workflow = importData.workflow;
    if (workflow) {
      if (!workflow.name) {
        throw new Error('Invalid workflow data: name required');
      }

      if (!workflow.definition) {
        throw new Error('Invalid workflow data: definition required');
      }

      // Validate steps if present
      if (workflow.steps && Array.isArray(workflow.steps)) {
        for (const step of workflow.steps) {
          if (!step.step_id) {
            throw new Error('Invalid step data: step_id required');
          }
          if (!step.step_type) {
            throw new Error('Invalid step data: step_type required');
          }
        }
      }
    }

    return true;
  }

  /**
   * Check for conflicting workflows
   */
  async _checkConflicts(workflowData) {
    // Check by ID if metadata included
    if (workflowData.metadata?.id) {
      const existing = await Workflow.findByPk(workflowData.metadata.id);
      if (existing) {
        return existing;
      }
    }

    // Check by name
    const existing = await Workflow.findOne({
      where: {
        name: workflowData.name
      }
    });

    return existing;
  }

  /**
   * Generate unique workflow name
   */
  _generateUniqueName(baseName) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${baseName} (imported ${timestamp})`;
  }

  /**
   * Replace existing workflow
   */
  async _replaceWorkflow(existingWorkflow, workflowData, userId) {
    // Delete existing steps
    await WorkflowStep.destroy({
      where: {
        workflow_id: existingWorkflow.id
      }
    });

    // Update workflow
    await existingWorkflow.update({
      description: workflowData.description,
      version: workflowData.version || existingWorkflow.version + 1,
      trigger_type: workflowData.trigger_type,
      trigger_config: workflowData.trigger_config,
      definition: workflowData.definition,
      variables: workflowData.variables,
      jsonlex_schema: workflowData.jsonlex_schema,
      tags: workflowData.tags,
      category: workflowData.category,
      settings: workflowData.settings
    });

    // Create new steps
    if (workflowData.steps && Array.isArray(workflowData.steps)) {
      for (const stepData of workflowData.steps) {
        await WorkflowStep.create({
          workflow_id: existingWorkflow.id,
          ...stepData
        });
      }
    }

    // Log audit event
    await auditService.logWorkflowUpdate(existingWorkflow, workflowData, userId);

    return existingWorkflow;
  }

  /**
   * Create workflow from import data
   */
  async _createWorkflowFromImport(workflowData, userId, options = {}) {
    const preserveIds = options.preserveIds === true;

    // Create workflow
    const workflow = await Workflow.create({
      id: preserveIds && workflowData.metadata?.id ? workflowData.metadata.id : uuidv4(),
      name: workflowData.name,
      description: workflowData.description,
      version: workflowData.version || 1,
      status: options.status || 'draft', // Import as draft by default
      trigger_type: workflowData.trigger_type || 'manual',
      trigger_config: workflowData.trigger_config,
      definition: workflowData.definition,
      variables: workflowData.variables || {},
      permissions: {},
      jsonlex_schema: workflowData.jsonlex_schema,
      tags: workflowData.tags || [],
      category: workflowData.category,
      owner_id: userId,
      is_template: workflowData.is_template || false,
      template_category: workflowData.template_category,
      settings: workflowData.settings || {}
    });

    // Create steps
    if (workflowData.steps && Array.isArray(workflowData.steps)) {
      for (const stepData of workflowData.steps) {
        await WorkflowStep.create({
          workflow_id: workflow.id,
          step_id: stepData.step_id,
          step_type: stepData.step_type,
          name: stepData.name,
          description: stepData.description,
          comment: stepData.comment,
          position: stepData.position,
          config: stepData.config || {},
          inputs: stepData.inputs || {},
          outputs: stepData.outputs || {},
          conditions: stepData.conditions,
          next_steps: stepData.next_steps,
          error_handler: stepData.error_handler,
          timeout: stepData.timeout,
          retry_config: stepData.retry_config || {},
          flags: stepData.flags || {},
          order: stepData.order || 0,
          is_enabled: stepData.is_enabled !== false
        });
      }
    }

    return workflow;
  }

  /**
   * Validate workflow structure before import
   */
  async validateImport(importData) {
    try {
      this._validateImportData(importData);

      const warnings = [];
      const workflow = importData.workflow;

      // Check for potential issues
      if (workflow.trigger_type === 'webhook' && !workflow.trigger_config?.secret) {
        warnings.push('Webhook trigger configured but no secret will be imported');
      }

      if (workflow.trigger_type === 'scheduled' && !workflow.trigger_config?.schedule) {
        warnings.push('Scheduled trigger configured but no schedule found');
      }

      if (workflow.steps && workflow.steps.length > 100) {
        warnings.push(`Workflow has ${workflow.steps.length} steps (may impact performance)`);
      }

      // Check for conflicts
      const existing = await this._checkConflicts(workflow);
      if (existing) {
        warnings.push(`Workflow with name "${workflow.name}" already exists`);
      }

      return {
        valid: true,
        warnings,
        workflow: {
          name: workflow.name,
          stepCount: workflow.steps?.length || 0,
          triggerType: workflow.trigger_type
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }
}

module.exports = new ImportExportService();
