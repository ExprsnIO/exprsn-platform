/**
 * ═══════════════════════════════════════════════════════════
 * Visual Query Builder - Tab Components (Fields, Filters, Aggregation, etc.)
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  // Extend QueryBuilderUI with tab rendering methods
  if (typeof window.QueryBuilderUI === 'undefined') {
    console.error('[QueryBuilderUI-Tabs] QueryBuilderUI not loaded');
    return;
  }

  Object.assign(window.QueryBuilderUI.prototype, {

    // ═══════════════════════════════════════════════════════════
    // Fields Tab
    // ═══════════════════════════════════════════════════════════

    renderFieldsTab(container) {
      const query = this.qb.currentQuery;
      if (!query) {
        container.innerHTML = '<div class="alert alert-info">Please select a data source first</div>';
        return;
      }

      const selectedFields = query.fields || [];

      container.innerHTML = `
        <div class="fields-selector">
          <div class="row">
            <!-- Available Fields -->
            <div class="col-md-6">
              <div class="section-header">
                <h5><i class="fas fa-list"></i> Available Fields</h5>
                <small class="text-muted">${this.availableFields.length} fields</small>
              </div>
              <div class="field-search mb-3">
                <input type="text" class="form-control" id="fieldSearchInput"
                  placeholder="Search fields..." onkeyup="window.queryBuilderUI.filterAvailableFields()">
              </div>
              <div class="available-fields-list" id="availableFieldsList">
                ${this.renderAvailableFields()}
              </div>
            </div>

            <!-- Selected Fields -->
            <div class="col-md-6">
              <div class="section-header">
                <h5><i class="fas fa-check-square"></i> Selected Fields</h5>
                <div class="header-actions">
                  <button class="btn btn-sm btn-outline-primary" onclick="window.queryBuilderUI.selectAllFields()">
                    <i class="fas fa-check-double"></i> Select All
                  </button>
                  <button class="btn btn-sm btn-outline-secondary" onclick="window.queryBuilderUI.clearAllFields()">
                    <i class="fas fa-times"></i> Clear All
                  </button>
                </div>
              </div>
              <div class="selected-fields-list" id="selectedFieldsList">
                ${selectedFields.length === 0
                  ? '<div class="text-muted text-center p-4">No fields selected<br><small>Select from available fields or use * for all</small></div>'
                  : this.renderSelectedFields(selectedFields)}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    renderAvailableFields() {
      if (this.availableFields.length === 0) {
        return '<div class="text-muted text-center p-4">No fields available<br><small>Configure data source first</small></div>';
      }

      return this.availableFields.map(field => {
        const isSelected = this.qb.currentQuery?.fields?.some(f => f.name === field.name);
        return `
          <div class="field-item ${isSelected ? 'selected' : ''}" data-field="${field.name}">
            <div class="field-info">
              <div class="field-name">
                <i class="fas fa-grip-vertical drag-handle"></i>
                ${field.label || field.name}
              </div>
              <div class="field-type">
                <span class="badge bg-secondary">${field.type}</span>
              </div>
            </div>
            <div class="field-actions">
              ${isSelected
                ? `<button class="btn btn-sm btn-outline-danger" onclick="window.queryBuilderUI.removeField('${field.name}')">
                    <i class="fas fa-times"></i>
                  </button>`
                : `<button class="btn btn-sm btn-outline-primary" onclick="window.queryBuilderUI.addField('${field.name}')">
                    <i class="fas fa-plus"></i>
                  </button>`
              }
            </div>
          </div>
        `;
      }).join('');
    }

    renderSelectedFields(fields) {
      return fields.map((field, index) => `
        <div class="selected-field-item" data-field-index="${index}">
          <div class="field-drag-handle">
            <i class="fas fa-grip-vertical"></i>
          </div>
          <div class="field-config">
            <div class="row g-2">
              <div class="col-md-4">
                <label class="form-label-sm">Field</label>
                <input type="text" class="form-control form-control-sm" value="${field.name}" disabled>
              </div>
              <div class="col-md-4">
                <label class="form-label-sm">Alias (Optional)</label>
                <input type="text" class="form-control form-control-sm" value="${field.alias || ''}"
                  placeholder="Custom name"
                  onchange="window.queryBuilderUI.updateFieldAlias(${index}, this.value)">
              </div>
              <div class="col-md-3">
                <label class="form-label-sm">Transform</label>
                <select class="form-select form-select-sm" onchange="window.queryBuilderUI.updateFieldTransform(${index}, this.value)">
                  <option value="" ${!field.transform ? 'selected' : ''}>None</option>
                  <option value="uppercase" ${field.transform === 'uppercase' ? 'selected' : ''}>UPPERCASE</option>
                  <option value="lowercase" ${field.transform === 'lowercase' ? 'selected' : ''}>lowercase</option>
                  <option value="trim" ${field.transform === 'trim' ? 'selected' : ''}>Trim</option>
                  <option value="date_format" ${field.transform === 'date_format' ? 'selected' : ''}>Format Date</option>
                </select>
              </div>
              <div class="col-md-1">
                <label class="form-label-sm">&nbsp;</label>
                <button class="btn btn-sm btn-outline-danger w-100" onclick="window.queryBuilderUI.removeFieldByIndex(${index})">
                  <i class="fas fa-times"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `).join('');
    }

    filterAvailableFields() {
      const searchTerm = document.getElementById('fieldSearchInput').value.toLowerCase();
      const fieldItems = document.querySelectorAll('.field-item');

      fieldItems.forEach(item => {
        const fieldName = item.dataset.field.toLowerCase();
        item.style.display = fieldName.includes(searchTerm) ? 'flex' : 'none';
      });
    }

    addField(fieldName) {
      const query = this.qb.currentQuery;
      if (!query) return;

      const field = this.availableFields.find(f => f.name === fieldName);
      if (!field) return;

      if (!query.fields) {
        query.fields = [];
      }

      query.fields.push({
        name: field.name,
        alias: '',
        transform: ''
      });

      this.qb.updateQuery(query.id, {});
      this.renderFieldsTab(document.getElementById('queryTabContent'));
    }

    removeField(fieldName) {
      const query = this.qb.currentQuery;
      if (!query || !query.fields) return;

      query.fields = query.fields.filter(f => f.name !== fieldName);
      this.qb.updateQuery(query.id, {});
      this.renderFieldsTab(document.getElementById('queryTabContent'));
    }

    removeFieldByIndex(index) {
      const query = this.qb.currentQuery;
      if (!query || !query.fields) return;

      query.fields.splice(index, 1);
      this.qb.updateQuery(query.id, {});
      this.renderFieldsTab(document.getElementById('queryTabContent'));
    }

    updateFieldAlias(index, alias) {
      const query = this.qb.currentQuery;
      if (!query || !query.fields || !query.fields[index]) return;

      query.fields[index].alias = alias;
      this.qb.updateQuery(query.id, {});
    }

    updateFieldTransform(index, transform) {
      const query = this.qb.currentQuery;
      if (!query || !query.fields || !query.fields[index]) return;

      query.fields[index].transform = transform;
      this.qb.updateQuery(query.id, {});
    }

    selectAllFields() {
      const query = this.qb.currentQuery;
      if (!query) return;

      query.fields = this.availableFields.map(f => ({
        name: f.name,
        alias: '',
        transform: ''
      }));

      this.qb.updateQuery(query.id, {});
      this.renderFieldsTab(document.getElementById('queryTabContent'));
    }

    clearAllFields() {
      const query = this.qb.currentQuery;
      if (!query) return;

      query.fields = [];
      this.qb.updateQuery(query.id, {});
      this.renderFieldsTab(document.getElementById('queryTabContent'));
    }

    // ═══════════════════════════════════════════════════════════
    // Filters Tab
    // ═══════════════════════════════════════════════════════════

    renderFiltersTab(container) {
      const query = this.qb.currentQuery;
      if (!query) {
        container.innerHTML = '<div class="alert alert-info">Please select a data source first</div>';
        return;
      }

      container.innerHTML = `
        <div class="filters-builder">
          <div class="section-header">
            <h5><i class="fas fa-filter"></i> Filter Rules</h5>
            <div class="header-actions">
              <button class="btn btn-sm btn-outline-primary" onclick="window.queryBuilderUI.addFilterRule()">
                <i class="fas fa-plus"></i> Add Rule
              </button>
              <button class="btn btn-sm btn-outline-primary" onclick="window.queryBuilderUI.addFilterGroup()">
                <i class="fas fa-layer-group"></i> Add Group
              </button>
            </div>
          </div>
          <div class="filter-rules-container">
            ${this.renderFilterGroup(query.filters)}
          </div>
        </div>
      `;
    }

    renderFilterGroup(group, level = 0) {
      if (!group || !group.rules) {
        return '<div class="text-muted text-center p-4">No filters configured<br><small>Click "Add Rule" to create a filter</small></div>';
      }

      const indent = level * 20;

      return `
        <div class="filter-group" style="margin-left: ${indent}px;">
          <div class="group-header">
            <select class="form-select form-select-sm group-condition" style="width: 100px;"
              onchange="window.queryBuilderUI.updateGroupCondition('${group.id || 'root'}', this.value)">
              <option value="AND" ${group.condition === 'AND' ? 'selected' : ''}>AND</option>
              <option value="OR" ${group.condition === 'OR' ? 'selected' : ''}>OR</option>
            </select>
            ${level > 0 ? `<button class="btn btn-sm btn-outline-danger" onclick="window.queryBuilderUI.removeFilterGroup('${group.id}')">
              <i class="fas fa-times"></i>
            </button>` : ''}
          </div>
          <div class="group-rules">
            ${group.rules.map(rule => {
              if (rule.type === 'group') {
                return this.renderFilterGroup(rule, level + 1);
              }
              return this.renderFilterRule(rule, group.id || 'root');
            }).join('')}
          </div>
        </div>
      `;
    }

    renderFilterRule(rule, groupId) {
      const operators = Object.entries(window.QUERY_OPERATORS)
        .filter(([key, op]) => {
          // Filter operators based on field type if known
          return true; // For now, show all
        });

      return `
        <div class="filter-rule">
          <div class="row g-2 align-items-center">
            <!-- Field -->
            <div class="col-md-3">
              <select class="form-select form-select-sm" onchange="window.queryBuilderUI.updateFilterField('${rule.id}', this.value)">
                <option value="">-- Select Field --</option>
                ${this.availableFields.map(f => `
                  <option value="${f.name}" ${rule.field === f.name ? 'selected' : ''}>${f.label || f.name}</option>
                `).join('')}
              </select>
            </div>

            <!-- Operator -->
            <div class="col-md-2">
              <select class="form-select form-select-sm" onchange="window.queryBuilderUI.updateFilterOperator('${rule.id}', this.value)">
                ${operators.map(([key, op]) => `
                  <option value="${key}" ${rule.operator === key ? 'selected' : ''}>${op.label}</option>
                `).join('')}
              </select>
            </div>

            <!-- Value Type -->
            <div class="col-md-2">
              <select class="form-select form-select-sm" onchange="window.queryBuilderUI.updateFilterValueType('${rule.id}', this.value)">
                <option value="static" ${rule.valueType === 'static' ? 'selected' : ''}>Static Value</option>
                <option value="variable" ${rule.valueType === 'variable' ? 'selected' : ''}>Variable</option>
                <option value="parameter" ${rule.valueType === 'parameter' ? 'selected' : ''}>Parameter</option>
                <option value="field" ${rule.valueType === 'field' ? 'selected' : ''}>Field</option>
              </select>
            </div>

            <!-- Value -->
            <div class="col-md-4">
              ${this.renderFilterValueInput(rule)}
            </div>

            <!-- Actions -->
            <div class="col-md-1">
              <button class="btn btn-sm btn-outline-danger" onclick="window.queryBuilderUI.removeFilterRule('${rule.id}', '${groupId}')">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    renderFilterValueInput(rule) {
      const needsValue = !['isNull', 'isNotNull', 'isTrue', 'isFalse'].includes(rule.operator);
      if (!needsValue) {
        return '<input type="text" class="form-control form-control-sm" value="N/A" disabled>';
      }

      switch (rule.valueType) {
        case 'variable':
          return `
            <select class="form-select form-select-sm" onchange="window.queryBuilderUI.updateFilterValue('${rule.id}', this.value)">
              <option value="">-- Select Variable --</option>
              ${this.qb.availableVariables.map(v => `
                <option value="${v.name}" ${rule.valueSource === v.name ? 'selected' : ''}>${v.name}</option>
              `).join('')}
            </select>
          `;

        case 'field':
          return `
            <select class="form-select form-select-sm" onchange="window.queryBuilderUI.updateFilterValue('${rule.id}', this.value)">
              <option value="">-- Select Field --</option>
              ${this.availableFields.map(f => `
                <option value="${f.name}" ${rule.valueSource === f.name ? 'selected' : ''}>${f.label || f.name}</option>
              `).join('')}
            </select>
          `;

        case 'parameter':
          return `
            <input type="text" class="form-control form-control-sm" placeholder="Parameter name"
              value="${rule.valueSource || ''}"
              onchange="window.queryBuilderUI.updateFilterValue('${rule.id}', this.value)">
          `;

        default: // static
          return `
            <input type="text" class="form-control form-control-sm" placeholder="Enter value"
              value="${rule.value || ''}"
              onchange="window.queryBuilderUI.updateFilterValue('${rule.id}', this.value)">
          `;
      }
    }

    addFilterRule() {
      this.qb.addFilter(this.qb.currentQuery.id);
    }

    addFilterGroup() {
      this.qb.addFilterGroup(this.qb.currentQuery.id);
    }

    removeFilterRule(ruleId, groupId) {
      this.qb.removeFilter(this.qb.currentQuery.id, ruleId);
    }

    removeFilterGroup(groupId) {
      this.qb.removeFilter(this.qb.currentQuery.id, groupId);
    }

    updateGroupCondition(groupId, condition) {
      const query = this.qb.currentQuery;
      if (!query) return;

      const updateGroup = (group) => {
        if ((group.id || 'root') === groupId) {
          group.condition = condition;
          return true;
        }
        for (const rule of group.rules) {
          if (rule.type === 'group' && updateGroup(rule)) {
            return true;
          }
        }
        return false;
      };

      updateGroup(query.filters);
      this.qb.updateQuery(query.id, {});
    }

    updateFilterField(ruleId, field) {
      const query = this.qb.currentQuery;
      const rule = this.findFilterRule(query.filters, ruleId);
      if (rule) {
        rule.field = field;
        this.qb.updateQuery(query.id, {});
        this.renderFiltersTab(document.getElementById('queryTabContent'));
      }
    }

    updateFilterOperator(ruleId, operator) {
      const query = this.qb.currentQuery;
      const rule = this.findFilterRule(query.filters, ruleId);
      if (rule) {
        rule.operator = operator;
        this.qb.updateQuery(query.id, {});
        this.renderFiltersTab(document.getElementById('queryTabContent'));
      }
    }

    updateFilterValueType(ruleId, valueType) {
      const query = this.qb.currentQuery;
      const rule = this.findFilterRule(query.filters, ruleId);
      if (rule) {
        rule.valueType = valueType;
        rule.value = '';
        rule.valueSource = '';
        this.qb.updateQuery(query.id, {});
        this.renderFiltersTab(document.getElementById('queryTabContent'));
      }
    }

    updateFilterValue(ruleId, value) {
      const query = this.qb.currentQuery;
      const rule = this.findFilterRule(query.filters, ruleId);
      if (rule) {
        if (rule.valueType === 'static') {
          rule.value = value;
        } else {
          rule.valueSource = value;
        }
        this.qb.updateQuery(query.id, {});
      }
    }

    findFilterRule(group, ruleId) {
      for (const rule of group.rules) {
        if (rule.id === ruleId) {
          return rule;
        }
        if (rule.type === 'group') {
          const found = this.findFilterRule(rule, ruleId);
          if (found) return found;
        }
      }
      return null;
    }

    // ═══════════════════════════════════════════════════════════
    // Continue in next file...
    // ═══════════════════════════════════════════════════════════
  });

})();
