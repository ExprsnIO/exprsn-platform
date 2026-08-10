/**
 * Entity AI Assistant
 *
 * Natural language entity schema generation powered by AI.
 * Integrates with Entity Designer Pro.
 */

class EntityAIAssistant {
  constructor() {
    this.sessionId = null;
    this.isProcessing = false;
    this.suggestionId = null;
    this.init();
  }

  init() {
    this.createUI();
    this.attachEventListeners();
  }

  /**
   * Create the AI Assistant UI
   */
  createUI() {
    // Add AI button to Entity Designer header
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) {
      console.warn('[AI Assistant] Header not found, skipping UI creation');
      return;
    }

    const aiButton = document.createElement('button');
    aiButton.className = 'btn btn-primary';
    aiButton.id = 'aiAssistantBtn';
    aiButton.innerHTML = '<i class="fas fa-magic"></i> AI Assist';
    aiButton.title = 'Generate entity from natural language description';
    aiButton.style.marginRight = '0.75rem';

    // Insert before save button
    const saveBtn = document.getElementById('saveDraftBtn');
    if (saveBtn) {
      saveBtn.parentNode.insertBefore(aiButton, saveBtn);
    } else {
      headerRight.prepend(aiButton);
    }

    // Create AI Assistant Modal
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'aiAssistantModal';
    modal.tabIndex = '-1';
    modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">
              <i class="fas fa-magic"></i> AI Entity Assistant
            </h5>
            <button type="button" class="close text-white" data-dismiss="modal">
              <span>&times;</span>
            </button>
          </div>
          <div class="modal-body">
            <!-- Prompt Input -->
            <div class="form-group">
              <label for="aiPromptInput">
                <strong>Describe your entity in natural language:</strong>
              </label>
              <textarea
                class="form-control"
                id="aiPromptInput"
                rows="4"
                placeholder="Example: Create a customer entity with first name, last name, email, phone number, and billing address"
              ></textarea>
              <small class="form-text text-muted">
                Be specific about field names, types, and relationships.
              </small>
            </div>

            <!-- Quick Examples -->
            <div class="mb-3">
              <strong class="d-block mb-2">Quick Examples:</strong>
              <div class="btn-group-sm" role="group">
                <button class="btn btn-outline-secondary btn-sm ai-example-btn" data-example="customer">
                  Customer
                </button>
                <button class="btn btn-outline-secondary btn-sm ai-example-btn" data-example="product">
                  Product
                </button>
                <button class="btn btn-outline-secondary btn-sm ai-example-btn" data-example="order">
                  Order
                </button>
                <button class="btn btn-outline-secondary btn-sm ai-example-btn" data-example="employee">
                  Employee
                </button>
              </div>
            </div>

            <!-- AI Response Area -->
            <div id="aiResponseArea" style="display: none;">
              <hr>
              <div class="alert alert-info">
                <h6><i class="fas fa-check-circle"></i> AI Suggestion Generated</h6>
                <p class="mb-2" id="aiReasoning"></p>
                <small class="text-muted">
                  Confidence: <span id="aiConfidence">--</span>% |
                  Cost: $<span id="aiCost">--</span> |
                  Tokens: <span id="aiTokens">--</span>
                </small>
              </div>

              <!-- Schema Preview -->
              <div class="card">
                <div class="card-header bg-light">
                  <strong>Suggested Schema</strong>
                </div>
                <div class="card-body">
                  <div id="aiSchemaPreview"></div>
                </div>
              </div>
            </div>

            <!-- Loading Indicator -->
            <div id="aiLoadingIndicator" style="display: none;" class="text-center py-4">
              <div class="spinner-border text-primary" role="status">
                <span class="sr-only">Loading...</span>
              </div>
              <p class="mt-2 text-muted">AI is analyzing your request...</p>
            </div>

            <!-- Error Message -->
            <div id="aiErrorMessage" class="alert alert-danger" style="display: none;"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" id="aiGenerateBtn">
              <i class="fas fa-magic"></i> Generate Schema
            </button>
            <button type="button" class="btn btn-success" id="aiApplyBtn" style="display: none;">
              <i class="fas fa-check"></i> Apply to Entity Designer
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Open modal
    const aiBtn = document.getElementById('aiAssistantBtn');
    if (aiBtn) {
      aiBtn.addEventListener('click', () => this.openModal());
    }

    // Generate button
    const generateBtn = document.getElementById('aiGenerateBtn');
    if (generateBtn) {
      generateBtn.addEventListener('click', () => this.generateSchema());
    }

    // Apply button
    const applyBtn = document.getElementById('aiApplyBtn');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => this.applySchema());
    }

    // Example buttons
    document.querySelectorAll('.ai-example-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const example = e.target.dataset.example;
        this.loadExample(example);
      });
    });

    // Reset on modal close
    $('#aiAssistantModal').on('hidden.bs.modal', () => this.reset());
  }

  /**
   * Open the AI Assistant modal
   */
  openModal() {
    $('#aiAssistantModal').modal('show');
    document.getElementById('aiPromptInput').focus();
  }

  /**
   * Load example prompt
   */
  loadExample(type) {
    const examples = {
      customer: 'Create a customer entity with first name, last name, email (unique), phone number, billing address, shipping address, and customer since date',
      product: 'Create a product entity with name, SKU (unique), description, price, cost, stock quantity, category, and image URL',
      order: 'Create an order entity with order number (unique), customer reference, order date, status (pending/processing/shipped/delivered/cancelled), total amount, and shipping address',
      employee: 'Create an employee entity with first name, last name, email (unique), department, position, hire date, salary, and manager reference'
    };

    const prompt = examples[type] || '';
    document.getElementById('aiPromptInput').value = prompt;
  }

  /**
   * Generate schema from AI
   */
  async generateSchema() {
    const prompt = document.getElementById('aiPromptInput').value.trim();

    if (!prompt) {
      alert('Please enter a description for your entity');
      return;
    }

    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.showLoading(true);
    this.hideError();
    this.hideResponse();

    try {
      // Get current application ID (assuming it's in the URL or global)
      const applicationId = this.getApplicationId();

      const response = await fetch('/lowcode/api/ai/suggest/entity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          applicationId,
          context: {
            existingEntities: this.getExistingEntities(),
          },
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to generate schema');
      }

      // Display the suggestion
      this.displaySuggestion(result.data);

    } catch (error) {
      console.error('[AI Assistant] Error:', error);
      this.showError(error.message);
    } finally {
      this.isProcessing = false;
      this.showLoading(false);
    }
  }

  /**
   * Display AI suggestion
   */
  displaySuggestion(data) {
    this.suggestionId = data.suggestionId;
    const schema = data.schema;

    // Update metadata
    document.getElementById('aiReasoning').textContent = data.reasoning || 'AI-generated entity schema';
    document.getElementById('aiConfidence').textContent = data.confidenceScore || '--';
    document.getElementById('aiCost').textContent = (data.cost || 0).toFixed(4);
    document.getElementById('aiTokens').textContent =
      (data.usage?.inputTokens || 0) + (data.usage?.outputTokens || 0);

    // Build schema preview
    const preview = this.buildSchemaPreview(schema);
    document.getElementById('aiSchemaPreview').innerHTML = preview;

    // Show response and apply button
    this.showResponse();
    document.getElementById('aiApplyBtn').style.display = 'inline-block';
    document.getElementById('aiGenerateBtn').style.display = 'none';
  }

  /**
   * Build HTML preview of schema
   */
  buildSchemaPreview(schema) {
    let html = `
      <div class="mb-3">
        <strong>Entity Name:</strong> ${schema.entityName || schema.name || 'Unknown'}<br>
        <strong>Display Name:</strong> ${schema.displayName || schema.entityName || 'Unknown'}<br>
        <strong>Table Name:</strong> ${schema.tableName || schema.entityName + 's' || 'unknown'}
      </div>
      <strong>Fields:</strong>
      <table class="table table-sm table-bordered mt-2">
        <thead>
          <tr>
            <th>Field Name</th>
            <th>Type</th>
            <th>Required</th>
            <th>Unique</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
    `;

    (schema.fields || []).forEach(field => {
      html += `
        <tr>
          <td><code>${field.name}</code></td>
          <td><span class="badge badge-info">${field.type}</span></td>
          <td>${field.required ? '<i class="fas fa-check text-success"></i>' : '-'}</td>
          <td>${field.unique ? '<i class="fas fa-check text-success"></i>' : '-'}</td>
          <td>
            ${field.description || '-'}
            ${field.defaultValue ? `<br><small>Default: ${field.defaultValue}</small>` : ''}
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    if (schema.indexes && schema.indexes.length > 0) {
      html += `
        <div class="mt-3">
          <strong>Indexes:</strong>
          <ul class="list-unstyled mt-2">
      `;
      schema.indexes.forEach(idx => {
        html += `<li>• ${idx.name}: [${idx.fields.join(', ')}] ${idx.unique ? '(unique)' : ''}</li>`;
      });
      html += `</ul></div>`;
    }

    if (schema.relationships && schema.relationships.length > 0) {
      html += `
        <div class="mt-3">
          <strong>Relationships:</strong>
          <ul class="list-unstyled mt-2">
      `;
      schema.relationships.forEach(rel => {
        html += `<li>• ${rel.type} → ${rel.targetEntity} (${rel.foreignKey})</li>`;
      });
      html += `</ul></div>`;
    }

    return html;
  }

  /**
   * Apply schema to Entity Designer
   */
  applySchema() {
    if (!this.currentSuggestion || !this.currentSuggestion.schema) {
      alert('No schema to apply');
      return;
    }

    const schema = this.currentSuggestion.schema;

    // Check if Entity Designer Pro is available
    if (!window.entityDesignerPro || !window.entityDesignerPro.state) {
      alert('Entity Designer Pro not found. Please refresh the page and try again.');
      return;
    }

    const state = window.entityDesignerPro.state;

    // Update entity basic information
    if (schema.entityName && state.currentEntity) {
      state.currentEntity.name = schema.entityName;
    }
    if (schema.displayName && state.currentEntity) {
      state.currentEntity.displayName = schema.displayName;
    }
    if (schema.tableName && state.currentEntity) {
      state.currentEntity.tableName = schema.tableName;
    }
    if (schema.description && state.currentEntity) {
      state.currentEntity.description = schema.description;
    }

    // Convert AI field format to Entity Designer format
    const designerFields = (schema.fields || []).map(aiField => ({
      name: aiField.name,
      label: aiField.label || aiField.name,
      type: this.mapAITypeToDesignerType(aiField.type),
      description: aiField.description || null,
      defaultValue: aiField.defaultValue || aiField.default || null,
      indexed: aiField.index || aiField.indexed || false,
      validation: {
        required: aiField.required || false,
        unique: aiField.unique || false,
        primaryKey: aiField.primaryKey || false,
        minLength: aiField.validation?.minLength || aiField.validation?.min || null,
        maxLength: aiField.validation?.maxLength || aiField.validation?.max || null,
        pattern: aiField.validation?.pattern || null,
        minValue: aiField.validation?.minValue || null,
        maxValue: aiField.validation?.maxValue || null,
        enumValues: aiField.validation?.enum || null
      },
      config: {
        autoIncrement: aiField.autoIncrement || false,
        autoNow: aiField.autoNow || false,
        autoUpdate: aiField.autoUpdate || false,
        readOnly: aiField.readOnly || false,
        hidden: aiField.hidden || false,
        calculated: aiField.calculated || false,
        expression: aiField.expression || null
      },
      // Backwards compatibility
      required: aiField.required || false,
      unique: aiField.unique || false,
      primaryKey: aiField.primaryKey || false
    }));

    // Update entity schema
    const newSchema = {
      ...(state.currentEntity.schema || {}),
      fields: designerFields
    };

    // Convert indexes if provided
    if (schema.indexes && Array.isArray(schema.indexes)) {
      newSchema.indexes = schema.indexes.map(idx => ({
        name: idx.name,
        fields: idx.fields || [idx.field],
        type: idx.unique ? 'unique' : 'index'
      }));
    }

    // Convert relationships if provided
    if (schema.relationships && Array.isArray(schema.relationships)) {
      state.currentEntity.relationships = schema.relationships.map(rel => ({
        name: rel.name || `${rel.type}_${rel.targetEntity}`,
        type: rel.type, // belongsTo, hasMany, hasOne, belongsToMany
        targetEntity: rel.targetEntity,
        foreignKey: rel.foreignKey,
        onDelete: rel.onDelete || 'NO ACTION',
        onUpdate: rel.onUpdate || 'NO ACTION',
        through: rel.through || null,
        sourceKey: rel.sourceKey || 'id',
        targetKey: rel.targetKey || 'id'
      }));
    }

    // Apply the schema update
    if (window.entityDesignerPro.updateEntitySchema) {
      window.entityDesignerPro.updateEntitySchema(newSchema);
    }

    // Update header info
    const titleEl = document.getElementById('entityTitle');
    const subtitleEl = document.getElementById('entitySubtitle');
    if (titleEl) titleEl.textContent = state.currentEntity.displayName || state.currentEntity.name;
    if (subtitleEl) subtitleEl.textContent = state.currentEntity.tableName || '';

    // Show success message
    const fieldCount = designerFields.length;
    const relationshipCount = (schema.relationships || []).length;
    const indexCount = (schema.indexes || []).length;

    let message = `✅ Applied AI-generated schema!\n\n`;
    message += `• ${fieldCount} field${fieldCount !== 1 ? 's' : ''} added\n`;
    if (relationshipCount > 0) message += `• ${relationshipCount} relationship${relationshipCount !== 1 ? 's' : ''} configured\n`;
    if (indexCount > 0) message += `• ${indexCount} index${indexCount !== 1 ? 'es' : ''} created\n`;
    message += `\nReview the fields and save when ready.`;

    alert(message);

    // Close modal
    $('#aiAssistantModal').modal('hide');

    // Trigger view refresh
    if (window.entityDesignerPro.renderFieldsView) {
      window.entityDesignerPro.renderFieldsView();
    }
  }

  /**
   * Map AI field type to Entity Designer type
   */
  mapAITypeToDesignerType(aiType) {
    const typeMap = {
      'string': 'String',
      'text': 'Text',
      'integer': 'Integer',
      'int': 'Integer',
      'decimal': 'Decimal',
      'float': 'Decimal',
      'boolean': 'Boolean',
      'bool': 'Boolean',
      'date': 'Date',
      'datetime': 'DateTime',
      'timestamp': 'DateTime',
      'uuid': 'UUID',
      'json': 'JSON',
      'jsonb': 'JSONB',
      'enum': 'Enum',
      'email': 'Email',
      'url': 'URL',
      'phone': 'Phone',
      'color': 'Color'
    };

    return typeMap[aiType.toLowerCase()] || 'String';
  }

  /**
   * Show/hide loading indicator
   */
  showLoading(show) {
    document.getElementById('aiLoadingIndicator').style.display = show ? 'block' : 'none';
  }

  /**
   * Show/hide response area
   */
  showResponse() {
    document.getElementById('aiResponseArea').style.display = 'block';
  }

  hideResponse() {
    document.getElementById('aiResponseArea').style.display = 'none';
  }

  /**
   * Show error message
   */
  showError(message) {
    const errorDiv = document.getElementById('aiErrorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }

  hideError() {
    document.getElementById('aiErrorMessage').style.display = 'none';
  }

  /**
   * Reset the modal
   */
  reset() {
    document.getElementById('aiPromptInput').value = '';
    this.suggestionId = null;
    this.hideResponse();
    this.hideError();
    document.getElementById('aiApplyBtn').style.display = 'none';
    document.getElementById('aiGenerateBtn').style.display = 'inline-block';
  }

  /**
   * Get current application ID
   */
  getApplicationId() {
    // Try to get from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const appId = urlParams.get('applicationId') || urlParams.get('appId');

    if (appId) {
      return appId;
    }

    // Try to get from global variable (if set by Entity Designer)
    if (window.currentApplicationId) {
      return window.currentApplicationId;
    }

    // Default fallback (should be replaced with actual app ID)
    return '00000000-0000-0000-0000-000000000000';
  }

  /**
   * Get existing entities (for context)
   */
  getExistingEntities() {
    // TODO: Get from Entity Designer's entity list
    return [];
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Only initialize if we're on the Entity Designer page
  if (window.location.pathname.includes('entity-designer')) {
    window.aiAssistant = new EntityAIAssistant();
    console.log('[AI Assistant] Initialized successfully');
  }
});
