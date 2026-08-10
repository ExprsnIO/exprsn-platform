/**
 * ═══════════════════════════════════════════════════════════
 * Forge CRM Manager
 * Integrates with Forge CRM/ERP/Groupware services
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class ForgeManager {
    constructor() {
      this.forgeMappings = [];
      this.selectedEntity = null;
      this.init();
    }

    init() {
      this.setupEventListeners();
      this.loadMappings();
    }

    setupEventListeners() {
      // Module selector
      document.getElementById('forgeModuleSelect')?.addEventListener('change', (e) => {
        this.updateEntityOptions(e.target.value);
      });

      // Entity selector
      document.getElementById('forgeCrmEntitySelect')?.addEventListener('change', (e) => {
        this.selectedEntity = e.target.value;
        this.renderFieldMappings();
      });

      // Operation selector
      document.getElementById('forgeOperationSelect')?.addEventListener('change', () => {
        this.updateMappings();
      });

      // Add field mapping button
      document.getElementById('addFieldMappingBtn')?.addEventListener('click', () => {
        this.showAddMappingDialog();
      });

      // Import schema button
      document.getElementById('importForgeSchemaBtn')?.addEventListener('click', () => {
        this.importForgeSchema();
      });

      // Configure lookup button
      document.getElementById('configureLookupBtn')?.addEventListener('click', () => {
        this.configureLookup();
      });
    }

    updateEntityOptions(module) {
      const entitySelect = document.getElementById('forgeCrmEntitySelect');
      if (!entitySelect) return;

      // Clear existing options
      entitySelect.innerHTML = '<option value="">Select entity...</option>';

      // Add entity options based on module
      const entities = {
        crm: [
          { value: 'contact', label: 'Contact' },
          { value: 'account', label: 'Account' },
          { value: 'lead', label: 'Lead' },
          { value: 'opportunity', label: 'Opportunity' },
          { value: 'case', label: 'Case' },
          { value: 'task', label: 'Task' }
        ],
        erp: [
          { value: 'product', label: 'Product' },
          { value: 'order', label: 'Order' },
          { value: 'invoice', label: 'Invoice' },
          { value: 'supplier', label: 'Supplier' }
        ],
        groupware: [
          { value: 'event', label: 'Event' },
          { value: 'contact', label: 'Contact' },
          { value: 'task', label: 'Task' }
        ]
      };

      const moduleEntities = entities[module] || [];
      moduleEntities.forEach(entity => {
        const option = document.createElement('option');
        option.value = entity.value;
        option.textContent = entity.label;
        entitySelect.appendChild(option);
      });
    }

    renderFieldMappings() {
      const tbody = document.getElementById('forgeMappingTableBody');
      if (!tbody) return;

      if (!this.selectedEntity || this.forgeMappings.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-muted" style="text-align: center; padding: 2rem;">
              Select a CRM entity to configure field mapping
            </td>
          </tr>
        `;
        return;
      }

      const entityMappings = this.forgeMappings.filter(m => m.entityType === this.selectedEntity);

      if (entityMappings.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" class="text-muted" style="text-align: center; padding: 2rem;">
              No field mappings configured. Click "Add Field Mapping" to create one.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = entityMappings.map((mapping, index) => `
        <tr>
          <td>${mapping.formField}</td>
          <td style="text-align: center;">→</td>
          <td>${this.selectedEntity}.${mapping.crmField}</td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="forgeManager.deleteMapping(${index})">
              <i class="fas fa-trash"></i>
            </button>
          </td>
        </tr>
      `).join('');
    }

    showAddMappingDialog() {
      if (!this.selectedEntity) {
        alert('Please select a CRM entity first');
        return;
      }

      // Get form components for mapping
      const components = window.FORM_DESIGNER_STATE?.components || [];

      if (components.length === 0) {
        alert('No form components available. Add components to the canvas first.');
        return;
      }

      // Get CRM fields for the selected entity
      const crmFields = this.getCRMFields(this.selectedEntity);

      const formFieldOptions = components
        .filter(c => c.props?.label || c.props?.name)
        .map(c => {
          const label = c.props?.label || c.props?.name || c.type;
          return `<option value="${c.id}">${label}</option>`;
        })
        .join('');

      const crmFieldOptions = crmFields
        .map(field => `<option value="${field.name}">${field.label}</option>`)
        .join('');

      const existing = document.getElementById('addMappingDialog');
      if (existing) existing.remove();

      const dialog = document.createElement('div');
      dialog.id = 'addMappingDialog';
      dialog.className = 'modal active';
      dialog.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">Add Field Mapping</h3>
            <button class="modal-close" onclick="document.getElementById('addMappingDialog').remove()">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="form-group">
            <label>Form Field</label>
            <select id="mappingFormField" class="property-input">
              ${formFieldOptions}
            </select>
          </div>

          <div class="form-group">
            <label>CRM Field (${this.selectedEntity})</label>
            <select id="mappingCRMField" class="property-input">
              ${crmFieldOptions}
            </select>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="document.getElementById('addMappingDialog').remove()">Cancel</button>
            <button class="btn btn-primary" onclick="forgeManager.saveMapping()">Add Mapping</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);
    }

    getCRMFields(entityType) {
      // Define CRM entity fields
      const entityFields = {
        contact: [
          { name: 'firstName', label: 'First Name' },
          { name: 'lastName', label: 'Last Name' },
          { name: 'email', label: 'Email' },
          { name: 'phone', label: 'Phone' },
          { name: 'company', label: 'Company' },
          { name: 'title', label: 'Title' },
          { name: 'address', label: 'Address' }
        ],
        account: [
          { name: 'name', label: 'Account Name' },
          { name: 'industry', label: 'Industry' },
          { name: 'website', label: 'Website' },
          { name: 'phone', label: 'Phone' },
          { name: 'address', label: 'Address' }
        ],
        lead: [
          { name: 'firstName', label: 'First Name' },
          { name: 'lastName', label: 'Last Name' },
          { name: 'email', label: 'Email' },
          { name: 'phone', label: 'Phone' },
          { name: 'company', label: 'Company' },
          { name: 'status', label: 'Status' }
        ],
        opportunity: [
          { name: 'name', label: 'Opportunity Name' },
          { name: 'amount', label: 'Amount' },
          { name: 'stage', label: 'Stage' },
          { name: 'closeDate', label: 'Close Date' },
          { name: 'probability', label: 'Probability' }
        ]
      };

      return entityFields[entityType] || [];
    }

    saveMapping() {
      const formFieldId = document.getElementById('mappingFormField')?.value;
      const crmField = document.getElementById('mappingCRMField')?.value;

      if (!formFieldId || !crmField) {
        alert('Please select both form field and CRM field');
        return;
      }

      // Get form field label
      const components = window.FORM_DESIGNER_STATE?.components || [];
      const component = components.find(c => c.id === formFieldId);
      const formFieldLabel = component ? (component.props?.label || component.props?.name || component.type) : formFieldId;

      this.forgeMappings.push({
        entityType: this.selectedEntity,
        formField: formFieldLabel,
        formFieldId: formFieldId,
        crmField: crmField
      });

      this.updateMappings();
      this.renderFieldMappings();
      document.getElementById('addMappingDialog').remove();
    }

    deleteMapping(index) {
      this.forgeMappings.splice(index, 1);
      this.updateMappings();
      this.renderFieldMappings();
    }

    updateMappings() {
      window.FORM_DESIGNER_STATE.forgeMappings = this.forgeMappings;
      window.FORM_DESIGNER_STATE.isDirty = true;
    }

    loadMappings() {
      const mappings = window.FORM_DESIGNER_STATE.forgeMappings || [];
      this.forgeMappings = mappings;
      this.renderFieldMappings();
    }

    async importForgeSchema() {
      // This would make an API call to Forge service to import schema
      alert('Forge Schema Import feature coming soon!\n\nThis will connect to exprsn-forge service to import entity definitions.');

      // Example implementation:
      // try {
      //   const response = await fetch('/forge/api/schema/export', {
      //     method: 'GET',
      //     headers: { 'Content-Type': 'application/json' }
      //   });
      //   const schema = await response.json();
      //   // Process schema...
      // } catch (error) {
      //   alert('Failed to import schema: ' + error.message);
      // }
    }

    configureLookup() {
      alert('Lookup Configuration feature coming soon!\n\nThis will allow you to configure lookup fields for relationship mapping between form fields and CRM entities.');
    }
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    window.forgeManager = new ForgeManager();
  });

})();
