/**
 * ═══════════════════════════════════════════════════════════
 * Entity Designer - Migration Management Module
 * Client-side migration generation, application, and versioning
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  // Migration state
  window.migrationState = {
    previousEntitySnapshot: null,
    pendingMigrations: [],
    appliedMigrations: [],
    failedMigrations: []
  };

  /**
   * Initialize migrations tab
   */
  window.initializeMigrationsTab = function() {
    if (!state.currentEntity) {
      return;
    }

    // Initialize migrations array if not present
    if (!state.currentEntity.migrations) {
      state.currentEntity.migrations = [];
    }

    // Load migrations from entity
    const migrations = state.currentEntity.migrations || [];

    migrationState.pendingMigrations = migrations.filter(m => m.status === 'pending');
    migrationState.appliedMigrations = migrations.filter(m => m.status === 'applied');
    migrationState.failedMigrations = migrations.filter(m => m.status === 'failed');

    // Update UI
    updateMigrationCounts();
    renderMigrationLists();
  };

  /**
   * Update migration counts in UI
   */
  function updateMigrationCounts() {
    const currentVersion = state.currentEntity?.currentVersion || '1.0.0';
    const pendingCount = migrationState.pendingMigrations.length;
    const appliedCount = migrationState.appliedMigrations.length;

    // Update header stats
    const versionEl = document.getElementById('currentEntityVersion');
    const pendingTextEl = document.getElementById('pendingMigrationsText');
    const appliedTextEl = document.getElementById('appliedMigrationsText');

    if (versionEl) versionEl.textContent = currentVersion;
    if (pendingTextEl) pendingTextEl.textContent = pendingCount;
    if (appliedTextEl) appliedTextEl.textContent = appliedCount;

    // Update badge
    const badgeEl = document.getElementById('pendingMigrationsCount');
    if (badgeEl) {
      if (pendingCount > 0) {
        badgeEl.textContent = pendingCount;
        badgeEl.style.display = 'inline-block';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    // Enable/disable apply button
    const applyBtn = document.getElementById('applyMigrationsBtn');
    if (applyBtn) {
      applyBtn.disabled = pendingCount === 0;
    }
  }

  /**
   * Render migration lists
   */
  function renderMigrationLists() {
    renderPendingMigrations();
    renderAppliedMigrations();
    renderFailedMigrations();
  }

  /**
   * Render pending migrations
   */
  function renderPendingMigrations() {
    const container = document.getElementById('pendingMigrationsList');
    if (!container) return;

    if (migrationState.pendingMigrations.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 2rem; color: #9ca3af;">
          <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
          <p>No pending migrations. All changes are synchronized.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = migrationState.pendingMigrations
      .map(migration => createMigrationCard(migration, 'pending'))
      .join('');

    // Add event listeners
    attachMigrationEventListeners();
  }

  /**
   * Render applied migrations
   */
  function renderAppliedMigrations() {
    const container = document.getElementById('appliedMigrationsList');
    if (!container) return;

    if (migrationState.appliedMigrations.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 2rem; color: #9ca3af;">
          <p>No migrations have been applied yet.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = migrationState.appliedMigrations
      .map(migration => createMigrationCard(migration, 'applied'))
      .join('');

    // Add event listeners
    attachMigrationEventListeners();
  }

  /**
   * Render failed migrations
   */
  function renderFailedMigrations() {
    const container = document.getElementById('failedMigrationsList');
    const section = document.getElementById('failedMigrationsSection');

    if (!container || !section) return;

    if (migrationState.failedMigrations.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    container.innerHTML = migrationState.failedMigrations
      .map(migration => createMigrationCard(migration, 'failed'))
      .join('');

    // Add event listeners
    attachMigrationEventListeners();
  }

  /**
   * Create migration card HTML
   */
  function createMigrationCard(migration, status) {
    const formattedDate = new Date(migration.createdAt).toLocaleString();
    const typeClass = migration.type.replace('_', '-');

    return `
      <div class="migration-card" data-migration-id="${migration.id}">
        <div class="migration-card-header">
          <div style="flex: 1;">
            <h4 class="migration-title">${migration.version} - ${migration.description}</h4>
            <div class="migration-meta">
              <span class="migration-type-badge ${typeClass}">${migration.type.replace('_', ' ')}</span>
              <span class="migration-id">${migration.id}</span>
              <span class="migration-date">${formattedDate}</span>
            </div>
          </div>
          <div class="migration-actions">
            ${getMigrationActions(migration, status)}
          </div>
        </div>
        <div class="migration-sql-preview" id="preview-${migration.id}" style="display: none;">
          <div class="sql-tabs">
            <button class="sql-tab active" data-sql-type="up" data-migration-id="${migration.id}">Migration SQL</button>
            <button class="sql-tab" data-sql-type="down" data-migration-id="${migration.id}">Rollback SQL</button>
          </div>
          <pre class="sql-code" id="migrationSql-${migration.id}"><code>${escapeHtml(migration.sql)}</code></pre>
          <pre class="sql-code" id="rollbackSql-${migration.id}" style="display: none;"><code>${escapeHtml(migration.rollbackSql || 'No rollback SQL generated')}</code></pre>
          <div class="sql-actions">
            <button class="btn btn-sm btn-outline-primary copy-sql-btn" data-migration-id="${migration.id}" data-sql-type="up">
              <i class="fas fa-copy"></i> Copy
            </button>
            <button class="btn btn-sm btn-outline-secondary download-sql-btn" data-migration-id="${migration.id}">
              <i class="fas fa-download"></i> Download
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get action buttons based on migration status
   */
  function getMigrationActions(migration, status) {
    if (status === 'pending') {
      return `
        <button class="btn btn-sm btn-success apply-migration-btn" data-migration-id="${migration.id}" title="Apply this migration">
          <i class="fas fa-play"></i> Apply
        </button>
        <button class="btn btn-sm btn-outline-secondary view-migration-sql-btn" data-migration-id="${migration.id}" title="View SQL">
          <i class="fas fa-eye"></i> View SQL
        </button>
        <button class="btn btn-sm btn-outline-danger delete-migration-btn" data-migration-id="${migration.id}" title="Delete migration">
          <i class="fas fa-trash"></i>
        </button>
      `;
    } else if (status === 'applied') {
      const appliedDate = migration.appliedAt ? new Date(migration.appliedAt).toLocaleString() : 'Unknown';
      return `
        <span class="badge badge-success">✓ Applied ${appliedDate}</span>
        <button class="btn btn-sm btn-outline-secondary view-migration-sql-btn" data-migration-id="${migration.id}" title="View SQL">
          <i class="fas fa-eye"></i> View
        </button>
        <button class="btn btn-sm btn-outline-warning rollback-migration-btn" data-migration-id="${migration.id}" title="Rollback">
          <i class="fas fa-undo"></i> Rollback
        </button>
      `;
    } else if (status === 'failed') {
      return `
        <span class="badge badge-danger">✗ Failed</span>
        <button class="btn btn-sm btn-outline-secondary view-migration-sql-btn" data-migration-id="${migration.id}" title="View SQL">
          <i class="fas fa-eye"></i> View
        </button>
        <button class="btn btn-sm btn-outline-primary retry-migration-btn" data-migration-id="${migration.id}" title="Retry">
          <i class="fas fa-redo"></i> Retry
        </button>
        <button class="btn btn-sm btn-outline-danger delete-migration-btn" data-migration-id="${migration.id}" title="Delete">
          <i class="fas fa-trash"></i> Delete
        </button>
      `;
    }
    return '';
  }

  /**
   * Attach event listeners to migration cards
   */
  function attachMigrationEventListeners() {
    // View SQL buttons
    document.querySelectorAll('.view-migration-sql-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const migrationId = e.currentTarget.dataset.migrationId;
        toggleSQLPreview(migrationId);
      });
    });

    // Apply buttons
    document.querySelectorAll('.apply-migration-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const migrationId = e.currentTarget.dataset.migrationId;
        applyMigration(migrationId);
      });
    });

    // Delete buttons
    document.querySelectorAll('.delete-migration-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const migrationId = e.currentTarget.dataset.migrationId;
        deleteMigration(migrationId);
      });
    });

    // Rollback buttons
    document.querySelectorAll('.rollback-migration-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const migrationId = e.currentTarget.dataset.migrationId;
        rollbackMigration(migrationId);
      });
    });

    // Retry buttons
    document.querySelectorAll('.retry-migration-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const migrationId = e.currentTarget.dataset.migrationId;
        retryMigration(migrationId);
      });
    });

    // SQL tabs
    document.querySelectorAll('.sql-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const migrationId = e.currentTarget.dataset.migrationId;
        const sqlType = e.currentTarget.dataset.sqlType;
        switchSQLTab(migrationId, sqlType);
      });
    });

    // Copy SQL buttons
    document.querySelectorAll('.copy-sql-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const migrationId = e.currentTarget.dataset.migrationId;
        const sqlType = e.currentTarget.dataset.sqlType || 'up';
        copySQLToClipboard(migrationId, sqlType);
      });
    });

    // Download SQL buttons
    document.querySelectorAll('.download-sql-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const migrationId = e.currentTarget.dataset.migrationId;
        downloadSQL(migrationId);
      });
    });
  }

  /**
   * Toggle SQL preview visibility
   */
  function toggleSQLPreview(migrationId) {
    const preview = document.getElementById(`preview-${migrationId}`);
    if (preview) {
      preview.style.display = preview.style.display === 'none' ? 'block' : 'none';
    }
  }

  /**
   * Switch SQL tab (migration/rollback)
   */
  function switchSQLTab(migrationId, sqlType) {
    const migrationSql = document.getElementById(`migrationSql-${migrationId}`);
    const rollbackSql = document.getElementById(`rollbackSql-${migrationId}`);
    const tabs = document.querySelectorAll(`.sql-tab[data-migration-id="${migrationId}"]`);

    tabs.forEach(tab => {
      if (tab.dataset.sqlType === sqlType) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    if (sqlType === 'up') {
      if (migrationSql) migrationSql.style.display = 'block';
      if (rollbackSql) rollbackSql.style.display = 'none';
    } else {
      if (migrationSql) migrationSql.style.display = 'none';
      if (rollbackSql) rollbackSql.style.display = 'block';
    }
  }

  /**
   * Copy SQL to clipboard
   */
  async function copySQLToClipboard(migrationId, sqlType) {
    const migration = findMigrationById(migrationId);
    if (!migration) return;

    const sql = sqlType === 'up' ? migration.sql : migration.rollbackSql;

    try {
      await navigator.clipboard.writeText(sql);
      showToast('SQL copied to clipboard', 'success');
    } catch (err) {
      console.error('Failed to copy:', err);
      showToast('Failed to copy SQL', 'error');
    }
  }

  /**
   * Download SQL file
   */
  function downloadSQL(migrationId) {
    const migration = findMigrationById(migrationId);
    if (!migration) return;

    const filename = `${migration.id}_${migration.version}.sql`;
    const content = `-- Migration: ${migration.description}\n-- Version: ${migration.version}\n-- Type: ${migration.type}\n-- Generated: ${migration.createdAt}\n\n${migration.sql}\n\n-- Rollback SQL:\n-- ${migration.rollbackSql.split('\n').join('\n-- ')}`;

    downloadFile(filename, content, 'text/sql');
    showToast('SQL file downloaded', 'success');
  }

  /**
   * Open generate migration modal
   */
  window.openGenerateMigrationModal = function() {
    if (!state.currentEntity) {
      showToast('No entity selected', 'error');
      return;
    }

    // Take snapshot of current entity for comparison
    migrationState.previousEntitySnapshot = getPreviousEntitySnapshot();

    // Populate version field with auto-increment
    const currentVersion = state.currentEntity.currentVersion || '1.0.0';
    const suggestedVersion = incrementVersion(currentVersion, 'patch');

    const versionInput = document.getElementById('migrationVersion');
    if (versionInput) {
      versionInput.value = suggestedVersion;
    }

    // Detect changes automatically
    detectAndDisplayChanges();

    // Show modal
    const modal = document.getElementById('generateMigrationModal');
    if (modal) {
      modal.classList.add('active');
    }
  };

  /**
   * Close generate migration modal
   */
  window.closeGenerateMigrationModal = function() {
    const modal = document.getElementById('generateMigrationModal');
    if (modal) {
      modal.classList.remove('active');
    }

    // Clear form
    const form = modal.querySelector('.modal-body');
    if (form) {
      form.querySelector('#migrationVersion').value = '';
      form.querySelector('#migrationDescription').value = '';
      form.querySelector('#migrationType').value = 'auto';
      form.querySelector('#migrationSqlPreview code').textContent = '-- SQL will be generated when you click "Generate"...';
    }
  };

  /**
   * Get previous entity snapshot for comparison
   */
  function getPreviousEntitySnapshot() {
    // If there are applied migrations, get the last applied version
    if (migrationState.appliedMigrations.length > 0) {
      const lastMigration = migrationState.appliedMigrations[migrationState.appliedMigrations.length - 1];
      // Return a copy of the entity state after the last migration
      return JSON.parse(JSON.stringify(state.currentEntity));
    }

    // Otherwise, return null (this is a new entity)
    return null;
  }

  /**
   * Detect schema changes
   */
  function detectAndDisplayChanges() {
    if (!state.currentEntity) return;

    const changesList = document.getElementById('detectedChangesList');
    if (!changesList) return;

    const previous = migrationState.previousEntitySnapshot;
    const current = state.currentEntity;

    if (!previous) {
      changesList.innerHTML = `
        <div class="change-item">
          <input type="checkbox" id="change_create_table" checked disabled>
          <label for="change_create_table">
            <span class="change-type add">CREATE</span>
            Table: <code>${current.tableName}</code> with ${current.fields?.length || 0} fields
          </label>
        </div>
      `;
      return;
    }

    const changes = compareEntitySchemas(current, previous);

    if (changes.length === 0) {
      changesList.innerHTML = '<p style="color: #6b7280; font-size: 0.875rem;">No changes detected.</p>';
      return;
    }

    changesList.innerHTML = changes.map((change, index) => `
      <div class="change-item">
        <input type="checkbox" id="change_${index}" checked>
        <label for="change_${index}">
          <span class="change-type ${change.type}">${change.type.toUpperCase()}</span>
          ${change.description}
        </label>
      </div>
    `).join('');
  }

  /**
   * Compare entity schemas
   */
  function compareEntitySchemas(current, previous) {
    const changes = [];

    // Compare fields
    const currentFields = new Map((current.fields || []).map(f => [f.name, f]));
    const previousFields = new Map((previous.fields || []).map(f => [f.name, f]));

    // Added fields
    currentFields.forEach((field, name) => {
      if (!previousFields.has(name)) {
        changes.push({
          type: 'add',
          description: `Column: <code>${name}</code> (${field.type})`
        });
      }
    });

    // Removed fields
    previousFields.forEach((field, name) => {
      if (!currentFields.has(name)) {
        changes.push({
          type: 'remove',
          description: `Column: <code>${name}</code>`
        });
      }
    });

    // Modified fields
    currentFields.forEach((field, name) => {
      if (previousFields.has(name)) {
        const prevField = previousFields.get(name);
        if (JSON.stringify(field) !== JSON.stringify(prevField)) {
          changes.push({
            type: 'modify',
            description: `Column: <code>${name}</code> (${prevField.type} → ${field.type})`
          });
        }
      }
    });

    // Compare indexes
    const currentIndexes = new Map((current.indexes || []).map(i => [i.name, i]));
    const previousIndexes = new Map((previous.indexes || []).map(i => [i.name, i]));

    currentIndexes.forEach((index, name) => {
      if (!previousIndexes.has(name)) {
        changes.push({
          type: 'add',
          description: `Index: <code>${name}</code> on (${index.fields.join(', ')})`
        });
      }
    });

    previousIndexes.forEach((index, name) => {
      if (!currentIndexes.has(name)) {
        changes.push({
          type: 'remove',
          description: `Index: <code>${name}</code>`
        });
      }
    });

    return changes;
  }

  /**
   * Generate migration
   */
  window.generateMigration = async function() {
    if (!state.currentEntity) return;

    const version = document.getElementById('migrationVersion').value.trim();
    const description = document.getElementById('migrationDescription').value.trim();
    const type = document.getElementById('migrationType').value;
    const safeMode = document.getElementById('migrationSafeMode').checked;
    const generateRollback = document.getElementById('migrationGenerateRollback').checked;
    const backupData = document.getElementById('migrationBackupData').checked;

    // Validation
    if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
      showToast('Invalid version number. Use format: MAJOR.MINOR.PATCH', 'error');
      return;
    }

    if (!description) {
      showToast('Description is required', 'error');
      return;
    }

    try {
      // Call API to generate migration
      const response = await fetch(`/lowcode/api/entities/${state.currentEntity.id}/migrations/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentSchema: state.currentEntity,
          previousSchema: migrationState.previousEntitySnapshot,
          options: {
            type,
            safeMode,
            generateRollback,
            backupData
          },
          version,
          description
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate migration');
      }

      const { migration } = await response.json();

      // Add to pending migrations
      if (!state.currentEntity.migrations) {
        state.currentEntity.migrations = [];
      }
      state.currentEntity.migrations.push(migration);
      migrationState.pendingMigrations.push(migration);

      // Update UI
      updateMigrationCounts();
      renderMigrationLists();

      // Preview SQL
      const preview = document.getElementById('migrationSqlPreview');
      if (preview) {
        preview.querySelector('code').textContent = migration.sql;
      }

      showToast('Migration generated successfully', 'success');

      // Auto-save entity
      await saveEntity();

    } catch (error) {
      console.error('Migration generation error:', error);
      showToast('Failed to generate migration: ' + error.message, 'error');
    }
  };

  /**
   * Apply migration
   */
  async function applyMigration(migrationId) {
    const migration = findMigrationById(migrationId);
    if (!migration) return;

    if (!confirm(`Apply migration "${migration.description}"?\n\nThis will execute SQL against the database.`)) {
      return;
    }

    try {
      const response = await fetch(`/lowcode/api/entities/${state.currentEntity.id}/migrations/${migrationId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to apply migration');
      }

      const { success } = await response.json();

      if (success) {
        // Update migration status
        migration.status = 'applied';
        migration.appliedAt = new Date().toISOString();
        migration.appliedBy = state.currentUser?.username || 'system';

        // Move to applied list
        migrationState.pendingMigrations = migrationState.pendingMigrations.filter(m => m.id !== migrationId);
        migrationState.appliedMigrations.push(migration);

        // Update entity version
        state.currentEntity.currentVersion = migration.version;
        state.currentEntity.lastMigrationAt = migration.appliedAt;

        // Update UI
        updateMigrationCounts();
        renderMigrationLists();

        showToast('Migration applied successfully', 'success');

        // Save entity
        await saveEntity();
      }
    } catch (error) {
      console.error('Migration application error:', error);
      migration.status = 'failed';
      migrationState.failedMigrations.push(migration);
      migrationState.pendingMigrations = migrationState.pendingMigrations.filter(m => m.id !== migrationId);

      updateMigrationCounts();
      renderMigrationLists();

      showToast('Failed to apply migration: ' + error.message, 'error');
    }
  }

  /**
   * Rollback migration
   */
  async function rollbackMigration(migrationId) {
    const migration = findMigrationById(migrationId);
    if (!migration) return;

    if (!confirm(`Rollback migration "${migration.description}"?\n\n⚠️ WARNING: This will execute rollback SQL and revert changes.`)) {
      return;
    }

    try {
      const response = await fetch(`/lowcode/api/entities/${state.currentEntity.id}/migrations/${migrationId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Failed to rollback migration');
      }

      const { success } = await response.json();

      if (success) {
        // Update migration status
        migration.status = 'rolled_back';

        // Move back to pending
        migrationState.appliedMigrations = migrationState.appliedMigrations.filter(m => m.id !== migrationId);
        migrationState.pendingMigrations.push(migration);

        // Update UI
        updateMigrationCounts();
        renderMigrationLists();

        showToast('Migration rolled back successfully', 'success');

        // Save entity
        await saveEntity();
      }
    } catch (error) {
      console.error('Migration rollback error:', error);
      showToast('Failed to rollback migration: ' + error.message, 'error');
    }
  }

  /**
   * Retry failed migration
   */
  async function retryMigration(migrationId) {
    const migration = findMigrationById(migrationId);
    if (!migration) return;

    // Reset status to pending
    migration.status = 'pending';
    migrationState.failedMigrations = migrationState.failedMigrations.filter(m => m.id !== migrationId);
    migrationState.pendingMigrations.push(migration);

    updateMigrationCounts();
    renderMigrationLists();

    // Try to apply
    await applyMigration(migrationId);
  }

  /**
   * Delete migration
   */
  async function deleteMigration(migrationId) {
    const migration = findMigrationById(migrationId);
    if (!migration) return;

    if (!confirm(`Delete migration "${migration.description}"?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/lowcode/api/entities/${state.currentEntity.id}/migrations/${migrationId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete migration');
      }

      // Remove from all lists
      state.currentEntity.migrations = state.currentEntity.migrations.filter(m => m.id !== migrationId);
      migrationState.pendingMigrations = migrationState.pendingMigrations.filter(m => m.id !== migrationId);
      migrationState.appliedMigrations = migrationState.appliedMigrations.filter(m => m.id !== migrationId);
      migrationState.failedMigrations = migrationState.failedMigrations.filter(m => m.id !== migrationId);

      // Update UI
      updateMigrationCounts();
      renderMigrationLists();

      showToast('Migration deleted', 'success');

      // Save entity
      await saveEntity();
    } catch (error) {
      console.error('Migration deletion error:', error);
      showToast('Failed to delete migration: ' + error.message, 'error');
    }
  }

  /**
   * Apply all pending migrations
   */
  window.applyAllPendingMigrations = async function() {
    if (migrationState.pendingMigrations.length === 0) {
      showToast('No pending migrations to apply', 'info');
      return;
    }

    if (!confirm(`Apply all ${migrationState.pendingMigrations.length} pending migrations?`)) {
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const migration of [...migrationState.pendingMigrations]) {
      try {
        await applyMigration(migration.id);
        successCount++;
      } catch (error) {
        failCount++;
        console.error(`Failed to apply migration ${migration.id}:`, error);
      }
    }

    showToast(`Applied ${successCount} migrations, ${failCount} failed`, successCount > 0 ? 'success' : 'error');
  };

  /**
   * Export migrations SQL
   */
  window.exportMigrationsSQL = function() {
    if (migrationState.pendingMigrations.length === 0) {
      showToast('No pending migrations to export', 'info');
      return;
    }

    const sql = migrationState.pendingMigrations
      .map(m => `-- Migration: ${m.description}\n-- Version: ${m.version}\n-- Type: ${m.type}\n\n${m.sql}\n\n`)
      .join('\n');

    const filename = `${state.currentEntity.tableName}_migrations_${Date.now()}.sql`;
    downloadFile(filename, sql, 'text/sql');
    showToast('Migrations exported', 'success');
  };

  /**
   * Auto-increment version
   */
  window.autoIncrementVersion = function() {
    const versionInput = document.getElementById('migrationVersion');
    if (!versionInput) return;

    const currentVersion = state.currentEntity?.currentVersion || '1.0.0';
    const newVersion = incrementVersion(currentVersion, 'patch');
    versionInput.value = newVersion;
  };

  /**
   * Increment version helper
   */
  function incrementVersion(version, type = 'patch') {
    const [major, minor, patch] = version.split('.').map(Number);

    switch (type) {
      case 'major':
        return `${major + 1}.0.0`;
      case 'minor':
        return `${major}.${minor + 1}.0`;
      case 'patch':
      default:
        return `${major}.${minor}.${patch + 1}`;
    }
  }

  /**
   * Find migration by ID
   */
  function findMigrationById(id) {
    return state.currentEntity?.migrations?.find(m => m.id === id);
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
   * Download file helper
   */
  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Setup event listeners when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    // Generate Migration button
    const generateBtn = document.getElementById('generateMigrationBtn');
    if (generateBtn) {
      generateBtn.addEventListener('click', openGenerateMigrationModal);
    }

    // Apply All Pending button
    const applyAllBtn = document.getElementById('applyMigrationsBtn');
    if (applyAllBtn) {
      applyAllBtn.addEventListener('click', applyAllPendingMigrations);
    }

    // Export Migrations button
    const exportBtn = document.getElementById('exportMigrationsBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportMigrationsSQL);
    }

    // Modal close buttons
    const modalClose = document.getElementById('generateMigrationModalClose');
    const modalCancel = document.getElementById('generateMigrationCancel');
    const modalConfirm = document.getElementById('generateMigrationConfirm');

    if (modalClose) modalClose.addEventListener('click', closeGenerateMigrationModal);
    if (modalCancel) modalCancel.addEventListener('click', closeGenerateMigrationModal);
    if (modalConfirm) modalConfirm.addEventListener('click', generateMigration);

    // Auto-increment version button
    const autoIncrementBtn = document.getElementById('autoIncrementVersionBtn');
    if (autoIncrementBtn) {
      autoIncrementBtn.addEventListener('click', autoIncrementVersion);
    }

    // Migration type change handler
    const migrationTypeSelect = document.getElementById('migrationType');
    if (migrationTypeSelect) {
      migrationTypeSelect.addEventListener('change', detectAndDisplayChanges);
    }
  });

})();
