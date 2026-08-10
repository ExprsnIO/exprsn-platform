/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn DB Admin - Main Application
 * ═══════════════════════════════════════════════════════════
 */

(function() {
  'use strict';

  // ───────────────────────────────────────────────────────────
  // Application State
  // ───────────────────────────────────────────────────────────

  const state = {
    currentConnection: null,
    connections: [],
    editor: null,
    socket: null,
    currentPage: 'dashboard',
    queryHistory: [],
    currentResults: null,
    currentPage: 1,
    pageSize: 100
  };

  // ───────────────────────────────────────────────────────────
  // Initialize Application
  // ───────────────────────────────────────────────────────────

  function init() {
    initSocket();
    initMonacoEditor();
    initEventListeners();
    loadConnections();
    updateDashboardStats();

    // Load data every 30 seconds
    setInterval(() => {
      if (state.currentPage === 'dashboard') {
        updateDashboardStats();
      }
    }, 30000);
  }

  // ───────────────────────────────────────────────────────────
  // Socket.IO Initialization
  // ───────────────────────────────────────────────────────────

  function initSocket() {
    state.socket = io();

    state.socket.on('connect', () => {
      console.log('Socket.IO connected');
      addMessage('Connected to server', 'success');
    });

    state.socket.on('disconnect', () => {
      console.log('Socket.IO disconnected');
      addMessage('Disconnected from server', 'warning');
    });

    // Query execution events
    state.socket.on('query:started', (data) => {
      showQueryStatus('Executing query...');
    });

    state.socket.on('query:success', (data) => {
      hideQueryStatus();
      handleQuerySuccess(data);
    });

    state.socket.on('query:error', (data) => {
      hideQueryStatus();
      handleQueryError(data);
    });

    state.socket.on('query:chunk', (data) => {
      console.log('Query chunk received:', data);
    });
  }

  // ───────────────────────────────────────────────────────────
  // Monaco Editor Initialization
  // ───────────────────────────────────────────────────────────

  function initMonacoEditor() {
    require(['vs/editor/editor.main'], function() {
      state.editor = monaco.editor.create(document.getElementById('editor'), {
        value: '-- PostgreSQL Query Editor\n-- Press Ctrl+Enter to execute\n\nSELECT * FROM information_schema.tables\nWHERE table_schema = \'public\'\nLIMIT 10;',
        language: 'sql',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 14,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        suggestOnTriggerCharacters: true,
        quickSuggestions: true,
        tabSize: 2
      });

      // Add Ctrl+Enter keybinding for query execution
      state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        executeQuery();
      });

      // Add Ctrl+Shift+F keybinding for formatting
      state.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
        formatSQL();
      });
    });
  }

  // ───────────────────────────────────────────────────────────
  // Event Listeners
  // ───────────────────────────────────────────────────────────

  function initEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-link[data-page]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = e.currentTarget.dataset.page;
        navigateToPage(page);
      });
    });

    // Query editor buttons
    const executeBtn = document.getElementById('executeBtn');
    if (executeBtn) {
      executeBtn.addEventListener('click', executeQuery);
    }

    const explainBtn = document.getElementById('explainBtn');
    if (explainBtn) {
      explainBtn.addEventListener('click', explainQuery);
    }

    const formatBtn = document.getElementById('formatBtn');
    if (formatBtn) {
      formatBtn.addEventListener('click', formatSQL);
    }

    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveQuery);
    }

    // Quick actions
    document.querySelectorAll('.quick-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const action = e.currentTarget.dataset.action;
        handleQuickAction(action);
      });
    });

    // Connection management
    const addConnectionBtn = document.getElementById('addConnectionBtn');
    if (addConnectionBtn) {
      addConnectionBtn.addEventListener('click', () => {
        showConnectionModal();
      });
    }
  }

  // ───────────────────────────────────────────────────────────
  // Page Navigation
  // ───────────────────────────────────────────────────────────

  function navigateToPage(page) {
    // Hide all pages
    document.querySelectorAll('.page-content').forEach(p => {
      p.style.display = 'none';
    });

    // Show selected page
    const pageElement = document.getElementById(page + 'Page');
    if (pageElement) {
      pageElement.style.display = 'block';
    }

    // Update nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    document.querySelector(`.nav-link[data-page="${page}"]`)?.classList.add('active');

    // Update page title
    const titles = {
      dashboard: { title: 'Dashboard', subtitle: 'PostgreSQL Database Administration' },
      query: { title: 'Query Editor', subtitle: 'Execute SQL queries with syntax highlighting' },
      connections: { title: 'Connections', subtitle: 'Manage database connections' },
      tables: { title: 'Tables', subtitle: 'Manage database tables' },
      tablespaces: { title: 'Tablespaces', subtitle: 'Manage tablespaces' },
      indices: { title: 'Indices', subtitle: 'Manage database indices' },
      functions: { title: 'Functions', subtitle: 'Manage functions and stored procedures' },
      triggers: { title: 'Triggers', subtitle: 'Manage database triggers' },
      sequences: { title: 'Sequences', subtitle: 'Manage database sequences' },
      users: { title: 'Users & Roles', subtitle: 'Manage database users and roles' },
      'import-export': { title: 'Import/Export', subtitle: 'Import and export data' }
    };

    const pageInfo = titles[page] || { title: page, subtitle: '' };
    document.getElementById('pageTitle').textContent = pageInfo.title;
    document.getElementById('pageSubtitle').textContent = pageInfo.subtitle;

    state.currentPage = page;

    // Load page-specific data
    loadPageData(page);
  }

  function loadPageData(page) {
    if (!state.currentConnection) {
      return;
    }

    switch (page) {
      case 'tables':
        loadTables();
        break;
      case 'functions':
        loadFunctions();
        break;
      case 'triggers':
        loadTriggers();
        break;
      case 'sequences':
        loadSequences();
        break;
      case 'tablespaces':
        loadTablespaces();
        break;
      case 'indices':
        loadIndices();
        break;
      case 'users':
        loadUsers();
        break;
    }
  }

  // ───────────────────────────────────────────────────────────
  // Connection Management
  // ───────────────────────────────────────────────────────────

  async function loadConnections() {
    try {
      showLoading();
      const response = await fetch('/api/connections');
      const data = await response.json();

      if (data.success) {
        state.connections = data.data;
        renderConnections();
        updateConnectionsCount();
        updateDashboardStats();

        // Auto-select first connection if available
        if (state.connections.length > 0 && !state.currentConnection) {
          selectConnection(state.connections[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load connections:', error);
      addMessage('Failed to load connections', 'danger');
    } finally {
      hideLoading();
    }
  }

  function renderConnections() {
    const dropdown = document.getElementById('connectionDropdownMenu');
    const serversTable = document.getElementById('serversTableBody');

    if (state.connections.length === 0) {
      dropdown.innerHTML = '<li><a class="dropdown-item text-muted"><em>No connections</em></a></li>';
      serversTable.innerHTML = `
        <tr>
          <td colspan="8" class="text-center text-muted py-4">
            <i class="bi bi-inbox fs-1 d-block mb-2"></i>
            No database connections configured
          </td>
        </tr>
      `;
      return;
    }

    // Render dropdown
    dropdown.innerHTML = state.connections.map(conn => `
      <li>
        <a class="dropdown-item connection-select ${state.currentConnection?.id === conn.id ? 'active' : ''}"
           href="#"
           data-id="${conn.id}">
          <span class="status-indicator ${conn.isActive ? 'online' : 'offline'}"></span>
          ${conn.name}
        </a>
      </li>
    `).join('');

    // Add click handlers
    dropdown.querySelectorAll('.connection-select').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.preventDefault();
        const connId = e.currentTarget.dataset.id;
        const conn = state.connections.find(c => c.id === connId);
        if (conn) {
          await selectConnection(conn);
        }
      });
    });

    // Render servers table
    serversTable.innerHTML = state.connections.map(conn => `
      <tr>
        <td>
          <span class="status-indicator ${conn.isActive ? 'online' : 'offline'}"></span>
          ${conn.isActive ? 'Online' : 'Offline'}
        </td>
        <td>
          <div class="server-name">
            <div class="server-icon" style="background: ${getColorForConnection(conn)}20; color: ${getColorForConnection(conn)};">
              <i class="bi bi-database"></i>
            </div>
            <strong>${conn.name}</strong>
          </div>
        </td>
        <td>${conn.host}</td>
        <td>${conn.port}</td>
        <td>${conn.database}</td>
        <td>${conn.username}</td>
        <td><span class="badge bg-info">PostgreSQL ${conn.version || 'N/A'}</span></td>
        <td>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="app.testConnection('${conn.id}')" title="Test Connection">
              <i class="bi bi-lightning"></i>
            </button>
            <button class="btn btn-outline-secondary" onclick="app.editConnection('${conn.id}')" title="Edit">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-outline-danger" onclick="app.deleteConnection('${conn.id}')" title="Delete">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  async function selectConnection(conn) {
    state.currentConnection = conn;
    document.getElementById('currentConnection').textContent = conn.name;

    // Update dropdown
    document.querySelectorAll('.connection-select').forEach(item => {
      item.classList.toggle('active', item.dataset.id === conn.id);
    });

    // Test connection and get version
    await testConnection(conn.id);

    addMessage(`Connected to ${conn.name}`, 'success');

    // Reload current page data
    loadPageData(state.currentPage);
  }

  async function testConnection(connId) {
    try {
      const response = await fetch(`/api/connections/${connId}/test`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        addMessage(`Connection test successful: ${data.message}`, 'success');
        // Update connection with version info
        const conn = state.connections.find(c => c.id === connId);
        if (conn && data.version) {
          conn.version = data.version;
          renderConnections();
        }
      } else {
        addMessage(`Connection test failed: ${data.message}`, 'danger');
      }
    } catch (error) {
      console.error('Connection test failed:', error);
      addMessage('Connection test failed', 'danger');
    }
  }

  function getColorForConnection(conn) {
    const colors = ['#667eea', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];
    const hash = conn.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  function updateConnectionsCount() {
    const count = state.connections.length;
    const online = state.connections.filter(c => c.isActive).length;

    document.getElementById('connectionsCount').textContent = count;
    document.getElementById('statConnections').textContent = count;
    document.getElementById('statConnectionsOnline').textContent = `${online} Online`;
  }

  // ───────────────────────────────────────────────────────────
  // Query Execution
  // ───────────────────────────────────────────────────────────

  function executeQuery() {
    if (!state.currentConnection) {
      addMessage('Please select a connection first', 'warning');
      return;
    }

    if (!state.editor) {
      addMessage('Editor not initialized', 'danger');
      return;
    }

    const query = getSelectedTextOrFullQuery();

    if (!query.trim()) {
      addMessage('Please enter a query', 'warning');
      return;
    }

    // Show loading
    showQueryStatus('Executing query...');

    // Clear previous results
    document.getElementById('resultsContainer').innerHTML = '';
    document.getElementById('resultsPagination').classList.add('d-none');

    // Execute via Socket.IO
    state.socket.emit('query:execute', {
      connectionId: state.currentConnection.id,
      query: query,
      connectionConfig: {
        host: state.currentConnection.host,
        port: state.currentConnection.port,
        database: state.currentConnection.database,
        username: state.currentConnection.username,
        password: state.currentConnection.password
      }
    });

    // Add to history
    addToHistory({
      query: query,
      timestamp: new Date(),
      status: 'executing'
    });
  }

  function getSelectedTextOrFullQuery() {
    const selection = state.editor.getSelection();
    const selectedText = state.editor.getModel().getValueInRange(selection);

    if (selectedText.trim()) {
      return selectedText;
    }

    return state.editor.getValue();
  }

  function handleQuerySuccess(data) {
    const { rows, rowCount, executionTimeMs, fields } = data;

    // Update badges
    document.getElementById('rowCountBadge').textContent = rowCount;

    // Render results
    renderResults(rows, fields);

    // Show pagination if needed
    if (rowCount > state.pageSize) {
      showPagination(rowCount);
    }

    // Add success message
    addMessage(`Query executed successfully in ${executionTimeMs}ms. ${rowCount} rows returned.`, 'success');

    // Update history
    updateHistoryStatus(true, executionTimeMs, rowCount);

    // Update stats
    updateQueryStats();
  }

  function handleQueryError(data) {
    const { error } = data;

    // Show error
    document.getElementById('resultsContainer').innerHTML = `
      <div class="alert alert-danger">
        <h6><i class="bi bi-exclamation-triangle me-2"></i>Query Error</h6>
        <pre class="mb-0"><code>${escapeHtml(error)}</code></pre>
      </div>
    `;

    // Add error message
    addMessage(`Query failed: ${error}`, 'danger');

    // Update history
    updateHistoryStatus(false, 0, 0);
  }

  function renderResults(rows, fields) {
    if (!rows || rows.length === 0) {
      document.getElementById('resultsContainer').innerHTML = `
        <div class="text-center text-muted py-5">
          <i class="bi bi-inbox fs-1 d-block mb-3"></i>
          <p>Query returned no results</p>
        </div>
      `;
      return;
    }

    const columns = Object.keys(rows[0]);

    let html = '<table class="table table-hover results-table data-grid">';
    html += '<thead><tr>';

    columns.forEach(col => {
      html += `<th>${escapeHtml(col)}</th>`;
    });

    html += '</tr></thead><tbody>';

    rows.forEach((row, rowIdx) => {
      html += '<tr>';
      columns.forEach(col => {
        const value = row[col];
        const cellClass = value === null ? 'cell-null data-grid-cell' : 'data-grid-cell';
        const displayValue = value === null ? 'NULL' : escapeHtml(String(value));
        html += `<td class="${cellClass}" data-row="${rowIdx}" data-col="${col}">${displayValue}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table>';

    document.getElementById('resultsContainer').innerHTML = html;

    // Store results
    state.currentResults = rows;

    // Add edit handlers
    addEditHandlers();
  }

  function addEditHandlers() {
    document.querySelectorAll('.data-grid-cell').forEach(cell => {
      cell.addEventListener('dblclick', (e) => {
        const row = e.currentTarget.dataset.row;
        const col = e.currentTarget.dataset.col;
        const currentValue = state.currentResults[row][col];

        // Create input
        const input = document.createElement('input');
        input.value = currentValue || '';
        input.className = 'form-control form-control-sm';

        // Replace cell content
        e.currentTarget.innerHTML = '';
        e.currentTarget.appendChild(input);
        input.focus();
        input.select();

        // Save on blur or enter
        input.addEventListener('blur', () => saveCell(row, col, input.value, e.currentTarget));
        input.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter') {
            saveCell(row, col, input.value, e.currentTarget);
          } else if (evt.key === 'Escape') {
            renderCell(e.currentTarget, currentValue);
          }
        });
      });
    });
  }

  function saveCell(row, col, value, cellElement) {
    // Update state
    state.currentResults[row][col] = value;

    // Render cell
    renderCell(cellElement, value);

    // TODO: Send UPDATE query to database
    console.log(`Update: Row ${row}, Column ${col}, New Value: ${value}`);
  }

  function renderCell(cellElement, value) {
    const displayValue = value === null ? 'NULL' : escapeHtml(String(value));
    const cellClass = value === null ? 'cell-null' : '';
    cellElement.className = `data-grid-cell ${cellClass}`;
    cellElement.innerHTML = displayValue;
  }

  // ───────────────────────────────────────────────────────────
  // Query Explain
  // ───────────────────────────────────────────────────────────

  function explainQuery() {
    if (!state.editor || !state.currentConnection) {
      addMessage('Please select a connection and enter a query', 'warning');
      return;
    }

    const query = getSelectedTextOrFullQuery();
    const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;

    showQueryStatus('Analyzing query plan...');

    state.socket.emit('query:execute', {
      connectionId: state.currentConnection.id,
      query: explainQuery,
      connectionConfig: {
        host: state.currentConnection.host,
        port: state.currentConnection.port,
        database: state.currentConnection.database,
        username: state.currentConnection.username,
        password: state.currentConnection.password
      }
    });

    state.socket.once('query:success', (data) => {
      hideQueryStatus();
      renderExplainPlan(data.rows);

      // Switch to explain tab
      const explainTab = document.querySelector('a[href="#explainTab"]');
      if (explainTab) {
        explainTab.click();
      }
    });
  }

  function renderExplainPlan(rows) {
    const container = document.getElementById('explainContainer');

    if (!rows || rows.length === 0) {
      container.innerHTML = '<p class="text-muted">No explain plan available</p>';
      return;
    }

    const plan = rows[0]['QUERY PLAN'];

    container.innerHTML = `
      <pre class="bg-light p-3 rounded" style="max-height: 500px; overflow: auto;"><code>${JSON.stringify(plan, null, 2)}</code></pre>
    `;
  }

  // ───────────────────────────────────────────────────────────
  // SQL Formatting (Basic)
  // ───────────────────────────────────────────────────────────

  function formatSQL() {
    if (!state.editor) return;

    const query = state.editor.getValue();

    // Basic SQL formatting
    const formatted = query
      .replace(/\bSELECT\b/gi, 'SELECT\n  ')
      .replace(/\bFROM\b/gi, '\nFROM\n  ')
      .replace(/\bWHERE\b/gi, '\nWHERE\n  ')
      .replace(/\bAND\b/gi, '\n  AND ')
      .replace(/\bOR\b/gi, '\n  OR ')
      .replace(/\bJOIN\b/gi, '\nJOIN\n  ')
      .replace(/\bLEFT JOIN\b/gi, '\nLEFT JOIN\n  ')
      .replace(/\bINNER JOIN\b/gi, '\nINNER JOIN\n  ')
      .replace(/\bGROUP BY\b/gi, '\nGROUP BY\n  ')
      .replace(/\bORDER BY\b/gi, '\nORDER BY\n  ')
      .replace(/\bLIMIT\b/gi, '\nLIMIT ');

    state.editor.setValue(formatted);
    addMessage('Query formatted', 'info');
  }

  // ───────────────────────────────────────────────────────────
  // Save Query
  // ───────────────────────────────────────────────────────────

  async function saveQuery() {
    if (!state.editor) return;

    const query = state.editor.getValue();
    const name = prompt('Enter a name for this query:');

    if (!name) return;

    try {
      const response = await fetch('/api/queries/saved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          query,
          userId: 'admin' // TODO: Get from session
        })
      });

      const data = await response.json();

      if (data.success) {
        addMessage('Query saved successfully', 'success');
      } else {
        addMessage('Failed to save query', 'danger');
      }
    } catch (error) {
      console.error('Save query failed:', error);
      addMessage('Failed to save query', 'danger');
    }
  }

  // ───────────────────────────────────────────────────────────
  // Query History
  // ───────────────────────────────────────────────────────────

  function addToHistory(entry) {
    state.queryHistory.unshift(entry);
    renderHistory();
  }

  function updateHistoryStatus(success, duration, rows) {
    if (state.queryHistory.length > 0) {
      state.queryHistory[0].status = success ? 'success' : 'error';
      state.queryHistory[0].duration = duration;
      state.queryHistory[0].rows = rows;
      renderHistory();
    }
  }

  function renderHistory() {
    const tbody = document.getElementById('historyTableBody');

    if (state.queryHistory.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No query history</td></tr>';
      return;
    }

    tbody.innerHTML = state.queryHistory.slice(0, 20).map(entry => `
      <tr>
        <td>${new Date(entry.timestamp).toLocaleTimeString()}</td>
        <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(entry.query)}">
          ${escapeHtml(entry.query)}
        </td>
        <td>${entry.duration ? entry.duration + 'ms' : '-'}</td>
        <td>${entry.rows !== undefined ? entry.rows : '-'}</td>
        <td>
          <span class="badge ${entry.status === 'success' ? 'bg-success' : entry.status === 'error' ? 'bg-danger' : 'bg-secondary'}">
            ${entry.status}
          </span>
        </td>
      </tr>
    `).join('');
  }

  // ───────────────────────────────────────────────────────────
  // Dashboard Stats
  // ───────────────────────────────────────────────────────────

  async function updateDashboardStats() {
    updateConnectionsCount();

    if (state.currentConnection) {
      await updateTableCount();
      await updateFunctionCount();
    }

    updateQueryCount();
  }

  async function updateTableCount() {
    try {
      const response = await fetch(`/api/tables?connectionId=${state.currentConnection.id}`);
      const data = await response.json();

      if (data.success) {
        document.getElementById('statTables').textContent = data.data.length;
      }
    } catch (error) {
      console.error('Failed to get table count:', error);
    }
  }

  async function updateFunctionCount() {
    try {
      const response = await fetch(`/api/functions?connectionId=${state.currentConnection.id}`);
      const data = await response.json();

      if (data.success) {
        document.getElementById('statFunctions').textContent = data.data.length;
      }
    } catch (error) {
      console.error('Failed to get function count:', error);
    }
  }

  function updateQueryCount() {
    const today = new Date().toDateString();
    const todayQueries = state.queryHistory.filter(q =>
      new Date(q.timestamp).toDateString() === today
    );
    document.getElementById('statQueries').textContent = todayQueries.length;
  }

  function updateQueryStats() {
    updateQueryCount();
  }

  // ───────────────────────────────────────────────────────────
  // Load Tables
  // ───────────────────────────────────────────────────────────

  async function loadTables() {
    if (!state.currentConnection) return;

    try {
      showLoading();
      const response = await fetch(`/api/tables?connectionId=${state.currentConnection.id}`);
      const data = await response.json();

      if (data.success) {
        renderTablesTable(data.data);
      }
    } catch (error) {
      console.error('Failed to load tables:', error);
      addMessage('Failed to load tables', 'danger');
    } finally {
      hideLoading();
    }
  }

  function renderTablesTable(tables) {
    const tbody = document.getElementById('tablesTableBody');

    if (!tables || tables.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No tables found</td></tr>';
      return;
    }

    tbody.innerHTML = tables.map(table => `
      <tr>
        <td>${table.schemaname || table.schema || 'public'}</td>
        <td><strong>${table.tablename || table.name}</strong></td>
        <td>${table.n_live_tup || '-'}</td>
        <td>${formatBytes(table.size || 0)}</td>
        <td>${table.column_count || '-'}</td>
        <td>${table.index_count || '-'}</td>
        <td>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" title="View Data">
              <i class="bi bi-eye"></i>
            </button>
            <button class="btn btn-outline-secondary" title="Structure">
              <i class="bi bi-diagram-3"></i>
            </button>
            <button class="btn btn-outline-info" title="Edit">
              <i class="bi bi-pencil"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ───────────────────────────────────────────────────────────
  // Utility Functions
  // ───────────────────────────────────────────────────────────

  function showLoading() {
    document.getElementById('loadingOverlay').classList.remove('d-none');
  }

  function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('d-none');
  }

  function showQueryStatus(message) {
    const status = document.getElementById('queryStatus');
    if (status) {
      document.getElementById('queryStatusText').textContent = message;
      status.classList.remove('d-none');
    }
  }

  function hideQueryStatus() {
    const status = document.getElementById('queryStatus');
    if (status) {
      status.classList.add('d-none');
    }
  }

  function addMessage(message, type = 'info') {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    const messageElement = document.createElement('div');
    messageElement.className = `alert alert-${type} alert-dismissible fade show mb-2`;
    messageElement.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    container.insertBefore(messageElement, container.firstChild);

    // Update message count
    const count = container.querySelectorAll('.alert').length;
    document.getElementById('messageCountBadge').textContent = count;

    // Auto-remove after 10 seconds
    setTimeout(() => {
      messageElement.remove();
      const newCount = container.querySelectorAll('.alert').length;
      document.getElementById('messageCountBadge').textContent = newCount;
    }, 10000);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  function showPagination(totalRows) {
    const pagination = document.getElementById('resultsPagination');
    pagination.classList.remove('d-none');

    document.getElementById('paginationStart').textContent = 1;
    document.getElementById('paginationEnd').textContent = Math.min(state.pageSize, totalRows);
    document.getElementById('paginationTotal').textContent = totalRows;
  }

  function handleQuickAction(action) {
    switch (action) {
      case 'new-connection':
        showConnectionModal();
        break;
      case 'query-editor':
        navigateToPage('query');
        break;
      case 'import-data':
        navigateToPage('import-export');
        break;
      case 'export-data':
        navigateToPage('import-export');
        break;
    }
  }

  function showConnectionModal() {
    // TODO: Implement connection modal
    alert('Connection modal - To be implemented');
  }

  // Stub functions for table operations (to be implemented)
  function loadFunctions() { console.log('loadFunctions - TODO'); }
  function loadTriggers() { console.log('loadTriggers - TODO'); }
  function loadSequences() { console.log('loadSequences - TODO'); }
  function loadTablespaces() { console.log('loadTablespaces - TODO'); }
  function loadIndices() { console.log('loadIndices - TODO'); }
  function loadUsers() { console.log('loadUsers - TODO'); }

  // ───────────────────────────────────────────────────────────
  // Public API (for onclick handlers)
  // ───────────────────────────────────────────────────────────

  window.app = {
    testConnection,
    editConnection: (id) => { console.log('Edit connection:', id); },
    deleteConnection: (id) => { console.log('Delete connection:', id); }
  };

  // ───────────────────────────────────────────────────────────
  // Initialize on DOM Ready
  // ───────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
