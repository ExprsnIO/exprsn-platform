/**
 * Exprsn Low-Code Platform - Entity Designer
 *
 * Interactive UI for designing database entities
 */

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const DesignerState = {
  entityId: null,
  applicationId: null,
  entity: {
    name: '',
    displayName: 'New Entity',
    description: '',
    schema: {
      fields: [],
      relationships: []
    },
    indexes: [],
    status: 'draft',
    apiEndpointsEnabled: false
  },
  selectedField: null,
  selectedRelationship: null,
  selectedIndex: null,
  currentView: 'fields',
  isDirty: false,
  autoSaveInterval: null
};

// Field data types
const DATA_TYPES = [
  { value: 'string', label: 'Text (String)', icon: 'fa-font' },
  { value: 'integer', label: 'Number (Integer)', icon: 'fa-hashtag' },
  { value: 'float', label: 'Decimal (Float)', icon: 'fa-percentage' },
  { value: 'boolean', label: 'True/False (Boolean)', icon: 'fa-toggle-on' },
  { value: 'date', label: 'Date', icon: 'fa-calendar' },
  { value: 'datetime', label: 'Date & Time', icon: 'fa-clock' },
  { value: 'text', label: 'Long Text', icon: 'fa-align-left' },
  { value: 'json', label: 'JSON Object', icon: 'fa-code' },
  { value: 'uuid', label: 'UUID', icon: 'fa-fingerprint' },
  { value: 'enum', label: 'Enumeration', icon: 'fa-list' }
];

// Relationship types
const RELATIONSHIP_TYPES = [
  { value: 'oneToOne', label: 'One-to-One (1:1)', icon: 'fa-link' },
  { value: 'oneToMany', label: 'One-to-Many (1:N)', icon: 'fa-arrow-right' },
  { value: 'manyToOne', label: 'Many-to-One (N:1)', icon: 'fa-arrow-left' },
  { value: 'manyToMany', label: 'Many-to-Many (N:M)', icon: 'fa-arrows-alt-h' }
];

// Index types
const INDEX_TYPES = [
  { value: 'primary', label: 'Primary Key', icon: 'fa-key' },
  { value: 'unique', label: 'Unique Index', icon: 'fa-fingerprint' },
  { value: 'index', label: 'Standard Index', icon: 'fa-list-ol' },
  { value: 'fulltext', label: 'Full-Text Index', icon: 'fa-search' }
];

// ============================================================================
// API CLIENT
// ============================================================================

const API = {
  baseUrl: '/lowcode/api',

  async request(endpoint, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        ...options
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'API request failed');
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  async getEntity(id) {
    return this.request(`/entities/${id}`);
  },

  async createEntity(data) {
    return this.request('/entities', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateEntity(id, data) {
    return this.request(`/entities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async generateAPI(id) {
    return this.request(`/entities/${id}/generate-api`, {
      method: 'POST'
    });
  }
};

// ============================================================================
// ENTITY OPERATIONS
// ============================================================================

/**
 * Load entity from API
 */
async function loadEntity(entityId) {
  try {
    const response = await API.getEntity(entityId);
    DesignerState.entity = response.data;
    DesignerState.entityId = entityId;
    DesignerState.applicationId = response.data.applicationId;

    // Ensure indexes array exists
    if (!DesignerState.entity.indexes) {
      DesignerState.entity.indexes = [];
    }

    // Update UI
    document.getElementById('entityDisplayName').value = DesignerState.entity.displayName;
    document.getElementById('entityStatus').textContent = DesignerState.entity.status;
    document.getElementById('entityStatus').className = `entity-status ${DesignerState.entity.status}`;

    renderFieldsList();
    renderFieldsTable();
    renderRelationshipsTable();
    renderIndexesTable();
    renderSchema();
  } catch (error) {
    showToast('Failed to load entity: ' + error.message, 'error');
  }
}

/**
 * Save entity
 */
async function saveEntity() {
  try {
    // Validate: Must have at least one field
    if (!DesignerState.entity.schema.fields || DesignerState.entity.schema.fields.length === 0) {
      showToast('Please add at least one field before saving', 'error');
      return;
    }

    // Transform field schema: frontend uses 'dataType', backend expects 'type'
    const transformedFields = DesignerState.entity.schema.fields.map(field => ({
      name: field.name,
      type: field.dataType,  // Map dataType -> type
      displayName: field.displayName,
      required: field.required || false,
      unique: field.unique || false,
      indexed: field.indexed || false,
      primaryKey: field.primaryKey || false,
      defaultValue: field.defaultValue || null,
      validation: field.validation || {},
      metadata: field.metadata || {}
    }));

    const data = {
      name: generateEntityName(DesignerState.entity.displayName),
      displayName: DesignerState.entity.displayName,
      description: DesignerState.entity.description || '',
      schema: {
        fields: transformedFields,
        relationships: DesignerState.entity.schema.relationships || []
      },
      indexes: DesignerState.entity.indexes || [],
      // For development: Use mock userId if not authenticated
      // TODO: Replace with actual authentication
      userId: getUserId()
    };

    if (DesignerState.entityId) {
      await API.updateEntity(DesignerState.entityId, data);
      showToast('Entity saved successfully', 'success');
    } else {
      data.applicationId = DesignerState.applicationId || getAppIdFromUrl();
      const response = await API.createEntity(data);
      DesignerState.entityId = response.data.id;
      showToast('Entity created successfully', 'success');

      // Update URL
      const url = new URL(window.location);
      url.searchParams.set('entityId', response.data.id);
      window.history.pushState({}, '', url);
    }

    DesignerState.isDirty = false;
  } catch (error) {
    showToast('Failed to save entity: ' + error.message, 'error');
    console.error('Save entity error:', error);
  }
}

/**
 * Generate API endpoints for entity
 */
async function generateAPI() {
  if (!DesignerState.entityId) {
    showToast('Please save the entity first', 'error');
    return;
  }

  try {
    await API.generateAPI(DesignerState.entityId);
    showToast('API endpoints generated successfully', 'success');
  } catch (error) {
    showToast('Failed to generate API: ' + error.message, 'error');
  }
}

// ============================================================================
// FIELD OPERATIONS
// ============================================================================

/**
 * Add new field
 */
function addField() {
  const newField = {
    id: generateFieldId(),
    name: `field_${DesignerState.entity.schema.fields.length + 1}`,
    displayName: `Field ${DesignerState.entity.schema.fields.length + 1}`,
    dataType: 'string',
    required: false,
    unique: false,
    indexed: false,
    defaultValue: null,
    validation: {},
    metadata: {}
  };

  DesignerState.entity.schema.fields.push(newField);
  DesignerState.isDirty = true;

  renderFieldsList();
  renderFieldsTable();
  renderSchema();

  // Auto-select the new field
  selectField(newField.id);
}

/**
 * Update field
 */
function updateField(fieldId, updates) {
  const field = DesignerState.entity.schema.fields.find(f => f.id === fieldId);
  if (!field) return;

  Object.assign(field, updates);
  DesignerState.isDirty = true;

  renderFieldsList();
  renderFieldsTable();
  renderSchema();
}

/**
 * Delete field
 */
function deleteField(fieldId) {
  if (!confirm('Are you sure you want to delete this field?')) {
    return;
  }

  DesignerState.entity.schema.fields = DesignerState.entity.schema.fields.filter(
    f => f.id !== fieldId
  );
  DesignerState.isDirty = true;

  if (DesignerState.selectedField === fieldId) {
    DesignerState.selectedField = null;
    showEmptyProperties();
  }

  renderFieldsList();
  renderFieldsTable();
  renderSchema();
}

/**
 * Move field up in the list
 */
function moveFieldUp(fieldId) {
  const fields = DesignerState.entity.schema.fields;
  const index = fields.findIndex(f => f.id === fieldId);

  if (index <= 0) return; // Already at top or not found

  // Swap with previous field
  [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];

  DesignerState.isDirty = true;
  renderFieldsList();
  renderFieldsTable();
  renderSchema();
}

/**
 * Move field down in the list
 */
function moveFieldDown(fieldId) {
  const fields = DesignerState.entity.schema.fields;
  const index = fields.findIndex(f => f.id === fieldId);

  if (index < 0 || index >= fields.length - 1) return; // Already at bottom or not found

  // Swap with next field
  [fields[index], fields[index + 1]] = [fields[index + 1], fields[index]];

  DesignerState.isDirty = true;
  renderFieldsList();
  renderFieldsTable();
  renderSchema();
}

/**
 * Select field
 */
function selectField(fieldId) {
  DesignerState.selectedField = fieldId;
  const field = DesignerState.entity.schema.fields.find(f => f.id === fieldId);

  if (field) {
    renderFieldProperties(field);
  }

  // Update selected state in list
  document.querySelectorAll('.field-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.fieldId === fieldId);
  });
}

// ============================================================================
// RELATIONSHIP OPERATIONS
// ============================================================================

/**
 * Add new relationship
 */
function addRelationship() {
  const newRelationship = {
    id: generateFieldId(),
    name: `relationship_${DesignerState.entity.schema.relationships.length + 1}`,
    type: 'oneToMany',
    targetEntity: '',
    foreignKey: '',
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  };

  DesignerState.entity.schema.relationships.push(newRelationship);
  DesignerState.isDirty = true;

  renderRelationshipsTable();
  renderSchema();
}

/**
 * Delete relationship
 */
function deleteRelationship(relationshipId) {
  if (!confirm('Are you sure you want to delete this relationship?')) {
    return;
  }

  DesignerState.entity.schema.relationships = DesignerState.entity.schema.relationships.filter(
    r => r.id !== relationshipId
  );
  DesignerState.isDirty = true;

  renderRelationshipsTable();
  renderSchema();
  showToast('Relationship deleted', 'success');
}

// ============================================================================
// INDEX OPERATIONS
// ============================================================================

/**
 * Add new index
 */
function addIndex() {
  const newIndex = {
    id: generateFieldId(),
    name: `idx_${DesignerState.entity.name || 'entity'}_${DesignerState.entity.indexes.length + 1}`,
    type: 'index',
    fields: [],
    unique: false
  };

  DesignerState.entity.indexes.push(newIndex);
  DesignerState.isDirty = true;

  renderIndexesTable();
  renderSchema();
}

/**
 * Delete index
 */
function deleteIndex(indexId) {
  if (!confirm('Are you sure you want to delete this index?')) {
    return;
  }

  DesignerState.entity.indexes = DesignerState.entity.indexes.filter(
    i => i.id !== indexId
  );
  DesignerState.isDirty = true;

  renderIndexesTable();
  renderSchema();
  showToast('Index deleted', 'success');
}

// ============================================================================
// RENDERING FUNCTIONS
// ============================================================================

/**
 * Render fields list (left sidebar)
 */
function renderFieldsList() {
  const list = document.getElementById('fieldsList');
  list.innerHTML = '';

  if (DesignerState.entity.schema.fields.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 2rem 1rem; color: var(--text-secondary);">
        <i class="fas fa-inbox" style="font-size: 2rem; opacity: 0.5; margin-bottom: 0.5rem;"></i>
        <p style="font-size: 0.875rem;">No fields yet</p>
        <p style="font-size: 0.75rem;">Click "Add Field" to get started</p>
      </div>
    `;
    return;
  }

  DesignerState.entity.schema.fields.forEach(field => {
    const item = createFieldListItem(field);
    list.appendChild(item);
  });
}

/**
 * Create field list item
 */
function createFieldListItem(field) {
  const div = document.createElement('div');
  div.className = 'field-item';
  if (DesignerState.selectedField === field.id) {
    div.classList.add('selected');
  }
  div.dataset.fieldId = field.id;
  div.onclick = () => selectField(field.id);

  const dataType = DATA_TYPES.find(t => t.value === field.dataType) || DATA_TYPES[0];
  const badges = [];

  if (field.primaryKey) badges.push('<span class="field-badge primary">PK</span>');
  if (field.required) badges.push('<span class="field-badge required">Required</span>');
  if (field.unique) badges.push('<span class="field-badge">Unique</span>');
  if (field.indexed) badges.push('<span class="field-badge">Indexed</span>');

  div.innerHTML = `
    <div class="field-name">
      <span>${escapeHtml(field.displayName)}</span>
      <i class="fas fa-chevron-right" style="font-size: 0.75rem; color: var(--text-tertiary);"></i>
    </div>
    <div class="field-type">
      <i class="fas ${dataType.icon}"></i>
      ${dataType.label}
    </div>
    ${badges.length > 0 ? `<div class="field-badges">${badges.join('')}</div>` : ''}
  `;

  return div;
}

/**
 * Render fields table (center area)
 */
function renderFieldsTable() {
  const tbody = document.getElementById('fieldsTableBody');
  tbody.innerHTML = '';

  if (DesignerState.entity.schema.fields.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          No fields defined yet
        </td>
      </tr>
    `;
    return;
  }

  DesignerState.entity.schema.fields.forEach(field => {
    const row = createFieldTableRow(field);
    tbody.appendChild(row);
  });
}

/**
 * Create field table row
 */
function createFieldTableRow(field) {
  const tr = document.createElement('tr');
  const fieldIndex = DesignerState.entity.schema.fields.findIndex(f => f.id === field.id);
  const isFirst = fieldIndex === 0;
  const isLast = fieldIndex === DesignerState.entity.schema.fields.length - 1;

  const dataType = DATA_TYPES.find(t => t.value === field.dataType) || DATA_TYPES[0];

  tr.innerHTML = `
    <td style="width: 80px; text-align: center;">
      <div style="display: flex; flex-direction: column; gap: 0.25rem; align-items: center;">
        <button
          class="btn btn-secondary"
          style="padding: 0.125rem 0.375rem; font-size: 0.75rem; ${isFirst ? 'opacity: 0.3; cursor: not-allowed;' : ''}"
          onclick="event.stopPropagation(); moveFieldUp('${field.id}')"
          ${isFirst ? 'disabled' : ''}
          title="Move up">
          <i class="fas fa-chevron-up"></i>
        </button>
        <button
          class="btn btn-secondary"
          style="padding: 0.125rem 0.375rem; font-size: 0.75rem; ${isLast ? 'opacity: 0.3; cursor: not-allowed;' : ''}"
          onclick="event.stopPropagation(); moveFieldDown('${field.id}')"
          ${isLast ? 'disabled' : ''}
          title="Move down">
          <i class="fas fa-chevron-down"></i>
        </button>
      </div>
    </td>
    <td onclick="selectField('${field.id}')" style="cursor: pointer;">
      <strong>${escapeHtml(field.displayName)}</strong>
      <br>
      <small style="color: var(--text-secondary);">${escapeHtml(field.name)}</small>
    </td>
    <td onclick="selectField('${field.id}')" style="cursor: pointer;">
      <i class="fas ${dataType.icon}"></i>
      ${dataType.label}
    </td>
    <td onclick="selectField('${field.id}')" style="cursor: pointer;">${field.required ? '<i class="fas fa-check" style="color: var(--success);"></i>' : '-'}</td>
    <td onclick="selectField('${field.id}')" style="cursor: pointer;">${field.unique ? '<i class="fas fa-check" style="color: var(--success);"></i>' : '-'}</td>
    <td onclick="selectField('${field.id}')" style="cursor: pointer;">${field.indexed ? '<i class="fas fa-check" style="color: var(--success);"></i>' : '-'}</td>
    <td onclick="selectField('${field.id}')" style="cursor: pointer;"><code>${field.defaultValue !== null ? field.defaultValue : '-'}</code></td>
  `;

  return tr;
}

/**
 * Render relationships table
 */
function renderRelationshipsTable() {
  const tbody = document.getElementById('relationshipsTableBody');
  tbody.innerHTML = '';

  if (!DesignerState.entity.schema.relationships || DesignerState.entity.schema.relationships.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          No relationships defined yet
        </td>
      </tr>
    `;
    return;
  }

  DesignerState.entity.schema.relationships.forEach(rel => {
    const relType = RELATIONSHIP_TYPES.find(t => t.value === rel.type) || RELATIONSHIP_TYPES[1];
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td><strong>${escapeHtml(rel.name)}</strong></td>
      <td>
        <i class="fas ${relType.icon}"></i>
        ${relType.label}
      </td>
      <td>${escapeHtml(rel.targetEntity || '-')}</td>
      <td><code>${escapeHtml(rel.foreignKey || '-')}</code></td>
      <td>
        <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="deleteRelationship('${rel.id}')">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Render indexes table
 */
function renderIndexesTable() {
  const tbody = document.getElementById('indexesTableBody');
  tbody.innerHTML = '';

  if (!DesignerState.entity.indexes || DesignerState.entity.indexes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          No indexes defined yet
        </td>
      </tr>
    `;
    return;
  }

  DesignerState.entity.indexes.forEach(idx => {
    const idxType = INDEX_TYPES.find(t => t.value === idx.type) || INDEX_TYPES[2];
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td><strong>${escapeHtml(idx.name)}</strong></td>
      <td>
        <i class="fas ${idxType.icon}"></i>
        ${idxType.label}
      </td>
      <td>${idx.fields && idx.fields.length > 0 ? idx.fields.join(', ') : '-'}</td>
      <td>${idx.unique ? '<i class="fas fa-check" style="color: var(--success);"></i>' : '-'}</td>
      <td>
        <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="deleteIndex('${idx.id}')">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/**
 * Render field properties (right sidebar)
 */
function renderFieldProperties(field) {
  const content = document.getElementById('propertiesContent');

  const dataTypeOptions = DATA_TYPES.map(dt =>
    `<option value="${dt.value}" ${field.dataType === dt.value ? 'selected' : ''}>${dt.label}</option>`
  ).join('');

  content.innerHTML = `
    <div class="property-group">
      <div class="property-group-title">Basic Information</div>

      <div class="form-group">
        <label class="form-label">Field Name</label>
        <input
          type="text"
          class="form-input"
          id="propFieldName"
          value="${escapeHtml(field.name)}"
          pattern="[a-zA-Z][a-zA-Z0-9_]*"
        >
        <small style="color: var(--text-secondary); font-size: 0.75rem;">
          Database column name (letters, numbers, underscores)
        </small>
      </div>

      <div class="form-group">
        <label class="form-label">Display Name</label>
        <input
          type="text"
          class="form-input"
          id="propDisplayName"
          value="${escapeHtml(field.displayName)}"
        >
      </div>

      <div class="form-group">
        <label class="form-label">Data Type</label>
        <select class="form-select" id="propDataType">
          ${dataTypeOptions}
        </select>
      </div>
    </div>

    <div class="property-group">
      <div class="property-group-title">Constraints</div>

      <div class="form-group">
        <div class="form-checkbox">
          <input
            type="checkbox"
            id="propRequired"
            ${field.required ? 'checked' : ''}
          >
          <label for="propRequired">Required</label>
        </div>
      </div>

      <div class="form-group">
        <div class="form-checkbox">
          <input
            type="checkbox"
            id="propUnique"
            ${field.unique ? 'checked' : ''}
          >
          <label for="propUnique">Unique</label>
        </div>
      </div>

      <div class="form-group">
        <div class="form-checkbox">
          <input
            type="checkbox"
            id="propIndexed"
            ${field.indexed ? 'checked' : ''}
          >
          <label for="propIndexed">Indexed</label>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Default Value</label>
        <input
          type="text"
          class="form-input"
          id="propDefaultValue"
          value="${field.defaultValue !== null ? escapeHtml(String(field.defaultValue)) : ''}"
          placeholder="null"
          ${field.calculated ? 'disabled' : ''}
        >
      </div>
    </div>

    <div class="property-group">
      <div class="property-group-title">Advanced</div>

      <div class="form-group">
        <div class="form-checkbox">
          <input
            type="checkbox"
            id="propCalculated"
            ${field.calculated ? 'checked' : ''}
          >
          <label for="propCalculated">Calculated Field</label>
        </div>
        <small style="color: var(--text-secondary); font-size: 0.75rem; display: block; margin-top: 0.25rem;">
          Value computed from JSONLex expression
        </small>
      </div>

      <div id="calculatedFieldConfig" style="display: ${field.calculated ? 'block' : 'none'}; margin-top: 0.75rem;">
        <div class="form-group">
          <label class="form-label">JSONLex Expression</label>
          <textarea
            class="form-input"
            id="propCalculatedExpression"
            rows="4"
            placeholder="e.g., $.firstName + ' ' + $.lastName"
            style="font-family: 'Courier New', monospace; font-size: 0.875rem;"
          >${field.calculatedExpression || ''}</textarea>
          <small style="color: var(--text-secondary); font-size: 0.75rem;">
            Use $ to reference other fields. Updates automatically when dependencies change.
          </small>
        </div>
      </div>
    </div>

    ${field.dataType === 'enum' ? `
    <div class="property-group">
      <div class="property-group-title">
        Enum Values
        <button
          type="button"
          class="btn btn-secondary"
          style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin-left: auto;"
          onclick="addEnumValue('${field.id}')">
          <i class="fas fa-plus"></i> Add Value
        </button>
      </div>

      <div id="enumValuesContainer">
        ${renderEnumValues(field)}
      </div>
    </div>
    ` : ''}

    <div class="property-group">
      <div class="property-group-title">Validation</div>

      ${renderValidationFields(field)}
    </div>

    <div class="property-group">
      <button class="delete-field-btn" onclick="deleteField('${field.id}')">
        <i class="fas fa-trash"></i>
        Delete Field
      </button>
    </div>
  `;

  // Add event listeners
  addPropertyEventListeners(field);
}

/**
 * Render validation fields based on data type
 */
function renderValidationFields(field) {
  const validation = field.validation || {};

  switch (field.dataType) {
    case 'string':
      return `
        <div class="form-group">
          <label class="form-label">Min Length</label>
          <input
            type="number"
            class="form-input"
            id="propMinLength"
            value="${validation.minLength || ''}"
            min="0"
          >
        </div>
        <div class="form-group">
          <label class="form-label">Max Length</label>
          <input
            type="number"
            class="form-input"
            id="propMaxLength"
            value="${validation.maxLength || ''}"
            min="0"
          >
        </div>
        <div class="form-group">
          <label class="form-label">Pattern (Regex)</label>
          <input
            type="text"
            class="form-input"
            id="propPattern"
            value="${validation.pattern || ''}"
            placeholder="^[A-Za-z0-9]+$"
          >
        </div>
      `;

    case 'integer':
    case 'float':
      return `
        <div class="form-group">
          <label class="form-label">Minimum Value</label>
          <input
            type="number"
            class="form-input"
            id="propMin"
            value="${validation.min || ''}"
          >
        </div>
        <div class="form-group">
          <label class="form-label">Maximum Value</label>
          <input
            type="number"
            class="form-input"
            id="propMax"
            value="${validation.max || ''}"
          >
        </div>
      `;

    case 'enum':
      return `
        <div class="form-group">
          <label class="form-label">Enum Values (comma-separated)</label>
          <textarea
            class="form-textarea"
            id="propEnumValues"
            placeholder="value1, value2, value3"
          >${validation.enumValues ? validation.enumValues.join(', ') : ''}</textarea>
        </div>
      `;

    default:
      return '<p style="color: var(--text-secondary); font-size: 0.875rem;">No validation options for this data type</p>';
  }
}

/**
 * Add event listeners to property inputs
 */
function addPropertyEventListeners(field) {
  // Basic properties
  const inputs = {
    propFieldName: 'name',
    propDisplayName: 'displayName',
    propDataType: 'dataType',
    propDefaultValue: 'defaultValue'
  };

  Object.entries(inputs).forEach(([id, prop]) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', (e) => {
        updateField(field.id, { [prop]: e.target.value || null });
      });
    }
  });

  // Checkboxes
  ['propRequired', 'propUnique', 'propIndexed'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', (e) => {
        const prop = id.replace('prop', '').charAt(0).toLowerCase() + id.replace('prop', '').slice(1);
        updateField(field.id, { [prop]: e.target.checked });
      });
    }
  });

  // Calculated field checkbox
  const calculatedEl = document.getElementById('propCalculated');
  if (calculatedEl) {
    calculatedEl.addEventListener('change', (e) => {
      const calculated = e.target.checked;
      updateField(field.id, { calculated });

      // Show/hide expression config
      const config = document.getElementById('calculatedFieldConfig');
      if (config) {
        config.style.display = calculated ? 'block' : 'none';
      }

      // Disable default value if calculated
      const defaultValueEl = document.getElementById('propDefaultValue');
      if (defaultValueEl) {
        defaultValueEl.disabled = calculated;
        if (calculated) {
          defaultValueEl.value = '';
          updateField(field.id, { defaultValue: null });
        }
      }
    });
  }

  // Calculated expression
  const expressionEl = document.getElementById('propCalculatedExpression');
  if (expressionEl) {
    expressionEl.addEventListener('change', (e) => {
      updateField(field.id, { calculatedExpression: e.target.value || null });
    });
  }

  // Validation fields
  const validationInputs = ['propMinLength', 'propMaxLength', 'propPattern', 'propMin', 'propMax'];
  validationInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', (e) => {
        const prop = id.replace('prop', '').charAt(0).toLowerCase() + id.replace('prop', '').slice(1);
        const validation = { ...field.validation };
        validation[prop] = e.target.value || null;
        updateField(field.id, { validation });
      });
    }
  });

  // Enum values
  const enumEl = document.getElementById('propEnumValues');
  if (enumEl) {
    enumEl.addEventListener('change', (e) => {
      const values = e.target.value.split(',').map(v => v.trim()).filter(v => v);
      const validation = { ...field.validation, enumValues: values };
      updateField(field.id, { validation });
    });
  }
}

/**
 * Show empty properties panel
 */
function showEmptyProperties() {
  const content = document.getElementById('propertiesContent');
  content.innerHTML = `
    <div class="empty-properties">
      <div class="empty-icon">
        <i class="fas fa-hand-pointer"></i>
      </div>
      <p>Select a field to edit its properties</p>
    </div>
  `;
}

/**
 * Render enum values
 */
function renderEnumValues(field) {
  const enumValues = field.enumValues || [];

  if (enumValues.length === 0) {
    return `
      <div style="text-align: center; padding: 1rem; color: var(--text-secondary); font-size: 0.875rem;">
        No enum values defined. Click "Add Value" to create one.
      </div>
    `;
  }

  return `
    <table style="width: 100%; border-collapse: collapse; margin-top: 0.5rem;">
      <thead style="background: var(--bg-secondary);">
        <tr>
          <th style="padding: 0.5rem; border: 1px solid var(--border-color); text-align: left; font-size: 0.813rem;">Value</th>
          <th style="padding: 0.5rem; border: 1px solid var(--border-color); text-align: left; font-size: 0.813rem;">Label</th>
          <th style="padding: 0.5rem; border: 1px solid var(--border-color); text-align: center; width: 100px; font-size: 0.813rem;">Color</th>
          <th style="padding: 0.5rem; border: 1px solid var(--border-color); text-align: center; width: 60px; font-size: 0.813rem;">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${enumValues.map((ev, index) => `
          <tr>
            <td style="padding: 0.5rem; border: 1px solid var(--border-color);"><code>${escapeHtml(ev.value)}</code></td>
            <td style="padding: 0.5rem; border: 1px solid var(--border-color);">${escapeHtml(ev.label)}</td>
            <td style="padding: 0.5rem; border: 1px solid var(--border-color); text-align: center;">
              <div style="width: 20px; height: 20px; background: ${ev.color || '#6B7280'}; border-radius: 4px; margin: 0 auto; border: 1px solid var(--border-color);"></div>
            </td>
            <td style="padding: 0.5rem; border: 1px solid var(--border-color); text-align: center;">
              <button
                class="btn btn-secondary"
                style="padding: 0.125rem 0.375rem; font-size: 0.75rem;"
                onclick="event.stopPropagation(); deleteEnumValue('${field.id}', ${index})"
                title="Delete">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Add enum value
 */
function addEnumValue(fieldId) {
  const field = DesignerState.entity.schema.fields.find(f => f.id === fieldId);
  if (!field) return;

  if (!field.enumValues) {
    field.enumValues = [];
  }

  const value = prompt('Enter enum value (e.g., "active"):');
  if (!value) return;

  const label = prompt('Enter display label (e.g., "Active"):', value);
  if (!label) return;

  const color = prompt('Enter color (hex code, e.g., "#10B981"):', '#6B7280');

  field.enumValues.push({ value, label, color: color || '#6B7280' });

  DesignerState.isDirty = true;
  renderFieldProperties(field);
  renderSchema();
}

/**
 * Delete enum value
 */
function deleteEnumValue(fieldId, index) {
  if (!confirm('Are you sure you want to delete this enum value?')) {
    return;
  }

  const field = DesignerState.entity.schema.fields.find(f => f.id === fieldId);
  if (!field || !field.enumValues) return;

  field.enumValues.splice(index, 1);

  DesignerState.isDirty = true;
  renderFieldProperties(field);
  renderSchema();
}

/**
 * Render schema (code view)
 */
function renderSchema() {
  const schemaCode = document.getElementById('schemaCode');
  const schema = JSON.stringify(DesignerState.entity.schema, null, 2);
  schemaCode.textContent = schema;
}

// ============================================================================
// VIEW MANAGEMENT
// ============================================================================

/**
 * Switch view (fields/relationships/indexes/schema)
 */
function switchView(view) {
  DesignerState.currentView = view;

  // Update tabs
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });

  // Show/hide views
  document.getElementById('fieldsView').classList.toggle('hidden', view !== 'fields');
  document.getElementById('relationshipsView').classList.toggle('hidden', view !== 'relationships');
  document.getElementById('indexesView').classList.toggle('hidden', view !== 'indexes');
  document.getElementById('schemaView').classList.toggle('hidden', view !== 'schema');

  // Render appropriate view
  if (view === 'relationships') {
    renderRelationshipsTable();
  } else if (view === 'indexes') {
    renderIndexesTable();
  } else if (view === 'schema') {
    renderSchema();
  }
}

// ============================================================================
// THEME & UTILITIES
// ============================================================================

/**
 * Toggle theme
 */
function toggleTheme() {
  const html = document.documentElement;
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
}

/**
 * Load theme
 */
function loadTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

/**
 * Show toast
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle'
  };

  toast.innerHTML = `
    <i class="fas ${icons[type]} toast-icon"></i>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Generate field ID
 */
function generateFieldId() {
  return 'field_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Generate entity name from display name
 */
function generateEntityName(displayName) {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Get app ID from URL
 */
function getAppIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('appId') || 'mock-app-id';
}

/**
 * Get entity ID from URL
 */
function getEntityIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('entityId');
}

/**
 * Get user ID for authentication
 * TODO: Replace with actual authentication system
 */
function getUserId() {
  // Check if userId is in URL parameters (for development/testing)
  const params = new URLSearchParams(window.location.search);
  const urlUserId = params.get('userId');
  if (urlUserId) return urlUserId;

  // Check localStorage
  const storedUserId = localStorage.getItem('userId');
  if (storedUserId) return storedUserId;

  // Generate and store a mock userId for development
  const mockUserId = 'dev-user-' + Math.random().toString(36).substr(2, 9);
  localStorage.setItem('userId', mockUserId);
  console.warn('[DEV] Using mock userId:', mockUserId);
  return mockUserId;
}

/**
 * Start auto-save
 */
function startAutoSave() {
  DesignerState.autoSaveInterval = setInterval(() => {
    if (DesignerState.isDirty) {
      saveEntity();
    }
  }, 30000); // 30 seconds
}

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Load theme
  loadTheme();

  // Load entity if editing
  const entityId = getEntityIdFromUrl();
  if (entityId) {
    loadEntity(entityId);
  } else {
    renderFieldsList();
    renderFieldsTable();
    renderSchema();
  }

  // Event listeners
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  document.getElementById('addFieldBtn').addEventListener('click', addField);
  document.getElementById('addRelationshipBtn').addEventListener('click', addRelationship);
  document.getElementById('addIndexBtn').addEventListener('click', addIndex);
  document.getElementById('saveBtn').addEventListener('click', saveEntity);
  document.getElementById('generateApiBtn').addEventListener('click', generateAPI);

  document.getElementById('backBtn').addEventListener('click', () => {
    const appId = DesignerState.applicationId || getAppIdFromUrl();
    window.location.href = `/lowcode/applications?appId=${appId}`;
  });

  document.getElementById('entityDisplayName').addEventListener('change', (e) => {
    DesignerState.entity.displayName = e.target.value;
    DesignerState.entity.name = generateEntityName(e.target.value);
    DesignerState.isDirty = true;
  });

  // View tabs
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchView(tab.dataset.view);
    });
  });

  // Start auto-save
  startAutoSave();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + S: Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveEntity();
    }

    // Ctrl/Cmd + N: New field
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      addField();
    }
  });
});
