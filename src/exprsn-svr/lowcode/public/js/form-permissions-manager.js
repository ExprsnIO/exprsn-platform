/**
 * ═══════════════════════════════════════════════════════════
 * Permissions Manager - Enhanced Table-Based UI
 * Manages form and component-level permissions with CA token and exprsn-auth integration
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  class PermissionsManager {
    constructor() {
      this.permissions = {
        formLevel: {
          view: { enabled: true, rule: 'all', users: [], groups: [], roles: [] },
          edit: { enabled: false, rule: 'owner', users: [], groups: [], roles: [] },
          submit: { enabled: false, rule: 'authenticated', users: [], groups: [], roles: [] },
          delete: { enabled: false, rule: 'owner', users: [], groups: [], roles: [] }
        },
        tokenRequirements: {
          requireCAToken: false,
          validateExprsAuth: false,
          requiredPermissions: []
        },
        componentLevel: {}
      };

      // Available users, groups, and roles (loaded from exprsn-auth)
      this.availableUsers = [];
      this.availableGroups = [];
      this.availableRoles = [];

      // Current action being configured ('view', 'edit', 'submit', 'delete')
      this.currentAction = null;

      // Selected users/groups/roles in modal
      this.selectedUsers = [];
      this.selectedGroups = [];
      this.selectedRoles = [];

      this.init();
    }

    async init() {
      console.log('[Permissions Manager] Initializing...');

      this.setupEventListeners();
      this.loadPermissions();

      // Load available users, groups, and roles from exprsn-auth
      await this.loadAuthData();

      console.log('[Permissions Manager] Initialization complete');
    }

    // ───────────────────────────────────────────────────────────
    // Event Listeners
    // ───────────────────────────────────────────────────────────

    setupEventListeners() {
      // Form-level permission change handlers
      ['view', 'edit', 'submit', 'delete'].forEach(action => {
        // Enabled checkbox
        document.getElementById(`perm${this.capitalize(action)}Enabled`)?.addEventListener('change', () => {
          this.updatePermissions();
        });

        // Permission type select
        document.getElementById(`perm${this.capitalize(action)}Select`)?.addEventListener('change', (e) => {
          const value = e.target.value;
          const btn = document.getElementById(`select${this.capitalize(action)}SpecificBtn`);

          // Show/hide "Select..." button based on "specific" selection
          if (btn) {
            btn.style.display = value === 'specific' ? 'inline-block' : 'none';
          }

          this.updatePermissions();
        });

        // "Select..." button click handler
        document.getElementById(`select${this.capitalize(action)}SpecificBtn`)?.addEventListener('click', () => {
          this.showSelectorModal(action);
        });
      });

      // Token requirements
      document.getElementById('requireCAToken')?.addEventListener('change', () => {
        this.updatePermissions();
      });

      document.getElementById('validateExprsAuth')?.addEventListener('change', () => {
        this.updatePermissions();
      });

      document.getElementById('requiredPermissionsSelect')?.addEventListener('change', () => {
        this.updatePermissions();
      });

      // Component permissions button
      document.getElementById('configureComponentPermsBtn')?.addEventListener('click', () => {
        this.showComponentPermissionsDialog();
      });

      // Selector modal tabs
      document.querySelectorAll('.selector-tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.switchSelectorTab(btn.dataset.selectorTab);
        });
      });

      // Select All checkboxes
      document.getElementById('selectAllUsers')?.addEventListener('change', (e) => {
        this.selectAllInTable('users', e.target.checked);
      });

      document.getElementById('selectAllGroups')?.addEventListener('change', (e) => {
        this.selectAllInTable('groups', e.target.checked);
      });

      document.getElementById('selectAllRoles')?.addEventListener('change', (e) => {
        this.selectAllInTable('roles', e.target.checked);
      });

      // Search inputs
      document.getElementById('userSearchInput')?.addEventListener('input', (e) => {
        this.filterTable('users', e.target.value);
      });

      document.getElementById('groupSearchInput')?.addEventListener('input', (e) => {
        this.filterTable('groups', e.target.value);
      });

      document.getElementById('roleSearchInput')?.addEventListener('input', (e) => {
        this.filterTable('roles', e.target.value);
      });
    }

    // ───────────────────────────────────────────────────────────
    // Load Auth Data (Users, Groups, Roles)
    // ───────────────────────────────────────────────────────────

    async loadAuthData() {
      try {
        console.log('[Permissions Manager] Loading users, groups, and roles from exprsn-auth...');

        // In production, these would be API calls to exprsn-auth
        // For now, using mock data with realistic structure

        // Load users (would be: await fetch('/auth/api/users'))
        this.availableUsers = [
          { id: 'user-001', name: 'John Doe', email: 'john.doe@example.com' },
          { id: 'user-002', name: 'Jane Smith', email: 'jane.smith@example.com' },
          { id: 'user-003', name: 'Bob Johnson', email: 'bob.johnson@example.com' },
          { id: 'user-004', name: 'Alice Williams', email: 'alice.w@example.com' },
          { id: 'user-005', name: 'Charlie Brown', email: 'charlie.b@example.com' }
        ];

        // Load groups (would be: await fetch('/auth/api/groups'))
        this.availableGroups = [
          { id: 'group-001', name: 'Sales Team', memberCount: 12 },
          { id: 'group-002', name: 'Marketing Team', memberCount: 8 },
          { id: 'group-003', name: 'Engineering Team', memberCount: 25 },
          { id: 'group-004', name: 'Management', memberCount: 5 },
          { id: 'group-005', name: 'Customer Support', memberCount: 15 }
        ];

        // Load roles (would be: await fetch('/auth/api/roles'))
        this.availableRoles = [
          { id: 'admin', name: 'Administrator', description: 'Full system access' },
          { id: 'manager', name: 'Manager', description: 'Department management' },
          { id: 'user', name: 'Standard User', description: 'Basic access' },
          { id: 'guest', name: 'Guest', description: 'Limited read-only access' }
        ];

        console.log(`[Permissions Manager] Loaded ${this.availableUsers.length} users, ${this.availableGroups.length} groups, ${this.availableRoles.length} roles`);
      } catch (error) {
        console.error('[Permissions Manager] Failed to load auth data:', error);
      }
    }

    // ───────────────────────────────────────────────────────────
    // User/Role/Group Selector Modal
    // ───────────────────────────────────────────────────────────

    showSelectorModal(action) {
      this.currentAction = action;
      const modal = document.getElementById('userRoleSelectorModal');

      // Load current selections
      const perm = this.permissions.formLevel[action];
      this.selectedUsers = [...(perm.users || [])];
      this.selectedGroups = [...(perm.groups || [])];
      this.selectedRoles = [...(perm.roles || [])];

      // Update modal title
      document.getElementById('selectorModalTitle').textContent =
        `Select Users, Groups & Roles for ${this.capitalize(action)} Permission`;

      // Render tables
      this.renderUsersTable();
      this.renderGroupsTable();
      this.renderRolesTable();

      // Update selection count
      this.updateSelectionCount();

      // Show modal
      modal.classList.add('active');

      console.log(`[Permissions Manager] Opened selector modal for ${action} permission`);
    }

    closeSelectorModal() {
      const modal = document.getElementById('userRoleSelectorModal');
      modal.classList.remove('active');

      // Reset selections
      this.selectedUsers = [];
      this.selectedGroups = [];
      this.selectedRoles = [];
      this.currentAction = null;

      console.log('[Permissions Manager] Closed selector modal');
    }

    switchSelectorTab(tabName) {
      // Update tab buttons
      document.querySelectorAll('.selector-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.selectorTab === tabName);
      });

      // Update tab content
      document.querySelectorAll('.selector-tab-content').forEach(content => {
        content.classList.remove('active');
      });

      const targetTab = document.getElementById(`selectorTab${this.capitalize(tabName)}`);
      if (targetTab) {
        targetTab.classList.add('active');
      }

      console.log(`[Permissions Manager] Switched to ${tabName} tab`);
    }

    renderUsersTable() {
      const tbody = document.getElementById('usersTableBody');

      if (this.availableUsers.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="3" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
              No users available
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = this.availableUsers.map(user => `
        <tr>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">
            <input type="checkbox" class="user-checkbox" data-id="${user.id}" ${this.selectedUsers.includes(user.id) ? 'checked' : ''}>
          </td>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${user.name}</td>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); font-size: 0.875rem;">${user.email}</td>
        </tr>
      `).join('');

      // Add change listeners
      tbody.querySelectorAll('.user-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const userId = e.target.dataset.id;
          if (e.target.checked) {
            if (!this.selectedUsers.includes(userId)) {
              this.selectedUsers.push(userId);
            }
          } else {
            this.selectedUsers = this.selectedUsers.filter(id => id !== userId);
          }
          this.updateSelectionCount();
        });
      });

      console.log('[Permissions Manager] Rendered users table');
    }

    renderGroupsTable() {
      const tbody = document.getElementById('groupsTableBody');

      if (this.availableGroups.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="3" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
              No groups available
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = this.availableGroups.map(group => `
        <tr>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">
            <input type="checkbox" class="group-checkbox" data-id="${group.id}" ${this.selectedGroups.includes(group.id) ? 'checked' : ''}>
          </td>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${group.name}</td>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color); text-align: center;">${group.memberCount}</td>
        </tr>
      `).join('');

      // Add change listeners
      tbody.querySelectorAll('.group-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const groupId = e.target.dataset.id;
          if (e.target.checked) {
            if (!this.selectedGroups.includes(groupId)) {
              this.selectedGroups.push(groupId);
            }
          } else {
            this.selectedGroups = this.selectedGroups.filter(id => id !== groupId);
          }
          this.updateSelectionCount();
        });
      });

      console.log('[Permissions Manager] Rendered groups table');
    }

    renderRolesTable() {
      const tbody = document.getElementById('rolesTableBody');

      if (this.availableRoles.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="3" style="padding: 2rem; text-align: center; color: var(--text-secondary);">
              No roles available
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = this.availableRoles.map(role => `
        <tr>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">
            <input type="checkbox" class="role-checkbox" data-id="${role.id}" ${this.selectedRoles.includes(role.id) ? 'checked' : ''}>
          </td>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color);">${role.name}</td>
          <td style="padding: 0.75rem; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); font-size: 0.875rem;">${role.description}</td>
        </tr>
      `).join('');

      // Add change listeners
      tbody.querySelectorAll('.role-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const roleId = e.target.dataset.id;
          if (e.target.checked) {
            if (!this.selectedRoles.includes(roleId)) {
              this.selectedRoles.push(roleId);
            }
          } else {
            this.selectedRoles = this.selectedRoles.filter(id => id !== roleId);
          }
          this.updateSelectionCount();
        });
      });

      console.log('[Permissions Manager] Rendered roles table');
    }

    updateSelectionCount() {
      const countEl = document.getElementById('selectionCount');
      if (countEl) {
        countEl.textContent = `${this.selectedUsers.length} users, ${this.selectedGroups.length} groups, ${this.selectedRoles.length} roles`;
      }
    }

    selectAllInTable(type, checked) {
      const checkboxClass = `.${type.slice(0, -1)}-checkbox`;
      document.querySelectorAll(checkboxClass).forEach(cb => {
        cb.checked = checked;
        cb.dispatchEvent(new Event('change'));
      });

      console.log(`[Permissions Manager] ${checked ? 'Selected' : 'Deselected'} all ${type}`);
    }

    filterTable(type, searchTerm) {
      const tbody = document.getElementById(`${type}TableBody`);
      const rows = tbody.querySelectorAll('tr');

      const lowerSearch = searchTerm.toLowerCase();

      rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(lowerSearch) ? '' : 'none';
      });

      console.log(`[Permissions Manager] Filtered ${type} table with: "${searchTerm}"`);
    }

    saveSelection() {
      if (!this.currentAction) return;

      // Save selections to permissions object
      this.permissions.formLevel[this.currentAction].users = [...this.selectedUsers];
      this.permissions.formLevel[this.currentAction].groups = [...this.selectedGroups];
      this.permissions.formLevel[this.currentAction].roles = [...this.selectedRoles];

      // Update the specific list display
      this.updateSpecificList(this.currentAction);

      // Save to global state
      window.FORM_DESIGNER_STATE.permissions = this.permissions;
      window.FORM_DESIGNER_STATE.isDirty = true;

      // Close modal
      this.closeSelectorModal();

      console.log(`[Permissions Manager] Saved selection for ${this.currentAction}:`, {
        users: this.selectedUsers.length,
        groups: this.selectedGroups.length,
        roles: this.selectedRoles.length
      });
    }

    updateSpecificList(action) {
      const listEl = document.getElementById(`${action}SpecificList`);
      if (!listEl) return;

      const perm = this.permissions.formLevel[action];
      const items = [];

      // Add users
      if (perm.users && perm.users.length > 0) {
        const userNames = perm.users.map(id => {
          const user = this.availableUsers.find(u => u.id === id);
          return user ? user.name : id;
        });
        items.push(`<strong>Users:</strong> ${userNames.join(', ')}`);
      }

      // Add groups
      if (perm.groups && perm.groups.length > 0) {
        const groupNames = perm.groups.map(id => {
          const group = this.availableGroups.find(g => g.id === id);
          return group ? group.name : id;
        });
        items.push(`<strong>Groups:</strong> ${groupNames.join(', ')}`);
      }

      // Add roles
      if (perm.roles && perm.roles.length > 0) {
        const roleNames = perm.roles.map(id => {
          const role = this.availableRoles.find(r => r.id === id);
          return role ? role.name : id;
        });
        items.push(`<strong>Roles:</strong> ${roleNames.join(', ')}`);
      }

      if (items.length > 0) {
        listEl.innerHTML = items.join('<br>');
      } else {
        listEl.innerHTML = '<em style="color: var(--text-secondary);">No specific users/groups/roles selected</em>';
      }
    }

    // ───────────────────────────────────────────────────────────
    // Update Permissions
    // ───────────────────────────────────────────────────────────

    updatePermissions() {
      this.permissions.formLevel = {
        view: {
          enabled: document.getElementById('permViewEnabled')?.checked,
          rule: document.getElementById('permViewSelect')?.value,
          users: this.permissions.formLevel.view.users || [],
          groups: this.permissions.formLevel.view.groups || [],
          roles: this.permissions.formLevel.view.roles || []
        },
        edit: {
          enabled: document.getElementById('permEditEnabled')?.checked,
          rule: document.getElementById('permEditSelect')?.value,
          users: this.permissions.formLevel.edit.users || [],
          groups: this.permissions.formLevel.edit.groups || [],
          roles: this.permissions.formLevel.edit.roles || []
        },
        submit: {
          enabled: document.getElementById('permSubmitEnabled')?.checked,
          rule: document.getElementById('permSubmitSelect')?.value,
          users: this.permissions.formLevel.submit.users || [],
          groups: this.permissions.formLevel.submit.groups || [],
          roles: this.permissions.formLevel.submit.roles || []
        },
        delete: {
          enabled: document.getElementById('permDeleteEnabled')?.checked,
          rule: document.getElementById('permDeleteSelect')?.value,
          users: this.permissions.formLevel.delete.users || [],
          groups: this.permissions.formLevel.delete.groups || [],
          roles: this.permissions.formLevel.delete.roles || []
        }
      };

      this.permissions.tokenRequirements = {
        requireCAToken: document.getElementById('requireCAToken')?.checked,
        validateExprsAuth: document.getElementById('validateExprsAuth')?.checked,
        requiredPermissions: Array.from(document.getElementById('requiredPermissionsSelect')?.selectedOptions || [])
          .map(opt => opt.value)
      };

      window.FORM_DESIGNER_STATE.permissions = this.permissions;
      window.FORM_DESIGNER_STATE.isDirty = true;

      console.log('[Permissions Manager] Permissions updated');
    }

    // ───────────────────────────────────────────────────────────
    // Load Permissions
    // ───────────────────────────────────────────────────────────

    loadPermissions() {
      const perms = window.FORM_DESIGNER_STATE.permissions || this.permissions;

      // Load form-level permissions
      if (perms.formLevel) {
        ['view', 'edit', 'submit', 'delete'].forEach(action => {
          if (perms.formLevel[action]) {
            const enabledCb = document.getElementById(`perm${this.capitalize(action)}Enabled`);
            const select = document.getElementById(`perm${this.capitalize(action)}Select`);

            if (enabledCb) enabledCb.checked = perms.formLevel[action].enabled;
            if (select) select.value = perms.formLevel[action].rule || 'all';

            // Show/hide "Select..." button
            const btn = document.getElementById(`select${this.capitalize(action)}SpecificBtn`);
            if (btn) {
              btn.style.display = perms.formLevel[action].rule === 'specific' ? 'inline-block' : 'none';
            }

            // Update specific list display
            this.updateSpecificList(action);
          }
        });
      }

      // Load token requirements
      if (perms.tokenRequirements) {
        const caToken = document.getElementById('requireCAToken');
        const exprsAuth = document.getElementById('validateExprsAuth');

        if (caToken) caToken.checked = perms.tokenRequirements.requireCAToken;
        if (exprsAuth) exprsAuth.checked = perms.tokenRequirements.validateExprsAuth;

        const permSelect = document.getElementById('requiredPermissionsSelect');
        if (permSelect && perms.tokenRequirements.requiredPermissions) {
          Array.from(permSelect.options).forEach(opt => {
            opt.selected = perms.tokenRequirements.requiredPermissions.includes(opt.value);
          });
        }
      }

      this.permissions = perms;

      console.log('[Permissions Manager] Permissions loaded');
    }

    // ───────────────────────────────────────────────────────────
    // Component Permissions
    // ───────────────────────────────────────────────────────────

    showComponentPermissionsDialog() {
      const components = window.FORM_DESIGNER_STATE?.components || [];

      if (components.length === 0) {
        alert('No components on the canvas. Add components first.');
        return;
      }

      const componentList = components.map(comp => {
        const label = comp.props?.label || comp.props?.name || comp.type;
        const compPerms = this.permissions.componentLevel[comp.id] || { visible: 'all', editable: 'all' };

        return `
          <tr>
            <td style="padding: 0.75rem; border: 1px solid var(--border-color);">${label}</td>
            <td style="padding: 0.75rem; border: 1px solid var(--border-color); font-size: 0.875rem; color: var(--text-secondary);">${comp.type}</td>
            <td style="padding: 0.75rem; border: 1px solid var(--border-color);">
              <select class="property-input" data-component="${comp.id}" data-perm="visible" style="margin: 0;">
                <option value="all" ${compPerms.visible === 'all' ? 'selected' : ''}>Everyone</option>
                <option value="authenticated" ${compPerms.visible === 'authenticated' ? 'selected' : ''}>Authenticated</option>
                <option value="owner" ${compPerms.visible === 'owner' ? 'selected' : ''}>Owner</option>
                <option value="specific" ${compPerms.visible === 'specific' ? 'selected' : ''}>Specific</option>
                <option value="none" ${compPerms.visible === 'none' ? 'selected' : ''}>Hidden</option>
              </select>
            </td>
            <td style="padding: 0.75rem; border: 1px solid var(--border-color);">
              <select class="property-input" data-component="${comp.id}" data-perm="editable" style="margin: 0;">
                <option value="all" ${compPerms.editable === 'all' ? 'selected' : ''}>Everyone</option>
                <option value="authenticated" ${compPerms.editable === 'authenticated' ? 'selected' : ''}>Authenticated</option>
                <option value="owner" ${compPerms.editable === 'owner' ? 'selected' : ''}>Owner</option>
                <option value="specific" ${compPerms.editable === 'specific' ? 'selected' : ''}>Specific</option>
                <option value="none" ${compPerms.editable === 'none' ? 'selected' : ''}>Read-Only</option>
              </select>
            </td>
          </tr>
        `;
      }).join('');

      const html = `
        <div style="overflow-x: auto; max-height: 400px;">
          <table style="width: 100%; border-collapse: collapse; background: white;">
            <thead style="position: sticky; top: 0; background: var(--bg-secondary); z-index: 1;">
              <tr>
                <th style="padding: 0.75rem; border: 1px solid var(--border-color); font-weight: 600; font-size: 0.875rem;">Component</th>
                <th style="padding: 0.75rem; border: 1px solid var(--border-color); font-weight: 600; font-size: 0.875rem;">Type</th>
                <th style="padding: 0.75rem; border: 1px solid var(--border-color); font-weight: 600; font-size: 0.875rem; min-width: 180px;">Visible To</th>
                <th style="padding: 0.75rem; border: 1px solid var(--border-color); font-weight: 600; font-size: 0.875rem; min-width: 180px;">Editable By</th>
              </tr>
            </thead>
            <tbody>
              ${componentList}
            </tbody>
          </table>
        </div>
      `;

      // Remove existing dialog
      const existing = document.getElementById('componentPermsDialog');
      if (existing) existing.remove();

      // Create dialog
      const dialog = document.createElement('div');
      dialog.id = 'componentPermsDialog';
      dialog.className = 'modal active';
      dialog.innerHTML = `
        <div class="modal-content" style="max-width: 900px;">
          <div class="modal-header">
            <h3 class="modal-title">Component-Level Permissions</h3>
            <button class="modal-close" onclick="document.getElementById('componentPermsDialog').remove()">
              <i class="fas fa-times"></i>
            </button>
          </div>
          ${html}
          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="document.getElementById('componentPermsDialog').remove()">Cancel</button>
            <button class="btn btn-primary" onclick="permissionsManager.saveComponentPermissions()">Save Permissions</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      console.log(`[Permissions Manager] Opened component permissions dialog for ${components.length} components`);
    }

    saveComponentPermissions() {
      const selects = document.querySelectorAll('#componentPermsDialog select');
      const componentPerms = {};

      selects.forEach(select => {
        const compId = select.dataset.component;
        const permType = select.dataset.perm;

        if (!componentPerms[compId]) {
          componentPerms[compId] = {};
        }

        componentPerms[compId][permType] = select.value;
      });

      this.permissions.componentLevel = componentPerms;
      window.FORM_DESIGNER_STATE.permissions = this.permissions;
      window.FORM_DESIGNER_STATE.isDirty = true;

      // Update summary
      this.updateComponentPermsSummary();

      document.getElementById('componentPermsDialog').remove();

      console.log('[Permissions Manager] Component permissions saved for', Object.keys(componentPerms).length, 'components');
    }

    updateComponentPermsSummary() {
      const summaryEl = document.getElementById('componentPermsSummary');
      if (!summaryEl) return;

      const count = Object.keys(this.permissions.componentLevel || {}).length;

      if (count === 0) {
        summaryEl.innerHTML = '<em>No component-specific permissions configured.</em>';
      } else {
        summaryEl.innerHTML = `<strong>${count}</strong> component(s) have custom permissions. <a href="#" onclick="permissionsManager.showComponentPermissionsDialog(); return false;" style="color: var(--primary-color);">Edit</a>`;
      }
    }

    // ───────────────────────────────────────────────────────────
    // Reset Permission
    // ───────────────────────────────────────────────────────────

    resetPermission(action) {
      const defaults = {
        view: { enabled: true, rule: 'all', users: [], groups: [], roles: [] },
        edit: { enabled: false, rule: 'owner', users: [], groups: [], roles: [] },
        submit: { enabled: false, rule: 'authenticated', users: [], groups: [], roles: [] },
        delete: { enabled: false, rule: 'owner', users: [], groups: [], roles: [] }
      };

      this.permissions.formLevel[action] = defaults[action];

      // Update UI
      document.getElementById(`perm${this.capitalize(action)}Enabled`).checked = defaults[action].enabled;
      document.getElementById(`perm${this.capitalize(action)}Select`).value = defaults[action].rule;

      // Hide "Select..." button
      const btn = document.getElementById(`select${this.capitalize(action)}SpecificBtn`);
      if (btn) btn.style.display = 'none';

      // Clear specific list
      const listEl = document.getElementById(`${action}SpecificList`);
      if (listEl) listEl.innerHTML = '';

      // Save
      window.FORM_DESIGNER_STATE.permissions = this.permissions;
      window.FORM_DESIGNER_STATE.isDirty = true;

      console.log(`[Permissions Manager] Reset ${action} permission to default`);
    }

    // ───────────────────────────────────────────────────────────
    // Export/Import
    // ───────────────────────────────────────────────────────────

    exportPermissions() {
      return this.permissions;
    }

    importPermissions(permissions) {
      this.permissions = permissions;
      window.FORM_DESIGNER_STATE.permissions = this.permissions;
      this.loadPermissions();
      this.updateComponentPermsSummary();
    }

    // ───────────────────────────────────────────────────────────
    // Utilities
    // ───────────────────────────────────────────────────────────

    capitalize(str) {
      return str.charAt(0).toUpperCase() + str.slice(1);
    }
  }

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    window.permissionsManager = new PermissionsManager();
  });

})();
