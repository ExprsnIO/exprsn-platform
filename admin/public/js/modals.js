/**
 * ═══════════════════════════════════════════════════════════════════════
 * CRUD Modal Components with Socket.IO Integration
 * ═══════════════════════════════════════════════════════════════════════
 */

const Modals = {
  /**
   * Show modal
   */
  show(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  },

  /**
   * Hide modal
   */
  hide(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
      document.body.style.overflow = '';
    }
  },

  /**
   * Create User Modal
   */
  userCreate: () => {
    return `
      <div id="modal-user-create" class="modal">
        <div class="modal-overlay" onclick="Modals.hide('modal-user-create')"></div>
        <div class="modal-dialog">
          <div class="modal-header">
            <h2>Create New User</h2>
            <button class="modal-close" onclick="Modals.hide('modal-user-create')">×</button>
          </div>
          <div class="modal-body">
            <form id="form-user-create" class="subgrid-form">
              <div class="form-row">
                <label for="user-username">Username *</label>
                <input type="text" id="user-username" name="username" required>
              </div>
              <div class="form-row">
                <label for="user-email">Email *</label>
                <input type="email" id="user-email" name="email" required>
              </div>
              <div class="form-row">
                <label for="user-firstName">First Name</label>
                <input type="text" id="user-firstName" name="firstName">
              </div>
              <div class="form-row">
                <label for="user-lastName">Last Name</label>
                <input type="text" id="user-lastName" name="lastName">
              </div>
              <div class="form-row">
                <label for="user-password">Password *</label>
                <input type="password" id="user-password" name="password" required>
              </div>
              <div class="form-row">
                <label for="user-status">Status</label>
                <select id="user-status" name="status">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div class="form-row">
                <label>
                  <input type="checkbox" id="user-emailVerified" name="emailVerified">
                  Email Verified
                </label>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="Modals.hide('modal-user-create')">Cancel</button>
            <button class="btn btn-primary" onclick="Modals.handleUserCreate()">Create User</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Edit User Modal
   */
  userEdit: (user) => {
    return `
      <div id="modal-user-edit" class="modal active">
        <div class="modal-overlay" onclick="Modals.hide('modal-user-edit')"></div>
        <div class="modal-dialog">
          <div class="modal-header">
            <h2>Edit User: ${user.username}</h2>
            <button class="modal-close" onclick="Modals.hide('modal-user-edit')">×</button>
          </div>
          <div class="modal-body">
            <form id="form-user-edit" class="subgrid-form" data-user-id="${user.id}">
              <div class="form-row">
                <label for="edit-user-username">Username</label>
                <input type="text" id="edit-user-username" name="username" value="${user.username || ''}">
              </div>
              <div class="form-row">
                <label for="edit-user-email">Email</label>
                <input type="email" id="edit-user-email" name="email" value="${user.email || ''}">
              </div>
              <div class="form-row">
                <label for="edit-user-firstName">First Name</label>
                <input type="text" id="edit-user-firstName" name="firstName" value="${user.firstName || ''}">
              </div>
              <div class="form-row">
                <label for="edit-user-lastName">Last Name</label>
                <input type="text" id="edit-user-lastName" name="lastName" value="${user.lastName || ''}">
              </div>
              <div class="form-row">
                <label for="edit-user-status">Status</label>
                <select id="edit-user-status" name="status">
                  <option value="active" ${user.status === 'active' ? 'selected' : ''}>Active</option>
                  <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>Inactive</option>
                  <option value="suspended" ${user.status === 'suspended' ? 'selected' : ''}>Suspended</option>
                </select>
              </div>
              <div class="form-row">
                <label>
                  <input type="checkbox" id="edit-user-emailVerified" name="emailVerified" ${user.emailVerified ? 'checked' : ''}>
                  Email Verified
                </label>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="Modals.hide('modal-user-edit')">Cancel</button>
            <button class="btn btn-primary" onclick="Modals.handleUserEdit('${user.id}')">Save Changes</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Delete Confirmation Modal
   */
  deleteConfirm: (entity, name, onConfirm) => {
    return `
      <div id="modal-delete-confirm" class="modal active">
        <div class="modal-overlay" onclick="Modals.hide('modal-delete-confirm')"></div>
        <div class="modal-dialog modal-sm">
          <div class="modal-header">
            <h2>Confirm Delete</h2>
            <button class="modal-close" onclick="Modals.hide('modal-delete-confirm')">×</button>
          </div>
          <div class="modal-body">
            <p>Are you sure you want to delete <strong>${entity}: ${name}</strong>?</p>
            <p class="text-danger">This action cannot be undone.</p>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="Modals.hide('modal-delete-confirm')">Cancel</button>
            <button class="btn btn-danger" onclick="${onConfirm}">Delete</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Database Table Editor Modal
   */
  tableEdit: (service, table, row) => {
    const columns = Object.keys(row || {});
    const formFields = columns.map(col => `
      <div class="form-row">
        <label for="edit-${col}">${col}</label>
        <input
          type="text"
          id="edit-${col}"
          name="${col}"
          value="${row[col] || ''}"
          ${col === 'id' ? 'readonly' : ''}
        >
      </div>
    `).join('');

    return `
      <div id="modal-table-edit" class="modal active">
        <div class="modal-overlay" onclick="Modals.hide('modal-table-edit')"></div>
        <div class="modal-dialog modal-lg">
          <div class="modal-header">
            <h2>Edit ${table} Row</h2>
            <button class="modal-close" onclick="Modals.hide('modal-table-edit')">×</button>
          </div>
          <div class="modal-body">
            <form id="form-table-edit" class="subgrid-form" data-service="${service}" data-table="${table}" data-id="${row.id}">
              ${formFields}
            </form>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="Modals.hide('modal-table-edit')">Cancel</button>
            <button class="btn btn-primary" onclick="Modals.handleTableRowEdit('${service}', '${table}', '${row.id}')">Save Changes</button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Handle User Create
   */
  async handleUserCreate() {
    const form = document.getElementById('form-user-create');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.success) {
        showNotification('User created successfully', 'success');
        Modals.hide('modal-user-create');
        // Refresh user list
        if (typeof loadUsersPage === 'function') {
          loadUsersPage();
        }
      } else {
        showNotification(result.error || 'Failed to create user', 'error');
      }
    } catch (error) {
      showNotification('Failed to create user', 'error');
      console.error('Error creating user:', error);
    }
  },

  /**
   * Handle User Edit
   */
  async handleUserEdit(userId) {
    const form = document.getElementById('form-user-edit');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.success) {
        showNotification('User updated successfully', 'success');
        Modals.hide('modal-user-edit');
        // Refresh user list
        if (typeof loadUsersPage === 'function') {
          loadUsersPage();
        }
      } else {
        showNotification(result.error || 'Failed to update user', 'error');
      }
    } catch (error) {
      showNotification('Failed to update user', 'error');
      console.error('Error updating user:', error);
    }
  },

  /**
   * Handle User Delete
   */
  async handleUserDelete(userId, username) {
    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        showNotification('User deleted successfully', 'success');
        Modals.hide('modal-delete-confirm');
        // Refresh user list
        if (typeof loadUsersPage === 'function') {
          loadUsersPage();
        }
      } else {
        showNotification(result.error || 'Failed to delete user', 'error');
      }
    } catch (error) {
      showNotification('Failed to delete user', 'error');
      console.error('Error deleting user:', error);
    }
  },

  /**
   * Handle Table Row Edit
   */
  async handleTableRowEdit(service, table, rowId) {
    const form = document.getElementById('form-table-edit');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
      const response = await fetch(`/api/database/${service}/tables/${table}/rows/${rowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data })
      });

      const result = await response.json();

      if (result.success) {
        showNotification('Row updated successfully', 'success');
        Modals.hide('modal-table-edit');
        // Refresh table data
        if (typeof loadTableData === 'function') {
          loadTableData(service, table);
        }
      } else {
        showNotification(result.error || 'Failed to update row', 'error');
      }
    } catch (error) {
      showNotification('Failed to update row', 'error');
      console.error('Error updating row:', error);
    }
  }
};

// Socket.IO event listeners for real-time updates
socket.on('user:created', (data) => {
  showNotification(`User ${data.user?.username || 'New user'} created`, 'info');
  // Refresh user list if on users page
  if (window.location.hash === '#/users' && typeof loadUsersPage === 'function') {
    loadUsersPage();
  }
});

socket.on('user:updated', (data) => {
  showNotification('User updated', 'info');
  if (window.location.hash === '#/users' && typeof loadUsersPage === 'function') {
    loadUsersPage();
  }
});

socket.on('user:deleted', (data) => {
  showNotification('User deleted', 'info');
  if (window.location.hash === '#/users' && typeof loadUsersPage === 'function') {
    loadUsersPage();
  }
});

socket.on('database:row-created', (data) => {
  showNotification(`Row created in ${data.table}`, 'info');
});

socket.on('database:row-updated', (data) => {
  showNotification(`Row updated in ${data.table}`, 'info');
});

socket.on('database:row-deleted', (data) => {
  showNotification(`Row deleted from ${data.table}`, 'info');
});

socket.on('ca:config-updated', (data) => {
  showNotification(`CA ${data.section} configuration updated`, 'info');
});
