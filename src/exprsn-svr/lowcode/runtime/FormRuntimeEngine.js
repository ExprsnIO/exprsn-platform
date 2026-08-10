/**
 * Form Runtime Engine
 *
 * Executes forms in runtime, handling rendering, events, validation,
 * and state management for end users.
 */

const FormulaEngine = require('../engine/FormulaEngine');
const { ConnectionManager } = require('../connections');
const FormValidator = require('./FormValidator');
const EventEmitter = require('events');

class FormRuntimeEngine extends EventEmitter {
  constructor(formDefinition, options = {}) {
    super();

    this.formDefinition = formDefinition;
    this.options = options;

    // Runtime state
    this.state = {
      // Form values
      values: {},

      // Component states
      components: {},

      // Variables (Power Apps-style)
      variables: {},

      // Collections (in-memory data)
      collections: new Map(),

      // Data sources
      dataSources: new Map(),

      // Loading states
      loading: {
        form: false,
        dataSources: {}
      },

      // Errors
      errors: {},

      // Validation
      validation: {
        isValid: true,
        errors: []
      },

      // Submission
      submission: {
        status: null, // null, 'submitting', 'success', 'error'
        data: null,
        error: null
      }
    };

    // Initialize engines
    this.formulaEngine = new FormulaEngine();
    this.validator = new FormValidator();

    // Connection manager for data sources
    this.connectionManager = ConnectionManager;

    // Background services
    this.backgroundServices = new Map();

    // Event handlers
    this.eventHandlers = new Map();
  }

  /**
   * Initialize the form runtime
   */
  async initialize() {
    try {
      this.emit('initializing');

      // Initialize variables
      this.initializeVariables();

      // Initialize collections
      this.initializeCollections();

      // Initialize data sources
      await this.initializeDataSources();

      // Initialize components
      this.initializeComponents();

      // Setup formula engine context
      this.setupFormulaContext();

      // Register event handlers
      this.registerEventHandlers();

      // Start background services
      this.startBackgroundServices();

      // Load auto-load data sources
      await this.loadAutoLoadDataSources();

      this.emit('initialized');

      return {
        success: true,
        state: this.getState()
      };
    } catch (error) {
      this.emit('error', error);
      throw new Error(`Form initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize variables from form definition
   */
  initializeVariables() {
    if (!this.formDefinition.variables) return;

    this.formDefinition.variables.forEach(variable => {
      this.state.variables[variable.name] = variable.defaultValue ?? null;
    });
  }

  /**
   * Initialize collections from form definition
   */
  initializeCollections() {
    if (!this.formDefinition.collections) return;

    this.formDefinition.collections.forEach(collection => {
      this.state.collections.set(collection.name, collection.defaultData || []);
    });
  }

  /**
   * Initialize data sources
   */
  async initializeDataSources() {
    if (!this.formDefinition.dataSources) return;

    for (const ds of this.formDefinition.dataSources) {
      try {
        // Create connection
        await this.connectionManager.createConnection(
          `form_${this.formDefinition.id}_${ds.name}`,
          ds.type,
          ds.config
        );

        this.state.dataSources.set(ds.name, {
          name: ds.name,
          type: ds.type,
          config: ds.config,
          autoLoad: ds.autoLoad || false,
          cachePolicy: ds.cachePolicy || 'none',
          loaded: false,
          data: null,
          error: null
        });

        this.emit('dataSourceInitialized', ds.name);
      } catch (error) {
        console.error(`Failed to initialize data source "${ds.name}":`, error);
        this.state.dataSources.set(ds.name, {
          name: ds.name,
          error: error.message,
          loaded: false
        });
      }
    }
  }

  /**
   * Initialize component states
   */
  initializeComponents() {
    if (!this.formDefinition.controls) return;

    this.formDefinition.controls.forEach(control => {
      this.state.components[control.id] = {
        id: control.id,
        type: control.type,
        visible: control.props?.visible !== false,
        enabled: control.props?.disabled !== true,
        value: control.props?.defaultValue ?? null,
        valid: true,
        error: null
      };

      // Initialize form value
      if (control.name) {
        this.state.values[control.name] = control.props?.defaultValue ?? null;
      }
    });
  }

  /**
   * Setup formula engine context
   */
  setupFormulaContext() {
    // Set form values
    this.formulaEngine.setContext(this.state.values);

    // Set variables
    Object.keys(this.state.variables).forEach(key => {
      this.formulaEngine.Set(key, this.state.variables[key]);
    });

    // Set collections
    this.state.collections.forEach((data, name) => {
      this.formulaEngine.ClearCollect(name, data);
    });
  }

  /**
   * Register event handlers from form definition
   */
  registerEventHandlers() {
    if (!this.formDefinition.events) return;

    Object.keys(this.formDefinition.events).forEach(eventType => {
      const handlers = this.formDefinition.events[eventType];

      if (Array.isArray(handlers)) {
        handlers.forEach(handler => {
          this.registerEventHandler(eventType, handler);
        });
      } else {
        this.registerEventHandler(eventType, handlers);
      }
    });
  }

  /**
   * Register single event handler
   */
  registerEventHandler(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }

    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * Start background services
   */
  startBackgroundServices() {
    if (!this.formDefinition.backgroundServices) return;

    this.formDefinition.backgroundServices.forEach(service => {
      this.startBackgroundService(service);
    });
  }

  /**
   * Start single background service
   */
  startBackgroundService(service) {
    const { id, type, formula, config } = service;

    switch (type) {
      case 'interval':
        // Execute formula at regular intervals
        const interval = setInterval(() => {
          this.executeFormula(formula);
        }, config.interval || 1000);

        this.backgroundServices.set(id, { type, interval });
        break;

      case 'debounce':
        // Execute formula after debounce delay
        // Implementation would use a debounce utility
        break;

      case 'throttle':
        // Execute formula at most once per throttle period
        // Implementation would use a throttle utility
        break;

      case 'idle':
        // Execute formula when user is idle
        // Implementation would use idle detection
        break;
    }
  }

  /**
   * Load auto-load data sources
   */
  async loadAutoLoadDataSources() {
    const autoLoadSources = Array.from(this.state.dataSources.values())
      .filter(ds => ds.autoLoad && !ds.error);

    for (const ds of autoLoadSources) {
      await this.loadDataSource(ds.name);
    }
  }

  /**
   * Load data source
   */
  async loadDataSource(name, queryConfig = {}) {
    const ds = this.state.dataSources.get(name);

    if (!ds) {
      throw new Error(`Data source "${name}" not found`);
    }

    if (ds.error) {
      throw new Error(`Data source "${name}" has initialization error: ${ds.error}`);
    }

    try {
      this.state.loading.dataSources[name] = true;
      this.emit('dataSourceLoading', name);

      const connectionId = `form_${this.formDefinition.id}_${name}`;
      const data = await this.connectionManager.query(connectionId, queryConfig);

      ds.data = data;
      ds.loaded = true;

      // Update collection if data source maps to one
      if (ds.collection) {
        this.state.collections.set(ds.collection, data);
        this.formulaEngine.ClearCollect(ds.collection, data);
      }

      this.state.loading.dataSources[name] = false;
      this.emit('dataSourceLoaded', name, data);

      return data;
    } catch (error) {
      this.state.loading.dataSources[name] = false;
      ds.error = error.message;
      this.emit('dataSourceError', name, error);
      throw error;
    }
  }

  /**
   * Set form value
   */
  setValue(controlName, value) {
    this.state.values[controlName] = value;

    // Update formula engine context
    this.formulaEngine.setContext({ [controlName]: value });

    // Find control and update component state
    const control = this.formDefinition.controls.find(c => c.name === controlName);
    if (control) {
      this.state.components[control.id].value = value;

      // Execute OnChange event if defined
      if (control.events?.OnChange) {
        this.executeFormula(control.events.OnChange);
      }
    }

    this.emit('valueChanged', controlName, value);
  }

  /**
   * Get form value
   */
  getValue(controlName) {
    return this.state.values[controlName];
  }

  /**
   * Set variable
   */
  setVariable(name, value) {
    this.state.variables[name] = value;
    this.formulaEngine.Set(name, value);
    this.emit('variableChanged', name, value);
  }

  /**
   * Get variable
   */
  getVariable(name) {
    return this.state.variables[name];
  }

  /**
   * Execute formula
   */
  executeFormula(formula, localContext = {}) {
    try {
      const result = this.formulaEngine.evaluate(formula, localContext);
      this.emit('formulaExecuted', formula, result);
      return result;
    } catch (error) {
      this.emit('formulaError', formula, error);
      throw error;
    }
  }

  /**
   * Trigger event
   */
  async triggerEvent(eventType, eventData = {}) {
    const handlers = this.eventHandlers.get(eventType) || [];

    for (const handler of handlers) {
      try {
        if (handler.type === 'formula') {
          await this.executeFormula(handler.formula, eventData);
        } else if (handler.type === 'action') {
          await this.executeAction(handler.action, eventData);
        }
      } catch (error) {
        console.error(`Event handler error (${eventType}):`, error);
        this.emit('eventHandlerError', eventType, error);
      }
    }

    this.emit('event', eventType, eventData);
  }

  /**
   * Execute action
   */
  async executeAction(action, context = {}) {
    switch (action.type) {
      case 'navigate':
        this.emit('navigate', action.url);
        break;

      case 'submit':
        await this.submit();
        break;

      case 'reset':
        this.reset();
        break;

      case 'loadDataSource':
        await this.loadDataSource(action.dataSource, action.query);
        break;

      case 'showMessage':
        this.emit('showMessage', action.message, action.messageType);
        break;

      default:
        console.warn(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Validate form
   */
  async validate() {
    const validation = await this.validator.validate(
      this.formDefinition,
      this.state.values,
      this.formulaEngine
    );

    this.state.validation = validation;

    // Update component error states
    validation.errors.forEach(error => {
      const control = this.formDefinition.controls.find(c => c.name === error.field);
      if (control) {
        this.state.components[control.id].valid = false;
        this.state.components[control.id].error = error.message;
      }
    });

    this.emit('validated', validation);

    return validation;
  }

  /**
   * Submit form
   */
  async submit() {
    try {
      this.state.submission.status = 'submitting';
      this.emit('submitting');

      // Validate form
      const validation = await this.validate();

      if (!validation.isValid) {
        this.state.submission.status = 'error';
        this.state.submission.error = 'Validation failed';
        this.emit('submitError', new Error('Validation failed'));
        return {
          success: false,
          error: 'Validation failed',
          validation
        };
      }

      // Trigger OnSubmit event
      await this.triggerEvent('OnSubmit', { values: this.state.values });

      // Create submission data
      const submissionData = {
        formId: this.formDefinition.id,
        values: this.state.values,
        submittedAt: new Date()
      };

      // If custom submit handler provided
      if (this.options.onSubmit) {
        const result = await this.options.onSubmit(submissionData);
        this.state.submission.status = 'success';
        this.state.submission.data = result;
        this.emit('submitted', result);
        return result;
      }

      // Default: emit submission event
      this.state.submission.status = 'success';
      this.state.submission.data = submissionData;
      this.emit('submitted', submissionData);

      return {
        success: true,
        data: submissionData
      };
    } catch (error) {
      this.state.submission.status = 'error';
      this.state.submission.error = error.message;
      this.emit('submitError', error);

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reset form
   */
  reset() {
    // Reset values to defaults
    this.formDefinition.controls.forEach(control => {
      if (control.name) {
        this.state.values[control.name] = control.props?.defaultValue ?? null;
        this.state.components[control.id].value = control.props?.defaultValue ?? null;
        this.state.components[control.id].valid = true;
        this.state.components[control.id].error = null;
      }
    });

    // Reset validation
    this.state.validation = {
      isValid: true,
      errors: []
    };

    // Reset submission
    this.state.submission = {
      status: null,
      data: null,
      error: null
    };

    this.emit('reset');
  }

  /**
   * Get current state
   */
  getState() {
    return {
      values: { ...this.state.values },
      variables: { ...this.state.variables },
      collections: Object.fromEntries(this.state.collections),
      components: { ...this.state.components },
      loading: { ...this.state.loading },
      errors: { ...this.state.errors },
      validation: { ...this.state.validation },
      submission: { ...this.state.submission }
    };
  }

  /**
   * Destroy runtime
   */
  async destroy() {
    // Stop background services
    this.backgroundServices.forEach((service, id) => {
      if (service.interval) {
        clearInterval(service.interval);
      }
    });

    this.backgroundServices.clear();

    // Close data source connections
    for (const ds of this.state.dataSources.values()) {
      try {
        const connectionId = `form_${this.formDefinition.id}_${ds.name}`;
        if (this.connectionManager.hasConnection(connectionId)) {
          await this.connectionManager.removeConnection(connectionId);
        }
      } catch (error) {
        console.error(`Error closing data source "${ds.name}":`, error);
      }
    }

    // Clear state
    this.state = null;

    // Remove all event listeners
    this.removeAllListeners();

    this.emit('destroyed');
  }
}

module.exports = FormRuntimeEngine;
