/**
 * ═══════════════════════════════════════════════════════════
 * Entity Designer Pro - Enhanced Entity Designer
 * Real-time collaborative entity schema designer with Socket.IO
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // State Management
  // ═══════════════════════════════════════════════════════════

  const state = {
    applicationId: null,
    entities: [],
    currentEntity: null,
    currentField: null,
    currentFieldIndex: null,
    currentRelationshipIndex: null,
    currentIndexIndex: null,
    currentView: 'fields',
    currentFormat: 'json',
    socket: null,
    connected: false,
    editMode: 'create', // 'create' or 'edit'
    d3Simulation: null,
    // Field modal state
    currentEnumValues: null,
    currentJSONSchema: null,
    // Entity locking state
    isLocked: false,
    isReadOnly: false,
    isTemplate: false,
    currentUser: null  // Populated from session/auth
  };

  // ═══════════════════════════════════════════════════════════
  // Initialization
  // ═══════════════════════════════════════════════════════════

  function init() {
    // Get application ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    state.applicationId = urlParams.get('appId');

    if (!state.applicationId) {
      showError('Application ID is required');
      return;
    }

    // Initialize Socket.IO
    initializeSocketIO();

    // Load entities
    loadEntities();

    // Setup event listeners
    setupEventListeners();

    console.log('Entity Designer Pro initialized');
  }

  // ═══════════════════════════════════════════════════════════
  // Socket.IO Integration
  // ═══════════════════════════════════════════════════════════

  function initializeSocketIO() {
    state.socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    state.socket.on('connect', () => {
      state.connected = true;
      updateConnectionStatus(true);
      console.log('Socket.IO connected');

      // Join application room
      if (state.applicationId) {
        state.socket.emit('join:application', state.applicationId);
      }
    });

    state.socket.on('disconnect', () => {
      state.connected = false;
      updateConnectionStatus(false);
      console.log('Socket.IO disconnected');
    });

    // Entity events
    state.socket.on('entity:created', handleEntityCreated);
    state.socket.on('entity:updated', handleEntityUpdated);
    state.socket.on('entity:deleted', handleEntityDeleted);

    // Field events
    state.socket.on('field:added', handleFieldAdded);
    state.socket.on('field:updated', handleFieldUpdated);
    state.socket.on('field:deleted', handleFieldDeleted);
  }

  function updateConnectionStatus(connected) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (statusDot && statusText) {
      if (connected) {
        statusDot.classList.add('connected');
        statusText.textContent = 'Connected';
      } else {
        statusDot.classList.remove('connected');
        statusText.textContent = 'Disconnected';
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Socket.IO Event Handlers
  // ═══════════════════════════════════════════════════════════

  function handleEntityCreated(data) {
    console.log('Entity created:', data);
    state.entities.push(data.entity);
    renderEntityList();
    showToast('Entity created successfully', 'success');
  }

  function handleEntityUpdated(data) {
    console.log('Entity updated:', data);
    const index = state.entities.findIndex(e => e.id === data.entity.id);
    if (index !== -1) {
      state.entities[index] = data.entity;
      renderEntityList();

      if (state.currentEntity && state.currentEntity.id === data.entity.id) {
        state.currentEntity = data.entity;
        renderCurrentView();
      }
    }
    showToast('Entity updated successfully', 'success');
  }

  function handleEntityDeleted(data) {
    console.log('Entity deleted:', data);
    state.entities = state.entities.filter(e => e.id !== data.entityId);
    renderEntityList();

    if (state.currentEntity && state.currentEntity.id === data.entityId) {
      state.currentEntity = null;
      renderCurrentView();
    }
    showToast('Entity deleted successfully', 'success');
  }

  function handleFieldAdded(data) {
    console.log('Field added:', data);
    if (state.currentEntity && state.currentEntity.id === data.entityId) {
      loadEntity(data.entityId);
    }
  }

  function handleFieldUpdated(data) {
    console.log('Field updated:', data);
    if (state.currentEntity && state.currentEntity.id === data.entityId) {
      loadEntity(data.entityId);
    }
  }

  function handleFieldDeleted(data) {
    console.log('Field deleted:', data);
    if (state.currentEntity && state.currentEntity.id === data.entityId) {
      loadEntity(data.entityId);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Event Listeners
  // ═══════════════════════════════════════════════════════════

  function setupEventListeners() {
    // Entity search
    const entitySearch = document.getElementById('entitySearch');
    if (entitySearch) {
      entitySearch.addEventListener('input', handleEntitySearch);
    }

    // Add entity button
    const addEntityBtn = document.getElementById('addEntityBtn');
    if (addEntityBtn) {
      addEntityBtn.addEventListener('click', openEntityModal);
    }

    // Tab switching (using class name 'view-tab' instead of 'tab-btn')
    document.querySelectorAll('.view-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const view = e.target.dataset.view || e.target.closest('.view-tab').dataset.view;
        if (view) {
          switchView(view);
        }
      });
    });

    // Format tabs
    document.querySelectorAll('.format-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const format = e.target.dataset.format;
        if (format) {
          switchFormat(format);
        }
      });
    });

    // Add field button
    const addFieldBtn = document.getElementById('addFieldBtn');
    if (addFieldBtn) {
      addFieldBtn.addEventListener('click', () => openFieldModal());
    }

    // Entity modal
    const entityModalClose = document.getElementById('entityModalClose');
    const entityModalCancel = document.getElementById('entityModalCancel');
    const entityModalSave = document.getElementById('entityModalSave');
    if (entityModalClose) entityModalClose.addEventListener('click', closeEntityModal);
    if (entityModalCancel) entityModalCancel.addEventListener('click', closeEntityModal);
    if (entityModalSave) entityModalSave.addEventListener('click', saveEntity);

    // Field modal
    const fieldModalClose = document.getElementById('fieldModalClose');
    const fieldModalCancel = document.getElementById('fieldModalCancel');
    const fieldModalSave = document.getElementById('fieldModalSave');
    if (fieldModalClose) fieldModalClose.addEventListener('click', closeFieldModal);
    if (fieldModalCancel) fieldModalCancel.addEventListener('click', closeFieldModal);
    if (fieldModalSave) fieldModalSave.addEventListener('click', saveField);

    // Relationship modal
    const relationshipModalClose = document.getElementById('relationshipModalClose');
    const relationshipModalCancel = document.getElementById('relationshipModalCancel');
    const relationshipModalSave = document.getElementById('relationshipModalSave');
    if (relationshipModalClose) relationshipModalClose.addEventListener('click', closeRelationshipModal);
    if (relationshipModalCancel) relationshipModalCancel.addEventListener('click', closeRelationshipModal);
    if (relationshipModalSave) relationshipModalSave.addEventListener('click', saveRelationship);

    // Index modal
    const indexModalClose = document.getElementById('indexModalClose');
    const indexModalCancel = document.getElementById('indexModalCancel');
    const indexModalSave = document.getElementById('indexModalSave');
    if (indexModalClose) indexModalClose.addEventListener('click', closeIndexModal);
    if (indexModalCancel) indexModalCancel.addEventListener('click', closeIndexModal);
    if (indexModalSave) indexModalSave.addEventListener('click', saveIndex);

    // Add relationship button
    const addRelationshipBtn = document.getElementById('addRelationshipBtn');
    if (addRelationshipBtn) {
      addRelationshipBtn.addEventListener('click', () => openRelationshipModal());
    }

    // Add index button
    const addIndexBtn = document.getElementById('addIndexBtn');
    if (addIndexBtn) {
      addIndexBtn.addEventListener('click', () => openIndexModal());
    }

    // Entity locking controls
    const toggleLockBtn = document.getElementById('toggleLockBtn');
    if (toggleLockBtn) {
      toggleLockBtn.addEventListener('click', toggleEntityLock);
    }

    const toggleReadOnlyBtn = document.getElementById('toggleReadOnlyBtn');
    if (toggleReadOnlyBtn) {
      toggleReadOnlyBtn.addEventListener('click', toggleEntityReadOnly);
    }

    const saveAsTemplateBtn = document.getElementById('saveAsTemplateBtn');
    if (saveAsTemplateBtn) {
      saveAsTemplateBtn.addEventListener('click', saveAsTemplate);
    }

    const entitySettingsBtn = document.getElementById('entitySettingsBtn');
    if (entitySettingsBtn) {
      entitySettingsBtn.addEventListener('click', openEntitySettingsModal);
    }

    // Entity settings modal
    const entitySettingsModalClose = document.getElementById('entitySettingsModalClose');
    const entitySettingsCancel = document.getElementById('entitySettingsCancel');
    const entitySettingsSave = document.getElementById('entitySettingsSave');
    if (entitySettingsModalClose) entitySettingsModalClose.addEventListener('click', closeEntitySettingsModal);
    if (entitySettingsCancel) entitySettingsCancel.addEventListener('click', closeEntitySettingsModal);
    if (entitySettingsSave) entitySettingsSave.addEventListener('click', saveEntitySettings);

    // Template checkbox handler
    const entityIsTemplate = document.getElementById('entityIsTemplate');
    if (entityIsTemplate) {
      entityIsTemplate.addEventListener('change', handleTemplateCheckboxChange);
    }

    // Locked checkbox handler
    const entityLocked = document.getElementById('entityLocked');
    if (entityLocked) {
      entityLocked.addEventListener('change', handleLockedCheckboxChange);
    }

    // Relationship modal dynamic sections
    setupRelationshipModalListeners();
  }

  function setupRelationshipModalListeners() {
    // Relationship type change handler
    const relTypeSelect = document.getElementById('modalRelationshipType');
    if (relTypeSelect) {
      relTypeSelect.addEventListener('change', handleRelationshipTypeChange);
    }

    // onInsert trigger change handler
    const onInsertSelect = document.getElementById('modalRelationshipOnInsert');
    if (onInsertSelect) {
      onInsertSelect.addEventListener('change', handleOnInsertChange);
    }

    // Bidirectional checkbox handler
    const bidirectionalCheckbox = document.getElementById('modalRelationshipBidirectional');
    if (bidirectionalCheckbox) {
      bidirectionalCheckbox.addEventListener('change', handleBidirectionalChange);
    }
  }

  function setupFieldModalListeners() {
    // Field type change handler
    const fieldTypeSelect = document.getElementById('modalFieldType');
    if (fieldTypeSelect) {
      fieldTypeSelect.addEventListener('change', (e) => {
        updateFieldConfigSections(e.target.value);
      });
    }

    // UUID trigger change handler
    const uuidTriggerSelect = document.getElementById('modalFieldUUIDTrigger');
    if (uuidTriggerSelect) {
      uuidTriggerSelect.addEventListener('change', handleUUIDTriggerChange);
    }

    // Calculated checkbox handler
    const calculatedCheckbox = document.getElementById('modalFieldCalculated');
    if (calculatedCheckbox) {
      calculatedCheckbox.addEventListener('change', handleCalculatedChange);
    }

    // Enum editor button
    const openEnumEditorBtn = document.getElementById('openEnumEditorBtn');
    if (openEnumEditorBtn) {
      openEnumEditorBtn.addEventListener('click', () => openEnumEditorModal());
    }

    // JSON schema builder button
    const openJSONEditorBtn = document.getElementById('openJSONEditorBtn');
    if (openJSONEditorBtn) {
      openJSONEditorBtn.addEventListener('click', () => openJSONSchemaModal());
    }

    // Expression builder button
    const openExpressionBuilderBtn = document.getElementById('openExpressionBuilderBtn');
    if (openExpressionBuilderBtn) {
      openExpressionBuilderBtn.addEventListener('click', () => openExpressionBuilderModal());
    }
  }

  function handleUUIDTriggerChange(e) {
    const trigger = e.target.value;
    const uuidFunctionGroup = document.getElementById('uuidFunctionGroup');

    if (uuidFunctionGroup) {
      if (trigger === 'function') {
        uuidFunctionGroup.style.display = 'block';
      } else {
        uuidFunctionGroup.style.display = 'none';
      }
    }
  }

  function handleCalculatedChange(e) {
    const isChecked = e.target.checked;
    const calculatedExpressionGroup = document.getElementById('calculatedExpressionGroup');

    if (calculatedExpressionGroup) {
      if (isChecked) {
        calculatedExpressionGroup.style.display = 'block';
      } else {
        calculatedExpressionGroup.style.display = 'none';
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Field Type Helpers
  // ═══════════════════════════════════════════════════════════

  function isStringType(type) {
    return ['String', 'Text', 'Char', 'Email', 'URL', 'Phone'].includes(type);
  }

  function isNumberType(type) {
    return ['Integer', 'BigInt', 'Decimal', 'Float', 'Double'].includes(type);
  }

  function isDateType(type) {
    return ['Date', 'DateTime', 'Time', 'Timestamp'].includes(type);
  }

  function requiresPrecision(type) {
    return type === 'Decimal';
  }

  function supportsAutoIncrement(type) {
    return ['Integer', 'BigInt'].includes(type);
  }

  // ═══════════════════════════════════════════════════════════
  // Dynamic Field Configuration Sections
  // ═══════════════════════════════════════════════════════════

  function updateFieldConfigSections(fieldType) {
    // Hide all sections first
    const sections = {
      stringConfigSection: document.getElementById('stringConfigSection'),
      numberConfigSection: document.getElementById('numberConfigSection'),
      precisionScaleRow: document.getElementById('precisionScaleRow'),
      autoIncrementOption: document.getElementById('autoIncrementOption'),
      dateConfigSection: document.getElementById('dateConfigSection'),
      uuidConfigSection: document.getElementById('uuidConfigSection'),
      enumConfigSection: document.getElementById('enumConfigSection'),
      jsonConfigSection: document.getElementById('jsonConfigSection'),
      colorConfigSection: document.getElementById('colorConfigSection')
    };

    // Hide all sections
    Object.values(sections).forEach(section => {
      if (section) section.style.display = 'none';
    });

    // Show relevant sections based on field type
    if (isStringType(fieldType)) {
      if (sections.stringConfigSection) sections.stringConfigSection.style.display = 'block';
    } else if (isNumberType(fieldType)) {
      if (sections.numberConfigSection) sections.numberConfigSection.style.display = 'block';

      if (requiresPrecision(fieldType) && sections.precisionScaleRow) {
        sections.precisionScaleRow.style.display = 'block';
      }

      if (supportsAutoIncrement(fieldType) && sections.autoIncrementOption) {
        sections.autoIncrementOption.style.display = 'block';
      }
    } else if (isDateType(fieldType)) {
      if (sections.dateConfigSection) sections.dateConfigSection.style.display = 'block';
    } else if (fieldType === 'UUID') {
      if (sections.uuidConfigSection) sections.uuidConfigSection.style.display = 'block';
    } else if (fieldType === 'Enum') {
      if (sections.enumConfigSection) sections.enumConfigSection.style.display = 'block';
    } else if (fieldType === 'JSON' || fieldType === 'JSONB') {
      if (sections.jsonConfigSection) sections.jsonConfigSection.style.display = 'block';
    } else if (fieldType === 'Color') {
      if (sections.colorConfigSection) sections.colorConfigSection.style.display = 'block';
    }
  }

  function handleRelationshipTypeChange(e) {
    const type = e.target.value;
    const junctionSection = document.getElementById('junctionTableSection');

    if (junctionSection) {
      if (type === 'belongsToMany') {
        junctionSection.style.display = 'block';
      } else {
        junctionSection.style.display = 'none';
      }
    }
  }

  function handleOnInsertChange(e) {
    const action = e.target.value;
    const customFunctionGroup = document.getElementById('customInsertFunctionGroup');

    if (customFunctionGroup) {
      if (action === 'custom') {
        customFunctionGroup.style.display = 'block';
      } else {
        customFunctionGroup.style.display = 'none';
      }
    }
  }

  function handleBidirectionalChange(e) {
    const isChecked = e.target.checked;
    const inverseSection = document.getElementById('inverseRelationshipSection');

    if (inverseSection) {
      if (isChecked) {
        inverseSection.style.display = 'block';
      } else {
        inverseSection.style.display = 'none';
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Entity Management
  // ═══════════════════════════════════════════════════════════

  async function loadEntities() {
    try {
      const response = await fetch(`/lowcode/api/entities?applicationId=${state.applicationId}`);
      const data = await response.json();

      if (data.success) {
        state.entities = data.data.entities || [];
        renderEntityList();
      } else {
        showError('Failed to load entities');
      }
    } catch (error) {
      console.error('Error loading entities:', error);
      showError('Failed to load entities');
    }
  }

  async function loadEntity(entityId) {
    try {
      const response = await fetch(`/lowcode/api/entities/${entityId}`);
      const data = await response.json();

      console.log('Entity API response:', data);

      if (data.success) {
        state.currentEntity = data.data;
        console.log('Current entity set:', state.currentEntity);
        console.log('Entity schema:', state.currentEntity.schema);
        console.log('Entity relationships:', state.currentEntity.relationships);
        console.log('Entity indexes:', state.currentEntity.indexes);

        updateEntityTitle();
        renderCurrentView();

        // Initialize entity status (lock, read-only, template)
        initializeEntityStatus();

        // Show add field button
        const addFieldBtn = document.getElementById('addFieldBtn');
        if (addFieldBtn) {
          addFieldBtn.style.display = 'flex';
        }
      } else {
        console.error('API returned unsuccessful response:', data);
        showError('Failed to load entity');
      }
    } catch (error) {
      console.error('Error loading entity:', error);
      console.error('Error stack:', error.stack);
      showError('Failed to load entity: ' + error.message);
    }
  }

  function renderEntityList() {
    const entityList = document.getElementById('entityList');

    if (!entityList) {
      console.error('Entity list element not found');
      return;
    }

    if (state.entities.length === 0) {
      entityList.innerHTML = '<div class="empty-state">No entities yet. Create your first entity to get started.</div>';
      return;
    }

    entityList.innerHTML = state.entities.map(entity => {
      const isActive = state.currentEntity && state.currentEntity.id === entity.id;
      const fieldCount = entity.schema && entity.schema.fields ? entity.schema.fields.length : 0;
      return `
        <div class="entity-item ${isActive ? 'active' : ''}" data-entity-id="${entity.id}">
          <div class="entity-info">
            <div class="entity-name">${escapeHtml(entity.displayName || entity.name)}</div>
            <div class="entity-meta">${fieldCount} fields</div>
          </div>
        </div>
      `;
    }).join('');

    // Add click listeners
    entityList.querySelectorAll('.entity-item').forEach(item => {
      item.addEventListener('click', () => {
        const entityId = item.dataset.entityId;
        loadEntity(entityId);
      });
    });
  }

  function handleEntitySearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.entity-item');

    items.forEach(item => {
      const entityName = item.querySelector('.entity-name').textContent.toLowerCase();
      if (entityName.includes(searchTerm)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  }

  function updateEntityTitle() {
    const titleEl = document.getElementById('entityTitle');
    const subtitleEl = document.getElementById('entitySubtitle');

    if (state.currentEntity) {
      if (titleEl) titleEl.textContent = state.currentEntity.displayName || state.currentEntity.name;
      if (subtitleEl) subtitleEl.textContent = state.currentEntity.tableName || '';
    } else {
      if (titleEl) titleEl.textContent = 'Select an entity';
      if (subtitleEl) subtitleEl.textContent = 'or create a new one';
    }
  }

  // ═══════════════════════════════════════════════════════════
  // View Management
  // ═══════════════════════════════════════════════════════════

  function switchView(view) {
    state.currentView = view;

    // Update tab buttons
    document.querySelectorAll('.view-tab').forEach(btn => {
      if (btn.dataset.view === view) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Show/hide views
    document.querySelectorAll('[id$="View"]').forEach(el => {
      el.classList.add('hidden');
    });

    const viewEl = document.getElementById(`${view}View`);
    if (viewEl) {
      viewEl.classList.remove('hidden');
    }

    renderCurrentView();
  }

  function renderCurrentView() {
    switch (state.currentView) {
      case 'fields':
        renderFieldsView();
        break;
      case 'relationships':
        renderRelationshipsView();
        break;
      case 'indexes':
        renderIndexesView();
        break;
      case 'schema':
        renderSchemaView();
        break;
      case 'migrations':
        if (typeof window.initializeMigrationsTab === 'function') {
          window.initializeMigrationsTab();
        }
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Fields View
  // ═══════════════════════════════════════════════════════════

  function renderFieldsView() {
    const fieldsTable = document.getElementById('fieldsTableBody');

    if (!fieldsTable) {
      console.error('Fields table body not found');
      return;
    }

    if (!state.currentEntity) {
      fieldsTable.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Select an entity to view fields</td></tr>';
      return;
    }

    const fields = (state.currentEntity.schema && state.currentEntity.schema.fields) || [];

    if (fields.length === 0) {
      fieldsTable.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">No fields yet. Add your first field to get started.</td></tr>';
      return;
    }

    fieldsTable.innerHTML = fields.map((field, index) => `
      <tr class="field-row" data-field-index="${index}">
        <td>${index + 1}</td>
        <td>${escapeHtml(field.name)}</td>
        <td><span class="type-badge">${escapeHtml(field.type)}</span></td>
        <td>${field.required ? '<i class="fas fa-check text-success"></i>' : ''}</td>
        <td>${field.unique ? '<i class="fas fa-check text-success"></i>' : ''}</td>
        <td>${field.indexed ? '<i class="fas fa-check text-success"></i>' : ''}</td>
        <td>${escapeHtml(field.defaultValue || '')}</td>
      </tr>
    `).join('');

    // Add click listeners for field selection
    fieldsTable.querySelectorAll('.field-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          const fieldIndex = parseInt(row.dataset.fieldIndex);
          selectField(fieldIndex);
        }
      });

      // Double-click to edit
      row.addEventListener('dblclick', () => {
        const fieldIndex = parseInt(row.dataset.fieldIndex);
        editField(fieldIndex);
      });
    });
  }

  function selectField(fieldIndex) {
    const fields = (state.currentEntity.schema && state.currentEntity.schema.fields) || [];
    const field = fields[fieldIndex];
    if (!field) {
      console.error('Field not found at index:', fieldIndex);
      return;
    }

    state.currentField = field;
    state.currentFieldIndex = fieldIndex;

    // Highlight selected row
    document.querySelectorAll('.field-row').forEach(row => {
      row.classList.remove('selected');
    });
    const selectedRow = document.querySelector(`[data-field-index="${fieldIndex}"]`);
    if (selectedRow) {
      selectedRow.classList.add('selected');
    }

    // Show field properties (editable)
    renderFieldProperties(field, fieldIndex);
  }

  function renderFieldProperties(field, fieldIndex) {
    const propertiesContent = document.getElementById('propertiesContent');

    if (!propertiesContent) {
      console.error('Properties content element not found');
      return;
    }

    try {
      const html = `
        <div class="property-section">
          <div class="property-section-title">Edit Field</div>

          <div class="form-group">
            <label class="form-label">Field Name</label>
            <input type="text" class="form-input" id="propFieldName" value="${escapeHtml(field.name || '')}">
          </div>

          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="propFieldType">
              <option value="String" ${field.type === 'String' ? 'selected' : ''}>String</option>
              <option value="Text" ${field.type === 'Text' ? 'selected' : ''}>Text</option>
              <option value="Integer" ${field.type === 'Integer' ? 'selected' : ''}>Integer</option>
              <option value="Decimal" ${field.type === 'Decimal' ? 'selected' : ''}>Decimal</option>
              <option value="Boolean" ${field.type === 'Boolean' ? 'selected' : ''}>Boolean</option>
              <option value="Date" ${field.type === 'Date' ? 'selected' : ''}>Date</option>
              <option value="DateTime" ${field.type === 'DateTime' ? 'selected' : ''}>DateTime</option>
              <option value="UUID" ${field.type === 'UUID' ? 'selected' : ''}>UUID</option>
              <option value="JSON" ${field.type === 'JSON' ? 'selected' : ''}>JSON</option>
              <option value="JSONB" ${field.type === 'JSONB' ? 'selected' : ''}>JSONB</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Default Value</label>
            <input type="text" class="form-input" id="propFieldDefault" value="${escapeHtml(field.defaultValue || '')}">
          </div>

          <div class="form-group">
            <div class="form-checkbox">
              <input type="checkbox" id="propFieldRequired" ${field.required ? 'checked' : ''}>
              <label for="propFieldRequired">Required</label>
            </div>
          </div>

          <div class="form-group">
            <div class="form-checkbox">
              <input type="checkbox" id="propFieldUnique" ${field.unique ? 'checked' : ''}>
              <label for="propFieldUnique">Unique</label>
            </div>
          </div>

          <div class="form-group">
            <div class="form-checkbox">
              <input type="checkbox" id="propFieldIndexed" ${field.indexed ? 'checked' : ''}>
              <label for="propFieldIndexed">Indexed</label>
            </div>
          </div>

          <button class="btn btn-primary" style="width: 100%; margin-top: 1rem;" onclick="window.entityDesignerPro.saveFieldChanges()">
            <i class="fas fa-save"></i> Save Changes
          </button>

          <button class="btn btn-secondary" style="width: 100%; margin-top: 0.5rem; background: #ef4444; color: white;" onclick="window.entityDesignerPro.deleteField(${fieldIndex})">
            <i class="fas fa-trash"></i> Delete Field
          </button>
        </div>

        <div class="property-section">
          <div class="property-section-title">Format Preview</div>
          <div class="format-tabs-vertical">
            <button class="format-tab-vertical active" data-format="crud">CRUD</button>
            <button class="format-tab-vertical" data-format="sql">SQL</button>
            <button class="format-tab-vertical" data-format="json">JSON</button>
            <button class="format-tab-vertical" data-format="jsonlex">JSONLex</button>
          </div>
          <div class="format-preview" id="formatPreview">
            ${generateFieldCRUD(field)}
          </div>
        </div>
      `;

      propertiesContent.innerHTML = html;

      // Add format tab listeners
      propertiesContent.querySelectorAll('.format-tab-vertical').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const format = e.target.dataset.format;
          switchFieldFormat(format, field);
        });
      });
    } catch (error) {
      console.error('Error rendering field properties:', error);
      propertiesContent.innerHTML = `<div class="error-message">Error displaying field properties: ${escapeHtml(error.message)}</div>`;
    }
  }

  function saveFieldChanges() {
    if (!state.currentEntity || state.currentFieldIndex === null) {
      showError('No field selected');
      return;
    }

    const name = document.getElementById('propFieldName').value.trim();
    const type = document.getElementById('propFieldType').value;
    const defaultValue = document.getElementById('propFieldDefault').value.trim();
    const required = document.getElementById('propFieldRequired').checked;
    const unique = document.getElementById('propFieldUnique').checked;
    const indexed = document.getElementById('propFieldIndexed').checked;

    if (!name) {
      showError('Field name is required');
      return;
    }

    // Update field in schema
    const fields = [...((state.currentEntity.schema && state.currentEntity.schema.fields) || [])];
    fields[state.currentFieldIndex] = {
      ...fields[state.currentFieldIndex],
      name,
      type,
      defaultValue: defaultValue || null,
      required,
      unique,
      indexed
    };

    const schema = { ...(state.currentEntity.schema || {}), fields };

    updateEntitySchema(schema);
  }

  function switchFieldFormat(format, field) {
    // Update active tab
    document.querySelectorAll('.format-tab-vertical').forEach(btn => {
      if (btn.dataset.format === format) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update preview
    const preview = document.getElementById('formatPreview');
    if (preview) {
      switch (format) {
        case 'crud':
          preview.innerHTML = generateFieldCRUD(field);
          break;
        case 'sql':
          preview.innerHTML = generateFieldSQL(field);
          break;
        case 'json':
          preview.innerHTML = generateFieldJSON(field);
          break;
        case 'jsonlex':
          preview.innerHTML = generateFieldJSONLex(field);
          break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Format Generators
  // ═══════════════════════════════════════════════════════════

  function generateFieldCRUD(field) {
    const entityName = state.currentEntity.name.toLowerCase();
    return `<pre># CRUD Operations for ${escapeHtml(field.name)}

CREATE: POST /api/${entityName}
READ:   GET  /api/${entityName}?${escapeHtml(field.name)}=&lt;value&gt;
UPDATE: PUT  /api/${entityName}/:id
DELETE: DELETE /api/${entityName}/:id

# Example Request Body (CREATE/UPDATE):
{
  "${escapeHtml(field.name)}": &lt;${escapeHtml(field.type)}&gt;
}</pre>`;
  }

  function generateFieldSQL(field) {
    let sql = escapeHtml(field.name) + ' ' + escapeHtml(field.type);

    if (field.length) {
      sql += `(${field.length})`;
    }

    if (field.required) {
      sql += ' NOT NULL';
    }

    if (field.unique) {
      sql += ' UNIQUE';
    }

    if (field.primaryKey) {
      sql += ' PRIMARY KEY';
    }

    if (field.defaultValue) {
      sql += ` DEFAULT '${escapeHtml(field.defaultValue)}'`;
    }

    return `<pre>${sql}</pre>`;
  }

  function generateFieldJSON(field) {
    const json = {
      name: field.name,
      type: field.type,
      required: field.required || false,
      unique: field.unique || false,
      indexed: field.indexed || false
    };

    if (field.length) json.length = field.length;
    if (field.defaultValue) json.defaultValue = field.defaultValue;

    return `<pre>${JSON.stringify(json, null, 2)}</pre>`;
  }

  function generateFieldJSONLex(field) {
    const jsonlex = {
      field: field.name,
      type: field.type,
      validation: {
        required: field.required || false,
        unique: field.unique || false
      }
    };

    if (field.length) {
      jsonlex.validation.maxLength = field.length;
    }

    return `<pre>${JSON.stringify(jsonlex, null, 2)}</pre>`;
  }

  // ═══════════════════════════════════════════════════════════
  // Relationships View with D3.js Visualization
  // ═══════════════════════════════════════════════════════════

  function renderRelationshipsView() {
    const canvas = document.getElementById('relationshipCanvas');

    if (!canvas) {
      console.error('Relationship canvas not found');
      return;
    }

    if (!state.currentEntity) {
      canvas.innerHTML = '<div class="empty-state">Select an entity to view relationships</div>';
      return;
    }

    const relationships = state.currentEntity.relationships || [];

    // Clear previous canvas
    canvas.innerHTML = '';

    // Add action buttons
    const toolbar = document.createElement('div');
    toolbar.style.cssText = 'padding: 1rem; background: white; border-bottom: 1px solid #e5e7eb; display: flex; gap: 0.5rem;';
    toolbar.innerHTML = `
      <button class="btn btn-primary" id="addRelationshipBtn">
        <i class="fas fa-plus"></i> Add Relationship
      </button>
    `;
    canvas.appendChild(toolbar);

    // Re-attach event listener for add relationship button
    const addRelBtn = toolbar.querySelector('#addRelationshipBtn');
    if (addRelBtn) {
      addRelBtn.addEventListener('click', () => openRelationshipModal());
    }

    // Create SVG container
    const svgContainer = document.createElement('div');
    svgContainer.id = 'relationshipSvgContainer';
    svgContainer.style.cssText = 'width: 100%; height: 550px; background: #f9fafb;';
    canvas.appendChild(svgContainer);

    if (relationships.length === 0) {
      svgContainer.innerHTML = '<div class="empty-state">No relationships yet. Add your first relationship to connect entities.</div>';
      return;
    }

    // D3.js Visualization
    renderD3Graph(svgContainer, relationships);
  }

  function renderD3Graph(container, relationships) {
    // Clear previous SVG
    d3.select(container).selectAll('*').remove();

    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    // Build nodes and links
    const nodes = [];
    const links = [];

    // Add current entity as center node
    nodes.push({
      id: state.currentEntity.name,
      name: state.currentEntity.displayName || state.currentEntity.name,
      tableName: state.currentEntity.tableName || state.currentEntity.name.toLowerCase(),
      isCurrent: true
    });

    // Add related entities and junction tables
    relationships.forEach((rel, index) => {
      const targetEntity = state.entities.find(e => e.name === rel.targetEntity);
      if (targetEntity && !nodes.find(n => n.id === targetEntity.name)) {
        nodes.push({
          id: targetEntity.name,
          name: targetEntity.displayName || targetEntity.name,
          tableName: targetEntity.tableName || targetEntity.name.toLowerCase(),
          isCurrent: false,
          isJunction: false
        });
      }

      // Add junction table node for Many-to-Many relationships
      if (rel.type === 'belongsToMany' && rel.junction) {
        const junctionId = `junction_${rel.junction.table}`;
        if (!nodes.find(n => n.id === junctionId)) {
          nodes.push({
            id: junctionId,
            name: rel.junction.table,
            tableName: rel.junction.table,
            isCurrent: false,
            isJunction: true
          });
        }

        // Create two links: source -> junction and junction -> target
        links.push({
          source: state.currentEntity.name,
          target: junctionId,
          type: rel.type,
          name: rel.name,
          relationship: rel,
          index: index,
          isJunctionLink: true,
          junctionKey: rel.junction.sourceKey
        });

        links.push({
          source: junctionId,
          target: rel.targetEntity,
          type: rel.type,
          name: rel.name,
          relationship: rel,
          index: index,
          isJunctionLink: true,
          junctionKey: rel.junction.targetKey
        });
      } else {
        // Direct relationship link
        links.push({
          source: state.currentEntity.name,
          target: rel.targetEntity,
          type: rel.type,
          name: rel.name,
          relationship: rel,
          index: index,
          isJunctionLink: false
        });
      }
    });

    // Create force simulation
    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(80));

    // Draw links
    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', d => d.isJunctionLink ? '#f59e0b' : '#3b82f6')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', d => d.isJunctionLink ? '5,5' : '0')
      .attr('marker-end', 'url(#arrowhead)');

    // Add arrowhead marker
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 30)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .append('path')
      .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
      .attr('fill', '#3b82f6');

    // Draw link labels (relationship type and actions)
    const linkLabel = svg.append('g')
      .selectAll('text')
      .data(links)
      .enter().append('text')
      .attr('font-size', 9)
      .attr('fill', '#374151')
      .attr('font-weight', 'bold')
      .text(d => {
        if (d.isJunctionLink) {
          return d.junctionKey;
        }
        const rel = d.relationship;
        const actions = rel.referentialActions ? `${rel.referentialActions.onDelete}` : '';
        return `${d.type}${actions ? ' (' + actions + ')' : ''}`;
      });

    // Add tooltips to links
    link.append('title')
      .text(d => {
        const rel = d.relationship;
        let tooltip = `Name: ${rel.name}\nType: ${rel.type}`;

        if (rel.source && rel.source.columns) {
          tooltip += `\nSource: ${rel.source.columns.join(', ')}`;
        }

        if (rel.destination && rel.destination.columns) {
          tooltip += `\nDestination: ${rel.destination.columns.join(', ')}`;
        }

        if (rel.referentialActions) {
          tooltip += `\nOn Update: ${rel.referentialActions.onUpdate}`;
          tooltip += `\nOn Delete: ${rel.referentialActions.onDelete}`;
        }

        if (rel.options && rel.options.indexed) {
          tooltip += '\nIndexed: Yes';
        }

        if (rel.options && rel.options.bidirectional) {
          tooltip += `\nBidirectional: ${rel.inverse ? rel.inverse.name : 'Yes'}`;
        }

        return tooltip;
      });

    // Draw nodes
    const node = svg.append('g')
      .selectAll('g')
      .data(nodes)
      .enter().append('g')
      .call(d3.drag()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended))
      .on('dblclick', (event, d) => {
        if (!d.isJunction && !d.isCurrent) {
          // Load the clicked entity
          const entity = state.entities.find(e => e.name === d.id);
          if (entity) {
            loadEntity(entity.id);
          }
        }
      });

    node.append('rect')
      .attr('width', d => d.isJunction ? 100 : 120)
      .attr('height', d => d.isJunction ? 30 : 40)
      .attr('x', d => d.isJunction ? -50 : -60)
      .attr('y', d => d.isJunction ? -15 : -20)
      .attr('rx', 5)
      .attr('fill', d => {
        if (d.isCurrent) return '#10b981'; // Green for current entity
        if (d.isJunction) return '#f59e0b'; // Orange for junction tables
        return '#3b82f6'; // Blue for related entities
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 5)
      .attr('fill', 'white')
      .attr('font-weight', 'bold')
      .attr('font-size', d => d.isJunction ? 10 : 12)
      .text(d => d.name);

    // Add tooltips to nodes
    node.append('title')
      .text(d => {
        if (d.isJunction) {
          return `Junction Table: ${d.tableName}`;
        }
        return `Entity: ${d.name}\nTable: ${d.tableName}${d.isCurrent ? '\n(Current Entity)' : ''}`;
      });

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      linkLabel
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2 - 5);

      node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    state.d3Simulation = simulation;
  }

  // ═══════════════════════════════════════════════════════════
  // Indexes View
  // ═══════════════════════════════════════════════════════════

  function renderIndexesView() {
    const indexesTable = document.getElementById('indexesTableBody');

    if (!indexesTable) {
      console.error('Indexes table body not found');
      return;
    }

    if (!state.currentEntity) {
      indexesTable.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">Select an entity to view indexes</td></tr>';
      return;
    }

    const indexes = state.currentEntity.indexes || [];

    // Show add button in header
    const editorActions = document.querySelector('.editor-actions');
    if (editorActions) {
      let addIndexBtn = document.getElementById('addIndexBtn');
      if (!addIndexBtn) {
        addIndexBtn = document.createElement('button');
        addIndexBtn.id = 'addIndexBtn';
        addIndexBtn.className = 'btn btn-primary';
        addIndexBtn.innerHTML = '<i class="fas fa-plus"></i> Add Index';
        addIndexBtn.addEventListener('click', () => openIndexModal());
        editorActions.appendChild(addIndexBtn);
      }
      addIndexBtn.style.display = 'flex';
    }

    if (indexes.length === 0) {
      indexesTable.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No indexes yet. Add indexes to improve query performance.</td></tr>';
      return;
    }

    indexesTable.innerHTML = indexes.map((idx, index) => `
      <tr>
        <td>${escapeHtml(idx.name)}</td>
        <td><span class="type-badge">${escapeHtml(idx.type)}</span></td>
        <td>${idx.fields.map(f => escapeHtml(f)).join(', ')}</td>
        <td>${idx.unique || idx.type === 'unique' ? '<i class="fas fa-check text-success"></i>' : ''}</td>
        <td>
          <button class="icon-btn" onclick="window.entityDesignerPro.editIndex(${index})" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="icon-btn" onclick="window.entityDesignerPro.deleteIndex(${index})" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
  }

  // ═══════════════════════════════════════════════════════════
  // Schema View - Multi-format display
  // ═══════════════════════════════════════════════════════════

  function renderSchemaView() {
    if (!state.currentEntity) {
      const schemaCode = document.getElementById('schemaCode');
      if (schemaCode) {
        schemaCode.value = '// Select an entity to view schema';
      }
      return;
    }

    switchFormat(state.currentFormat);
  }

  function switchFormat(format) {
    state.currentFormat = format;

    // Update format tabs
    document.querySelectorAll('.format-tab').forEach(btn => {
      if (btn.dataset.format === format) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Generate schema
    const schemaCode = document.getElementById('schemaCode');
    if (schemaCode) {
      switch (format) {
        case 'json':
          schemaCode.value = generateJSONSchema();
          break;
        case 'sql':
          schemaCode.value = generateSQLSchema();
          break;
        case 'xml':
          schemaCode.value = generateXMLSchema();
          break;
        case 'jsonlex':
          schemaCode.value = generateJSONLexSchema();
          break;
      }
    }
  }

  function generateJSONSchema() {
    const fields = (state.currentEntity.schema && state.currentEntity.schema.fields) || [];
    const schema = {
      name: state.currentEntity.name,
      displayName: state.currentEntity.displayName,
      tableName: state.currentEntity.tableName,
      fields: fields.map(field => ({
        name: field.name,
        type: field.type,
        required: field.required || false,
        unique: field.unique || false,
        indexed: field.indexed || false,
        defaultValue: field.defaultValue || null
      })),
      relationships: state.currentEntity.relationships || [],
      indexes: state.currentEntity.indexes || []
    };

    return JSON.stringify(schema, null, 2);
  }

  function generateSQLSchema() {
    const tableName = state.currentEntity.tableName || state.currentEntity.name.toLowerCase();
    const fields = (state.currentEntity.schema && state.currentEntity.schema.fields) || [];

    let sql = `CREATE TABLE ${tableName} (\n`;

    // Map field types to SQL types
    const typeMap = {
      'String': 'VARCHAR(255)',
      'Text': 'TEXT',
      'Integer': 'INTEGER',
      'Decimal': 'DECIMAL(10,2)',
      'Boolean': 'BOOLEAN',
      'Date': 'DATE',
      'DateTime': 'TIMESTAMP',
      'UUID': 'UUID',
      'JSON': 'JSON',
      'JSONB': 'JSONB'
    };

    sql += fields.map(field => {
      let line = `  ${field.name} ${typeMap[field.type] || field.type}`;

      if (field.required) {
        line += ' NOT NULL';
      }

      if (field.unique) {
        line += ' UNIQUE';
      }

      if (field.defaultValue) {
        line += ` DEFAULT '${field.defaultValue}'`;
      }

      return line;
    }).join(',\n');

    // Add primary key if exists
    const pkFields = fields.filter(f => f.primaryKey).map(f => f.name);
    if (pkFields.length > 0) {
      sql += `,\n  PRIMARY KEY (${pkFields.join(', ')})`;
    }

    sql += '\n);';

    // Add indexes
    const indexes = state.currentEntity.indexes || [];
    if (indexes.length > 0) {
      sql += '\n\n';
      sql += indexes.map(idx => {
        const indexType = idx.type === 'unique' ? 'UNIQUE INDEX' : 'INDEX';
        return `CREATE ${indexType} ${idx.name} ON ${tableName} (${idx.fields.join(', ')});`;
      }).join('\n');
    }

    return sql;
  }

  function generateXMLSchema() {
    const entity = state.currentEntity;
    const fields = (entity.schema && entity.schema.fields) || [];
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += `<entity name="${entity.name}">\n`;
    xml += `  <displayName>${entity.displayName || entity.name}</displayName>\n`;
    xml += `  <tableName>${entity.tableName || entity.name.toLowerCase()}</tableName>\n`;
    xml += '  <fields>\n';

    fields.forEach(field => {
      xml += `    <field name="${field.name}" type="${field.type}"`;
      if (field.required) xml += ' required="true"';
      if (field.unique) xml += ' unique="true"';
      if (field.indexed) xml += ' indexed="true"';
      if (field.defaultValue) xml += ` default="${field.defaultValue}"`;
      xml += ' />\n';
    });

    xml += '  </fields>\n';

    // Add relationships
    const relationships = state.currentEntity.relationships || [];
    if (relationships.length > 0) {
      xml += '  <relationships>\n';
      relationships.forEach(rel => {
        xml += `    <relationship name="${rel.name}" type="${rel.type}" target="${rel.targetEntity}" foreignKey="${rel.foreignKey}" />\n`;
      });
      xml += '  </relationships>\n';
    }

    // Add indexes
    const indexes = state.currentEntity.indexes || [];
    if (indexes.length > 0) {
      xml += '  <indexes>\n';
      indexes.forEach(idx => {
        xml += `    <index name="${idx.name}" type="${idx.type}" fields="${idx.fields.join(',')}" />\n`;
      });
      xml += '  </indexes>\n';
    }

    xml += '</entity>';

    return xml;
  }

  function generateJSONLexSchema() {
    const fields = (state.currentEntity.schema && state.currentEntity.schema.fields) || [];
    const schema = {
      entity: state.currentEntity.name,
      fields: fields.map(field => ({
        name: field.name,
        type: field.type,
        validation: {
          required: field.required || false,
          unique: field.unique || false
        }
      })),
      computedFields: fields
        .filter(f => f.computed)
        .map(field => ({
          name: field.name,
          expression: field.expression || `$.${field.name}`
        }))
    };

    return JSON.stringify(schema, null, 2);
  }

  // ═══════════════════════════════════════════════════════════
  // Entity Modal
  // ═══════════════════════════════════════════════════════════

  function openEntityModal() {
    state.editMode = 'create';
    const modal = document.getElementById('entityModal');
    const modalTitle = document.getElementById('entityModalTitle');
    const saveBtn = document.getElementById('entityModalSave');

    if (modalTitle) modalTitle.textContent = 'New Entity';
    if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Create Entity';

    // Clear form
    const displayName = document.getElementById('modalEntityDisplayName');
    const name = document.getElementById('modalEntityName');
    const tableName = document.getElementById('modalEntityTableName');
    const description = document.getElementById('modalEntityDescription');

    if (displayName) displayName.value = '';
    if (name) name.value = '';
    if (tableName) tableName.value = '';
    if (description) description.value = '';

    // Show modal
    if (modal) modal.classList.add('active');
  }

  function closeEntityModal() {
    const modal = document.getElementById('entityModal');
    if (modal) modal.classList.remove('active');
  }

  async function saveEntity() {
    const displayName = document.getElementById('modalEntityDisplayName').value.trim();
    const name = document.getElementById('modalEntityName').value.trim();
    const tableName = document.getElementById('modalEntityTableName').value.trim();
    const description = document.getElementById('modalEntityDescription').value.trim();
    const sourceType = document.getElementById('modalEntitySourceType').value;

    if (!displayName || !name) {
      showToast('Display name and name are required', 'error');
      return;
    }

    const entityData = {
      applicationId: state.applicationId,
      name,
      displayName,
      tableName: tableName || name.toLowerCase(),
      description,
      sourceType: sourceType || 'custom',
      schema: {
        fields: []
      },
      relationships: [],
      indexes: []
    };

    try {
      const response = await fetch('/lowcode/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entityData)
      });

      const data = await response.json();

      if (data.success) {
        closeEntityModal();

        // Socket.IO will handle the update via entity:created event
        if (!state.connected) {
          // Fallback if Socket.IO is not connected
          state.entities.push(data.data);
          renderEntityList();
          loadEntity(data.data.id);
        }

        showToast('Entity created successfully', 'success');
      } else {
        showToast(data.message || 'Failed to create entity', 'error');
      }
    } catch (error) {
      console.error('Error saving entity:', error);
      showToast('Failed to create entity', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Field Modal
  // ═══════════════════════════════════════════════════════════

  function openFieldModal(editIndex = null) {
    if (!state.currentEntity) {
      showToast('Please select an entity first', 'error');
      return;
    }

    const modal = document.getElementById('fieldModal');
    const modalTitle = document.getElementById('fieldModalTitle');
    const saveBtn = document.getElementById('fieldModalSave');

    // Setup field modal listeners
    setupFieldModalListeners();

    if (editIndex !== null) {
      // Edit mode
      state.editMode = 'edit';
      state.currentFieldIndex = editIndex;

      const fields = (state.currentEntity.schema && state.currentEntity.schema.fields) || [];
      const field = fields[editIndex];

      if (!field) {
        showError('Field not found');
        return;
      }

      if (modalTitle) modalTitle.textContent = 'Edit Field';
      if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Update Field';

      // Backwards compatibility: Convert old field structure to new structure
      const validation = field.validation || {
        required: field.required || false,
        unique: field.unique || false,
        primaryKey: field.primaryKey || false
      };

      const config = field.config || {
        autoIncrement: field.autoIncrement || false,
        autoNow: field.autoNow || false,
        autoUpdate: field.autoUpdate || false,
        readOnly: field.readOnly || false,
        hidden: field.hidden || false,
        calculated: field.calculated || false
      };

      // Populate basic information
      setValueIfExists('modalFieldName', field.name || '');
      setValueIfExists('modalFieldLabel', field.label || field.displayLabel || '');
      setValueIfExists('modalFieldType', field.type || 'String');
      setValueIfExists('modalFieldDescription', field.description || '');

      // Populate validation constraints
      setCheckedIfExists('modalFieldRequired', validation.required);
      setCheckedIfExists('modalFieldUnique', validation.unique);
      setCheckedIfExists('modalFieldIndexed', field.indexed || false);
      setCheckedIfExists('modalFieldPrimaryKey', validation.primaryKey);
      setValueIfExists('modalFieldDefault', field.defaultValue || '');

      // Populate string configuration
      setValueIfExists('modalFieldMinLength', validation.minLength || '');
      setValueIfExists('modalFieldMaxLength', validation.maxLength || '');
      setValueIfExists('modalFieldPattern', validation.pattern || '');

      // Populate number configuration
      setValueIfExists('modalFieldMinValue', validation.minValue || '');
      setValueIfExists('modalFieldMaxValue', validation.maxValue || '');
      setValueIfExists('modalFieldPrecision', validation.precision || '');
      setValueIfExists('modalFieldScale', validation.scale || '');

      // Populate date configuration
      setValueIfExists('modalFieldMinDate', validation.minDate || '');
      setValueIfExists('modalFieldMaxDate', validation.maxDate || '');

      // Populate field config (already defined above with backwards compatibility)
      setCheckedIfExists('modalFieldAutoIncrement', config.autoIncrement);
      setCheckedIfExists('modalFieldAutoNow', config.autoNow);
      setCheckedIfExists('modalFieldAutoUpdate', config.autoUpdate);

      // Populate UUID configuration
      setValueIfExists('modalFieldUUIDTrigger', config.uuidTrigger || 'insert');
      setValueIfExists('modalFieldUUIDFunction', config.uuidFunction || '');

      // Populate enum configuration
      setValueIfExists('modalFieldEnumScope', config.enumScope || 'field');
      // Show enum values preview if they exist
      if (config.enumValues && config.enumValues.length > 0) {
        const enumPreview = document.getElementById('enumValuesPreview');
        const enumText = document.getElementById('enumValuesText');
        if (enumPreview && enumText) {
          enumPreview.style.display = 'block';
          enumText.textContent = config.enumValues.map(v => v.value || v).join(', ');
        }
      }

      // Populate color configuration
      setValueIfExists('modalFieldColorFormat', config.colorFormat || 'hex');

      // Populate advanced options (using backward-compatible config)
      setCheckedIfExists('modalFieldReadOnly', config.readOnly);
      setCheckedIfExists('modalFieldHidden', config.hidden);
      setCheckedIfExists('modalFieldCalculated', config.calculated);
      setValueIfExists('modalFieldExpression', config.expression || field.expression || '');

      // Update dynamic sections visibility
      updateFieldConfigSections(field.type || 'String');

      // Handle UUID trigger visibility
      if (config.uuidTrigger) {
        handleUUIDTriggerChange({ target: { value: config.uuidTrigger } });
      }

      // Handle calculated expression visibility
      if (config.calculated) {
        handleCalculatedChange({ target: { checked: true } });
      }

    } else {
      // Create mode
      state.editMode = 'create';
      state.currentFieldIndex = null;

      if (modalTitle) modalTitle.textContent = 'New Field';
      if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Add Field';

      // Clear all basic information
      setValueIfExists('modalFieldName', '');
      setValueIfExists('modalFieldLabel', '');
      setValueIfExists('modalFieldType', 'String');
      setValueIfExists('modalFieldDescription', '');

      // Clear validation constraints
      setCheckedIfExists('modalFieldRequired', false);
      setCheckedIfExists('modalFieldUnique', false);
      setCheckedIfExists('modalFieldIndexed', false);
      setCheckedIfExists('modalFieldPrimaryKey', false);
      setValueIfExists('modalFieldDefault', '');

      // Clear string configuration
      setValueIfExists('modalFieldMinLength', '');
      setValueIfExists('modalFieldMaxLength', '');
      setValueIfExists('modalFieldPattern', '');

      // Clear number configuration
      setValueIfExists('modalFieldMinValue', '');
      setValueIfExists('modalFieldMaxValue', '');
      setValueIfExists('modalFieldPrecision', '');
      setValueIfExists('modalFieldScale', '');

      // Clear date configuration
      setValueIfExists('modalFieldMinDate', '');
      setValueIfExists('modalFieldMaxDate', '');

      // Clear field config
      setCheckedIfExists('modalFieldAutoIncrement', false);
      setCheckedIfExists('modalFieldAutoNow', false);
      setCheckedIfExists('modalFieldAutoUpdate', false);

      // Clear UUID configuration
      setValueIfExists('modalFieldUUIDTrigger', 'insert');
      setValueIfExists('modalFieldUUIDFunction', '');

      // Clear enum configuration
      setValueIfExists('modalFieldEnumScope', 'field');
      const enumPreview = document.getElementById('enumValuesPreview');
      if (enumPreview) enumPreview.style.display = 'none';

      // Clear color configuration
      setValueIfExists('modalFieldColorFormat', 'hex');

      // Clear advanced options
      setCheckedIfExists('modalFieldReadOnly', false);
      setCheckedIfExists('modalFieldHidden', false);
      setCheckedIfExists('modalFieldCalculated', false);
      setValueIfExists('modalFieldExpression', '');

      // Update dynamic sections visibility for default type (String)
      updateFieldConfigSections('String');

      // Hide UUID function group
      handleUUIDTriggerChange({ target: { value: 'insert' } });

      // Hide calculated expression group
      handleCalculatedChange({ target: { checked: false } });
    }

    // Initialize color picker if the modal contains it
    initColorPicker();

    // Show modal
    if (modal) modal.classList.add('active');
  }

  function closeFieldModal() {
    const modal = document.getElementById('fieldModal');
    if (modal) modal.classList.remove('active');
    state.editMode = 'create';
    state.currentFieldIndex = null;
  }

  async function saveField() {
    // Basic information
    const name = getValueIfExists('modalFieldName').trim();
    const label = getValueIfExists('modalFieldLabel').trim();
    const type = getValueIfExists('modalFieldType');
    const description = getValueIfExists('modalFieldDescription').trim();

    if (!name) {
      showToast('Field name is required', 'error');
      return;
    }

    // Build validation object
    const validation = {
      required: getCheckedIfExists('modalFieldRequired'),
      unique: getCheckedIfExists('modalFieldUnique'),
      primaryKey: getCheckedIfExists('modalFieldPrimaryKey')
    };

    // String validation
    const minLength = getValueIfExists('modalFieldMinLength').trim();
    const maxLength = getValueIfExists('modalFieldMaxLength').trim();
    const pattern = getValueIfExists('modalFieldPattern').trim();
    if (minLength) validation.minLength = parseInt(minLength);
    if (maxLength) validation.maxLength = parseInt(maxLength);
    if (pattern) validation.pattern = pattern;

    // Number validation
    const minValue = getValueIfExists('modalFieldMinValue').trim();
    const maxValue = getValueIfExists('modalFieldMaxValue').trim();
    const precision = getValueIfExists('modalFieldPrecision').trim();
    const scale = getValueIfExists('modalFieldScale').trim();
    if (minValue) validation.minValue = parseFloat(minValue);
    if (maxValue) validation.maxValue = parseFloat(maxValue);
    if (precision) validation.precision = parseInt(precision);
    if (scale) validation.scale = parseInt(scale);

    // Date validation
    const minDate = getValueIfExists('modalFieldMinDate').trim();
    const maxDate = getValueIfExists('modalFieldMaxDate').trim();
    if (minDate) validation.minDate = minDate;
    if (maxDate) validation.maxDate = maxDate;

    // Build config object
    const config = {
      // Number config
      autoIncrement: getCheckedIfExists('modalFieldAutoIncrement'),

      // Date config
      autoNow: getCheckedIfExists('modalFieldAutoNow'),
      autoUpdate: getCheckedIfExists('modalFieldAutoUpdate'),

      // UUID config
      uuidTrigger: null,
      uuidFunction: null,

      // Enum config
      enumScope: null,
      enumValues: null,

      // JSON config
      jsonSchema: null,

      // Color config
      colorFormat: null,

      // Advanced options
      readOnly: getCheckedIfExists('modalFieldReadOnly'),
      hidden: getCheckedIfExists('modalFieldHidden'),
      calculated: getCheckedIfExists('modalFieldCalculated'),
      expression: null
    };

    // UUID configuration (only for UUID type)
    if (type === 'UUID') {
      const uuidTrigger = getValueIfExists('modalFieldUUIDTrigger');
      const uuidFunction = getValueIfExists('modalFieldUUIDFunction').trim();
      config.uuidTrigger = uuidTrigger || 'insert';
      if (uuidFunction) config.uuidFunction = uuidFunction;
    }

    // Enum configuration (only for Enum type)
    if (type === 'Enum') {
      config.enumScope = getValueIfExists('modalFieldEnumScope') || 'field';
      // TODO: Get enumValues from enum editor modal when implemented
      config.enumValues = state.currentEnumValues || null;
    }

    // JSON configuration (only for JSON/JSONB types)
    if (type === 'JSON' || type === 'JSONB') {
      // TODO: Get jsonSchema from JSON schema builder when implemented
      config.jsonSchema = state.currentJSONSchema || null;
    }

    // Color configuration (only for Color type)
    if (type === 'Color') {
      config.colorFormat = getValueIfExists('modalFieldColorFormat') || 'hex';
    }

    // Calculated expression
    if (config.calculated) {
      const expression = getValueIfExists('modalFieldExpression').trim();
      if (expression) config.expression = expression;
    }

    // Get default value
    const defaultValue = getValueIfExists('modalFieldDefault').trim();
    const indexed = getCheckedIfExists('modalFieldIndexed');

    // Build comprehensive field data object
    const fieldData = {
      name,
      label: label || name,
      type,
      description: description || null,
      validation,
      config,
      defaultValue: defaultValue || null,
      indexed,
      // Backwards compatibility - flatten some fields to top level
      required: validation.required,
      unique: validation.unique,
      primaryKey: validation.primaryKey
    };

    // Update fields array
    const fields = [...((state.currentEntity.schema && state.currentEntity.schema.fields) || [])];

    if (state.editMode === 'edit' && state.currentFieldIndex !== null) {
      // Update existing field
      fields[state.currentFieldIndex] = fieldData;
    } else {
      // Add new field
      fields.push(fieldData);
    }

    const schema = { ...(state.currentEntity.schema || {}), fields };

    closeFieldModal();
    updateEntitySchema(schema);
  }

  // ═══════════════════════════════════════════════════════════
  // Relationship Modal
  // ═══════════════════════════════════════════════════════════

  function openRelationshipModal(editIndex = null) {
    if (!state.currentEntity) {
      showToast('Please select an entity first', 'error');
      return;
    }

    const modal = document.getElementById('relationshipModal');
    const modalTitle = document.getElementById('relationshipModalTitle');
    const saveBtn = document.getElementById('relationshipModalSave');

    // Populate target entity dropdown
    const targetEntitySelect = document.getElementById('modalRelationshipTarget');
    if (targetEntitySelect) {
      targetEntitySelect.innerHTML = '<option value="">Select target entity...</option>' +
        state.entities
          .filter(e => e.id !== state.currentEntity.id)
          .map(e => `<option value="${e.name}">${e.displayName || e.name}</option>`)
          .join('');
    }

    if (editIndex !== null) {
      // Edit mode
      state.editMode = 'edit';
      state.currentRelationshipIndex = editIndex;

      const relationships = state.currentEntity.relationships || [];
      const rel = relationships[editIndex];

      if (!rel) {
        showError('Relationship not found');
        return;
      }

      if (modalTitle) modalTitle.textContent = 'Edit Relationship';
      if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Update Relationship';

      // Populate basic fields
      setValueIfExists('modalRelationshipName', rel.name || '');
      setValueIfExists('modalRelationshipType', rel.type || 'belongsTo');
      if (targetEntitySelect) targetEntitySelect.value = rel.targetEntity || (rel.destination ? rel.destination.entity : '');

      // Source configuration
      setValueIfExists('modalRelationshipSourceTable', state.currentEntity.tableName || state.currentEntity.name.toLowerCase());
      const sourceColumns = rel.source && rel.source.columns ? rel.source.columns.join(', ') : 'id';
      setValueIfExists('modalRelationshipSourceColumns', sourceColumns);

      // Destination configuration (backwards compatibility with foreignKey)
      let destColumns = '';
      if (rel.destination && rel.destination.columns) {
        destColumns = rel.destination.columns.join(', ');
      } else if (rel.foreignKey) {
        destColumns = rel.foreignKey;
      }
      setValueIfExists('modalRelationshipDestColumns', destColumns);

      // Junction table (Many-to-Many)
      if (rel.junction) {
        setValueIfExists('modalRelationshipJunctionTable', rel.junction.table || '');
        setValueIfExists('modalRelationshipJunctionSourceKey', rel.junction.sourceKey || '');
        setValueIfExists('modalRelationshipJunctionTargetKey', rel.junction.targetKey || '');
      } else {
        setValueIfExists('modalRelationshipJunctionTable', '');
        setValueIfExists('modalRelationshipJunctionSourceKey', '');
        setValueIfExists('modalRelationshipJunctionTargetKey', '');
      }

      // Referential actions
      if (rel.referentialActions) {
        setValueIfExists('modalRelationshipOnUpdate', rel.referentialActions.onUpdate || 'NO ACTION');
        setValueIfExists('modalRelationshipOnDelete', rel.referentialActions.onDelete || 'CASCADE');
      } else {
        // Backwards compatibility with old onDelete field
        setValueIfExists('modalRelationshipOnUpdate', 'NO ACTION');
        setValueIfExists('modalRelationshipOnDelete', rel.onDelete || 'CASCADE');
      }

      // Trigger actions
      if (rel.triggers && rel.triggers.onInsert) {
        setValueIfExists('modalRelationshipOnInsert', rel.triggers.onInsert.action || 'none');
        setValueIfExists('modalRelationshipInsertFunction', rel.triggers.onInsert.function || '');
      } else {
        setValueIfExists('modalRelationshipOnInsert', 'none');
        setValueIfExists('modalRelationshipInsertFunction', '');
      }

      // Lookup configuration
      if (rel.lookup) {
        setValueIfExists('modalRelationshipDisplayField', rel.lookup.displayField || '');
        setValueIfExists('modalRelationshipFilterCondition', rel.lookup.filterCondition || '');
        setValueIfExists('modalRelationshipSortOrder', rel.lookup.sortOrder || '');
      } else {
        setValueIfExists('modalRelationshipDisplayField', '');
        setValueIfExists('modalRelationshipFilterCondition', '');
        setValueIfExists('modalRelationshipSortOrder', '');
      }

      // Advanced options
      if (rel.options) {
        setCheckedIfExists('modalRelationshipRollbackOnFail', rel.options.rollbackOnFail || false);
        setCheckedIfExists('modalRelationshipDeferrable', rel.options.deferrable || false);
        setCheckedIfExists('modalRelationshipIndexed', rel.options.indexed || false);
        setCheckedIfExists('modalRelationshipBidirectional', rel.options.bidirectional || false);
      } else {
        setCheckedIfExists('modalRelationshipRollbackOnFail', false);
        setCheckedIfExists('modalRelationshipDeferrable', false);
        setCheckedIfExists('modalRelationshipIndexed', false);
        setCheckedIfExists('modalRelationshipBidirectional', false);
      }

      // Inverse relationship
      if (rel.inverse) {
        setValueIfExists('modalRelationshipInverseName', rel.inverse.name || '');
      } else {
        setValueIfExists('modalRelationshipInverseName', '');
      }

      // Update dynamic sections visibility
      handleRelationshipTypeChange({ target: { value: rel.type || 'belongsTo' } });
      handleOnInsertChange({ target: { value: rel.triggers && rel.triggers.onInsert ? rel.triggers.onInsert.action : 'none' } });
      handleBidirectionalChange({ target: { checked: rel.options && rel.options.bidirectional } });

    } else {
      // Create mode
      state.editMode = 'create';
      state.currentRelationshipIndex = null;

      if (modalTitle) modalTitle.textContent = 'New Relationship';
      if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Add Relationship';

      // Clear basic fields
      setValueIfExists('modalRelationshipName', '');
      setValueIfExists('modalRelationshipType', 'belongsTo');
      if (targetEntitySelect) targetEntitySelect.value = '';

      // Source configuration (auto-populate)
      setValueIfExists('modalRelationshipSourceTable', state.currentEntity.tableName || state.currentEntity.name.toLowerCase());
      setValueIfExists('modalRelationshipSourceColumns', 'id');

      // Destination configuration
      setValueIfExists('modalRelationshipDestColumns', '');

      // Junction table
      setValueIfExists('modalRelationshipJunctionTable', '');
      setValueIfExists('modalRelationshipJunctionSourceKey', '');
      setValueIfExists('modalRelationshipJunctionTargetKey', '');

      // Referential actions
      setValueIfExists('modalRelationshipOnUpdate', 'NO ACTION');
      setValueIfExists('modalRelationshipOnDelete', 'CASCADE');

      // Trigger actions
      setValueIfExists('modalRelationshipOnInsert', 'none');
      setValueIfExists('modalRelationshipInsertFunction', '');

      // Lookup configuration
      setValueIfExists('modalRelationshipDisplayField', '');
      setValueIfExists('modalRelationshipFilterCondition', '');
      setValueIfExists('modalRelationshipSortOrder', '');

      // Advanced options
      setCheckedIfExists('modalRelationshipRollbackOnFail', false);
      setCheckedIfExists('modalRelationshipDeferrable', false);
      setCheckedIfExists('modalRelationshipIndexed', true); // Default to indexed
      setCheckedIfExists('modalRelationshipBidirectional', false);

      // Inverse relationship
      setValueIfExists('modalRelationshipInverseName', '');

      // Update dynamic sections visibility
      handleRelationshipTypeChange({ target: { value: 'belongsTo' } });
      handleOnInsertChange({ target: { value: 'none' } });
      handleBidirectionalChange({ target: { checked: false } });
    }

    // Show modal
    if (modal) modal.classList.add('active');
  }

  // Helper functions for setting field values
  function setValueIfExists(fieldId, value) {
    const field = document.getElementById(fieldId);
    if (field) {
      field.value = value;
    }
  }

  function setCheckedIfExists(fieldId, checked) {
    const field = document.getElementById(fieldId);
    if (field) {
      field.checked = checked;
    }
  }

  function closeRelationshipModal() {
    const modal = document.getElementById('relationshipModal');
    if (modal) modal.classList.remove('active');
    state.editMode = 'create';
    state.currentRelationshipIndex = null;
  }

  async function saveRelationship() {
    // Basic information
    const name = getValueIfExists('modalRelationshipName').trim();
    const type = getValueIfExists('modalRelationshipType');
    const targetEntity = getValueIfExists('modalRelationshipTarget');

    // Source configuration
    const sourceTable = getValueIfExists('modalRelationshipSourceTable').trim();
    const sourceColumnsStr = getValueIfExists('modalRelationshipSourceColumns').trim();
    const sourceColumns = sourceColumnsStr.split(',').map(c => c.trim()).filter(c => c);

    // Destination configuration
    const destColumnsStr = getValueIfExists('modalRelationshipDestColumns').trim();
    const destColumns = destColumnsStr.split(',').map(c => c.trim()).filter(c => c);

    // Validate required fields
    if (!name || !targetEntity) {
      showToast('Relationship name and target entity are required', 'error');
      return;
    }

    if (sourceColumns.length === 0) {
      showToast('Source columns are required', 'error');
      return;
    }

    if (destColumns.length === 0 && type !== 'belongsToMany') {
      showToast('Destination columns are required', 'error');
      return;
    }

    // Get target entity table name
    const targetEntityObj = state.entities.find(e => e.name === targetEntity);
    const targetTable = targetEntityObj ? (targetEntityObj.tableName || targetEntityObj.name.toLowerCase()) : targetEntity.toLowerCase();

    // Build relationship data object
    const relationshipData = {
      name,
      type,
      targetEntity,
      source: {
        table: sourceTable,
        columns: sourceColumns
      },
      destination: {
        entity: targetEntity,
        table: targetTable,
        columns: destColumns
      },
      referentialActions: {
        onUpdate: getValueIfExists('modalRelationshipOnUpdate') || 'NO ACTION',
        onDelete: getValueIfExists('modalRelationshipOnDelete') || 'CASCADE'
      },
      triggers: {
        onInsert: {
          action: getValueIfExists('modalRelationshipOnInsert') || 'none',
          function: getValueIfExists('modalRelationshipInsertFunction').trim() || null
        }
      },
      lookup: {
        displayField: getValueIfExists('modalRelationshipDisplayField').trim() || null,
        filterCondition: getValueIfExists('modalRelationshipFilterCondition').trim() || null,
        sortOrder: getValueIfExists('modalRelationshipSortOrder').trim() || null
      },
      options: {
        rollbackOnFail: getCheckedIfExists('modalRelationshipRollbackOnFail'),
        deferrable: getCheckedIfExists('modalRelationshipDeferrable'),
        indexed: getCheckedIfExists('modalRelationshipIndexed'),
        bidirectional: getCheckedIfExists('modalRelationshipBidirectional')
      }
    };

    // Junction table configuration (Many-to-Many only)
    if (type === 'belongsToMany') {
      const junctionTable = getValueIfExists('modalRelationshipJunctionTable').trim();
      const junctionSourceKey = getValueIfExists('modalRelationshipJunctionSourceKey').trim();
      const junctionTargetKey = getValueIfExists('modalRelationshipJunctionTargetKey').trim();

      if (!junctionTable || !junctionSourceKey || !junctionTargetKey) {
        showToast('Junction table configuration is required for Many-to-Many relationships', 'error');
        return;
      }

      relationshipData.junction = {
        table: junctionTable,
        sourceKey: junctionSourceKey,
        targetKey: junctionTargetKey
      };
    }

    // Inverse relationship (if bidirectional)
    if (relationshipData.options.bidirectional) {
      const inverseName = getValueIfExists('modalRelationshipInverseName').trim();
      if (!inverseName) {
        showToast('Inverse relationship name is required when bidirectional is enabled', 'error');
        return;
      }

      relationshipData.inverse = {
        name: inverseName
      };
    }

    // Backwards compatibility: Add foreignKey field for old code
    if (destColumns.length > 0) {
      relationshipData.foreignKey = destColumns[0]; // Use first column for backwards compatibility
    }

    // Backwards compatibility: Add old onDelete field
    relationshipData.onDelete = relationshipData.referentialActions.onDelete;

    // Update entity relationships
    const relationships = [...(state.currentEntity.relationships || [])];

    if (state.editMode === 'edit' && state.currentRelationshipIndex !== null) {
      // Update existing relationship
      relationships[state.currentRelationshipIndex] = relationshipData;
    } else {
      // Add new relationship
      relationships.push(relationshipData);
    }

    closeRelationshipModal();
    updateEntityRelationships(relationships);
  }

  // Helper functions for getting field values
  function getValueIfExists(fieldId) {
    const field = document.getElementById(fieldId);
    return field ? field.value : '';
  }

  function getCheckedIfExists(fieldId) {
    const field = document.getElementById(fieldId);
    return field ? field.checked : false;
  }

  // ═══════════════════════════════════════════════════════════
  // Index Modal
  // ═══════════════════════════════════════════════════════════

  // State for selected index fields
  let selectedIndexFields = [];
  let draggedIndexFieldIndex = null;

  function openIndexModal(editIndex = null) {
    if (!state.currentEntity) {
      showToast('Please select an entity first', 'error');
      return;
    }

    const modal = document.getElementById('indexModal');
    const modalTitle = document.getElementById('indexModalTitle');
    const saveBtn = document.getElementById('indexModalSave');

    // Reset selected fields
    selectedIndexFields = [];

    if (editIndex !== null) {
      // Edit mode
      state.editMode = 'edit';
      state.currentIndexIndex = editIndex;

      const indexes = state.currentEntity.indexes || [];
      const idx = indexes[editIndex];

      if (!idx) {
        showToast('Index not found', 'error');
        return;
      }

      if (modalTitle) modalTitle.textContent = 'Edit Index';
      if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Update Index';

      // Populate basic information
      document.getElementById('modalIndexName').value = idx.name || '';
      document.getElementById('modalIndexType').value = idx.type || 'btree';
      document.getElementById('modalIndexUnique').checked = idx.unique || false;

      // Populate advanced options
      document.getElementById('modalIndexConcurrent').checked = idx.concurrent || false;
      document.getElementById('modalIndexPartial').checked = idx.partial ? true : false;
      document.getElementById('modalIndexPartialWhere').value = idx.partial || '';
      document.getElementById('modalIndexInclude').value = idx.include ? idx.include.join(', ') : '';
      document.getElementById('modalIndexFillFactor').value = idx.fillFactor || 90;
      document.getElementById('fillFactorValue').textContent = idx.fillFactor || 90;
      document.getElementById('modalIndexStorageParams').value = idx.storageParams || '';

      // Show/hide partial index WHERE field
      const partialWhereGroup = document.getElementById('partialIndexWhereGroup');
      if (partialWhereGroup) {
        partialWhereGroup.style.display = idx.partial ? 'block' : 'none';
      }

      // Parse fields (backwards compatibility)
      if (idx.fields) {
        if (Array.isArray(idx.fields)) {
          // Check if it's the new format with objects
          if (idx.fields.length > 0 && typeof idx.fields[0] === 'object' && idx.fields[0].name) {
            // New format: array of { name, order }
            selectedIndexFields = idx.fields.map(f => ({
              name: f.name,
              order: f.order || 'ASC'
            }));
          } else {
            // Old format: array of strings
            selectedIndexFields = idx.fields.map(f => ({
              name: f,
              order: 'ASC'
            }));
          }
        } else if (typeof idx.fields === 'string') {
          // Very old format: comma-separated string
          selectedIndexFields = idx.fields.split(',').map(f => ({
            name: f.trim(),
            order: 'ASC'
          })).filter(f => f.name);
        }
      }
    } else {
      // Create mode
      state.editMode = 'create';
      state.currentIndexIndex = null;

      if (modalTitle) modalTitle.textContent = 'New Index';
      if (saveBtn) saveBtn.innerHTML = '<i class="fas fa-save"></i> Add Index';

      // Clear form
      document.getElementById('modalIndexName').value = '';
      document.getElementById('modalIndexType').value = 'btree';
      document.getElementById('modalIndexUnique').checked = false;
      document.getElementById('modalIndexConcurrent').checked = false;
      document.getElementById('modalIndexPartial').checked = false;
      document.getElementById('modalIndexPartialWhere').value = '';
      document.getElementById('modalIndexInclude').value = '';
      document.getElementById('modalIndexFillFactor').value = 90;
      document.getElementById('fillFactorValue').textContent = '90';
      document.getElementById('modalIndexStorageParams').value = '';

      // Hide partial index WHERE field
      const partialWhereGroup = document.getElementById('partialIndexWhereGroup');
      if (partialWhereGroup) {
        partialWhereGroup.style.display = 'none';
      }
    }

    // Initialize the field selection interface
    updateAvailableFieldsList();
    updateSelectedFieldsTable();
    initializeIndexModalEventListeners();
    initializeIndexDragDrop();

    // Show modal
    if (modal) modal.classList.add('active');
  }

  function closeIndexModal() {
    const modal = document.getElementById('indexModal');
    if (modal) modal.classList.remove('active');
    state.editMode = 'create';
    state.currentIndexIndex = null;
    selectedIndexFields = [];
  }

  async function saveIndex() {
    const name = document.getElementById('modalIndexName').value.trim();
    const type = document.getElementById('modalIndexType').value;
    const unique = document.getElementById('modalIndexUnique').checked;
    const concurrent = document.getElementById('modalIndexConcurrent').checked;
    const isPartial = document.getElementById('modalIndexPartial').checked;
    const partialWhere = document.getElementById('modalIndexPartialWhere').value.trim();
    const includeStr = document.getElementById('modalIndexInclude').value.trim();
    const fillFactor = parseInt(document.getElementById('modalIndexFillFactor').value, 10);
    const storageParams = document.getElementById('modalIndexStorageParams').value.trim();

    if (!name) {
      showToast('Index name is required', 'error');
      return;
    }

    if (selectedIndexFields.length === 0) {
      showToast('At least one field must be selected', 'error');
      return;
    }

    // Parse include columns
    const include = includeStr ? includeStr.split(',').map(f => f.trim()).filter(f => f) : [];

    // Build comprehensive index data
    const indexData = {
      name,
      type,
      fields: selectedIndexFields, // Array of { name, order }
      unique,
      concurrent,
      partial: isPartial ? partialWhere : null,
      include: include.length > 0 ? include : null,
      fillFactor,
      storageParams: storageParams || null
    };

    // Update entity indexes
    const indexes = [...(state.currentEntity.indexes || [])];

    if (state.editMode === 'edit' && state.currentIndexIndex !== null) {
      // Update existing index
      indexes[state.currentIndexIndex] = indexData;
    } else {
      // Add new index
      indexes.push(indexData);
    }

    closeIndexModal();
    updateEntityIndexes(indexes);
  }

  // Helper function to update available fields list
  function updateAvailableFieldsList() {
    const container = document.getElementById('availableFieldsList');
    if (!container) return;

    const fields = (state.currentEntity.schema && state.currentEntity.schema.fields) || [];
    const searchTerm = document.getElementById('availableFieldsSearch')?.value.toLowerCase() || '';

    // Get list of fields already in other indexes
    const indexedFields = new Set();
    const indexes = state.currentEntity.indexes || [];
    indexes.forEach(idx => {
      if (idx.fields) {
        if (Array.isArray(idx.fields)) {
          idx.fields.forEach(f => {
            const fieldName = typeof f === 'object' ? f.name : f;
            indexedFields.add(fieldName);
          });
        } else if (typeof idx.fields === 'string') {
          idx.fields.split(',').forEach(f => indexedFields.add(f.trim()));
        }
      }
    });

    // Filter fields based on search
    const filteredFields = fields.filter(field => {
      const fieldName = field.name || '';
      const fieldType = field.type || '';
      return fieldName.toLowerCase().includes(searchTerm) ||
             fieldType.toLowerCase().includes(searchTerm);
    });

    // Render available fields
    container.innerHTML = filteredFields.map(field => {
      const isSelected = selectedIndexFields.some(f => f.name === field.name);
      const isIndexed = indexedFields.has(field.name);

      return `
        <div class="available-field-item">
          <input
            type="checkbox"
            id="availField_${field.name}"
            data-field-name="${field.name}"
            ${isSelected ? 'checked' : ''}
          >
          <label for="availField_${field.name}" style="cursor: pointer; flex: 1; margin: 0;">
            ${field.name}
            <span class="field-type-badge">${field.type || 'String'}</span>
          </label>
          ${isIndexed && !isSelected ? '<span class="field-already-indexed"><i class="fas fa-check-circle"></i> Indexed</span>' : ''}
        </div>
      `;
    }).join('');

    // Attach event listeners to checkboxes
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const fieldName = e.target.dataset.fieldName;
        if (e.target.checked) {
          addFieldToSelection(fieldName);
        } else {
          removeFieldFromSelection(fieldName);
        }
      });
    });
  }

  // Helper function to update selected fields table
  function updateSelectedFieldsTable() {
    const tbody = document.getElementById('selectedFieldsTableBody');
    if (!tbody) return;

    if (selectedIndexFields.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: var(--text-secondary, #6b7280); font-size: 0.813rem; padding: 2rem;">
            No fields selected
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = selectedIndexFields.map((field, index) => `
      <tr class="selected-field-row" draggable="true" data-index="${index}">
        <td>
          <i class="fas fa-grip-vertical drag-handle"></i>
          ${index + 1}
        </td>
        <td>${field.name}</td>
        <td>
          <select class="form-select" data-field-index="${index}" style="font-size: 0.813rem; padding: 0.25rem 0.5rem;">
            <option value="ASC" ${field.order === 'ASC' ? 'selected' : ''}>ASC</option>
            <option value="DESC" ${field.order === 'DESC' ? 'selected' : ''}>DESC</option>
          </select>
        </td>
        <td>
          <button class="remove-field-btn" data-field-name="${field.name}" title="Remove field">
            <i class="fas fa-times"></i>
          </button>
        </td>
      </tr>
    `).join('');

    // Attach event listeners for sort order changes
    tbody.querySelectorAll('select').forEach(select => {
      select.addEventListener('change', (e) => {
        const fieldIndex = parseInt(e.target.dataset.fieldIndex, 10);
        if (selectedIndexFields[fieldIndex]) {
          selectedIndexFields[fieldIndex].order = e.target.value;
        }
      });
    });

    // Attach event listeners for remove buttons
    tbody.querySelectorAll('.remove-field-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const fieldName = e.currentTarget.dataset.fieldName;
        removeFieldFromSelection(fieldName);
      });
    });
  }

  // Helper function to add field to selection
  function addFieldToSelection(fieldName) {
    if (selectedIndexFields.some(f => f.name === fieldName)) {
      return; // Already selected
    }

    selectedIndexFields.push({
      name: fieldName,
      order: 'ASC'
    });

    updateSelectedFieldsTable();
    updateAvailableFieldsList(); // Update to reflect checkbox state
  }

  // Helper function to remove field from selection
  function removeFieldFromSelection(fieldName) {
    selectedIndexFields = selectedIndexFields.filter(f => f.name !== fieldName);
    updateSelectedFieldsTable();
    updateAvailableFieldsList(); // Update to reflect checkbox state
  }

  // Initialize drag and drop for reordering fields
  function initializeIndexDragDrop() {
    const tbody = document.getElementById('selectedFieldsTableBody');
    if (!tbody) return;

    tbody.addEventListener('dragstart', handleIndexDragStart);
    tbody.addEventListener('dragover', handleIndexDragOver);
    tbody.addEventListener('drop', handleIndexDrop);
    tbody.addEventListener('dragend', handleIndexDragEnd);
    tbody.addEventListener('dragleave', handleIndexDragLeave);
  }

  function handleIndexDragStart(e) {
    if (e.target.tagName === 'TR' && e.target.classList.contains('selected-field-row')) {
      e.target.classList.add('dragging');
      draggedIndexFieldIndex = parseInt(e.target.dataset.index, 10);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', e.target.innerHTML);
    }
  }

  function handleIndexDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const row = e.target.closest('tr');
    if (row && row.classList.contains('selected-field-row') && !row.classList.contains('dragging')) {
      // Remove drag-over from all rows
      document.querySelectorAll('.selected-field-row').forEach(r => r.classList.remove('drag-over'));
      // Add to current row
      row.classList.add('drag-over');
    }

    return false;
  }

  function handleIndexDragLeave(e) {
    const row = e.target.closest('tr');
    if (row && row.classList.contains('selected-field-row')) {
      row.classList.remove('drag-over');
    }
  }

  function handleIndexDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    e.preventDefault();

    const targetRow = e.target.closest('tr');
    if (!targetRow || !targetRow.classList.contains('selected-field-row')) return false;

    const targetIndex = parseInt(targetRow.dataset.index, 10);

    if (draggedIndexFieldIndex !== null && draggedIndexFieldIndex !== targetIndex) {
      // Reorder the selectedIndexFields array
      const item = selectedIndexFields.splice(draggedIndexFieldIndex, 1)[0];
      selectedIndexFields.splice(targetIndex, 0, item);

      // Re-render table
      updateSelectedFieldsTable();
      initializeIndexDragDrop(); // Re-attach event listeners
    }

    return false;
  }

  function handleIndexDragEnd(e) {
    document.querySelectorAll('.selected-field-row').forEach(row => {
      row.classList.remove('dragging', 'drag-over');
    });
    draggedIndexFieldIndex = null;
  }

  // Initialize event listeners for index modal
  function initializeIndexModalEventListeners() {
    // Search field
    const searchInput = document.getElementById('availableFieldsSearch');
    if (searchInput) {
      searchInput.removeEventListener('input', updateAvailableFieldsList);
      searchInput.addEventListener('input', updateAvailableFieldsList);
    }

    // Select all button
    const selectAllBtn = document.getElementById('selectAllFieldsBtn');
    if (selectAllBtn) {
      selectAllBtn.onclick = () => {
        const fields = (state.currentEntity.schema && state.currentEntity.schema.fields) || [];
        fields.forEach(field => {
          if (!selectedIndexFields.some(f => f.name === field.name)) {
            addFieldToSelection(field.name);
          }
        });
      };
    }

    // Clear all button
    const clearAllBtn = document.getElementById('clearAllFieldsBtn');
    if (clearAllBtn) {
      clearAllBtn.onclick = () => {
        selectedIndexFields = [];
        updateSelectedFieldsTable();
        updateAvailableFieldsList();
      };
    }

    // Partial index checkbox
    const partialCheckbox = document.getElementById('modalIndexPartial');
    const partialWhereGroup = document.getElementById('partialIndexWhereGroup');
    if (partialCheckbox && partialWhereGroup) {
      partialCheckbox.onchange = () => {
        partialWhereGroup.style.display = partialCheckbox.checked ? 'block' : 'none';
      };
    }

    // Fill factor slider
    const fillFactorSlider = document.getElementById('modalIndexFillFactor');
    const fillFactorValue = document.getElementById('fillFactorValue');
    if (fillFactorSlider && fillFactorValue) {
      fillFactorSlider.oninput = () => {
        fillFactorValue.textContent = fillFactorSlider.value;
      };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CRUD Operations
  // ═══════════════════════════════════════════════════════════

  async function updateEntitySchema(schema) {
    try {
      const response = await fetch(`/lowcode/api/entities/${state.currentEntity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema })
      });

      const data = await response.json();

      if (data.success) {
        // Emit Socket.IO event
        if (state.socket && state.connected) {
          state.socket.emit('entity:updated', {
            entityId: state.currentEntity.id,
            entity: data.data
          });
        }

        loadEntity(state.currentEntity.id);
        showToast('Schema updated successfully', 'success');
      } else {
        showToast(data.message || 'Failed to update schema', 'error');
      }
    } catch (error) {
      console.error('Error updating schema:', error);
      showToast('Failed to update schema', 'error');
    }
  }

  async function deleteField(fieldIndex) {
    if (!confirm('Are you sure you want to delete this field?')) {
      return;
    }

    const fields = [...((state.currentEntity.schema && state.currentEntity.schema.fields) || [])];

    if (!fields[fieldIndex]) {
      showToast('Field not found', 'error');
      return;
    }

    // Remove field from array
    fields.splice(fieldIndex, 1);

    // Update entity schema
    const schema = { ...(state.currentEntity.schema || {}), fields };

    updateEntitySchema(schema);
  }

  function editField(fieldIndex) {
    openFieldModal(fieldIndex);
  }

  async function updateEntityRelationships(relationships) {
    try {
      const response = await fetch(`/lowcode/api/entities/${state.currentEntity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationships })
      });

      const data = await response.json();

      if (data.success) {
        // Emit Socket.IO event
        if (state.socket && state.connected) {
          state.socket.emit('entity:updated', {
            entityId: state.currentEntity.id,
            entity: data.data
          });
        }

        loadEntity(state.currentEntity.id);
        showToast('Relationships updated successfully', 'success');
      } else {
        showToast(data.message || 'Failed to update relationships', 'error');
      }
    } catch (error) {
      console.error('Error updating relationships:', error);
      showToast('Failed to update relationships', 'error');
    }
  }

  function deleteRelationship(index) {
    if (!confirm('Are you sure you want to delete this relationship?')) {
      return;
    }

    const relationships = [...(state.currentEntity.relationships || [])];
    relationships.splice(index, 1);

    updateEntityRelationships(relationships);
  }

  function editRelationship(index) {
    openRelationshipModal(index);
  }

  async function updateEntityIndexes(indexes) {
    try {
      const response = await fetch(`/lowcode/api/entities/${state.currentEntity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ indexes })
      });

      const data = await response.json();

      if (data.success) {
        // Emit Socket.IO event
        if (state.socket && state.connected) {
          state.socket.emit('entity:updated', {
            entityId: state.currentEntity.id,
            entity: data.data
          });
        }

        loadEntity(state.currentEntity.id);
        showToast('Indexes updated successfully', 'success');
      } else {
        showToast(data.message || 'Failed to update indexes', 'error');
      }
    } catch (error) {
      console.error('Error updating indexes:', error);
      showToast('Failed to update indexes', 'error');
    }
  }

  function deleteIndex(index) {
    if (!confirm('Are you sure you want to delete this index?')) {
      return;
    }

    const indexes = [...(state.currentEntity.indexes || [])];
    indexes.splice(index, 1);

    updateEntityIndexes(indexes);
  }

  function editIndex(index) {
    openIndexModal(index);
  }

  // ═══════════════════════════════════════════════════════════
  // Placeholder Modals for Future Features
  // ═══════════════════════════════════════════════════════════

  function openEnumEditorModal() {
    // Initialize or load existing enum values
    if (!state.currentEnumValues) {
      state.currentEnumValues = [];
    }

    // Create modal if it doesn't exist
    let modal = document.getElementById('enumEditorModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'enumEditorModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px;">
          <div class="modal-header">
            <h2><i class="fas fa-list-ul"></i> Enum Editor</h2>
            <button class="modal-close" id="enumEditorClose">&times;</button>
          </div>
          <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
            <!-- Enum Scope -->
            <div class="form-group">
              <label>Enum Scope</label>
              <select id="enumEditorScope" class="form-control">
                <option value="field">Field-specific</option>
                <option value="global">Global (reusable)</option>
                <option value="session">Session-scoped</option>
                <option value="form">Form-scoped</option>
              </select>
            </div>

            <div id="enumEditorGlobalName" style="display: none;" class="form-group">
              <label>Global Enum Name</label>
              <input type="text" id="enumEditorName" class="form-control" placeholder="e.g., StatusTypes">
            </div>

            <!-- Toolbar -->
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
              <button class="btn btn-primary" id="enumAddValueBtn">
                <i class="fas fa-plus"></i> Add Value
              </button>
              <button class="btn btn-secondary" id="enumImportJSONBtn">
                <i class="fas fa-file-import"></i> Import JSON
              </button>
              <button class="btn btn-secondary" id="enumImportCSVBtn">
                <i class="fas fa-file-csv"></i> Import CSV
              </button>
              <button class="btn btn-secondary" id="enumExportJSONBtn">
                <i class="fas fa-file-export"></i> Export JSON
              </button>
            </div>

            <!-- Enum Values Table -->
            <div class="table-responsive">
              <table class="table" id="enumValuesTable">
                <thead>
                  <tr>
                    <th style="width: 30px;"></th>
                    <th style="width: 150px;">Value</th>
                    <th style="width: 150px;">Label</th>
                    <th style="width: 100px;">Color</th>
                    <th style="width: 100px;">Icon</th>
                    <th style="width: 80px;">Default</th>
                    <th style="width: 100px;">Actions</th>
                  </tr>
                </thead>
                <tbody id="enumValuesTableBody">
                  <!-- Rows will be dynamically added here -->
                </tbody>
              </table>
            </div>

            <!-- Preview Section -->
            <div class="form-group" style="margin-top: 1.5rem;">
              <label>Preview</label>
              <div id="enumPreviewArea" style="padding: 1rem; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; min-height: 60px;">
                <!-- Preview badges will appear here -->
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="enumEditorCancel">Cancel</button>
            <button class="btn btn-primary" id="enumEditorSave">
              <i class="fas fa-save"></i> Save
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Add event listeners
      document.getElementById('enumEditorClose').addEventListener('click', closeEnumEditorModal);
      document.getElementById('enumEditorCancel').addEventListener('click', closeEnumEditorModal);
      document.getElementById('enumEditorSave').addEventListener('click', saveEnumValues);
      document.getElementById('enumAddValueBtn').addEventListener('click', addEnumValue);
      document.getElementById('enumImportJSONBtn').addEventListener('click', importEnumJSON);
      document.getElementById('enumImportCSVBtn').addEventListener('click', importEnumCSV);
      document.getElementById('enumExportJSONBtn').addEventListener('click', exportEnumJSON);
      document.getElementById('enumEditorScope').addEventListener('change', handleEnumScopeChange);
    }

    // Populate modal with current values
    populateEnumEditor();
    modal.classList.add('active');
  }

  function handleEnumScopeChange() {
    const scope = document.getElementById('enumEditorScope').value;
    const globalNameDiv = document.getElementById('enumEditorGlobalName');
    if (scope === 'global') {
      globalNameDiv.style.display = 'block';
    } else {
      globalNameDiv.style.display = 'none';
    }
  }

  function populateEnumEditor() {
    const tbody = document.getElementById('enumValuesTableBody');
    tbody.innerHTML = '';

    if (!state.currentEnumValues || state.currentEnumValues.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #6c757d; padding: 2rem;">No enum values defined. Click "Add Value" to get started.</td></tr>';
      updateEnumPreview();
      return;
    }

    state.currentEnumValues.forEach((enumValue, index) => {
      const row = createEnumRow(enumValue, index);
      tbody.appendChild(row);
    });

    updateEnumPreview();
  }

  function createEnumRow(enumValue, index) {
    const tr = document.createElement('tr');
    tr.draggable = true;
    tr.dataset.index = index;
    tr.innerHTML = `
      <td style="cursor: move; text-align: center;">
        <i class="fas fa-grip-vertical" style="color: #adb5bd;"></i>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm" value="${escapeHtml(enumValue.value || '')}"
               onchange="updateEnumValue(${index}, 'value', this.value)">
      </td>
      <td>
        <input type="text" class="form-control form-control-sm" value="${escapeHtml(enumValue.label || '')}"
               onchange="updateEnumValue(${index}, 'label', this.value)">
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="color" class="form-control form-control-sm" value="${enumValue.color || '#6c757d'}"
                 style="width: 50px; height: 32px; padding: 2px;"
                 onchange="updateEnumValue(${index}, 'color', this.value)">
          <input type="text" class="form-control form-control-sm" value="${enumValue.color || '#6c757d'}"
                 style="width: 80px;"
                 onchange="updateEnumValue(${index}, 'color', this.value)">
        </div>
      </td>
      <td>
        <select class="form-control form-control-sm" onchange="updateEnumValue(${index}, 'icon', this.value)">
          <option value="">None</option>
          ${getIconOptions(enumValue.icon || '')}
        </select>
      </td>
      <td style="text-align: center;">
        <input type="radio" name="enumDefault" ${enumValue.isDefault ? 'checked' : ''}
               onchange="setEnumDefault(${index})">
      </td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteEnumValue(${index})" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;

    // Add drag and drop listeners
    tr.addEventListener('dragstart', handleDragStart);
    tr.addEventListener('dragover', handleDragOver);
    tr.addEventListener('drop', handleDrop);
    tr.addEventListener('dragend', handleDragEnd);

    return tr;
  }

  function getIconOptions(selectedIcon) {
    const icons = [
      'fa-check', 'fa-times', 'fa-exclamation', 'fa-info', 'fa-question',
      'fa-star', 'fa-heart', 'fa-thumbs-up', 'fa-thumbs-down',
      'fa-flag', 'fa-bookmark', 'fa-tag', 'fa-bell',
      'fa-user', 'fa-users', 'fa-building', 'fa-home',
      'fa-circle', 'fa-square', 'fa-play', 'fa-pause', 'fa-stop'
    ];

    return icons.map(icon =>
      `<option value="${icon}" ${icon === selectedIcon ? 'selected' : ''}>
        ${icon.replace('fa-', '')}
      </option>`
    ).join('');
  }

  // Make these functions globally accessible for inline event handlers
  window.updateEnumValue = function(index, field, value) {
    if (!state.currentEnumValues[index]) return;
    state.currentEnumValues[index][field] = value;
    updateEnumPreview();
  };

  window.setEnumDefault = function(index) {
    state.currentEnumValues.forEach((ev, i) => {
      ev.isDefault = (i === index);
    });
    updateEnumPreview();
  };

  window.deleteEnumValue = function(index) {
    if (confirm('Are you sure you want to delete this enum value?')) {
      state.currentEnumValues.splice(index, 1);
      populateEnumEditor();
    }
  };

  function addEnumValue() {
    if (!state.currentEnumValues) {
      state.currentEnumValues = [];
    }

    const newValue = {
      value: `value_${state.currentEnumValues.length + 1}`,
      label: `Value ${state.currentEnumValues.length + 1}`,
      color: '#6c757d',
      icon: '',
      order: state.currentEnumValues.length,
      isDefault: state.currentEnumValues.length === 0
    };

    state.currentEnumValues.push(newValue);
    populateEnumEditor();
  }

  // Drag and drop functionality
  let draggedElement = null;

  function handleDragStart(e) {
    draggedElement = this;
    this.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
  }

  function handleDragOver(e) {
    if (e.preventDefault) {
      e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
  }

  function handleDrop(e) {
    if (e.stopPropagation) {
      e.stopPropagation();
    }

    if (draggedElement !== this) {
      const fromIndex = parseInt(draggedElement.dataset.index);
      const toIndex = parseInt(this.dataset.index);

      // Reorder array
      const item = state.currentEnumValues.splice(fromIndex, 1)[0];
      state.currentEnumValues.splice(toIndex, 0, item);

      // Update order property
      state.currentEnumValues.forEach((ev, i) => {
        ev.order = i;
      });

      populateEnumEditor();
    }

    return false;
  }

  function handleDragEnd(e) {
    this.style.opacity = '1';
  }

  function updateEnumPreview() {
    const previewArea = document.getElementById('enumPreviewArea');
    if (!previewArea) return;

    if (!state.currentEnumValues || state.currentEnumValues.length === 0) {
      previewArea.innerHTML = '<span style="color: #6c757d;">No values to preview</span>';
      return;
    }

    previewArea.innerHTML = state.currentEnumValues.map(ev => `
      <span class="badge" style="background-color: ${ev.color}; margin: 0.25rem; font-size: 14px; padding: 0.5rem 0.75rem;">
        ${ev.icon ? `<i class="fas ${ev.icon}"></i> ` : ''}
        ${escapeHtml(ev.label)}
        ${ev.isDefault ? '<i class="fas fa-star" style="margin-left: 0.5rem; font-size: 10px;"></i>' : ''}
      </span>
    `).join('');
  }

  function importEnumJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (Array.isArray(data)) {
            state.currentEnumValues = data.map((item, index) => ({
              value: item.value || item.name || `value_${index}`,
              label: item.label || item.display || item.value || `Value ${index}`,
              color: item.color || '#6c757d',
              icon: item.icon || '',
              order: index,
              isDefault: item.isDefault || false
            }));
            populateEnumEditor();
            showToast('Enum values imported successfully', 'success');
          } else {
            showToast('Invalid JSON format. Expected an array.', 'error');
          }
        } catch (err) {
          showToast('Failed to parse JSON file', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function importEnumCSV() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const lines = event.target.result.split('\n');
          const values = [];

          for (let i = 1; i < lines.length; i++) { // Skip header
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
            if (parts.length >= 2) {
              values.push({
                value: parts[0],
                label: parts[1],
                color: parts[2] || '#6c757d',
                icon: parts[3] || '',
                order: i - 1,
                isDefault: parts[4] === 'true' || parts[4] === '1'
              });
            }
          }

          if (values.length > 0) {
            state.currentEnumValues = values;
            populateEnumEditor();
            showToast('Enum values imported from CSV', 'success');
          } else {
            showToast('No valid values found in CSV', 'error');
          }
        } catch (err) {
          showToast('Failed to parse CSV file', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function exportEnumJSON() {
    if (!state.currentEnumValues || state.currentEnumValues.length === 0) {
      showToast('No enum values to export', 'error');
      return;
    }

    const dataStr = JSON.stringify(state.currentEnumValues, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'enum-values.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Enum values exported', 'success');
  }

  function saveEnumValues() {
    // Validate enum values
    if (!state.currentEnumValues || state.currentEnumValues.length === 0) {
      showToast('Please add at least one enum value', 'error');
      return;
    }

    // Check for duplicate values
    const values = state.currentEnumValues.map(ev => ev.value);
    const duplicates = values.filter((v, i) => values.indexOf(v) !== i);
    if (duplicates.length > 0) {
      showToast(`Duplicate values found: ${duplicates.join(', ')}`, 'error');
      return;
    }

    // Update the preview in the field modal
    const enumPreview = document.getElementById('enumValuesPreview');
    const enumText = document.getElementById('enumValuesText');

    if (enumPreview && enumText) {
      enumPreview.style.display = 'block';
      enumText.textContent = state.currentEnumValues.map(ev => ev.label).join(', ');
    }

    closeEnumEditorModal();
    showToast('Enum values saved successfully', 'success');
  }

  function closeEnumEditorModal() {
    const modal = document.getElementById('enumEditorModal');
    if (modal) modal.classList.remove('active');
  }

  function openJSONSchemaModal() {
    // Initialize schema if not exists
    if (!state.currentJSONSchema) {
      state.currentJSONSchema = {
        type: 'object',
        properties: {},
        required: []
      };
    }

    // Create modal if it doesn't exist
    let modal = document.getElementById('jsonSchemaModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'jsonSchemaModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 1000px;">
          <div class="modal-header">
            <h2><i class="fas fa-code"></i> JSON Schema Builder</h2>
            <button class="modal-close" id="jsonSchemaClose">&times;</button>
          </div>
          <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <!-- Left Panel: Tree Editor -->
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                  <h4 style="margin: 0;">Schema Structure</h4>
                  <button class="btn btn-sm btn-primary" id="jsonSchemaAddRootProperty">
                    <i class="fas fa-plus"></i> Add Property
                  </button>
                </div>
                <div id="jsonSchemaTree" style="border: 1px solid #dee2e6; border-radius: 4px; padding: 1rem; background: #f8f9fa; min-height: 400px; max-height: 500px; overflow-y: auto;">
                  <!-- Tree will be rendered here -->
                </div>
              </div>

              <!-- Right Panel: Preview and Import -->
              <div>
                <div style="margin-bottom: 1.5rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <h4 style="margin: 0;">JSON Schema Preview</h4>
                    <div>
                      <button class="btn btn-sm btn-secondary" id="jsonSchemaImport" title="Import from JSON">
                        <i class="fas fa-file-import"></i>
                      </button>
                      <button class="btn btn-sm btn-secondary" id="jsonSchemaExport" title="Export Schema">
                        <i class="fas fa-file-export"></i>
                      </button>
                    </div>
                  </div>
                  <textarea id="jsonSchemaPreview" class="form-control" style="font-family: monospace; font-size: 12px; height: 250px;" readonly></textarea>
                </div>

                <div>
                  <h4>Sample JSON</h4>
                  <button class="btn btn-sm btn-secondary" id="jsonSchemaGenSample" style="margin-bottom: 0.5rem;">
                    <i class="fas fa-magic"></i> Generate Sample
                  </button>
                  <textarea id="jsonSamplePreview" class="form-control" style="font-family: monospace; font-size: 12px; height: 150px;" readonly></textarea>
                </div>

                <div style="margin-top: 1rem;">
                  <h4>Validation Errors</h4>
                  <div id="jsonSchemaErrors" style="padding: 0.75rem; background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; min-height: 50px; max-height: 100px; overflow-y: auto; font-size: 12px;">
                    <span style="color: #28a745;"><i class="fas fa-check-circle"></i> Schema is valid</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="jsonSchemaCancel">Cancel</button>
            <button class="btn btn-primary" id="jsonSchemaSave">
              <i class="fas fa-save"></i> Save Schema
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Add event listeners
      document.getElementById('jsonSchemaClose').addEventListener('click', closeJSONSchemaModal);
      document.getElementById('jsonSchemaCancel').addEventListener('click', closeJSONSchemaModal);
      document.getElementById('jsonSchemaSave').addEventListener('click', saveJSONSchema);
      document.getElementById('jsonSchemaAddRootProperty').addEventListener('click', () => addJSONSchemaProperty(null));
      document.getElementById('jsonSchemaImport').addEventListener('click', importJSONSchema);
      document.getElementById('jsonSchemaExport').addEventListener('click', exportJSONSchema);
      document.getElementById('jsonSchemaGenSample').addEventListener('click', generateSampleJSON);
    }

    renderJSONSchemaTree();
    updateJSONSchemaPreview();
    modal.classList.add('active');
  }

  function renderJSONSchemaTree() {
    const tree = document.getElementById('jsonSchemaTree');
    if (!tree) return;

    tree.innerHTML = '';

    if (!state.currentJSONSchema.properties || Object.keys(state.currentJSONSchema.properties).length === 0) {
      tree.innerHTML = '<p style="color: #6c757d; text-align: center; padding: 2rem;">No properties defined. Click "Add Property" to start building your schema.</p>';
      return;
    }

    const rootDiv = document.createElement('div');
    renderSchemaProperties(state.currentJSONSchema.properties, rootDiv, null, state.currentJSONSchema.required);
    tree.appendChild(rootDiv);
  }

  function renderSchemaProperties(properties, container, path, requiredFields = []) {
    Object.keys(properties).forEach(key => {
      const prop = properties[key];
      const propPath = path ? `${path}.${key}` : key;
      const isRequired = requiredFields.includes(key);

      const propDiv = document.createElement('div');
      propDiv.style.cssText = 'margin-left: 1rem; margin-bottom: 0.75rem; border-left: 2px solid #dee2e6; padding-left: 0.75rem;';

      // Property header
      const headerDiv = document.createElement('div');
      headerDiv.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;';

      const typeColors = {
        string: '#17a2b8', number: '#28a745', boolean: '#ffc107',
        object: '#6f42c1', array: '#fd7e14', null: '#6c757d'
      };

      headerDiv.innerHTML = `
        <strong style="color: #495057;">${escapeHtml(key)}</strong>
        <span class="badge" style="background: ${typeColors[prop.type] || '#6c757d'}; font-size: 10px;">${prop.type}</span>
        ${isRequired ? '<span class="badge badge-danger" style="font-size: 10px;">Required</span>' : ''}
        <div style="margin-left: auto; display: flex; gap: 0.25rem;">
          ${prop.type === 'object' ? `<button class="btn btn-sm btn-primary" onclick="addJSONSchemaProperty('${propPath}')" title="Add nested property"><i class="fas fa-plus"></i></button>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="editJSONSchemaProperty('${propPath}')" title="Edit"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteJSONSchemaProperty('${propPath}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      `;
      propDiv.appendChild(headerDiv);

      // Property details
      if (prop.description) {
        const descDiv = document.createElement('div');
        descDiv.style.cssText = 'font-size: 12px; color: #6c757d; font-style: italic;';
        descDiv.textContent = prop.description;
        propDiv.appendChild(descDiv);
      }

      // Type-specific constraints
      const constraintsDiv = document.createElement('div');
      constraintsDiv.style.cssText = 'font-size: 11px; color: #495057; margin-top: 0.25rem;';
      let constraints = [];

      if (prop.type === 'string') {
        if (prop.minLength) constraints.push(`min: ${prop.minLength}`);
        if (prop.maxLength) constraints.push(`max: ${prop.maxLength}`);
        if (prop.pattern) constraints.push(`pattern: ${prop.pattern}`);
      } else if (prop.type === 'number') {
        if (prop.minimum !== undefined) constraints.push(`min: ${prop.minimum}`);
        if (prop.maximum !== undefined) constraints.push(`max: ${prop.maximum}`);
      } else if (prop.type === 'array') {
        if (prop.items) constraints.push(`items: ${prop.items.type || 'any'}`);
      }

      if (prop.default !== undefined) constraints.push(`default: ${JSON.stringify(prop.default)}`);

      if (constraints.length > 0) {
        constraintsDiv.textContent = constraints.join(' | ');
        propDiv.appendChild(constraintsDiv);
      }

      // Recursive rendering for nested objects
      if (prop.type === 'object' && prop.properties && Object.keys(prop.properties).length > 0) {
        renderSchemaProperties(prop.properties, propDiv, propPath, prop.required || []);
      }

      container.appendChild(propDiv);
    });
  }

  // Global functions for inline event handlers
  window.addJSONSchemaProperty = function(parentPath) {
    const propName = prompt('Enter property name:');
    if (!propName || !propName.trim()) return;

    const newProp = {
      type: 'string',
      description: ''
    };

    if (!parentPath) {
      // Add to root
      if (!state.currentJSONSchema.properties) {
        state.currentJSONSchema.properties = {};
      }
      state.currentJSONSchema.properties[propName] = newProp;
    } else {
      // Add to nested object
      const parent = getPropertyByPath(state.currentJSONSchema, parentPath);
      if (parent && parent.type === 'object') {
        if (!parent.properties) {
          parent.properties = {};
        }
        parent.properties[propName] = newProp;
      }
    }

    renderJSONSchemaTree();
    updateJSONSchemaPreview();
  };

  window.editJSONSchemaProperty = function(path) {
    const prop = getPropertyByPath(state.currentJSONSchema, path);
    if (!prop) return;

    // Create a simple edit form
    const type = prompt('Type (string|number|boolean|object|array|null):', prop.type);
    if (!type) return;

    prop.type = type;
    prop.description = prompt('Description (optional):', prop.description || '') || '';

    // Type-specific constraints
    if (type === 'string') {
      const minLength = prompt('Minimum length (optional):', prop.minLength || '');
      const maxLength = prompt('Maximum length (optional):', prop.maxLength || '');
      const pattern = prompt('Regex pattern (optional):', prop.pattern || '');

      if (minLength) prop.minLength = parseInt(minLength);
      if (maxLength) prop.maxLength = parseInt(maxLength);
      if (pattern) prop.pattern = pattern;
    } else if (type === 'number') {
      const minimum = prompt('Minimum value (optional):', prop.minimum !== undefined ? prop.minimum : '');
      const maximum = prompt('Maximum value (optional):', prop.maximum !== undefined ? prop.maximum : '');

      if (minimum !== '') prop.minimum = parseFloat(minimum);
      if (maximum !== '') prop.maximum = parseFloat(maximum);
    } else if (type === 'array') {
      const itemsType = prompt('Array items type (string|number|boolean|object):', prop.items?.type || 'string');
      prop.items = { type: itemsType };
    } else if (type === 'object') {
      if (!prop.properties) prop.properties = {};
    }

    const defaultValue = prompt('Default value (JSON, optional):', prop.default ? JSON.stringify(prop.default) : '');
    if (defaultValue) {
      try {
        prop.default = JSON.parse(defaultValue);
      } catch (e) {
        // Keep as string if not valid JSON
        prop.default = defaultValue;
      }
    }

    // Required toggle
    const propName = path.split('.').pop();
    const parentPath = path.split('.').slice(0, -1).join('.');
    const parent = parentPath ? getPropertyByPath(state.currentJSONSchema, parentPath) : state.currentJSONSchema;

    const makeRequired = confirm('Mark this property as required?');
    if (!parent.required) parent.required = [];

    const reqIndex = parent.required.indexOf(propName);
    if (makeRequired && reqIndex === -1) {
      parent.required.push(propName);
    } else if (!makeRequired && reqIndex !== -1) {
      parent.required.splice(reqIndex, 1);
    }

    renderJSONSchemaTree();
    updateJSONSchemaPreview();
  };

  window.deleteJSONSchemaProperty = function(path) {
    if (!confirm('Delete this property?')) return;

    const parts = path.split('.');
    const propName = parts.pop();
    const parentPath = parts.join('.');

    const parent = parentPath ? getPropertyByPath(state.currentJSONSchema, parentPath) : state.currentJSONSchema;

    if (parent && parent.properties) {
      delete parent.properties[propName];

      // Remove from required array
      if (parent.required) {
        const reqIndex = parent.required.indexOf(propName);
        if (reqIndex !== -1) {
          parent.required.splice(reqIndex, 1);
        }
      }
    }

    renderJSONSchemaTree();
    updateJSONSchemaPreview();
  };

  function getPropertyByPath(schema, path) {
    if (!path) return schema;

    const parts = path.split('.');
    let current = schema.properties;

    for (let i = 0; i < parts.length; i++) {
      if (!current || !current[parts[i]]) return null;

      if (i === parts.length - 1) {
        return current[parts[i]];
      }

      current = current[parts[i]].properties;
    }

    return null;
  }

  function updateJSONSchemaPreview() {
    const preview = document.getElementById('jsonSchemaPreview');
    if (!preview) return;

    try {
      preview.value = JSON.stringify(state.currentJSONSchema, null, 2);
      document.getElementById('jsonSchemaErrors').innerHTML = '<span style="color: #28a745;"><i class="fas fa-check-circle"></i> Schema is valid</span>';
    } catch (err) {
      document.getElementById('jsonSchemaErrors').innerHTML = `<span style="color: #dc3545;"><i class="fas fa-exclamation-circle"></i> ${escapeHtml(err.message)}</span>`;
    }
  }

  function generateSampleJSON() {
    const sample = generateSampleFromSchema(state.currentJSONSchema);
    document.getElementById('jsonSamplePreview').value = JSON.stringify(sample, null, 2);
  }

  function generateSampleFromSchema(schema) {
    if (!schema || !schema.type) return null;

    switch (schema.type) {
      case 'string':
        return schema.default !== undefined ? schema.default : 'sample text';
      case 'number':
        return schema.default !== undefined ? schema.default : schema.minimum || 0;
      case 'boolean':
        return schema.default !== undefined ? schema.default : true;
      case 'null':
        return null;
      case 'array':
        const itemSample = schema.items ? generateSampleFromSchema(schema.items) : 'item';
        return [itemSample];
      case 'object':
        const obj = {};
        if (schema.properties) {
          Object.keys(schema.properties).forEach(key => {
            obj[key] = generateSampleFromSchema(schema.properties[key]);
          });
        }
        return obj;
      default:
        return null;
    }
  }

  function importJSONSchema() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const schema = JSON.parse(event.target.result);
          if (schema.type && (schema.type === 'object' || schema.type === 'array')) {
            state.currentJSONSchema = schema;
            renderJSONSchemaTree();
            updateJSONSchemaPreview();
            showToast('Schema imported successfully', 'success');
          } else {
            showToast('Invalid schema format', 'error');
          }
        } catch (err) {
          showToast('Failed to parse JSON schema', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function exportJSONSchema() {
    const dataStr = JSON.stringify(state.currentJSONSchema, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'json-schema.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Schema exported', 'success');
  }

  function saveJSONSchema() {
    closeJSONSchemaModal();
    showToast('JSON schema saved successfully', 'success');
  }

  function closeJSONSchemaModal() {
    const modal = document.getElementById('jsonSchemaModal');
    if (modal) modal.classList.remove('active');
  }

  function openExpressionBuilderModal() {
    // Get current expression from the field modal
    const expressionField = document.getElementById('modalFieldExpression');
    const currentExpression = expressionField ? expressionField.value : '';

    // Create modal if it doesn't exist
    let modal = document.getElementById('expressionBuilderModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'expressionBuilderModal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 1200px;">
          <div class="modal-header">
            <h2><i class="fas fa-function"></i> JSONLex Expression Builder</h2>
            <button class="modal-close" id="expressionBuilderClose">&times;</button>
          </div>
          <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
            <div style="display: grid; grid-template-columns: 250px 1fr 250px; gap: 1rem; height: 500px;">
              <!-- Left Panel: Function Library -->
              <div style="border: 1px solid #dee2e6; border-radius: 4px; padding: 1rem; overflow-y: auto; background: #f8f9fa;">
                <h4 style="margin-top: 0;">Functions</h4>
                <div id="exprFunctionLibrary">
                  <!-- Function categories will be rendered here -->
                </div>
              </div>

              <!-- Center Panel: Expression Editor -->
              <div style="display: flex; flex-direction: column; gap: 1rem;">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <label style="margin: 0; font-weight: bold;">Expression</label>
                    <select id="exprTemplateSelect" class="form-control" style="width: 200px;">
                      <option value="">-- Templates --</option>
                      <option value="concat">Concatenate Fields</option>
                      <option value="math">Math Calculation</option>
                      <option value="conditional">If-Then-Else</option>
                      <option value="dateFormat">Format Date</option>
                      <option value="uppercase">Uppercase Text</option>
                      <option value="sum">Sum Array</option>
                    </select>
                  </div>
                  <textarea id="exprEditorTextarea" class="form-control"
                            style="font-family: 'Courier New', monospace; font-size: 13px; height: 200px;"
                            placeholder="Enter JSONLex expression here...">${escapeHtml(currentExpression)}</textarea>
                  <div id="exprSyntaxStatus" style="margin-top: 0.5rem; padding: 0.5rem; border-radius: 4px; font-size: 12px;">
                    <span style="color: #6c757d;">Enter an expression to validate</span>
                  </div>
                </div>

                <!-- Test Console -->
                <div style="border-top: 1px solid #dee2e6; padding-top: 1rem;">
                  <h4>Test Console</h4>
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div>
                      <label>Sample Data (JSON)</label>
                      <textarea id="exprTestData" class="form-control"
                                style="font-family: 'Courier New', monospace; font-size: 12px; height: 120px;"
                                placeholder='{"firstName": "John", "lastName": "Doe", "age": 30}'></textarea>
                    </div>
                    <div>
                      <label>Result</label>
                      <div id="exprTestResult"
                           style="padding: 1rem; background: #f8f9fa; border: 1px solid #dee2e6;
                                  border-radius: 4px; height: 120px; overflow-y: auto;
                                  font-family: 'Courier New', monospace; font-size: 12px;">
                        <span style="color: #6c757d;">Click "Test Expression" to see results</span>
                      </div>
                    </div>
                  </div>
                  <button class="btn btn-primary" id="exprTestBtn" style="margin-top: 0.5rem;">
                    <i class="fas fa-play"></i> Test Expression
                  </button>
                </div>
              </div>

              <!-- Right Panel: Field Picker & Operators -->
              <div style="border: 1px solid #dee2e6; border-radius: 4px; padding: 1rem; overflow-y: auto; background: #f8f9fa;">
                <h4 style="margin-top: 0;">Fields</h4>
                <div id="exprFieldPicker" style="margin-bottom: 1.5rem;">
                  <!-- Available fields will be listed here -->
                </div>

                <h4>Operators</h4>
                <div id="exprOperators" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem;">
                  <!-- Operators will be rendered here -->
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="expressionBuilderCancel">Cancel</button>
            <button class="btn btn-primary" id="expressionBuilderSave">
              <i class="fas fa-save"></i> Save Expression
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Add event listeners
      document.getElementById('expressionBuilderClose').addEventListener('click', closeExpressionBuilderModal);
      document.getElementById('expressionBuilderCancel').addEventListener('click', closeExpressionBuilderModal);
      document.getElementById('expressionBuilderSave').addEventListener('click', saveExpression);
      document.getElementById('exprTestBtn').addEventListener('click', testExpression);
      document.getElementById('exprTemplateSelect').addEventListener('change', loadExpressionTemplate);
      document.getElementById('exprEditorTextarea').addEventListener('input', validateExpression);
    }

    // Populate the modal
    populateExpressionBuilder();
    modal.classList.add('active');
  }

  function populateExpressionBuilder() {
    // Populate function library
    const functionLibrary = document.getElementById('exprFunctionLibrary');
    const functions = {
      'Math': [
        { name: 'SUM', syntax: 'SUM(array)', desc: 'Sum of array values' },
        { name: 'AVG', syntax: 'AVG(array)', desc: 'Average of array values' },
        { name: 'MIN', syntax: 'MIN(a, b)', desc: 'Minimum value' },
        { name: 'MAX', syntax: 'MAX(a, b)', desc: 'Maximum value' },
        { name: 'ROUND', syntax: 'ROUND(num, decimals)', desc: 'Round number' },
        { name: 'CEIL', syntax: 'CEIL(num)', desc: 'Round up' },
        { name: 'FLOOR', syntax: 'FLOOR(num)', desc: 'Round down' },
        { name: 'ABS', syntax: 'ABS(num)', desc: 'Absolute value' },
        { name: 'POW', syntax: 'POW(base, exp)', desc: 'Power' },
        { name: 'SQRT', syntax: 'SQRT(num)', desc: 'Square root' }
      ],
      'String': [
        { name: 'CONCAT', syntax: 'CONCAT(str1, str2, ...)', desc: 'Concatenate strings' },
        { name: 'UPPER', syntax: 'UPPER(str)', desc: 'Uppercase' },
        { name: 'LOWER', syntax: 'LOWER(str)', desc: 'Lowercase' },
        { name: 'TRIM', syntax: 'TRIM(str)', desc: 'Remove whitespace' },
        { name: 'SUBSTRING', syntax: 'SUBSTRING(str, start, len)', desc: 'Extract substring' },
        { name: 'LENGTH', syntax: 'LENGTH(str)', desc: 'String length' },
        { name: 'REPLACE', syntax: 'REPLACE(str, find, repl)', desc: 'Replace text' }
      ],
      'Date': [
        { name: 'NOW', syntax: 'NOW()', desc: 'Current date/time' },
        { name: 'DATEADD', syntax: 'DATEADD(date, num, unit)', desc: 'Add to date' },
        { name: 'DATEDIFF', syntax: 'DATEDIFF(date1, date2, unit)', desc: 'Date difference' },
        { name: 'FORMAT_DATE', syntax: 'FORMAT_DATE(date, format)', desc: 'Format date' },
        { name: 'YEAR', syntax: 'YEAR(date)', desc: 'Extract year' },
        { name: 'MONTH', syntax: 'MONTH(date)', desc: 'Extract month' },
        { name: 'DAY', syntax: 'DAY(date)', desc: 'Extract day' }
      ],
      'Logical': [
        { name: 'IF', syntax: 'IF(cond, true_val, false_val)', desc: 'Conditional' },
        { name: 'AND', syntax: 'AND(cond1, cond2, ...)', desc: 'Logical AND' },
        { name: 'OR', syntax: 'OR(cond1, cond2, ...)', desc: 'Logical OR' },
        { name: 'NOT', syntax: 'NOT(cond)', desc: 'Logical NOT' },
        { name: 'SWITCH', syntax: 'SWITCH(val, case1, res1, ...)', desc: 'Switch statement' }
      ],
      'Aggregate': [
        { name: 'COUNT', syntax: 'COUNT(array)', desc: 'Count items' },
        { name: 'DISTINCT', syntax: 'DISTINCT(array)', desc: 'Unique values' },
        { name: 'GROUP_BY', syntax: 'GROUP_BY(array, field)', desc: 'Group by field' }
      ]
    };

    let html = '';
    Object.keys(functions).forEach(category => {
      html += `<div class="function-category" style="margin-bottom: 1rem;">
        <strong style="color: #495057; font-size: 13px;">${category}</strong>`;

      functions[category].forEach(fn => {
        html += `
          <div class="function-item"
               style="padding: 0.5rem; margin: 0.25rem 0; background: white; border-radius: 4px; cursor: pointer; font-size: 11px;"
               onclick="insertFunction('${fn.syntax}')"
               title="${fn.desc}">
            <strong style="color: #007bff;">${fn.name}</strong><br>
            <span style="color: #6c757d; font-size: 10px;">${fn.syntax}</span>
          </div>`;
      });

      html += '</div>';
    });

    functionLibrary.innerHTML = html;

    // Populate field picker
    const fieldPicker = document.getElementById('exprFieldPicker');
    if (state.currentEntity && state.currentEntity.fields) {
      let fieldHtml = '';
      state.currentEntity.fields.forEach(field => {
        fieldHtml += `
          <div class="field-item"
               style="padding: 0.5rem; margin: 0.25rem 0; background: white; border-radius: 4px; cursor: pointer; font-size: 12px;"
               onclick="insertField('${field.name}')"
               title="${field.type}">
            <i class="fas fa-database" style="color: #6c757d; margin-right: 0.25rem;"></i>
            ${escapeHtml(field.name)}
            <span style="color: #6c757d; font-size: 10px; display: block;">${field.type}</span>
          </div>`;
      });
      fieldPicker.innerHTML = fieldHtml || '<p style="color: #6c757d; font-size: 11px;">No fields available</p>';
    } else {
      fieldPicker.innerHTML = '<p style="color: #6c757d; font-size: 11px;">No entity loaded</p>';
    }

    // Populate operators
    const operators = [
      { sym: '+', desc: 'Add' },
      { sym: '-', desc: 'Subtract' },
      { sym: '*', desc: 'Multiply' },
      { sym: '/', desc: 'Divide' },
      { sym: '%', desc: 'Modulo' },
      { sym: '=', desc: 'Equal' },
      { sym: '!=', desc: 'Not equal' },
      { sym: '<', desc: 'Less than' },
      { sym: '>', desc: 'Greater than' },
      { sym: '<=', desc: 'Less or equal' },
      { sym: '>=', desc: 'Greater or equal' },
      { sym: '&&', desc: 'And' },
      { sym: '||', desc: 'Or' }
    ];

    const operatorsDiv = document.getElementById('exprOperators');
    operatorsDiv.innerHTML = operators.map(op => `
      <button class="btn btn-sm btn-secondary"
              style="font-size: 11px; padding: 0.25rem 0.5rem;"
              onclick="insertOperator('${op.sym}')"
              title="${op.desc}">
        ${escapeHtml(op.sym)}
      </button>
    `).join('');
  }

  // Global functions for inline handlers
  window.insertFunction = function(syntax) {
    const textarea = document.getElementById('exprEditorTextarea');
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);
    textarea.value = textBefore + syntax + textAfter;
    textarea.focus();
    validateExpression();
  };

  window.insertField = function(fieldName) {
    const textarea = document.getElementById('exprEditorTextarea');
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);
    textarea.value = textBefore + `$.${fieldName}` + textAfter;
    textarea.focus();
    validateExpression();
  };

  window.insertOperator = function(operator) {
    const textarea = document.getElementById('exprEditorTextarea');
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(cursorPos);
    textarea.value = textBefore + ` ${operator} ` + textAfter;
    textarea.focus();
    validateExpression();
  };

  function validateExpression() {
    const textarea = document.getElementById('exprEditorTextarea');
    const statusDiv = document.getElementById('exprSyntaxStatus');
    const expression = textarea.value.trim();

    if (!expression) {
      statusDiv.innerHTML = '<span style="color: #6c757d;">Enter an expression to validate</span>';
      statusDiv.style.background = '#f8f9fa';
      return;
    }

    // Basic syntax validation
    const errors = [];

    // Check for balanced parentheses
    const openCount = (expression.match(/\(/g) || []).length;
    const closeCount = (expression.match(/\)/g) || []).length;
    if (openCount !== closeCount) {
      errors.push('Unbalanced parentheses');
    }

    // Check for balanced quotes
    const quoteCount = (expression.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      errors.push('Unbalanced quotes');
    }

    if (errors.length > 0) {
      statusDiv.innerHTML = `<span style="color: #dc3545;"><i class="fas fa-exclamation-circle"></i> ${errors.join(', ')}</span>`;
      statusDiv.style.background = '#f8d7da';
    } else {
      statusDiv.innerHTML = '<span style="color: #28a745;"><i class="fas fa-check-circle"></i> Syntax looks valid</span>';
      statusDiv.style.background = '#d4edda';
    }
  }

  function testExpression() {
    const expression = document.getElementById('exprEditorTextarea').value.trim();
    const testDataStr = document.getElementById('exprTestData').value.trim();
    const resultDiv = document.getElementById('exprTestResult');

    if (!expression) {
      resultDiv.innerHTML = '<span style="color: #dc3545;">No expression to test</span>';
      return;
    }

    let testData = {};
    if (testDataStr) {
      try {
        testData = JSON.parse(testDataStr);
      } catch (err) {
        resultDiv.innerHTML = `<span style="color: #dc3545;">Invalid test data JSON: ${escapeHtml(err.message)}</span>`;
        return;
      }
    }

    // Simple evaluation (in real implementation, this would use JSONLex evaluator)
    try {
      // Replace $.fieldName with testData.fieldName
      let evalExpr = expression.replace(/\$\.(\w+)/g, (match, field) => {
        return testData[field] !== undefined ? JSON.stringify(testData[field]) : 'null';
      });

      // For demonstration, show the transformed expression
      resultDiv.innerHTML = `
        <div style="margin-bottom: 0.5rem;"><strong>Transformed:</strong></div>
        <div style="background: white; padding: 0.5rem; border-radius: 4px; margin-bottom: 0.5rem; font-size: 11px; word-break: break-all;">
          ${escapeHtml(evalExpr)}
        </div>
        <div style="color: #6c757d; font-size: 11px;">
          <em>Note: Full JSONLex evaluation requires server-side processing</em>
        </div>
      `;
    } catch (err) {
      resultDiv.innerHTML = `<span style="color: #dc3545;">Error: ${escapeHtml(err.message)}</span>`;
    }
  }

  function loadExpressionTemplate() {
    const select = document.getElementById('exprTemplateSelect');
    const template = select.value;
    const textarea = document.getElementById('exprEditorTextarea');

    const templates = {
      concat: '$.firstName + " " + $.lastName',
      math: '($.price * $.quantity) * (1 - $.discount)',
      conditional: 'IF($.age >= 18, "Adult", "Minor")',
      dateFormat: 'FORMAT_DATE($.createdAt, "YYYY-MM-DD")',
      uppercase: 'UPPER($.name)',
      sum: 'SUM($.items)'
    };

    if (template && templates[template]) {
      textarea.value = templates[template];
      validateExpression();
    }

    select.value = '';
  }

  function saveExpression() {
    const expression = document.getElementById('exprEditorTextarea').value.trim();
    const expressionField = document.getElementById('modalFieldExpression');

    if (expressionField) {
      expressionField.value = expression;
    }

    closeExpressionBuilderModal();
    showToast('Expression saved successfully', 'success');
  }

  function closeExpressionBuilderModal() {
    const modal = document.getElementById('expressionBuilderModal');
    if (modal) modal.classList.remove('active');
  }

  // ═══════════════════════════════════════════════════════════
  // Color Picker Functions
  // ═══════════════════════════════════════════════════════════

  let colorPickerState = {
    hue: 0,
    saturation: 100,
    brightness: 50,
    alpha: 1,
    recentColors: []
  };

  function initColorPicker() {
    // Load recent colors from localStorage
    const saved = localStorage.getItem('entityDesignerRecentColors');
    if (saved) {
      colorPickerState.recentColors = JSON.parse(saved);
    }

    // Initialize canvas
    const canvas = document.getElementById('colorPaletteCanvas');
    if (canvas) {
      drawColorPalette();
      canvas.addEventListener('click', handleCanvasClick);
    }

    // Initialize brightness slider
    const slider = document.getElementById('colorBrightnessSlider');
    if (slider) {
      slider.addEventListener('input', handleBrightnessChange);
    }

    // Initialize format tabs
    document.querySelectorAll('.color-format-tab').forEach(tab => {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.color-format-tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        switchColorFormat(this.dataset.format);
      });
    });

    // Initialize input listeners
    document.getElementById('hexInput')?.addEventListener('change', handleHexInput);
    ['rgbR', 'rgbG', 'rgbB'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', handleRGBInput);
    });
    ['rgbaR', 'rgbaG', 'rgbaB', 'rgbaA'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', handleRGBAInput);
    });
    ['hslH', 'hslS', 'hslL'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', handleHSLInput);
    });
    ['cmykC', 'cmykM', 'cmykY', 'cmykK'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', handleCMYKInput);
    });

    // Populate preset palettes
    populateColorPresets();
    updateRecentColors();
  }

  function drawColorPalette() {
    const canvas = document.getElementById('colorPaletteCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Draw saturation gradient (left to right: white to hue)
    for (let x = 0; x < width; x++) {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      const saturation = (x / width) * 100;

      // Top: white
      gradient.addColorStop(0, `hsl(${colorPickerState.hue}, ${saturation}%, 100%)`);
      // Bottom: full color
      gradient.addColorStop(1, `hsl(${colorPickerState.hue}, ${saturation}%, 0%)`);

      ctx.fillStyle = gradient;
      ctx.fillRect(x, 0, 1, height);
    }
  }

  function handleCanvasClick(e) {
    const canvas = document.getElementById('colorPaletteCanvas');
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const saturation = (x / rect.width) * 100;
    const lightness = 100 - (y / rect.height) * 100;

    colorPickerState.saturation = Math.round(saturation);
    colorPickerState.brightness = Math.round(lightness);

    updateColorFromHSL();
  }

  function handleBrightnessChange(e) {
    const value = parseInt(e.target.value);
    colorPickerState.hue = (value / 100) * 360;
    drawColorPalette();
    updateColorFromHSL();
  }

  function updateColorFromHSL() {
    const { hue, saturation, brightness } = colorPickerState;
    const rgb = hslToRgb(hue, saturation, brightness);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);

    updateAllFormats(hex);
    updateColorPreview(hex);
    addToRecentColors(hex);
  }

  function updateAllFormats(hex) {
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const cmyk = rgbToCmyk(rgb.r, rgb.g, rgb.b);

    // Update HEX
    const hexInput = document.getElementById('hexInput');
    if (hexInput) hexInput.value = hex;

    // Update RGB
    document.getElementById('rgbR').value = rgb.r;
    document.getElementById('rgbG').value = rgb.g;
    document.getElementById('rgbB').value = rgb.b;

    // Update RGBA
    document.getElementById('rgbaR').value = rgb.r;
    document.getElementById('rgbaG').value = rgb.g;
    document.getElementById('rgbaB').value = rgb.b;
    document.getElementById('rgbaA').value = colorPickerState.alpha;

    // Update HSL
    document.getElementById('hslH').value = Math.round(hsl.h);
    document.getElementById('hslS').value = Math.round(hsl.s);
    document.getElementById('hslL').value = Math.round(hsl.l);

    // Update CMYK
    document.getElementById('cmykC').value = Math.round(cmyk.c);
    document.getElementById('cmykM').value = Math.round(cmyk.m);
    document.getElementById('cmykY').value = Math.round(cmyk.y);
    document.getElementById('cmykK').value = Math.round(cmyk.k);
  }

  function updateColorPreview(hex) {
    const preview = document.getElementById('colorPreview');
    const hexValue = document.getElementById('colorHexValue');

    if (preview) preview.style.background = hex;
    if (hexValue) hexValue.textContent = hex;
  }

  function switchColorFormat(format) {
    document.querySelectorAll('.color-format-inputs').forEach(div => {
      div.style.display = 'none';
    });

    const targetDiv = format === 'hex' ? 'hexInputs' :
                      format === 'rgb' ? 'rgbInputs' :
                      format === 'rgba' ? 'rgbaInputs' :
                      format === 'hsl' ? 'hslInputs' :
                      'cmykInputs';

    document.getElementById(targetDiv).style.display = 'block';
  }

  // Input handlers
  function handleHexInput(e) {
    const hex = e.target.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      updateAllFormats(hex);
      updateColorPreview(hex);
      addToRecentColors(hex);
    }
  }

  function handleRGBInput() {
    const r = parseInt(document.getElementById('rgbR').value) || 0;
    const g = parseInt(document.getElementById('rgbG').value) || 0;
    const b = parseInt(document.getElementById('rgbB').value) || 0;
    const hex = rgbToHex(r, g, b);
    updateAllFormats(hex);
    updateColorPreview(hex);
  }

  function handleRGBAInput() {
    const r = parseInt(document.getElementById('rgbaR').value) || 0;
    const g = parseInt(document.getElementById('rgbaG').value) || 0;
    const b = parseInt(document.getElementById('rgbaB').value) || 0;
    colorPickerState.alpha = parseFloat(document.getElementById('rgbaA').value) || 1;
    const hex = rgbToHex(r, g, b);
    updateAllFormats(hex);
    updateColorPreview(hex);
  }

  function handleHSLInput() {
    const h = parseInt(document.getElementById('hslH').value) || 0;
    const s = parseInt(document.getElementById('hslS').value) || 0;
    const l = parseInt(document.getElementById('hslL').value) || 0;
    const rgb = hslToRgb(h, s, l);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    updateAllFormats(hex);
    updateColorPreview(hex);
  }

  function handleCMYKInput() {
    const c = parseInt(document.getElementById('cmykC').value) || 0;
    const m = parseInt(document.getElementById('cmykM').value) || 0;
    const y = parseInt(document.getElementById('cmykY').value) || 0;
    const k = parseInt(document.getElementById('cmykK').value) || 0;
    const rgb = cmykToRgb(c, m, y, k);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    updateAllFormats(hex);
    updateColorPreview(hex);
  }

  // Color conversion functions
  function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, x)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  function rgbToCmyk(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const k = 1 - Math.max(r, g, b);
    const c = k === 1 ? 0 : (1 - r - k) / (1 - k);
    const m = k === 1 ? 0 : (1 - g - k) / (1 - k);
    const y = k === 1 ? 0 : (1 - b - k) / (1 - k);
    return { c: c * 100, m: m * 100, y: y * 100, k: k * 100 };
  }

  function cmykToRgb(c, m, y, k) {
    c /= 100; m /= 100; y /= 100; k /= 100;
    const r = 255 * (1 - c) * (1 - k);
    const g = 255 * (1 - m) * (1 - k);
    const b = 255 * (1 - y) * (1 - k);
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
  }

  function addToRecentColors(hex) {
    if (!colorPickerState.recentColors.includes(hex)) {
      colorPickerState.recentColors.unshift(hex);
      if (colorPickerState.recentColors.length > 10) {
        colorPickerState.recentColors.pop();
      }
      localStorage.setItem('entityDesignerRecentColors', JSON.stringify(colorPickerState.recentColors));
      updateRecentColors();
    }
  }

  function updateRecentColors() {
    const container = document.getElementById('recentColors');
    if (!container) return;

    container.innerHTML = colorPickerState.recentColors.map(color => `
      <div style="width: 30px; height: 30px; background: ${color}; border: 1px solid #dee2e6;
                  border-radius: 4px; cursor: pointer;"
           onclick="selectPresetColor('${color}')"
           title="${color}"></div>
    `).join('');
  }

  function populateColorPresets() {
    // Material colors
    const materialColors = [
      '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
      '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50',
      '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800'
    ];

    // Bootstrap colors
    const bootstrapColors = [
      '#0d6efd', '#6c757d', '#198754', '#dc3545', '#ffc107',
      '#0dcaf0', '#f8f9fa', '#212529', '#6610f2', '#d63384'
    ];

    const materialDiv = document.getElementById('materialPalette');
    if (materialDiv) {
      materialDiv.innerHTML = materialColors.map(color => `
        <div style="width: 30px; height: 30px; background: ${color}; border: 1px solid #dee2e6;
                    border-radius: 4px; cursor: pointer;"
             onclick="selectPresetColor('${color}')"
             title="${color}"></div>
      `).join('');
    }

    const bootstrapDiv = document.getElementById('bootstrapPalette');
    if (bootstrapDiv) {
      bootstrapDiv.innerHTML = bootstrapColors.map(color => `
        <div style="width: 30px; height: 30px; background: ${color}; border: 1px solid #dee2e6;
                    border-radius: 4px; cursor: pointer;"
             onclick="selectPresetColor('${color}')"
             title="${color}"></div>
      `).join('');
    }
  }

  window.selectPresetColor = function(hex) {
    updateAllFormats(hex);
    updateColorPreview(hex);
    addToRecentColors(hex);
  };

  // ═══════════════════════════════════════════════════════════
  // Utility Functions
  // ═══════════════════════════════════════════════════════════

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }

  function showToast(message, type = 'info') {
    // Log all toast messages to console
    const logMessage = `[Toast ${type.toUpperCase()}] ${message}`;
    if (type === 'error') {
      console.error(logMessage);
    } else if (type === 'success') {
      console.log(logMessage);
    } else {
      console.info(logMessage);
    }

    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon">
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      </div>
      <div class="toast-message">${escapeHtml(message)}</div>
    `;
    toast.style.cssText = `
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      padding: 1rem 1.5rem;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 10000;
      animation: slideIn 0.3s ease;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function showError(message) {
    console.error('[ERROR]', message);
    console.trace('Error trace:');
    showToast(message, 'error');
  }

  function showSuccess(message) {
    showToast(message, 'success');
  }

  // ═══════════════════════════════════════════════════════════
  // Entity Locking & Read-Only Mode
  // ═══════════════════════════════════════════════════════════

  /**
   * Initialize entity status (lock, read-only, template)
   */
  function initializeEntityStatus() {
    if (!state.currentEntity) {
      // Hide status bar when no entity is selected
      const statusBar = document.getElementById('entityStatusBar');
      if (statusBar) statusBar.style.display = 'none';
      return;
    }

    // Get metadata from entity
    const metadata = state.currentEntity.metadata || {};
    state.isLocked = metadata.locked || false;
    state.isReadOnly = metadata.readOnly || false;
    state.isTemplate = metadata.isTemplate || false;

    // Show status bar
    const statusBar = document.getElementById('entityStatusBar');
    if (statusBar) statusBar.style.display = 'flex';

    // Update badges
    updateEntityStatusBadges();

    // Update button states
    updateLockButtons();

    // Apply UI restrictions
    if (state.isLocked) {
      enforceLockMode();
    } else if (state.isReadOnly) {
      enforceReadOnlyMode();
    } else {
      removeRestrictions();
    }
  }

  /**
   * Update status badges visibility and content
   */
  function updateEntityStatusBadges() {
    const metadata = state.currentEntity?.metadata || {};

    // Locked badge
    const lockedBadge = document.getElementById('lockedBadge');
    if (lockedBadge) {
      lockedBadge.style.display = state.isLocked ? 'inline-flex' : 'none';
    }

    // Read-only badge
    const readOnlyBadge = document.getElementById('readOnlyBadge');
    if (readOnlyBadge) {
      readOnlyBadge.style.display = state.isReadOnly ? 'inline-flex' : 'none';
    }

    // Template badge
    const templateBadge = document.getElementById('templateBadge');
    if (templateBadge) {
      templateBadge.style.display = state.isTemplate ? 'inline-flex' : 'none';
    }

    // Version badge
    const versionBadge = document.getElementById('versionBadge');
    const versionText = document.getElementById('versionText');
    if (versionBadge && versionText && metadata.version) {
      versionText.textContent = metadata.version;
      versionBadge.style.display = 'inline-flex';
    } else if (versionBadge) {
      versionBadge.style.display = 'none';
    }
  }

  /**
   * Update lock/read-only button text and states
   */
  function updateLockButtons() {
    // Lock button
    const lockBtn = document.getElementById('toggleLockBtn');
    const lockBtnText = document.getElementById('lockBtnText');
    if (lockBtn && lockBtnText) {
      lockBtnText.textContent = state.isLocked ? 'Unlock' : 'Lock';
      lockBtn.disabled = false;
    }

    // Read-only button
    const readOnlyBtn = document.getElementById('toggleReadOnlyBtn');
    const readOnlyBtnText = document.getElementById('readOnlyBtnText');
    if (readOnlyBtn && readOnlyBtnText) {
      readOnlyBtnText.textContent = state.isReadOnly ? 'Enable Editing' : 'Read-Only';
      // Disable read-only toggle if locked
      readOnlyBtn.disabled = state.isLocked;
    }

    // Disable other buttons if locked
    const saveAsTemplateBtn = document.getElementById('saveAsTemplateBtn');
    if (saveAsTemplateBtn) {
      saveAsTemplateBtn.disabled = state.isLocked;
    }
  }

  /**
   * Toggle entity lock state
   */
  async function toggleEntityLock() {
    if (!state.currentEntity) return;

    const newLockState = !state.isLocked;

    // Show confirmation dialog
    const action = newLockState ? 'lock' : 'unlock';
    const message = newLockState
      ? 'Are you sure you want to lock this entity? It cannot be modified until unlocked.'
      : 'Are you sure you want to unlock this entity?';

    if (!confirm(message)) return;

    try {
      // Update metadata
      if (!state.currentEntity.metadata) {
        state.currentEntity.metadata = {};
      }
      state.currentEntity.metadata.locked = newLockState;

      if (newLockState) {
        state.currentEntity.metadata.lockedBy = state.currentUser || 'current_user';
        state.currentEntity.metadata.lockedAt = new Date().toISOString();
      } else {
        state.currentEntity.metadata.lockedBy = null;
        state.currentEntity.metadata.lockedAt = null;
      }

      // Save to server
      await saveEntityMetadata();

      // Update local state
      state.isLocked = newLockState;

      // Update UI
      updateEntityStatusBadges();
      updateLockButtons();

      // Apply restrictions
      if (state.isLocked) {
        enforceLockMode();
      } else {
        removeRestrictions();
        // Re-apply read-only if still active
        if (state.isReadOnly) {
          enforceReadOnlyMode();
        }
      }

      showSuccess(`Entity ${action}ed successfully`);
    } catch (error) {
      console.error('Error toggling lock:', error);
      showError(`Failed to ${action} entity`);
    }
  }

  /**
   * Toggle entity read-only state
   */
  async function toggleEntityReadOnly() {
    if (!state.currentEntity || state.isLocked) return;

    const newReadOnlyState = !state.isReadOnly;

    try {
      // Update metadata
      if (!state.currentEntity.metadata) {
        state.currentEntity.metadata = {};
      }
      state.currentEntity.metadata.readOnly = newReadOnlyState;

      // Save to server
      await saveEntityMetadata();

      // Update local state
      state.isReadOnly = newReadOnlyState;

      // Update UI
      updateEntityStatusBadges();
      updateLockButtons();

      // Apply restrictions
      if (state.isReadOnly) {
        enforceReadOnlyMode();
      } else {
        removeRestrictions();
      }

      const action = newReadOnlyState ? 'enabled' : 'disabled';
      showSuccess(`Read-only mode ${action}`);
    } catch (error) {
      console.error('Error toggling read-only:', error);
      showError('Failed to toggle read-only mode');
    }
  }

  /**
   * Save as template
   */
  function saveAsTemplate() {
    if (!state.currentEntity) return;

    // Open entity settings modal with template tab active
    openEntitySettingsModal();

    // Pre-check template checkbox
    const templateCheckbox = document.getElementById('entityIsTemplate');
    if (templateCheckbox) {
      templateCheckbox.checked = true;
      handleTemplateCheckboxChange({ target: { checked: true } });
    }
  }

  /**
   * Open entity settings modal
   */
  function openEntitySettingsModal() {
    if (!state.currentEntity) return;

    const modal = document.getElementById('entitySettingsModal');
    if (!modal) return;

    const metadata = state.currentEntity.metadata || {};

    // Populate form fields
    const displayName = document.getElementById('entityDisplayName');
    if (displayName) displayName.value = state.currentEntity.displayName || state.currentEntity.name || '';

    const description = document.getElementById('entityDescription');
    if (description) description.value = metadata.description || '';

    const version = document.getElementById('entityVersion');
    if (version) version.value = metadata.version || '1.0.0';

    const locked = document.getElementById('entityLocked');
    if (locked) {
      locked.checked = state.isLocked;
      handleLockedCheckboxChange({ target: { checked: state.isLocked } });
    }

    const readOnly = document.getElementById('entityReadOnly');
    if (readOnly) readOnly.checked = state.isReadOnly;

    const isTemplate = document.getElementById('entityIsTemplate');
    if (isTemplate) {
      isTemplate.checked = state.isTemplate;
      handleTemplateCheckboxChange({ target: { checked: state.isTemplate } });
    }

    const templateName = document.getElementById('entityTemplateName');
    if (templateName) templateName.value = metadata.templateName || '';

    const templateCategory = document.getElementById('entityTemplateCategory');
    if (templateCategory) templateCategory.value = metadata.templateCategory || '';

    // Show lock info if locked
    if (state.isLocked && metadata.lockedBy) {
      const lockedByUser = document.getElementById('lockedByUser');
      const lockedAtTime = document.getElementById('lockedAtTime');
      if (lockedByUser) lockedByUser.textContent = metadata.lockedBy;
      if (lockedAtTime) {
        const date = new Date(metadata.lockedAt);
        lockedAtTime.textContent = date.toLocaleString();
      }
    }

    // Show modal
    modal.classList.add('active');
  }

  /**
   * Close entity settings modal
   */
  function closeEntitySettingsModal() {
    const modal = document.getElementById('entitySettingsModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }

  /**
   * Save entity settings
   */
  async function saveEntitySettings() {
    if (!state.currentEntity) return;

    try {
      // Gather form data
      const displayName = document.getElementById('entityDisplayName')?.value;
      const description = document.getElementById('entityDescription')?.value;
      const version = document.getElementById('entityVersion')?.value;
      const locked = document.getElementById('entityLocked')?.checked;
      const readOnly = document.getElementById('entityReadOnly')?.checked;
      const isTemplate = document.getElementById('entityIsTemplate')?.checked;
      const templateName = document.getElementById('entityTemplateName')?.value;
      const templateCategory = document.getElementById('entityTemplateCategory')?.value;

      // Validate version format
      if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
        showError('Invalid version format. Use MAJOR.MINOR.PATCH (e.g., 1.0.0)');
        return;
      }

      // Update entity
      if (displayName) state.currentEntity.displayName = displayName;

      // Update metadata
      if (!state.currentEntity.metadata) {
        state.currentEntity.metadata = {};
      }

      state.currentEntity.metadata.description = description;
      state.currentEntity.metadata.version = version || '1.0.0';
      state.currentEntity.metadata.locked = locked;
      state.currentEntity.metadata.readOnly = readOnly;
      state.currentEntity.metadata.isTemplate = isTemplate;
      state.currentEntity.metadata.templateName = templateName;
      state.currentEntity.metadata.templateCategory = templateCategory;

      // Handle lock state change
      if (locked && !state.isLocked) {
        state.currentEntity.metadata.lockedBy = state.currentUser || 'current_user';
        state.currentEntity.metadata.lockedAt = new Date().toISOString();
      } else if (!locked) {
        state.currentEntity.metadata.lockedBy = null;
        state.currentEntity.metadata.lockedAt = null;
      }

      // Save to server
      await saveEntityMetadata();

      // Update local state
      state.isLocked = locked;
      state.isReadOnly = readOnly;
      state.isTemplate = isTemplate;

      // Update UI
      updateEntityStatusBadges();
      updateLockButtons();
      updateEntityTitle();

      // Apply restrictions
      if (state.isLocked) {
        enforceLockMode();
      } else if (state.isReadOnly) {
        enforceReadOnlyMode();
      } else {
        removeRestrictions();
      }

      // Close modal
      closeEntitySettingsModal();

      showSuccess('Entity settings saved successfully');
    } catch (error) {
      console.error('Error saving entity settings:', error);
      showError('Failed to save entity settings');
    }
  }

  /**
   * Save entity metadata to server
   */
  async function saveEntityMetadata() {
    if (!state.currentEntity) return;

    const response = await fetch(`/lowcode/api/entities/${state.currentEntity.id}/metadata`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        displayName: state.currentEntity.displayName,
        metadata: state.currentEntity.metadata
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Failed to save metadata');
    }

    return data;
  }

  /**
   * Enforce lock mode - most restrictive
   */
  function enforceLockMode() {
    // Disable all edit controls
    disableAllControls();

    // Add locked overlay to editor content
    const editorContent = document.querySelector('.editor-content');
    if (editorContent) {
      editorContent.classList.add('locked-overlay');
    }

    // Hide action buttons except unlock
    const addFieldBtn = document.getElementById('addFieldBtn');
    if (addFieldBtn) addFieldBtn.style.display = 'none';

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) saveBtn.disabled = true;

    const generateCrudBtn = document.getElementById('generateCrudBtn');
    if (generateCrudBtn) generateCrudBtn.disabled = true;
  }

  /**
   * Enforce read-only mode - viewing allowed, editing prevented
   */
  function enforceReadOnlyMode() {
    // Disable all edit controls
    disableAllControls();

    // Add read-only overlay to editor content
    const editorContent = document.querySelector('.editor-content');
    if (editorContent) {
      editorContent.classList.add('read-only-overlay');
    }

    // Hide action buttons
    const addFieldBtn = document.getElementById('addFieldBtn');
    if (addFieldBtn) addFieldBtn.style.display = 'none';

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) saveBtn.disabled = true;

    // Disable all form inputs in properties panel
    const propertiesContent = document.getElementById('propertiesContent');
    if (propertiesContent) {
      const inputs = propertiesContent.querySelectorAll('input, select, textarea, button');
      inputs.forEach(input => input.disabled = true);
    }
  }

  /**
   * Remove all restrictions
   */
  function removeRestrictions() {
    // Remove overlays
    const editorContent = document.querySelector('.editor-content');
    if (editorContent) {
      editorContent.classList.remove('locked-overlay', 'read-only-overlay');
    }

    // Re-enable controls
    enableAllControls();

    // Show action buttons
    const addFieldBtn = document.getElementById('addFieldBtn');
    if (addFieldBtn && state.currentEntity) addFieldBtn.style.display = 'inline-flex';

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) saveBtn.disabled = false;

    const generateCrudBtn = document.getElementById('generateCrudBtn');
    if (generateCrudBtn) generateCrudBtn.disabled = false;

    // Enable properties panel inputs
    const propertiesContent = document.getElementById('propertiesContent');
    if (propertiesContent) {
      const inputs = propertiesContent.querySelectorAll('input, select, textarea, button');
      inputs.forEach(input => input.disabled = false);
    }
  }

  /**
   * Disable all edit controls
   */
  function disableAllControls() {
    // Disable table row clicks
    const fieldsTableBody = document.getElementById('fieldsTableBody');
    if (fieldsTableBody) {
      fieldsTableBody.style.pointerEvents = 'none';
    }

    // Disable relationship canvas interactions
    const relationshipCanvas = document.getElementById('relationshipCanvas');
    if (relationshipCanvas) {
      relationshipCanvas.style.pointerEvents = 'none';
    }
  }

  /**
   * Enable all edit controls
   */
  function enableAllControls() {
    // Enable table row clicks
    const fieldsTableBody = document.getElementById('fieldsTableBody');
    if (fieldsTableBody) {
      fieldsTableBody.style.pointerEvents = 'auto';
    }

    // Enable relationship canvas interactions
    const relationshipCanvas = document.getElementById('relationshipCanvas');
    if (relationshipCanvas) {
      relationshipCanvas.style.pointerEvents = 'auto';
    }
  }

  /**
   * Handle template checkbox change
   */
  function handleTemplateCheckboxChange(e) {
    const isChecked = e.target.checked;
    const templateSettingsGroup = document.getElementById('templateSettingsGroup');

    if (templateSettingsGroup) {
      templateSettingsGroup.style.display = isChecked ? 'block' : 'none';
    }
  }

  /**
   * Handle locked checkbox change
   */
  function handleLockedCheckboxChange(e) {
    const isChecked = e.target.checked;
    const lockedInfoSection = document.getElementById('lockedInfoSection');

    if (lockedInfoSection) {
      lockedInfoSection.style.display = isChecked ? 'block' : 'none';
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════

  window.entityDesignerPro = {
    init,
    editField,
    deleteField,
    saveFieldChanges,
    editRelationship,
    deleteRelationship,
    editIndex,
    deleteIndex
  };

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
