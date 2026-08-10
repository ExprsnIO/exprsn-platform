/**
 * ═══════════════════════════════════════════════════════════
 * Form Runtime Service - Execute Form Definitions
 * Renders forms, handles data binding, validation, and submission
 * ═══════════════════════════════════════════════════════════
 */

const { AppForm } = require('../models');
const ValidationEngine = require('./ValidationEngine');
const DataIntegrationService = require('./DataIntegrationService');
const RBACService = require('./RBACService');

class FormRuntimeService {
  constructor() {
    this.validationEngine = new ValidationEngine();
    this.dataIntegration = new DataIntegrationService();
    this.rbac = new RBACService();
    this.activeInstances = new Map();
  }

  /**
   * Initialize a form instance for runtime execution
   */
  async initializeForm(formId, userId, context = {}) {
    try {
      // Load form definition
      const form = await AppForm.findByPk(formId);
      if (!form) {
        throw new Error('Form not found');
      }

      // Check user permissions
      const canAccess = await this.rbac.canAccessForm(userId, formId, 'read');
      if (!canAccess) {
        throw new Error('Access denied');
      }

      // Create runtime instance
      const instance = {
        id: `form_${formId}_${Date.now()}`,
        formId,
        userId,
        form,
        context,
        data: {},
        variables: this.initializeVariables(form.variables || []),
        collections: this.initializeCollections(form.collections || []),
        validationErrors: {},
        isDirty: false,
        isValid: false
      };

      // Store instance
      this.activeInstances.set(instance.id, instance);

      // Load initial data from data sources
      await this.loadDataSources(instance);

      return {
        success: true,
        instanceId: instance.id,
        definition: this.buildRuntimeDefinition(form, userId),
        initialData: instance.data,
        variables: instance.variables
      };
    } catch (error) {
      console.error('[FormRuntime] Error initializing form:', error);
      throw error;
    }
  }

  /**
   * Build runtime definition with user-specific permissions
   */
  buildRuntimeDefinition(form, userId) {
    return {
      id: form.id,
      name: form.name,
      displayName: form.displayName,
      formType: form.formType,
      layout: form.layout,
      screens: form.screens || [],
      controls: this.buildControlsWithPermissions(form.controls, userId),
      dataSources: form.dataSources || [],
      events: form.events || {},
      theme: form.theme || {},
      settings: form.settings || {}
    };
  }

  /**
   * Build controls array with field-level permissions applied
   */
  buildControlsWithPermissions(controls, userId) {
    // TODO: Filter based on field-level RBAC
    return controls.map(control => ({
      ...control,
      // Add runtime properties
      _runtime: {
        visible: true,
        enabled: true,
        required: control.required || false
      }
    }));
  }

  /**
   * Initialize form variables with default values
   */
  initializeVariables(variableDefs) {
    const variables = {};
    for (const varDef of variableDefs) {
      variables[varDef.name] = varDef.defaultValue || this.getDefaultValueForType(varDef.type);
    }
    return variables;
  }

  /**
   * Initialize form collections
   */
  initializeCollections(collectionDefs) {
    const collections = {};
    for (const collDef of collectionDefs) {
      collections[collDef.name] = [];
    }
    return collections;
  }

  /**
   * Load data from configured data sources
   */
  async loadDataSources(instance) {
    const { form, context } = instance;

    for (const dataSource of form.dataSources || []) {
      try {
        const data = await this.dataIntegration.fetchData(
          dataSource,
          context.filters || {}
        );

        // Store in instance data
        instance.data[dataSource.name] = data;

        // If mapped to collection, populate it
        if (dataSource.targetCollection) {
          instance.collections[dataSource.targetCollection] = data;
        }
      } catch (error) {
        console.error(`[FormRuntime] Error loading data source ${dataSource.name}:`, error);
        instance.data[dataSource.name] = null;
      }
    }
  }

  /**
   * Update field value with validation
   */
  async updateFieldValue(instanceId, fieldName, value) {
    const instance = this.activeInstances.get(instanceId);
    if (!instance) {
      throw new Error('Form instance not found');
    }

    // Update data
    instance.data[fieldName] = value;
    instance.isDirty = true;

    // Find field control
    const control = instance.form.controls.find(c => c.name === fieldName);
    if (!control) {
      return { success: true };
    }

    // Validate field
    const errors = await this.validationEngine.validateField(
      control,
      value,
      instance.data
    );

    // Update validation errors
    if (errors.length > 0) {
      instance.validationErrors[fieldName] = errors;
      instance.isValid = false;
    } else {
      delete instance.validationErrors[fieldName];
      instance.isValid = Object.keys(instance.validationErrors).length === 0;
    }

    // Execute onChange event if defined
    if (control.events && control.events.onChange) {
      await this.executeEvent(instance, control.events.onChange, { fieldName, value });
    }

    return {
      success: true,
      errors: instance.validationErrors[fieldName] || [],
      isValid: instance.isValid
    };
  }

  /**
   * Validate entire form
   */
  async validateForm(instanceId) {
    const instance = this.activeInstances.get(instanceId);
    if (!instance) {
      throw new Error('Form instance not found');
    }

    const allErrors = {};

    // Validate each control
    for (const control of instance.form.controls) {
      const value = instance.data[control.name];
      const errors = await this.validationEngine.validateField(
        control,
        value,
        instance.data
      );

      if (errors.length > 0) {
        allErrors[control.name] = errors;
      }
    }

    // Validate form-level rules
    const formLevelErrors = await this.validationEngine.validateFormRules(
      instance.form.validationRules || [],
      instance.data
    );

    instance.validationErrors = allErrors;
    instance.isValid = Object.keys(allErrors).length === 0 && formLevelErrors.length === 0;

    return {
      success: true,
      isValid: instance.isValid,
      fieldErrors: allErrors,
      formErrors: formLevelErrors
    };
  }

  /**
   * Submit form data
   */
  async submitForm(instanceId, submitOptions = {}) {
    const instance = this.activeInstances.get(instanceId);
    if (!instance) {
      throw new Error('Form instance not found');
    }

    // Validate before submission
    const validation = await this.validateForm(instanceId);
    if (!validation.isValid) {
      return {
        success: false,
        error: 'VALIDATION_FAILED',
        errors: validation.fieldErrors,
        formErrors: validation.formErrors
      };
    }

    // Check write permission
    const canWrite = await this.rbac.canAccessForm(
      instance.userId,
      instance.formId,
      'write'
    );
    if (!canWrite) {
      return {
        success: false,
        error: 'ACCESS_DENIED',
        message: 'You do not have permission to submit this form'
      };
    }

    try {
      // Execute onSubmit event if defined
      if (instance.form.events && instance.form.events.onSubmit) {
        await this.executeEvent(instance, instance.form.events.onSubmit, {
          data: instance.data
        });
      }

      // Save to data sources
      const saveResults = await this.saveToDataSources(instance, submitOptions);

      // Execute onSuccess event
      if (instance.form.events && instance.form.events.onSuccess) {
        await this.executeEvent(instance, instance.form.events.onSuccess, {
          data: instance.data,
          results: saveResults
        });
      }

      // Mark as clean
      instance.isDirty = false;

      return {
        success: true,
        data: instance.data,
        results: saveResults
      };
    } catch (error) {
      console.error('[FormRuntime] Error submitting form:', error);

      // Execute onError event
      if (instance.form.events && instance.form.events.onError) {
        await this.executeEvent(instance, instance.form.events.onError, {
          error: error.message
        });
      }

      return {
        success: false,
        error: 'SUBMISSION_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Save data to configured data sources
   */
  async saveToDataSources(instance, options) {
    const results = [];

    for (const dataSource of instance.form.dataSources || []) {
      // Skip read-only data sources
      if (!dataSource.writable) continue;

      try {
        const result = await this.dataIntegration.saveData(
          dataSource,
          instance.data,
          options
        );

        results.push({
          dataSource: dataSource.name,
          success: true,
          result
        });
      } catch (error) {
        console.error(`[FormRuntime] Error saving to ${dataSource.name}:`, error);
        results.push({
          dataSource: dataSource.name,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Execute form event handler
   */
  async executeEvent(instance, eventConfig, context) {
    try {
      // Handle different event types
      switch (eventConfig.type) {
        case 'function':
          // Execute JavaScript function (sandboxed)
          return await this.executeScript(eventConfig.code, {
            data: instance.data,
            variables: instance.variables,
            collections: instance.collections,
            ...context
          });

        case 'navigate':
          // Navigation event
          return { action: 'navigate', url: eventConfig.url };

        case 'api':
          // API call event
          return await this.dataIntegration.executeApiCall(eventConfig);

        case 'workflow':
          // Trigger workflow (integration with Workflow Engine)
          return { action: 'workflow', workflowId: eventConfig.workflowId };

        default:
          console.warn(`[FormRuntime] Unknown event type: ${eventConfig.type}`);
          return null;
      }
    } catch (error) {
      console.error('[FormRuntime] Error executing event:', error);
      throw error;
    }
  }

  /**
   * Execute JavaScript code in sandboxed environment
   */
  async executeScript(code, context) {
    // TODO: Implement VM2 sandbox for safe script execution
    // For now, just log and return
    console.log('[FormRuntime] Script execution:', { code, context });
    return { executed: true };
  }

  /**
   * Evaluate conditional visibility rules
   */
  evaluateVisibility(rules, data) {
    if (!rules || !rules.conditions) return true;

    const results = rules.conditions.map(condition => {
      const fieldValue = data[condition.field];
      return this.evaluateCondition(condition.operator, fieldValue, condition.value);
    });

    return rules.operator === 'AND'
      ? results.every(r => r)
      : results.some(r => r);
  }

  /**
   * Evaluate single condition
   */
  evaluateCondition(operator, fieldValue, compareValue) {
    switch (operator) {
      case 'equals':
        return fieldValue === compareValue;
      case 'notEquals':
        return fieldValue !== compareValue;
      case 'contains':
        return String(fieldValue).includes(compareValue);
      case 'greaterThan':
        return Number(fieldValue) > Number(compareValue);
      case 'lessThan':
        return Number(fieldValue) < Number(compareValue);
      case 'isEmpty':
        return !fieldValue || fieldValue === '';
      case 'isNotEmpty':
        return !!fieldValue && fieldValue !== '';
      default:
        return false;
    }
  }

  /**
   * Get default value for data type
   */
  getDefaultValueForType(type) {
    switch (type) {
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'array':
        return [];
      case 'object':
        return {};
      case 'date':
        return null;
      default:
        return null;
    }
  }

  /**
   * Destroy form instance
   */
  destroyInstance(instanceId) {
    this.activeInstances.delete(instanceId);
    return { success: true };
  }

  /**
   * Get instance state
   */
  getInstanceState(instanceId) {
    const instance = this.activeInstances.get(instanceId);
    if (!instance) {
      throw new Error('Form instance not found');
    }

    return {
      data: instance.data,
      variables: instance.variables,
      collections: instance.collections,
      validationErrors: instance.validationErrors,
      isDirty: instance.isDirty,
      isValid: instance.isValid
    };
  }
}

module.exports = new FormRuntimeService();
