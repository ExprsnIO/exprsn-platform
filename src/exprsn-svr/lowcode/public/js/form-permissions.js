/**
 * ═══════════════════════════════════════════════════════════
 * Form Designer - Permissions Module
 * Granular access control based on users, groups, and roles
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class PermissionsManager {
    constructor(formDesigner) {
      this.formDesigner = formDesigner;
      this.appId = formDesigner.state.appId;

      // Form-level permissions
      this.formPermissions = {
        view: { type: 'all', users: [], groups: [], roles: [] },
        edit: { type: 'all', users: [], groups: [], roles: [] },
        submit: { type: 'all', users: [], groups: [], roles: [] },
        delete: { type: 'owner', users: [], groups: [], roles: [] }
      };

      // Component-level permissions
      this.componentPermissions = {};

      // Available users, groups, and roles
      this.availableUsers = [];
      this.availableGroups = [];
      this.availableRoles = [];

      this.init();
    }

    async init() {
      console.log('[Permissions] Initializing permissions manager...');

      // Load available users, groups, and roles
      await Promise.all([
        this.loadUsers(),
        this.loadGroups(),
        this.loadRoles()
      ]);

      // Load existing permissions from form
      if (this.formDesigner.state.form?.permissions) {
        this.loadPermissions(this.formDesigner.state.form.permissions);
      }

      console.log('[Permissions] Initialization complete');
    }

    // ───────────────────────────────────────────────────────────
    // Load Users, Groups, and Roles
    // ───────────────────────────────────────────────────────────

    async loadUsers() {
      try {
        // In a real implementation, this would call the auth service
        // For now, we'll use mock data
        this.availableUsers = [
          { id: 'user-1', name: 'John Doe', email: 'john@example.com' },
          { id: 'user-2', name: 'Jane Smith', email: 'jane@example.com' },
          { id: 'user-3', name: 'Bob Johnson', email: 'bob@example.com' }
        ];

        console.log('[Permissions] Loaded', this.availableUsers.length, 'users');
      } catch (error) {
        console.error('[Permissions] Failed to load users:', error);
      }
    }

    async loadGroups() {
      try {
        // In a real implementation, this would call the auth/nexus service
        this.availableGroups = [
          { id: 'group-1', name: 'Sales Team', memberCount: 12 },
          { id: 'group-2', name: 'Marketing Team', memberCount: 8 },
          { id: 'group-3', name: 'Engineering Team', memberCount: 25 },
          { id: 'group-4', name: 'Management', memberCount: 5 }
        ];

        console.log('[Permissions] Loaded', this.availableGroups.length, 'groups');
      } catch (error) {
        console.error('[Permissions] Failed to load groups:', error);
      }
    }

    async loadRoles() {
      try {
        // Load from auth service
        this.availableRoles = [
          { id: 'admin', name: 'Administrator', description: 'Full system access' },
          { id: 'manager', name: 'Manager', description: 'Department management' },
          { id: 'user', name: 'Standard User', description: 'Basic access' },
          { id: 'guest', name: 'Guest', description: 'Limited read-only access' }
        ];

        console.log('[Permissions] Loaded', this.availableRoles.length, 'roles');
      } catch (error) {
        console.error('[Permissions] Failed to load roles:', error);
      }
    }

    // ───────────────────────────────────────────────────────────
    // Form-Level Permissions
    // ───────────────────────────────────────────────────────────

    setFormPermission(action, permissionConfig) {
      // action: 'view', 'edit', 'submit', 'delete'
      // permissionConfig: { type: 'all'|'owner'|'specific', users: [], groups: [], roles: [] }

      this.formPermissions[action] = {
        type: permissionConfig.type || 'all',
        users: permissionConfig.users || [],
        groups: permissionConfig.groups || [],
        roles: permissionConfig.roles || []
      };

      console.log('[Permissions] Form permission set:', action, this.formPermissions[action]);
    }

    getFormPermission(action) {
      return this.formPermissions[action] || { type: 'all', users: [], groups: [], roles: [] };
    }

    addFormPermissionUser(action, userId) {
      if (!this.formPermissions[action]) {
        this.formPermissions[action] = { type: 'specific', users: [], groups: [], roles: [] };
      }

      if (!this.formPermissions[action].users.includes(userId)) {
        this.formPermissions[action].users.push(userId);
        this.formPermissions[action].type = 'specific';
      }
    }

    removeFormPermissionUser(action, userId) {
      if (this.formPermissions[action]) {
        this.formPermissions[action].users =
          this.formPermissions[action].users.filter(id => id !== userId);
      }
    }

    addFormPermissionGroup(action, groupId) {
      if (!this.formPermissions[action]) {
        this.formPermissions[action] = { type: 'specific', users: [], groups: [], roles: [] };
      }

      if (!this.formPermissions[action].groups.includes(groupId)) {
        this.formPermissions[action].groups.push(groupId);
        this.formPermissions[action].type = 'specific';
      }
    }

    removeFormPermissionGroup(action, groupId) {
      if (this.formPermissions[action]) {
        this.formPermissions[action].groups =
          this.formPermissions[action].groups.filter(id => id !== groupId);
      }
    }

    addFormPermissionRole(action, roleId) {
      if (!this.formPermissions[action]) {
        this.formPermissions[action] = { type: 'specific', users: [], groups: [], roles: [] };
      }

      if (!this.formPermissions[action].roles.includes(roleId)) {
        this.formPermissions[action].roles.push(roleId);
        this.formPermissions[action].type = 'specific';
      }
    }

    removeFormPermissionRole(action, roleId) {
      if (this.formPermissions[action]) {
        this.formPermissions[action].roles =
          this.formPermissions[action].roles.filter(id => id !== roleId);
      }
    }

    // ───────────────────────────────────────────────────────────
    // Component-Level Permissions
    // ───────────────────────────────────────────────────────────

    setComponentPermission(componentId, permissionConfig) {
      // permissionConfig: {
      //   visible: { type, users, groups, roles },
      //   editable: { type, users, groups, roles }
      // }

      this.componentPermissions[componentId] = {
        visible: permissionConfig.visible || { type: 'all', users: [], groups: [], roles: [] },
        editable: permissionConfig.editable || { type: 'all', users: [], groups: [], roles: [] }
      };

      console.log('[Permissions] Component permission set:', componentId);
    }

    getComponentPermission(componentId) {
      return this.componentPermissions[componentId] || {
        visible: { type: 'all', users: [], groups: [], roles: [] },
        editable: { type: 'all', users: [], groups: [], roles: [] }
      };
    }

    removeComponentPermission(componentId) {
      delete this.componentPermissions[componentId];
    }

    // ───────────────────────────────────────────────────────────
    // Permission Checking (Runtime)
    // ───────────────────────────────────────────────────────────

    checkFormPermission(action, user) {
      const permission = this.formPermissions[action];

      if (!permission) {
        return true; // Default allow if not configured
      }

      switch (permission.type) {
        case 'all':
          return true;

        case 'owner':
          // Check if user is the form owner
          return user && user.id === this.formDesigner.state.form?.createdBy;

        case 'none':
          return false;

        case 'specific':
          return this.checkSpecificPermission(permission, user);

        default:
          return false;
      }
    }

    checkComponentPermission(componentId, action, user) {
      const permission = this.componentPermissions[componentId];

      if (!permission) {
        return true; // Default allow if not configured
      }

      const actionPermission = permission[action]; // 'visible' or 'editable'

      if (!actionPermission) {
        return true;
      }

      switch (actionPermission.type) {
        case 'all':
          return true;

        case 'none':
          return false;

        case 'specific':
          return this.checkSpecificPermission(actionPermission, user);

        default:
          return false;
      }
    }

    checkSpecificPermission(permission, user) {
      if (!user) {
        return false;
      }

      // Check if user ID is in the list
      if (permission.users.includes(user.id)) {
        return true;
      }

      // Check if user's groups are in the list
      if (user.groups && user.groups.some(g => permission.groups.includes(g.id))) {
        return true;
      }

      // Check if user's roles are in the list
      if (user.roles && user.roles.some(r => permission.roles.includes(r))) {
        return true;
      }

      return false;
    }

    // ───────────────────────────────────────────────────────────
    // UI Rendering
    // ───────────────────────────────────────────────────────────

    renderPermissionsPanel() {
      return `
        <div class="permissions-panel">
          <h4 style="font-size: 1rem; margin-bottom: 1rem;">Form Permissions</h4>

          ${this.renderFormPermissionSection('view', 'View Form', 'Who can view this form')}
          ${this.renderFormPermissionSection('edit', 'Edit Form', 'Who can edit form data')}
          ${this.renderFormPermissionSection('submit', 'Submit Form', 'Who can submit the form')}
          ${this.renderFormPermissionSection('delete', 'Delete Records', 'Who can delete form records')}

          <div style="margin-top: 1.5rem;">
            <button class="btn btn-sm btn-primary" id="savePermissions">
              <i class="fas fa-save"></i> Save Permissions
            </button>
          </div>
        </div>
      `;
    }

    renderFormPermissionSection(action, title, description) {
      const permission = this.getFormPermission(action);

      return `
        <div class="permission-section" style="margin-bottom: 1.5rem; padding: 1rem; border: 1px solid var(--border-color); border-radius: 4px;">
          <div style="margin-bottom: 0.5rem;">
            <strong>${title}</strong>
            <p style="font-size: 0.875rem; color: var(--text-secondary); margin: 0.25rem 0 0 0;">${description}</p>
          </div>

          <div class="form-group" style="margin-top: 0.75rem;">
            <label style="font-size: 0.875rem;">Permission Type</label>
            <select class="form-control form-control-sm" id="permType_${action}">
              <option value="all" ${permission.type === 'all' ? 'selected' : ''}>Everyone</option>
              <option value="owner" ${permission.type === 'owner' ? 'selected' : ''}>Owner Only</option>
              <option value="specific" ${permission.type === 'specific' ? 'selected' : ''}>Specific Users/Groups/Roles</option>
              <option value="none" ${permission.type === 'none' ? 'selected' : ''}>No One</option>
            </select>
          </div>

          <div id="specificPermissions_${action}" style="display: ${permission.type === 'specific' ? 'block' : 'none'}; margin-top: 0.75rem;">
            <div class="form-group">
              <label style="font-size: 0.875rem;">Users</label>
              ${this.renderMultiSelect(`users_${action}`, this.availableUsers, permission.users, 'name')}
            </div>

            <div class="form-group">
              <label style="font-size: 0.875rem;">Groups</label>
              ${this.renderMultiSelect(`groups_${action}`, this.availableGroups, permission.groups, 'name')}
            </div>

            <div class="form-group">
              <label style="font-size: 0.875rem;">Roles</label>
              ${this.renderMultiSelect(`roles_${action}`, this.availableRoles, permission.roles, 'name')}
            </div>
          </div>
        </div>
      `;
    }

    renderMultiSelect(id, options, selectedIds, labelField) {
      return `
        <select class="form-control form-control-sm" id="${id}" multiple size="4">
          ${options.map(option => `
            <option value="${option.id}" ${selectedIds.includes(option.id) ? 'selected' : ''}>
              ${option[labelField]}
            </option>
          `).join('')}
        </select>
        <small class="form-text text-muted">Hold Ctrl/Cmd to select multiple</small>
      `;
    }

    renderComponentPermissionEditor(componentId) {
      const permission = this.getComponentPermission(componentId);

      return `
        <div class="component-permissions">
          <h5 style="font-size: 0.875rem; margin-bottom: 0.75rem;">Component Permissions</h5>

          <div class="form-group">
            <label style="font-size: 0.875rem;">Visibility</label>
            <select class="form-control form-control-sm" id="compVisibility_${componentId}">
              <option value="all" ${permission.visible.type === 'all' ? 'selected' : ''}>Everyone</option>
              <option value="specific" ${permission.visible.type === 'specific' ? 'selected' : ''}>Specific Users/Groups/Roles</option>
              <option value="none" ${permission.visible.type === 'none' ? 'selected' : ''}>Hidden</option>
            </select>
          </div>

          <div class="form-group">
            <label style="font-size: 0.875rem;">Editable</label>
            <select class="form-control form-control-sm" id="compEditable_${componentId}">
              <option value="all" ${permission.editable.type === 'all' ? 'selected' : ''}>Everyone</option>
              <option value="specific" ${permission.editable.type === 'specific' ? 'selected' : ''}>Specific Users/Groups/Roles</option>
              <option value="none" ${permission.editable.type === 'none' ? 'selected' : ''}>Read Only</option>
            </select>
          </div>
        </div>
      `;
    }

    // ───────────────────────────────────────────────────────────
    // Event Handlers Setup
    // ───────────────────────────────────────────────────────────

    setupPermissionEventHandlers() {
      // Permission type change handlers
      ['view', 'edit', 'submit', 'delete'].forEach(action => {
        const select = document.getElementById(`permType_${action}`);
        if (select) {
          select.addEventListener('change', (e) => {
            const specificDiv = document.getElementById(`specificPermissions_${action}`);
            if (specificDiv) {
              specificDiv.style.display = e.target.value === 'specific' ? 'block' : 'none';
            }

            this.setFormPermission(action, { type: e.target.value, users: [], groups: [], roles: [] });
          });
        }

        // Users multiselect
        const usersSelect = document.getElementById(`users_${action}`);
        if (usersSelect) {
          usersSelect.addEventListener('change', (e) => {
            const selectedUsers = Array.from(e.target.selectedOptions).map(opt => opt.value);
            this.formPermissions[action].users = selectedUsers;
          });
        }

        // Groups multiselect
        const groupsSelect = document.getElementById(`groups_${action}`);
        if (groupsSelect) {
          groupsSelect.addEventListener('change', (e) => {
            const selectedGroups = Array.from(e.target.selectedOptions).map(opt => opt.value);
            this.formPermissions[action].groups = selectedGroups;
          });
        }

        // Roles multiselect
        const rolesSelect = document.getElementById(`roles_${action}`);
        if (rolesSelect) {
          rolesSelect.addEventListener('change', (e) => {
            const selectedRoles = Array.from(e.target.selectedOptions).map(opt => opt.value);
            this.formPermissions[action].roles = selectedRoles;
          });
        }
      });

      // Save button
      const saveBtn = document.getElementById('savePermissions');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          this.savePermissions();
        });
      }
    }

    // ───────────────────────────────────────────────────────────
    // Persistence
    // ───────────────────────────────────────────────────────────

    getFormDefinition() {
      return {
        formPermissions: this.formPermissions,
        componentPermissions: this.componentPermissions
      };
    }

    loadPermissions(permissions) {
      if (permissions.formPermissions) {
        this.formPermissions = permissions.formPermissions;
      }

      if (permissions.componentPermissions) {
        this.componentPermissions = permissions.componentPermissions;
      }

      console.log('[Permissions] Loaded permissions');
    }

    async savePermissions() {
      console.log('[Permissions] Saving permissions...');

      try {
        const formId = this.formDesigner.state.formId;

        if (!formId) {
          alert('Please save the form first before configuring permissions');
          return;
        }

        const response = await fetch(`/lowcode/api/forms/${formId}/permissions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.getFormDefinition())
        });

        const result = await response.json();

        if (result.success) {
          this.formDesigner.showNotification('Permissions saved successfully!', 'success');
        } else {
          throw new Error(result.message);
        }
      } catch (error) {
        console.error('[Permissions] Failed to save permissions:', error);
        this.formDesigner.showNotification('Failed to save permissions: ' + error.message, 'error');
      }
    }

    // ───────────────────────────────────────────────────────────
    // Runtime Permission Enforcement
    // ───────────────────────────────────────────────────────────

    applyPermissionsToForm(user) {
      console.log('[Permissions] Applying permissions for user:', user);

      // Hide/disable components based on permissions
      const components = document.querySelectorAll('[data-component-id]');

      components.forEach(element => {
        const componentId = element.getAttribute('data-component-id');

        // Check visibility
        const canView = this.checkComponentPermission(componentId, 'visible', user);
        if (!canView) {
          element.style.display = 'none';
        }

        // Check editability
        const canEdit = this.checkComponentPermission(componentId, 'editable', user);
        if (!canEdit) {
          const inputs = element.querySelectorAll('input, textarea, select, button');
          inputs.forEach(input => {
            input.disabled = true;
            input.readOnly = true;
          });
        }
      });

      // Hide submit button if user can't submit
      if (!this.checkFormPermission('submit', user)) {
        const submitButtons = document.querySelectorAll('[type="submit"]');
        submitButtons.forEach(btn => btn.style.display = 'none');
      }
    }
  }

  // Export to window
  window.PermissionsManager = PermissionsManager;

})();
