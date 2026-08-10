/**
 * Report Workflow Integration Service
 * Integrates reports with exprsn-workflow for automation
 */

const axios = require('axios');
const reportService = require('./reportService');
const reportExportService = require('./reportExportService');
const crmReportService = require('../crm/reportService');
const erpReportService = require('../erp/reportBuilderService');
const groupwareReportService = require('../groupware/reportService');
const logger = require('../../../utils/logger');

class ReportWorkflowIntegration {
  constructor() {
    this.workflowUrl = process.env.WORKFLOW_URL || 'http://localhost:3017';

    // Report-triggered workflow conditions
    this.conditionTypes = {
      VALUE_THRESHOLD: 'value_threshold',       // Numeric value exceeds/falls below threshold
      ROW_COUNT: 'row_count',                   // Result count matches condition
      FIELD_MATCH: 'field_match',               // Specific field matches value
      DATE_TRIGGER: 'date_trigger',             // Date-based conditions
      PERCENT_CHANGE: 'percent_change',         // Percentage change from previous run
      CUSTOM_EXPRESSION: 'custom_expression'    // JavaScript expression evaluation
    };

    // Workflow step types for reports
    this.workflowStepTypes = {
      GENERATE_REPORT: 'generate_report',
      EMAIL_REPORT: 'email_report',
      EXPORT_REPORT: 'export_report',
      STORE_REPORT: 'store_report',
      CONDITIONAL_REPORT: 'conditional_report'
    };
  }

  /**
   * Register report step types with workflow service
   */
  async registerReportSteps() {
    try {
      const stepTypes = [
        {
          type: this.workflowStepTypes.GENERATE_REPORT,
          name: 'Generate Report',
          description: 'Execute a report and return results',
          category: 'reports',
          config: {
            reportId: { type: 'string', required: true, label: 'Report ID' },
            parameters: { type: 'object', required: false, label: 'Report Parameters' },
            skipCache: { type: 'boolean', required: false, label: 'Skip Cache', default: false }
          },
          outputs: ['result', 'executionId', 'duration', 'rowCount']
        },
        {
          type: this.workflowStepTypes.EMAIL_REPORT,
          name: 'Email Report',
          description: 'Generate and email a report',
          category: 'reports',
          config: {
            reportId: { type: 'string', required: true, label: 'Report ID' },
            parameters: { type: 'object', required: false, label: 'Report Parameters' },
            recipients: { type: 'array', required: true, label: 'Email Recipients' },
            subject: { type: 'string', required: true, label: 'Email Subject' },
            format: { type: 'select', options: ['pdf', 'excel', 'csv'], default: 'pdf', label: 'Export Format' },
            includeInline: { type: 'boolean', default: true, label: 'Include Summary in Email' }
          },
          outputs: ['emailSent', 'executionId']
        },
        {
          type: this.workflowStepTypes.EXPORT_REPORT,
          name: 'Export Report',
          description: 'Export report to specified format',
          category: 'reports',
          config: {
            reportId: { type: 'string', required: true, label: 'Report ID' },
            parameters: { type: 'object', required: false, label: 'Report Parameters' },
            format: { type: 'select', options: ['pdf', 'excel', 'csv', 'json'], required: true, label: 'Export Format' },
            fileName: { type: 'string', required: false, label: 'Custom File Name' }
          },
          outputs: ['fileUrl', 'fileName', 'fileSize', 'executionId']
        },
        {
          type: this.workflowStepTypes.STORE_REPORT,
          name: 'Store Report Result',
          description: 'Store report result for later use',
          category: 'reports',
          config: {
            reportId: { type: 'string', required: true, label: 'Report ID' },
            parameters: { type: 'object', required: false, label: 'Report Parameters' },
            storageKey: { type: 'string', required: true, label: 'Storage Key' },
            ttl: { type: 'number', default: 3600, label: 'Time to Live (seconds)' }
          },
          outputs: ['storageKey', 'executionId', 'storedAt']
        },
        {
          type: this.workflowStepTypes.CONDITIONAL_REPORT,
          name: 'Conditional Report',
          description: 'Execute report and evaluate conditions',
          category: 'reports',
          config: {
            reportId: { type: 'string', required: true, label: 'Report ID' },
            parameters: { type: 'object', required: false, label: 'Report Parameters' },
            conditions: { type: 'array', required: true, label: 'Conditions to Evaluate' }
          },
          outputs: ['result', 'conditionsMet', 'executionId']
        }
      ];

      for (const stepType of stepTypes) {
        await this.registerStepType(stepType);
        logger.info('Registered report workflow step type', { type: stepType.type });
      }

      return { success: true, stepsRegistered: stepTypes.length };
    } catch (err) {
      logger.error('Failed to register report step types', { error: err.message });
      throw err;
    }
  }

  /**
   * Register a single step type with workflow service
   */
  async registerStepType(stepType) {
    try {
      const response = await axios.post(`${this.workflowUrl}/api/step-types/register`, stepType, {
        headers: { 'X-Service': 'exprsn-forge' }
      });
      return response.data;
    } catch (err) {
      logger.error('Failed to register step type', { type: stepType.type, error: err.message });
      throw err;
    }
  }

  /**
   * Execute workflow step: Generate Report
   */
  async executeGenerateReportStep(stepConfig, context = {}) {
    try {
      const { reportId, parameters = {}, skipCache = false } = stepConfig;

      // Merge workflow context variables into report parameters
      const resolvedParams = this.resolveWorkflowVariables(parameters, context);

      logger.info('Executing generate report step', { reportId, parameters: resolvedParams });

      const result = await reportService.executeReport(
        reportId,
        context.userId || context.executedBy,
        resolvedParams,
        { skipCache }
      );

      return {
        success: true,
        outputs: {
          result: result.result,
          executionId: result.executionId,
          duration: result.duration,
          rowCount: result.result?.rowCount || 0,
          fromCache: result.fromCache
        }
      };
    } catch (err) {
      logger.error('Generate report step failed', { error: err.message });
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Execute workflow step: Email Report
   */
  async executeEmailReportStep(stepConfig, context = {}) {
    try {
      const { reportId, parameters = {}, recipients, subject, format = 'pdf', includeInline = true } = stepConfig;

      // Generate report
      const reportResult = await reportService.executeReport(
        reportId,
        context.userId || context.executedBy,
        this.resolveWorkflowVariables(parameters, context)
      );

      // Get report details
      const report = await reportService.getReport(reportId, context.userId);

      // Export report
      const exportResult = await reportExportService.exportReport(report, reportResult.result, format);

      // Send email via Herald service
      const emailSent = await this.sendReportEmail({
        recipients,
        subject,
        report,
        result: reportResult.result,
        exportFile: exportResult,
        includeInline
      });

      return {
        success: true,
        outputs: {
          emailSent,
          executionId: reportResult.executionId,
          recipients: recipients.length
        }
      };
    } catch (err) {
      logger.error('Email report step failed', { error: err.message });
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Execute workflow step: Export Report
   */
  async executeExportReportStep(stepConfig, context = {}) {
    try {
      const { reportId, parameters = {}, format, fileName } = stepConfig;

      // Generate report
      const reportResult = await reportService.executeReport(
        reportId,
        context.userId || context.executedBy,
        this.resolveWorkflowVariables(parameters, context)
      );

      // Get report details
      const report = await reportService.getReport(reportId, context.userId);

      // Export report
      const exportResult = await reportExportService.exportReport(report, reportResult.result, format, {
        fileName: fileName || undefined
      });

      return {
        success: true,
        outputs: {
          fileUrl: exportResult.fileUrl,
          fileName: exportResult.fileName,
          fileSize: exportResult.fileSize,
          executionId: reportResult.executionId,
          format: exportResult.format
        }
      };
    } catch (err) {
      logger.error('Export report step failed', { error: err.message });
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Execute workflow step: Store Report Result
   */
  async executeStoreReportStep(stepConfig, context = {}) {
    try {
      const { reportId, parameters = {}, storageKey, ttl = 3600 } = stepConfig;

      // Generate report
      const reportResult = await reportService.executeReport(
        reportId,
        context.userId || context.executedBy,
        this.resolveWorkflowVariables(parameters, context)
      );

      // Store in Redis
      const redis = require('../../config/redis');
      const fullKey = `workflow:report:${storageKey}`;

      await redis.setex(
        fullKey,
        ttl,
        JSON.stringify({
          result: reportResult.result,
          executionId: reportResult.executionId,
          storedAt: new Date().toISOString(),
          context: { workflowId: context.workflowId, executionId: context.executionId }
        })
      );

      logger.info('Stored report result', { storageKey: fullKey, ttl });

      return {
        success: true,
        outputs: {
          storageKey: fullKey,
          executionId: reportResult.executionId,
          storedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + ttl * 1000).toISOString()
        }
      };
    } catch (err) {
      logger.error('Store report step failed', { error: err.message });
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Execute workflow step: Conditional Report
   */
  async executeConditionalReportStep(stepConfig, context = {}) {
    try {
      const { reportId, parameters = {}, conditions } = stepConfig;

      // Generate report
      const reportResult = await reportService.executeReport(
        reportId,
        context.userId || context.executedBy,
        this.resolveWorkflowVariables(parameters, context)
      );

      // Evaluate conditions
      const conditionResults = [];
      let allConditionsMet = true;

      for (const condition of conditions) {
        const met = await this.evaluateCondition(condition, reportResult.result);
        conditionResults.push({
          condition: condition.name || condition.type,
          met,
          details: condition
        });

        if (!met && condition.required !== false) {
          allConditionsMet = false;
        }
      }

      logger.info('Evaluated report conditions', {
        reportId,
        conditionCount: conditions.length,
        conditionsMet: allConditionsMet
      });

      return {
        success: true,
        outputs: {
          result: reportResult.result,
          conditionsMet: allConditionsMet,
          conditionResults,
          executionId: reportResult.executionId
        }
      };
    } catch (err) {
      logger.error('Conditional report step failed', { error: err.message });
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * Evaluate a single condition against report result
   */
  async evaluateCondition(condition, result) {
    try {
      switch (condition.type) {
        case this.conditionTypes.VALUE_THRESHOLD:
          return this.evaluateValueThreshold(condition, result);

        case this.conditionTypes.ROW_COUNT:
          return this.evaluateRowCount(condition, result);

        case this.conditionTypes.FIELD_MATCH:
          return this.evaluateFieldMatch(condition, result);

        case this.conditionTypes.PERCENT_CHANGE:
          return this.evaluatePercentChange(condition, result);

        case this.conditionTypes.CUSTOM_EXPRESSION:
          return this.evaluateCustomExpression(condition, result);

        default:
          logger.warn('Unknown condition type', { type: condition.type });
          return false;
      }
    } catch (err) {
      logger.error('Failed to evaluate condition', { error: err.message, condition });
      return false;
    }
  }

  /**
   * Evaluate value threshold condition (e.g., total > 1000)
   */
  evaluateValueThreshold(condition, result) {
    const { field, operator, value } = condition;
    const fieldValue = this.getFieldValue(result, field);

    if (fieldValue === null || fieldValue === undefined) {
      return false;
    }

    const numValue = parseFloat(fieldValue);
    const numThreshold = parseFloat(value);

    if (isNaN(numValue) || isNaN(numThreshold)) {
      return false;
    }

    switch (operator) {
      case 'gt': return numValue > numThreshold;
      case 'gte': return numValue >= numThreshold;
      case 'lt': return numValue < numThreshold;
      case 'lte': return numValue <= numThreshold;
      case 'eq': return numValue === numThreshold;
      case 'neq': return numValue !== numThreshold;
      default: return false;
    }
  }

  /**
   * Evaluate row count condition
   */
  evaluateRowCount(condition, result) {
    const { operator, value } = condition;
    const rowCount = result.rowCount || result.data?.length || 0;
    const threshold = parseInt(value, 10);

    switch (operator) {
      case 'gt': return rowCount > threshold;
      case 'gte': return rowCount >= threshold;
      case 'lt': return rowCount < threshold;
      case 'lte': return rowCount <= threshold;
      case 'eq': return rowCount === threshold;
      case 'neq': return rowCount !== threshold;
      default: return false;
    }
  }

  /**
   * Evaluate field match condition
   */
  evaluateFieldMatch(condition, result) {
    const { field, operator = 'eq', value } = condition;
    const fieldValue = this.getFieldValue(result, field);

    switch (operator) {
      case 'eq': return fieldValue == value;
      case 'neq': return fieldValue != value;
      case 'contains': return String(fieldValue).includes(String(value));
      case 'startsWith': return String(fieldValue).startsWith(String(value));
      case 'endsWith': return String(fieldValue).endsWith(String(value));
      case 'regex': return new RegExp(value).test(String(fieldValue));
      default: return false;
    }
  }

  /**
   * Evaluate percent change condition
   */
  evaluatePercentChange(condition, result) {
    // This would require storing previous execution results
    // For now, return false and log warning
    logger.warn('Percent change conditions require historical data (not yet implemented)');
    return false;
  }

  /**
   * Evaluate custom JavaScript expression
   */
  evaluateCustomExpression(condition, result) {
    try {
      const { expression } = condition;

      // Create safe context
      const context = {
        result,
        summary: result.summary,
        rowCount: result.rowCount || result.data?.length || 0,
        data: result.data
      };

      // Use Function constructor for safe evaluation (safer than eval)
      const func = new Function('context', `with(context) { return ${expression}; }`);
      return Boolean(func(context));
    } catch (err) {
      logger.error('Failed to evaluate custom expression', { error: err.message, expression: condition.expression });
      return false;
    }
  }

  /**
   * Get nested field value from result
   */
  getFieldValue(result, fieldPath) {
    const parts = fieldPath.split('.');
    let value = result;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }

    return value;
  }

  /**
   * Resolve workflow variables in parameters
   */
  resolveWorkflowVariables(parameters, context) {
    const resolved = { ...parameters };

    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
        const varName = value.slice(2, -2).trim();

        if (context.variables && varName in context.variables) {
          resolved[key] = context.variables[varName];
        } else if (varName in context) {
          resolved[key] = context[varName];
        }
      } else if (typeof value === 'object' && value !== null) {
        resolved[key] = this.resolveWorkflowVariables(value, context);
      }
    }

    return resolved;
  }

  /**
   * Send report via email using Herald service
   */
  async sendReportEmail(options) {
    try {
      const { recipients, subject, report, result, exportFile, includeInline } = options;

      const heraldUrl = process.env.HERALD_URL || 'http://localhost:3014';

      const emailBody = includeInline ? this.formatReportSummary(report, result) :
        `Please find the attached ${report.name} report.`;

      await axios.post(`${heraldUrl}/api/notifications/send`, {
        type: 'email',
        recipients,
        subject,
        body: emailBody,
        attachments: exportFile ? [{
          filename: exportFile.fileName,
          path: exportFile.filePath || exportFile.fileUrl
        }] : []
      });

      logger.info('Report email sent', { recipients: recipients.length, reportId: report.id });
      return true;
    } catch (err) {
      logger.error('Failed to send report email', { error: err.message });
      return false;
    }
  }

  /**
   * Format report summary for email
   */
  formatReportSummary(report, result) {
    let summary = `# ${report.name}\n\n`;
    summary += `Generated at: ${new Date().toLocaleString()}\n\n`;

    if (result.summary) {
      summary += `## Summary\n\n`;
      for (const [key, value] of Object.entries(result.summary)) {
        summary += `- **${this.formatLabel(key)}**: ${value}\n`;
      }
      summary += `\n`;
    }

    summary += `Total Records: ${result.rowCount || result.data?.length || 0}\n\n`;
    summary += `Full report attached.\n`;

    return summary;
  }

  /**
   * Format label from snake_case
   */
  formatLabel(str) {
    return str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Trigger workflow based on report conditions
   */
  async triggerWorkflowFromReport(config) {
    try {
      const { reportId, workflowId, conditions, userId } = config;

      // Execute report
      const reportResult = await reportService.executeReport(reportId, userId);

      // Evaluate conditions
      let shouldTrigger = true;

      if (conditions && conditions.length > 0) {
        for (const condition of conditions) {
          const met = await this.evaluateCondition(condition, reportResult.result);
          if (!met && condition.required !== false) {
            shouldTrigger = false;
            break;
          }
        }
      }

      if (!shouldTrigger) {
        logger.info('Report conditions not met, workflow not triggered', { reportId, workflowId });
        return { triggered: false, reason: 'conditions_not_met' };
      }

      // Trigger workflow
      const response = await axios.post(`${this.workflowUrl}/api/workflows/${workflowId}/execute`, {
        triggeredBy: 'report',
        reportId,
        reportExecutionId: reportResult.executionId,
        reportData: reportResult.result,
        userId
      });

      logger.info('Workflow triggered from report', {
        reportId,
        workflowId,
        workflowExecutionId: response.data.executionId
      });

      return {
        triggered: true,
        workflowExecutionId: response.data.executionId
      };
    } catch (err) {
      logger.error('Failed to trigger workflow from report', { error: err.message });
      throw err;
    }
  }

  /**
   * Get available report types for workflow configuration
   */
  getAvailableReportTypes() {
    return {
      crm: Object.keys(crmReportService.getAvailableReports()),
      erp: Object.keys(erpReportService.getAvailableReports()),
      groupware: Object.keys(groupwareReportService.getAvailableReports())
    };
  }

  /**
   * Get report variables for workflow parameter mapping
   */
  async getReportVariables(reportId, userId) {
    try {
      const report = await reportService.getReport(reportId, userId);
      const config = report.config || {};

      // Extract variable definitions from report config
      return config.variables || {};
    } catch (err) {
      logger.error('Failed to get report variables', { error: err.message, reportId });
      return {};
    }
  }
}

module.exports = new ReportWorkflowIntegration();
