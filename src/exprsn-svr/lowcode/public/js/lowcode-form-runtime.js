/**
 * ═══════════════════════════════════════════════════════════
 * Client-Side Form Runtime Engine
 * Manages form state, events, validation, and data binding
 * ═══════════════════════════════════════════════════════════
 */

class FormRuntimeEngine {
  constructor(formDefinition, options = {}) {
    this.formDefinition = formDefinition;
    this.options = options;

    // Runtime state
    this.state = {
      // Form mode: 'create' or 'edit'
      mode: options.recordId ? 'edit' : 'create',

      // Record ID for edit mode
      recordId: options.recordId || null,

      // Form field values
      values: {},

      // Component visibility/enabled states
      components: {},

      // Variables (Power Apps-style global variables)
      variables: {},

      // Collections (in-memory tables)
      collections: new Map(),

      // Data sources
      dataSources: new Map(),

      // Entity bindings (primary entity for form)
      entityBinding: null,

      // Loaded record (for edit mode)
      record: null,

      // Loading states
      loading: {
        form: false,
        record: false,
        dataSources: {},
        formulas: {}
      },

      // Validation errors
      errors: {},

      // Validation state
      validation: {
        isValid: true,
        errorCount: 0,
        errors: []
      },

      // Submission state
      submission: {
        status: null, // null, 'submitting', 'success', 'error'
        data: null,
        error: null
      }
    };

    // Event handlers registry
    this.eventHandlers = new Map();

    // Background services (intervals, watchers)
    this.backgroundServices = new Map();

    // Data binding subscriptions
    this.dataBindings = new Map();

    // Formula cache
    this.formulaCache = new Map();

    // Change listeners
    this.changeListeners = [];

    console.log('[FormRuntime] Initialized', { formId: formDefinition.id });
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the form runtime
   */
  async initialize() {
    try {
      console.log('[FormRuntime] Initializing...', {
        mode: this.state.mode,
        recordId: this.state.recordId
      });

      // Initialize variables from form definition
      this.initializeVariables();

      // Initialize component states
      this.initializeComponents();

      // Identify primary entity binding
      this.identifyEntityBinding();

      // Load data sources
      await this.loadDataSources();

      // Load record if in edit mode
      if (this.state.mode === 'edit' && this.state.recordId) {
        await this.loadRecord();
      }

      // Setup event handlers
      this.setupEventHandlers();

      // Apply initial formulas
      await this.applyInitialFormulas();

      // Start background services
      this.startBackgroundServices();

      console.log('[FormRuntime] Initialization complete');
      this.emit('initialized');

      return true;
    } catch (error) {
      console.error('[FormRuntime] Initialization failed:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Initialize variables
   */
  initializeVariables() {
    if (this.formDefinition.variables) {
      Object.keys(this.formDefinition.variables).forEach(key => {
        this.state.variables[key] = this.formDefinition.variables[key];
      });
    }
  }

  /**
   * Initialize component states
   */
  initializeComponents() {
    if (!this.formDefinition.schema?.components) return;

    this.formDefinition.schema.components.forEach(component => {
      const id = component.id || component.name;

      this.state.components[id] = {
        visible: component.visible !== false,
        enabled: component.enabled !== false,
        required: component.required || false,
        value: component.defaultValue || null
      };

      // Set initial value
      if (component.defaultValue !== undefined) {
        this.setValue(id, component.defaultValue, { silent: true });
      }
    });
  }

  /**
   * Load data sources
   */
  async loadDataSources() {
    if (!this.formDefinition.connections) return;

    for (const connection of this.formDefinition.connections) {
      if (connection.sourceType === 'data_source') {
        await this.loadDataSource(connection);
      }
    }
  }

  /**
   * Load individual data source
   */
  async loadDataSource(connection) {
    const dataSourceId = connection.sourceId;

    if (this.state.dataSources.has(dataSourceId)) {
      return; // Already loaded
    }

    this.state.loading.dataSources[dataSourceId] = true;

    try {
      // Query data source via API
      const response = await fetch(`/lowcode/api/runtime/${window.APP_ID}/data/${dataSourceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'list',
          filters: connection.filters || {},
          options: { limit: 1000 }
        })
      });

      const result = await response.json();

      if (result.success) {
        this.state.dataSources.set(dataSourceId, result.data);
        console.log(`[FormRuntime] Loaded data source: ${dataSourceId}`, result.data.length, 'records');
      } else {
        console.error(`[FormRuntime] Failed to load data source: ${dataSourceId}`, result.error);
      }

    } catch (error) {
      console.error(`[FormRuntime] Error loading data source: ${dataSourceId}`, error);
    } finally {
      this.state.loading.dataSources[dataSourceId] = false;
    }
  }

  /**
   * Identify primary entity binding for the form
   */
  identifyEntityBinding() {
    if (!this.formDefinition.connections) return;

    // Find the first connection with create/update operations enabled
    const entityConnection = this.formDefinition.connections.find(conn => {
      return conn.operations && (conn.operations.create || conn.operations.update);
    });

    if (entityConnection) {
      this.state.entityBinding = {
        dataSourceId: entityConnection.dataSourceId,
        connectionName: entityConnection.connectionName,
        operations: entityConnection.operations,
        filters: entityConnection.filters || {}
      };

      console.log('[FormRuntime] Entity binding identified:', this.state.entityBinding);
    } else {
      console.log('[FormRuntime] No entity binding found (read-only form)');
    }
  }

  /**
   * Load record for edit mode
   */
  async loadRecord() {
    if (!this.state.entityBinding) {
      console.warn('[FormRuntime] Cannot load record: no entity binding');
      return;
    }

    this.state.loading.record = true;

    try {
      console.log('[FormRuntime] Loading record:', this.state.recordId);

      const response = await fetch(`/lowcode/api/runtime/${window.APP_ID}/data/${this.state.entityBinding.dataSourceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'get',
          recordId: this.state.recordId
        })
      });

      const result = await response.json();

      if (result.success && result.data) {
        this.state.record = result.data;

        // Populate form fields with record data
        this.populateFromRecord(result.data);

        console.log('[FormRuntime] Record loaded successfully');
        this.emit('recordLoaded', { record: result.data });
      } else {
        throw new Error(result.error || 'Failed to load record');
      }

    } catch (error) {
      console.error('[FormRuntime] Failed to load record:', error);
      this.emit('error', { type: 'loadRecord', error });
      throw error;
    } finally {
      this.state.loading.record = false;
    }
  }

  /**
   * Populate form fields from record data
   */
  populateFromRecord(record) {
    // Map record fields to form fields
    Object.keys(record).forEach(fieldName => {
      // Try to find component by name
      const component = this.formDefinition.schema?.components.find(c =>
        c.name === fieldName || c.id === fieldName
      );

      if (component) {
        const fieldId = component.id || component.name;
        this.setValue(fieldId, record[fieldName], {
          silent: true,
          validate: false
        });
      }
    });

    console.log('[FormRuntime] Form populated from record');
  }

  // ============================================================================
  // VALUE MANAGEMENT
  // ============================================================================

  /**
   * Set field value
   */
  setValue(fieldId, value, options = {}) {
    const oldValue = this.state.values[fieldId];

    // Update value
    this.state.values[fieldId] = value;

    // Update component state
    if (this.state.components[fieldId]) {
      this.state.components[fieldId].value = value;
    }

    // Clear validation error for this field
    delete this.state.errors[fieldId];

    // Emit change event unless silent
    if (!options.silent) {
      this.emit('change', { fieldId, value, oldValue });
      this.notifyChangeListeners(fieldId, value, oldValue);
    }

    // Trigger OnChange event handler if defined
    if (!options.silent) {
      this.triggerEventHandler(fieldId, 'onChange', { value, oldValue });
    }

    // Re-validate
    if (options.validate !== false) {
      this.validateField(fieldId);
    }

    return value;
  }

  /**
   * Get field value
   */
  getValue(fieldId) {
    return this.state.values[fieldId];
  }

  /**
   * Get all values
   */
  getValues() {
    return { ...this.state.values };
  }

  /**
   * Set variable
   */
  setVariable(name, value) {
    const oldValue = this.state.variables[name];
    this.state.variables[name] = value;
    this.emit('variableChanged', { name, value, oldValue });
    return value;
  }

  /**
   * Get variable
   */
  getVariable(name) {
    return this.state.variables[name];
  }

  // ============================================================================
  // FORMULA EVALUATION
  // ============================================================================

  /**
   * Evaluate formula (server-side)
   */
  async evaluateFormula(formula, options = {}) {
    try {
      // Check cache if enabled
      const cacheKey = formula + JSON.stringify(this.state.values);
      if (options.cache && this.formulaCache.has(cacheKey)) {
        return this.formulaCache.get(cacheKey);
      }

      // Build context
      const context = {
        ...this.state.values,
        ...options.context
      };

      // Call formula API
      const response = await fetch('/lowcode/api/formulas/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formula,
          context,
          variables: this.state.variables,
          collections: Object.fromEntries(this.state.collections)
        })
      });

      const result = await response.json();

      if (result.success) {
        const value = result.data.result;

        // Cache result if enabled
        if (options.cache) {
          this.formulaCache.set(cacheKey, value);
        }

        return value;
      } else {
        throw new Error(result.message || 'Formula evaluation failed');
      }

    } catch (error) {
      console.error('[FormRuntime] Formula evaluation error:', formula, error);
      throw error;
    }
  }

  /**
   * Apply initial formulas
   */
  async applyInitialFormulas() {
    if (!this.formDefinition.schema?.components) return;

    for (const component of this.formDefinition.schema.components) {
      // Apply Default formula
      if (component.defaultFormula) {
        try {
          const value = await this.evaluateFormula(component.defaultFormula);
          this.setValue(component.id, value, { silent: true });
        } catch (error) {
          console.warn('[FormRuntime] Failed to evaluate default formula for:', component.id, error);
        }
      }

      // Apply Visible formula
      if (component.visibleFormula) {
        try {
          const visible = await this.evaluateFormula(component.visibleFormula);
          this.setComponentVisibility(component.id, Boolean(visible));
        } catch (error) {
          console.warn('[FormRuntime] Failed to evaluate visible formula for:', component.id, error);
        }
      }
    }
  }

  // ============================================================================
  // EVENT HANDLING
  // ============================================================================

  /**
   * Setup event handlers from form definition
   */
  setupEventHandlers() {
    if (!this.formDefinition.schema?.components) return;

    this.formDefinition.schema.components.forEach(component => {
      const id = component.id || component.name;

      // Register event handlers
      if (component.onChange) {
        this.registerEventHandler(id, 'onChange', component.onChange);
      }

      if (component.onSelect) {
        this.registerEventHandler(id, 'onSelect', component.onSelect);
      }

      if (component.onVisible) {
        this.registerEventHandler(id, 'onVisible', component.onVisible);
      }

      if (component.onFocus) {
        this.registerEventHandler(id, 'onFocus', component.onFocus);
      }

      if (component.onBlur) {
        this.registerEventHandler(id, 'onBlur', component.onBlur);
      }

      if (component.onClick) {
        this.registerEventHandler(id, 'onClick', component.onClick);
      }
    });
  }

  /**
   * Register event handler
   */
  registerEventHandler(componentId, eventType, handler) {
    const key = `${componentId}:${eventType}`;
    this.eventHandlers.set(key, handler);
  }

  /**
   * Trigger event handler
   */
  async triggerEventHandler(componentId, eventType, eventData = {}) {
    const key = `${componentId}:${eventType}`;
    const handler = this.eventHandlers.get(key);

    if (!handler) return;

    try {
      // If handler is a formula string
      if (typeof handler === 'string') {
        await this.evaluateFormula(handler, { context: eventData });
      }
      // If handler is a function
      else if (typeof handler === 'function') {
        await handler.call(this, eventData);
      }
    } catch (error) {
      console.error(`[FormRuntime] Event handler error (${key}):`, error);
    }
  }

  // ============================================================================
  // COMPONENT STATE
  // ============================================================================

  /**
   * Set component visibility
   */
  setComponentVisibility(componentId, visible) {
    if (this.state.components[componentId]) {
      this.state.components[componentId].visible = visible;
      this.emit('componentVisibilityChanged', { componentId, visible });
    }
  }

  /**
   * Set component enabled state
   */
  setComponentEnabled(componentId, enabled) {
    if (this.state.components[componentId]) {
      this.state.components[componentId].enabled = enabled;
      this.emit('componentEnabledChanged', { componentId, enabled });
    }
  }

  /**
   * Get component state
   */
  getComponentState(componentId) {
    return this.state.components[componentId] || null;
  }

  // ============================================================================
  // VALIDATION
  // ============================================================================

  /**
   * Validate single field
   */
  validateField(fieldId) {
    const component = this.formDefinition.schema?.components.find(c => c.id === fieldId);
    if (!component) return true;

    const value = this.getValue(fieldId);
    const errors = [];

    // Required validation
    if (component.required && (value === null || value === undefined || value === '')) {
      errors.push(`${component.label || component.name} is required`);
    }

    // Type-specific validation
    if (value !== null && value !== undefined && value !== '') {
      switch (component.type) {
        case 'emailInput':
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            errors.push('Invalid email address');
          }
          break;

        case 'numberInput':
          if (isNaN(value)) {
            errors.push('Must be a number');
          } else {
            if (component.min !== undefined && value < component.min) {
              errors.push(`Must be at least ${component.min}`);
            }
            if (component.max !== undefined && value > component.max) {
              errors.push(`Must be at most ${component.max}`);
            }
          }
          break;

        case 'textInput':
        case 'textArea':
          if (component.minLength && value.length < component.minLength) {
            errors.push(`Must be at least ${component.minLength} characters`);
          }
          if (component.maxLength && value.length > component.maxLength) {
            errors.push(`Must be at most ${component.maxLength} characters`);
          }
          break;
      }
    }

    // Custom validation formula
    if (component.validationFormula) {
      // TODO: Evaluate validation formula
    }

    // Update errors
    if (errors.length > 0) {
      this.state.errors[fieldId] = errors;
      return false;
    } else {
      delete this.state.errors[fieldId];
      return true;
    }
  }

  /**
   * Validate entire form
   */
  validate() {
    this.state.errors = {};

    if (!this.formDefinition.schema?.components) {
      return true;
    }

    let isValid = true;

    this.formDefinition.schema.components.forEach(component => {
      const fieldValid = this.validateField(component.id);
      if (!fieldValid) {
        isValid = false;
      }
    });

    this.state.validation.isValid = isValid;
    this.state.validation.errorCount = Object.keys(this.state.errors).length;
    this.state.validation.errors = Object.values(this.state.errors).flat();

    this.emit('validated', { isValid, errors: this.state.errors });

    return isValid;
  }

  /**
   * Get validation errors
   */
  getErrors() {
    return { ...this.state.errors };
  }

  // ============================================================================
  // FORM SUBMISSION
  // ============================================================================

  /**
   * Save form data to entity
   */
  async saveToEntity(formData) {
    if (!this.state.entityBinding) {
      throw new Error('No entity binding configured');
    }

    const { dataSourceId, operations } = this.state.entityBinding;
    const operation = this.state.mode === 'edit' ? 'update' : 'create';

    // Check if operation is allowed
    if (!operations[operation]) {
      throw new Error(`Operation '${operation}' not allowed on this form`);
    }

    console.log(`[FormRuntime] Saving to entity (${operation}):`, formData);

    try {
      const response = await fetch(`/lowcode/api/runtime/${window.APP_ID}/data/${dataSourceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation,
          data: formData,
          ...(this.state.mode === 'edit' && { recordId: this.state.recordId })
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || `Failed to ${operation} record`);
      }

      console.log('[FormRuntime] Entity save successful:', result.data);
      return result.data;

    } catch (error) {
      console.error('[FormRuntime] Entity save failed:', error);
      throw error;
    }
  }

  /**
   * Delete current record
   */
  async deleteRecord() {
    if (this.state.mode !== 'edit' || !this.state.recordId) {
      throw new Error('Cannot delete: not in edit mode or no record loaded');
    }

    if (!this.state.entityBinding) {
      throw new Error('No entity binding configured');
    }

    const { dataSourceId, operations } = this.state.entityBinding;

    // Check if delete operation is allowed
    if (!operations.delete) {
      throw new Error('Delete operation not allowed on this form');
    }

    console.log('[FormRuntime] Deleting record:', this.state.recordId);

    try {
      const response = await fetch(`/lowcode/api/runtime/${window.APP_ID}/data/${dataSourceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'delete',
          recordId: this.state.recordId
        })
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to delete record');
      }

      console.log('[FormRuntime] Record deleted successfully');
      this.emit('recordDeleted', { recordId: this.state.recordId });

      return { success: true, recordId: this.state.recordId };

    } catch (error) {
      console.error('[FormRuntime] Delete failed:', error);
      throw error;
    }
  }

  /**
   * Submit form
   */
  async submit() {
    try {
      // Validate first
      const isValid = this.validate();

      if (!isValid) {
        console.warn('[FormRuntime] Form validation failed');
        this.emit('submitFailed', { reason: 'validation', errors: this.state.errors });
        return { success: false, error: 'Validation failed', errors: this.state.errors };
      }

      this.state.submission.status = 'submitting';
      this.emit('submitting');

      const formData = this.getValues();

      // Submit to entity if binding exists
      if (this.state.entityBinding) {
        const savedRecord = await this.saveToEntity(formData);

        this.state.submission.status = 'success';
        this.state.submission.data = savedRecord;

        console.log('[FormRuntime] Form submitted successfully to entity:', savedRecord);
        this.emit('submitted', { data: savedRecord, mode: this.state.mode });

        return { success: true, data: savedRecord };
      } else {
        // No entity binding - just return form data
        this.state.submission.status = 'success';
        this.state.submission.data = formData;

        console.log('[FormRuntime] Form submitted (no entity binding):', formData);
        this.emit('submitted', { data: formData, mode: this.state.mode });

        return { success: true, data: formData };
      }

    } catch (error) {
      this.state.submission.status = 'error';
      this.state.submission.error = error.message;

      console.error('[FormRuntime] Form submission error:', error);
      this.emit('submitError', { error });

      return { success: false, error: error.message };
    }
  }

  /**
   * Reset form
   */
  reset() {
    this.state.values = {};
    this.state.errors = {};
    this.state.submission = { status: null, data: null, error: null };

    // Reset to initial values
    this.initializeComponents();

    this.emit('reset');
    console.log('[FormRuntime] Form reset');
  }

  // ============================================================================
  // BACKGROUND SERVICES
  // ============================================================================

  /**
   * Start background services
   */
  startBackgroundServices() {
    // Auto-save service
    if (this.options.autoSave) {
      const autoSaveInterval = setInterval(() => {
        this.autoSave();
      }, this.options.autoSaveInterval || 30000);

      this.backgroundServices.set('autoSave', autoSaveInterval);
    }
  }

  /**
   * Auto-save form data
   */
  async autoSave() {
    const data = this.getValues();
    console.log('[FormRuntime] Auto-saving...', data);

    // TODO: Save to local storage or server
    localStorage.setItem(`form_${this.formDefinition.id}_draft`, JSON.stringify(data));

    this.emit('autoSaved', { data });
  }

  // ============================================================================
  // CHANGE LISTENERS
  // ============================================================================

  /**
   * Add change listener
   */
  onChange(listener) {
    this.changeListeners.push(listener);
    return () => {
      const index = this.changeListeners.indexOf(listener);
      if (index > -1) {
        this.changeListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify change listeners
   */
  notifyChangeListeners(fieldId, value, oldValue) {
    this.changeListeners.forEach(listener => {
      try {
        listener({ fieldId, value, oldValue, state: this.state });
      } catch (error) {
        console.error('[FormRuntime] Change listener error:', error);
      }
    });
  }

  // ============================================================================
  // EVENT EMITTER
  // ============================================================================

  /**
   * Emit event
   */
  emit(eventName, data) {
    const event = new CustomEvent(`formRuntime:${eventName}`, {
      detail: { formId: this.formDefinition.id, ...data }
    });
    document.dispatchEvent(event);
  }

  /**
   * Listen to event
   */
  on(eventName, listener) {
    const handler = (e) => listener(e.detail);
    document.addEventListener(`formRuntime:${eventName}`, handler);
    return () => document.removeEventListener(`formRuntime:${eventName}`, handler);
  }

  // ============================================================================
  // UTILITY METHODS (for use in event handlers)
  // ============================================================================

  /**
   * Navigate to another form
   */
  navigate(formId) {
    if (typeof loadForm === 'function') {
      loadForm(formId);
    } else {
      console.warn('[FormRuntime] Navigation not available');
    }
  }

  /**
   * Show notification/toast
   */
  notify(message, type = 'info') {
    if (typeof showToast === 'function') {
      showToast(message, type);
    } else {
      console.log(`[FormRuntime] ${type.toUpperCase()}: ${message}`);
    }
  }

  /**
   * Reset form to initial state
   */
  reset() {
    // Clear all values
    Object.keys(this.state.values).forEach(fieldId => {
      this.setValue(fieldId, null, { silent: true });
    });

    // Clear errors
    this.state.errors = {};
    this.state.validation = {
      isValid: true,
      errorCount: 0,
      errors: []
    };

    // Re-apply initial formulas
    this.applyInitialFormulas();

    this.emit('reset');
  }

  /**
   * Refresh data sources
   */
  async refreshDataSources() {
    this.state.dataSources.clear();
    await this.loadDataSources();
    this.emit('dataSourcesRefreshed');
  }

  /**
   * Get form state snapshot
   */
  getSnapshot() {
    return {
      values: { ...this.state.values },
      variables: { ...this.state.variables },
      components: { ...this.state.components },
      errors: { ...this.state.errors },
      validation: { ...this.state.validation }
    };
  }

  /**
   * Restore form state from snapshot
   */
  restoreSnapshot(snapshot) {
    this.state.values = { ...snapshot.values };
    this.state.variables = { ...snapshot.variables };
    this.state.components = { ...snapshot.components };
    this.state.errors = { ...snapshot.errors };
    this.state.validation = { ...snapshot.validation };

    this.emit('snapshotRestored', snapshot);
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Destroy runtime instance
   */
  destroy() {
    // Stop background services
    this.backgroundServices.forEach((service, name) => {
      clearInterval(service);
    });
    this.backgroundServices.clear();

    // Clear event handlers
    this.eventHandlers.clear();

    // Clear change listeners
    this.changeListeners = [];

    // Clear caches
    this.formulaCache.clear();

    console.log('[FormRuntime] Destroyed');
    this.emit('destroyed');
  }
}

// Export for use in app runner
window.FormRuntimeEngine = FormRuntimeEngine;
