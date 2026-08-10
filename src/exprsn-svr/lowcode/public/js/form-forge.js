/**
 * ═══════════════════════════════════════════════════════════
 * Form Designer - Forge Integration Module
 * Connects forms to exprsn-forge CRM for business data
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class ForgeIntegration {
    constructor(formDesigner) {
      this.formDesigner = formDesigner;
      this.appId = formDesigner.state.appId;

      // Forge CRM entities
      this.forgeEntities = [];
      this.entitySchemas = {};

      // Forge base URL
      this.forgeBaseUrl = '/forge/api';

      this.init();
    }

    async init() {
      console.log('[Forge] Initializing Forge integration...');

      // Load available CRM entities
      await this.loadForgeEntities();

      console.log('[Forge] Initialization complete');
    }

    // ───────────────────────────────────────────────────────────
    // Load Forge Entities
    // ───────────────────────────────────────────────────────────

    async loadForgeEntities() {
      try {
        // Try to load from Forge service
        const response = await fetch(`${this.forgeBaseUrl}/crm/entities`);
        const result = await response.json();

        if (result.success) {
          this.forgeEntities = result.data || [];
          console.log('[Forge] Loaded', this.forgeEntities.length, 'entities from Forge');
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.warn('[Forge] Using default CRM entities:', error);
        // Use default CRM entity definitions
        this.forgeEntities = [
          {
            id: 'contact',
            name: 'Contact',
            pluralName: 'Contacts',
            description: 'Individual people or contacts',
            icon: 'fas fa-user',
            fields: [
              { name: 'firstName', type: 'string', label: 'First Name', required: true },
              { name: 'lastName', type: 'string', label: 'Last Name', required: true },
              { name: 'email', type: 'email', label: 'Email', required: false },
              { name: 'phone', type: 'phone', label: 'Phone', required: false },
              { name: 'company', type: 'string', label: 'Company', required: false },
              { name: 'title', type: 'string', label: 'Title', required: false },
              { name: 'status', type: 'picklist', label: 'Status', options: ['Active', 'Inactive'] }
            ]
          },
          {
            id: 'account',
            name: 'Account',
            pluralName: 'Accounts',
            description: 'Companies or organizations',
            icon: 'fas fa-building',
            fields: [
              { name: 'name', type: 'string', label: 'Account Name', required: true },
              { name: 'website', type: 'url', label: 'Website', required: false },
              { name: 'industry', type: 'picklist', label: 'Industry', options: ['Technology', 'Finance', 'Healthcare', 'Retail', 'Other'] },
              { name: 'employees', type: 'number', label: 'Employees', required: false },
              { name: 'revenue', type: 'currency', label: 'Annual Revenue', required: false },
              { name: 'type', type: 'picklist', label: 'Account Type', options: ['Customer', 'Prospect', 'Partner', 'Vendor'] }
            ]
          },
          {
            id: 'lead',
            name: 'Lead',
            pluralName: 'Leads',
            description: 'Potential customers or sales prospects',
            icon: 'fas fa-user-plus',
            fields: [
              { name: 'firstName', type: 'string', label: 'First Name', required: true },
              { name: 'lastName', type: 'string', label: 'Last Name', required: true },
              { name: 'email', type: 'email', label: 'Email', required: true },
              { name: 'phone', type: 'phone', label: 'Phone', required: false },
              { name: 'company', type: 'string', label: 'Company', required: false },
              { name: 'source', type: 'picklist', label: 'Lead Source', options: ['Website', 'Referral', 'Trade Show', 'Cold Call', 'Social Media'] },
              { name: 'status', type: 'picklist', label: 'Status', options: ['New', 'Contacted', 'Qualified', 'Converted', 'Lost'] },
              { name: 'score', type: 'number', label: 'Lead Score', required: false }
            ]
          },
          {
            id: 'opportunity',
            name: 'Opportunity',
            pluralName: 'Opportunities',
            description: 'Sales opportunities and deals',
            icon: 'fas fa-dollar-sign',
            fields: [
              { name: 'name', type: 'string', label: 'Opportunity Name', required: true },
              { name: 'accountId', type: 'lookup', label: 'Account', lookupEntity: 'account', required: true },
              { name: 'amount', type: 'currency', label: 'Amount', required: true },
              { name: 'stage', type: 'picklist', label: 'Stage', options: ['Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'] },
              { name: 'probability', type: 'number', label: 'Probability %', required: false },
              { name: 'closeDate', type: 'date', label: 'Expected Close Date', required: true },
              { name: 'nextStep', type: 'string', label: 'Next Step', required: false }
            ]
          },
          {
            id: 'case',
            name: 'Case',
            pluralName: 'Cases',
            description: 'Customer support cases and tickets',
            icon: 'fas fa-ticket-alt',
            fields: [
              { name: 'subject', type: 'string', label: 'Subject', required: true },
              { name: 'description', type: 'text', label: 'Description', required: true },
              { name: 'contactId', type: 'lookup', label: 'Contact', lookupEntity: 'contact', required: false },
              { name: 'priority', type: 'picklist', label: 'Priority', options: ['Low', 'Medium', 'High', 'Critical'] },
              { name: 'status', type: 'picklist', label: 'Status', options: ['New', 'In Progress', 'Waiting', 'Resolved', 'Closed'] },
              { name: 'type', type: 'picklist', label: 'Case Type', options: ['Question', 'Problem', 'Feature Request', 'Bug'] }
            ]
          },
          {
            id: 'task',
            name: 'Task',
            pluralName: 'Tasks',
            description: 'Tasks and to-dos',
            icon: 'fas fa-tasks',
            fields: [
              { name: 'subject', type: 'string', label: 'Subject', required: true },
              { name: 'description', type: 'text', label: 'Description', required: false },
              { name: 'dueDate', type: 'date', label: 'Due Date', required: false },
              { name: 'priority', type: 'picklist', label: 'Priority', options: ['Low', 'Medium', 'High'] },
              { name: 'status', type: 'picklist', label: 'Status', options: ['Not Started', 'In Progress', 'Completed', 'Deferred'] },
              { name: 'assignedTo', type: 'user', label: 'Assigned To', required: false }
            ]
          }
        ];
      }
    }

    async loadEntitySchema(entityId) {
      if (this.entitySchemas[entityId]) {
        return this.entitySchemas[entityId];
      }

      const entity = this.forgeEntities.find(e => e.id === entityId);
      if (entity) {
        this.entitySchemas[entityId] = entity;
        return entity;
      }

      return null;
    }

    // ───────────────────────────────────────────────────────────
    // CRUD Operations
    // ───────────────────────────────────────────────────────────

    async getRecords(entityId, options = {}) {
      const {
        filters = [],
        sort = null,
        limit = 50,
        offset = 0
      } = options;

      try {
        const queryParams = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString()
        });

        if (sort) {
          queryParams.append('sort', sort);
        }

        if (filters.length > 0) {
          queryParams.append('filters', JSON.stringify(filters));
        }

        const response = await fetch(
          `${this.forgeBaseUrl}/crm/${entityId}?${queryParams}`
        );

        const result = await response.json();

        if (result.success) {
          return {
            records: result.data.records || [],
            total: result.data.total || 0,
            hasMore: result.data.hasMore || false
          };
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[Forge] Failed to load records:', error);
        throw error;
      }
    }

    async getRecord(entityId, recordId) {
      try {
        const response = await fetch(
          `${this.forgeBaseUrl}/crm/${entityId}/${recordId}`
        );

        const result = await response.json();

        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[Forge] Failed to load record:', error);
        throw error;
      }
    }

    async createRecord(entityId, data) {
      try {
        const response = await fetch(
          `${this.forgeBaseUrl}/crm/${entityId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          }
        );

        const result = await response.json();

        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[Forge] Failed to create record:', error);
        throw error;
      }
    }

    async updateRecord(entityId, recordId, data) {
      try {
        const response = await fetch(
          `${this.forgeBaseUrl}/crm/${entityId}/${recordId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          }
        );

        const result = await response.json();

        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[Forge] Failed to update record:', error);
        throw error;
      }
    }

    async deleteRecord(entityId, recordId) {
      try {
        const response = await fetch(
          `${this.forgeBaseUrl}/crm/${entityId}/${recordId}`,
          {
            method: 'DELETE'
          }
        );

        const result = await response.json();

        if (result.success) {
          return true;
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[Forge] Failed to delete record:', error);
        throw error;
      }
    }

    // ───────────────────────────────────────────────────────────
    // Lookup and Search
    // ───────────────────────────────────────────────────────────

    async searchRecords(entityId, searchTerm, fields = []) {
      try {
        const queryParams = new URLSearchParams({
          search: searchTerm,
          fields: fields.join(','),
          limit: '10'
        });

        const response = await fetch(
          `${this.forgeBaseUrl}/crm/${entityId}/search?${queryParams}`
        );

        const result = await response.json();

        if (result.success) {
          return result.data.records || [];
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[Forge] Search failed:', error);
        return [];
      }
    }

    // ───────────────────────────────────────────────────────────
    // UI Components
    // ───────────────────────────────────────────────────────────

    renderForgeEntitySelector() {
      return `
        <div class="forge-entity-selector">
          <label style="font-size: 0.875rem; font-weight: 600; margin-bottom: 0.5rem;">
            Forge CRM Entity
          </label>
          <select class="form-control" id="forgeEntitySelect">
            <option value="">Select a CRM entity...</option>
            ${this.forgeEntities.map(entity => `
              <option value="${entity.id}">
                ${entity.name} (${entity.pluralName})
              </option>
            `).join('')}
          </select>
          <small class="form-text text-muted">
            Connect this form to Forge CRM data
          </small>
        </div>
      `;
    }

    renderForgeFieldMapper(entityId) {
      const entity = this.forgeEntities.find(e => e.id === entityId);
      if (!entity) {
        return '<p style="color: var(--text-secondary);">Select an entity first</p>';
      }

      return `
        <div class="forge-field-mapper">
          <h5 style="font-size: 0.875rem; margin-bottom: 0.75rem;">
            Map Form Fields to ${entity.name} Fields
          </h5>
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Forge Field</th>
                <th>Type</th>
                <th>Form Field</th>
                <th>Required</th>
              </tr>
            </thead>
            <tbody>
              ${entity.fields.map(field => `
                <tr>
                  <td>${field.label}</td>
                  <td><span class="badge badge-secondary">${field.type}</span></td>
                  <td>
                    <select class="form-control form-control-sm forge-field-map" data-forge-field="${field.name}">
                      <option value="">Not mapped</option>
                      ${this.renderFormFieldOptions()}
                    </select>
                  </td>
                  <td>
                    ${field.required ? '<i class="fas fa-star" style="color: var(--danger-color);" title="Required"></i>' : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    renderFormFieldOptions() {
      // Get all form components that can be mapped
      const components = this.formDesigner.components.filter(c =>
        ['text', 'textarea', 'number', 'email', 'date', 'select', 'checkbox'].includes(c.type)
      );

      return components.map(comp => `
        <option value="${comp.id}">
          ${comp.props.label || comp.type} (${comp.type})
        </option>
      `).join('');
    }

    renderForgePanel() {
      return `
        <div class="forge-panel" style="padding: 1rem;">
          <h4 style="font-size: 1rem; margin-bottom: 1rem;">
            <i class="fas fa-cube"></i> Forge CRM Integration
          </h4>

          ${this.renderForgeEntitySelector()}

          <div id="forgeFieldMapping" style="margin-top: 1.5rem;">
            <!-- Field mapping will be rendered here when entity is selected -->
          </div>

          <div style="margin-top: 1.5rem;">
            <button class="btn btn-sm btn-success" id="saveForgeMapping">
              <i class="fas fa-save"></i> Save Forge Integration
            </button>
          </div>
        </div>
      `;
    }

    // ───────────────────────────────────────────────────────────
    // Event Handlers
    // ───────────────────────────────────────────────────────────

    setupForgeEventHandlers() {
      const entitySelect = document.getElementById('forgeEntitySelect');
      if (entitySelect) {
        entitySelect.addEventListener('change', (e) => {
          const entityId = e.target.value;
          if (entityId) {
            this.showForgeFieldMapping(entityId);
          }
        });
      }

      const saveBtn = document.getElementById('saveForgeMapping');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          this.saveForgeIntegration();
        });
      }
    }

    showForgeFieldMapping(entityId) {
      const mappingDiv = document.getElementById('forgeFieldMapping');
      if (mappingDiv) {
        mappingDiv.innerHTML = this.renderForgeFieldMapper(entityId);
      }
    }

    saveForgeIntegration() {
      const entityId = document.getElementById('forgeEntitySelect').value;
      if (!entityId) {
        alert('Please select a Forge entity first');
        return;
      }

      // Collect field mappings
      const fieldMappings = {};
      document.querySelectorAll('.forge-field-map').forEach(select => {
        const forgeField = select.getAttribute('data-forge-field');
        const formField = select.value;
        if (formField) {
          fieldMappings[forgeField] = formField;
        }
      });

      console.log('[Forge] Saving integration:', { entityId, fieldMappings });

      // Store in form state
      if (!this.formDesigner.state.form) {
        this.formDesigner.state.form = {};
      }

      this.formDesigner.state.form.forgeIntegration = {
        entityId,
        fieldMappings
      };

      this.formDesigner.showNotification('Forge integration saved!', 'success');
    }

    // ───────────────────────────────────────────────────────────
    // Persistence
    // ───────────────────────────────────────────────────────────

    getFormDefinition() {
      return {
        forgeIntegration: this.formDesigner.state.form?.forgeIntegration || null
      };
    }

    loadForgeIntegration(config) {
      if (config?.forgeIntegration) {
        this.formDesigner.state.form = this.formDesigner.state.form || {};
        this.formDesigner.state.form.forgeIntegration = config.forgeIntegration;
        console.log('[Forge] Loaded Forge integration config');
      }
    }
  }

  // Export to window
  window.ForgeIntegration = ForgeIntegration;

})();
