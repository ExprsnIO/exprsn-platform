/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Platform Setup Manager
 * ═══════════════════════════════════════════════════════════════════════
 * Real-time configuration and monitoring with WebSocket support
 * ═══════════════════════════════════════════════════════════════════════
 */

class ExprsSetupManager {
  constructor() {
    this.socket = null;
    this.currentPanel = 'overview';
    this.refreshInterval = null;
    this.serviceRegistry = {};
    this.databaseRegistry = {};
    this.redisConfig = {};

    this.init();
  }

  /**
   * Initialize the setup manager
   */
  async init() {
    console.log('[Setup] Initializing Exprsn Platform Setup Manager...');

    // Initialize WebSocket connection
    this.initializeWebSocket();

    // Load initial data
    await this.loadSystemHealth();
    await this.loadServices();
    await this.loadDatabases();
    await this.loadRedisConfig();

    // Start periodic refresh (fallback if WebSocket fails)
    this.startPeriodicRefresh();

    console.log('[Setup] Setup Manager initialized successfully');
  }

  /**
   * Initialize WebSocket for real-time updates
   */
  initializeWebSocket() {
    try {
      this.socket = io({
        path: '/socket.io',
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        console.log('[Setup] WebSocket connected');
        this.showToast('Connected', 'Real-time monitoring active', 'success');

        // Join setup room for real-time updates
        this.socket.emit('join-setup-room');
      });

      this.socket.on('disconnect', () => {
        console.log('[Setup] WebSocket disconnected');
        this.showToast('Disconnected', 'Real-time monitoring paused', 'warning');
      });

      // Listen for service status updates
      this.socket.on('service-status-update', (data) => {
        console.log('[Setup] Service status update:', data);
        this.handleServiceStatusUpdate(data);
      });

      // Listen for database status updates
      this.socket.on('database-status-update', (data) => {
        console.log('[Setup] Database status update:', data);
        this.handleDatabaseStatusUpdate(data);
      });

      // Listen for system health updates
      this.socket.on('system-health-update', (data) => {
        console.log('[Setup] System health update:', data);
        this.updateSystemHealthBadge(data);
      });

      this.socket.on('error', (error) => {
        console.error('[Setup] WebSocket error:', error);
      });

    } catch (error) {
      console.error('[Setup] Failed to initialize WebSocket:', error);
      this.showToast('WebSocket Error', 'Falling back to polling', 'warning');
    }
  }

  /**
   * Start periodic refresh (5 seconds)
   */
  startPeriodicRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(async () => {
      if (!this.socket || !this.socket.connected) {
        // Only refresh if WebSocket is not connected
        await this.loadSystemHealth();
      }
    }, 5000);
  }

  /**
   * Load system health overview
   */
  async loadSystemHealth() {
    try {
      const response = await fetch('/lowcode/setup-config/api/system-health');
      const data = await response.json();

      if (data.success) {
        this.updateSystemHealthBadge(data.health);
        this.updateOverviewStats(data.health);
      }
    } catch (error) {
      console.error('[Setup] Failed to load system health:', error);
      this.showToast('Error', 'Failed to load system health', 'danger');
    }
  }

  /**
   * Update system health badge in header
   */
  updateSystemHealthBadge(health) {
    const badge = document.getElementById('systemHealthBadge');
    const statusText = document.getElementById('healthStatus');
    const dot = badge.querySelector('.health-dot');

    if (!health) return;

    const statusMap = {
      healthy: { class: 'healthy', text: 'System Healthy', color: '#28a745' },
      degraded: { class: 'degraded', text: 'Degraded', color: '#ffc107' },
      unhealthy: { class: 'unhealthy', text: 'Unhealthy', color: '#dc3545' },
      critical: { class: 'critical', text: 'Critical', color: '#dc3545' }
    };

    const status = statusMap[health.overall?.status] || statusMap.unhealthy;

    dot.className = `health-dot ${status.class}`;
    statusText.textContent = status.text;
  }

  /**
   * Update overview stats
   */
  updateOverviewStats(health) {
    if (!health) return;

    // Services
    if (health.services) {
      document.getElementById('servicesRunning').textContent = health.services.running || 0;
      document.getElementById('servicesTotal').textContent = health.services.total || 21;
    }

    // Database
    if (health.database) {
      const dbCount = health.database.connected ? 1 : 0;
      document.getElementById('databasesConnected').textContent = dbCount;
      document.getElementById('databaseStatus').textContent = health.database.connected
        ? `Connected to ${health.database.database}`
        : 'Not connected';
    }

    // Redis
    if (health.redis) {
      const redisSymbol = health.redis.connected ? '●' : '○';
      document.getElementById('redisStatus').textContent = redisSymbol;
      document.getElementById('redisDetail').textContent = health.redis.connected
        ? `${health.redis.host}:${health.redis.port}`
        : health.redis.enabled ? 'Not connected' : 'Disabled';
    }

    // Render system status
    this.renderSystemStatus(health);
  }

  /**
   * Render system status overview
   */
  renderSystemStatus(health) {
    const container = document.getElementById('systemStatusContainer');
    if (!container) return;

    const services = health.services?.details || [];
    const categories = this.groupServicesByCategory(services);

    let html = '';

    for (const [category, categoryServices] of Object.entries(categories)) {
      const running = categoryServices.filter(s => s.status === 'running').length;
      const total = categoryServices.length;
      const percentage = Math.round((running / total) * 100);

      html += `
        <div class="progress-item">
          <div class="progress-icon ${running === total ? 'success' : running > 0 ? 'running' : 'pending'}">
            <i class="fas ${this.getCategoryIcon(category)}"></i>
          </div>
          <div class="progress-details">
            <div class="progress-title">${this.capitalizeFirst(category)} Services</div>
            <div class="progress-subtitle">${running}/${total} running (${percentage}%)</div>
          </div>
          <div class="progress-bar" style="width: 100px;">
            <div class="progress" style="height: 8px;">
              <div class="progress-bar ${running === total ? 'bg-success' : 'bg-primary'}"
                   style="width: ${percentage}%"></div>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = html || '<p class="text-muted">No service data available</p>';
  }

  /**
   * Group services by category
   */
  groupServicesByCategory(services) {
    const categories = {};

    services.forEach(service => {
      const category = service.category || 'other';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(service);
    });

    return categories;
  }

  /**
   * Get icon for category
   */
  getCategoryIcon(category) {
    const icons = {
      core: 'fa-shield-alt',
      messaging: 'fa-comments',
      content: 'fa-newspaper',
      media: 'fa-photo-video',
      infrastructure: 'fa-server',
      automation: 'fa-robot',
      commerce: 'fa-shopping-cart'
    };
    return icons[category] || 'fa-cube';
  }

  /**
   * Load all services
   */
  async loadServices() {
    try {
      const response = await fetch('/lowcode/setup-config/api/services');
      const data = await response.json();

      if (data.success) {
        this.serviceRegistry = data.services.reduce((acc, service) => {
          acc[service.id] = service;
          return acc;
        }, {});

        this.renderServices(data.services);
      }
    } catch (error) {
      console.error('[Setup] Failed to load services:', error);
      this.showToast('Error', 'Failed to load services', 'danger');
    }
  }

  /**
   * Render services grid
   */
  renderServices(services) {
    const grid = document.getElementById('servicesGrid');
    if (!grid) return;

    grid.innerHTML = services.map(service => {
      const color = service.color || '#667eea';
      const icon = service.icon || 'fa-cube';
      const statusClass = service.status === 'running' ? 'running' : 'stopped';

      // Build features list HTML
      const featuresHTML = service.features ? `
        <div class="service-features">
          <h4><i class="fas fa-star"></i> Key Features</h4>
          <ul>
            ${service.features.map(feature => `<li>${feature}</li>`).join('')}
          </ul>
        </div>
      ` : '';

      // Build dependencies HTML
      const depsHTML = service.dependencies && service.dependencies.length > 0 ? `
        <div class="service-dependencies">
          <strong><i class="fas fa-link"></i> Depends on:</strong>
          ${service.dependencies.map(dep => `<span class="dep-badge">${dep}</span>`).join(' ')}
        </div>
      ` : '';

      return `
        <div class="service-card enhanced" data-service-id="${service.id}">
          <div class="service-status-badge ${statusClass}">
            <i class="fas fa-circle"></i>
            ${this.capitalizeFirst(service.status)}
          </div>
          <div class="service-header">
            <div class="service-icon" style="background: ${color}">
              <i class="fas ${icon}"></i>
            </div>
            <div class="service-info">
              <h3>${service.name}</h3>
              <span class="service-category">${service.category}</span>
            </div>
          </div>
          <p class="service-description">${service.description}</p>
          ${featuresHTML}
          <div class="service-meta">
            <div class="meta-item">
              <i class="fas fa-network-wired"></i>
              Port ${service.port}
            </div>
            ${service.database ? `
              <div class="meta-item">
                <i class="fas fa-database"></i>
                ${service.database}
              </div>
            ` : ''}
            ${service.responseTime ? `
              <div class="meta-item">
                <i class="fas fa-tachometer-alt"></i>
                ${service.responseTime}ms
              </div>
            ` : ''}
            ${service.uptime ? `
              <div class="meta-item">
                <i class="fas fa-clock"></i>
                ${this.formatUptime(service.uptime)}
              </div>
            ` : ''}
          </div>
          ${depsHTML}
          <div class="service-actions">
            <button class="btn btn-outline-secondary btn-sm" onclick="setupManager.testService('${service.id}')">
              <i class="fas fa-plug"></i> Test
            </button>
            <button class="btn btn-outline-primary btn-sm" onclick="setupManager.configureService('${service.id}')">
              <i class="fas fa-cog"></i> Configure
            </button>
            <button class="btn btn-outline-info btn-sm" onclick="setupManager.viewServiceLogs('${service.id}')">
              <i class="fas fa-file-alt"></i> Logs
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Load databases configuration
   */
  async loadDatabases() {
    try {
      const response = await fetch('/lowcode/setup-config/api/databases');
      const data = await response.json();

      if (data.success) {
        this.databaseRegistry = data.databases;
        this.renderDatabases(data.databases);
      }
    } catch (error) {
      console.error('[Setup] Failed to load databases:', error);
      this.showToast('Error', 'Failed to load databases', 'danger');
    }
  }

  /**
   * Render databases
   */
  renderDatabases(databases) {
    const container = document.getElementById('databasesContainer');
    if (!container) return;

    container.innerHTML = databases.map(db => `
      <div class="database-card" data-db-id="${db.id}">
        <div class="db-header">
          <div class="db-name">
            <i class="fas fa-database"></i>
            ${db.name}
          </div>
          <div class="service-status-badge ${db.connected ? 'running' : 'stopped'}">
            <i class="fas fa-circle"></i>
            ${db.connected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        <div class="db-stats">
          <div class="db-stat">
            <div class="db-stat-label">Tables</div>
            <div class="db-stat-value">${db.tableCount || 0}</div>
          </div>
          <div class="db-stat">
            <div class="db-stat-label">Migrations</div>
            <div class="db-stat-value">${db.migrationsPending || 0}/${db.migrationsTotal || 0}</div>
          </div>
          <div class="db-stat">
            <div class="db-stat-label">Size</div>
            <div class="db-stat-value">${this.formatBytes(db.size || 0)}</div>
          </div>
          <div class="db-stat">
            <div class="db-stat-label">Last Backup</div>
            <div class="db-stat-value">${this.formatDate(db.lastBackup) || 'Never'}</div>
          </div>
        </div>
        <div class="service-actions">
          <button class="btn btn-outline-primary btn-sm" onclick="setupManager.runMigrations('${db.id}')">
            <i class="fas fa-rocket"></i> Migrate
          </button>
          <button class="btn btn-outline-secondary btn-sm" onclick="setupManager.seedDatabase('${db.id}')">
            <i class="fas fa-seedling"></i> Seed
          </button>
          <button class="btn btn-outline-success btn-sm" onclick="setupManager.backupDatabase('${db.id}')">
            <i class="fas fa-download"></i> Backup
          </button>
          <button class="btn btn-outline-warning btn-sm" onclick="setupManager.testDatabaseConnection('${db.id}')">
            <i class="fas fa-plug"></i> Test
          </button>
        </div>
      </div>
    `).join('');
  }

  /**
   * Load Redis configuration
   */
  async loadRedisConfig() {
    try {
      const response = await fetch('/lowcode/setup-config/api/redis');
      const data = await response.json();

      if (data.success) {
        this.redisConfig = data.redis;
        this.renderRedisConfig(data.redis);
      }
    } catch (error) {
      console.error('[Setup] Failed to load Redis config:', error);
      this.showToast('Error', 'Failed to load Redis config', 'danger');
    }
  }

  /**
   * Render Redis configuration
   */
  renderRedisConfig(redis) {
    const container = document.getElementById('redisContainer');
    if (!container) return;

    const dbAllocations = redis.databases || [];

    container.innerHTML = `
      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-bolt"></i>
          Redis Server Configuration
        </div>
        <div class="row">
          <div class="col-md-6">
            <label class="form-label">Host</label>
            <input type="text" class="form-control" value="${redis.host || 'localhost'}" id="redisHost">
          </div>
          <div class="col-md-3">
            <label class="form-label">Port</label>
            <input type="number" class="form-control" value="${redis.port || 6379}" id="redisPort">
          </div>
          <div class="col-md-3">
            <label class="form-label">Status</label>
            <div class="service-status-badge ${redis.connected ? 'running' : 'stopped'}" style="margin-top: 8px;">
              <i class="fas fa-circle"></i>
              ${redis.connected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </div>
        <button class="btn btn-primary mt-3" onclick="setupManager.testRedisConnection()">
          <i class="fas fa-plug"></i> Test Connection
        </button>
      </div>

      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-database"></i>
          Database Allocations (0-15)
        </div>
        <div class="table-responsive">
          <table class="table table-hover">
            <thead>
              <tr>
                <th>DB</th>
                <th>Service</th>
                <th>Purpose</th>
                <th>Key Prefix</th>
                <th>Keys</th>
                <th>Memory</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${dbAllocations.map((db, index) => `
                <tr>
                  <td><strong>${index}</strong></td>
                  <td>${db.service || 'Unallocated'}</td>
                  <td>${db.purpose || '-'}</td>
                  <td><code>${db.prefix || 'none'}</code></td>
                  <td>${db.keyCount || 0}</td>
                  <td>${this.formatBytes(db.memory || 0)}</td>
                  <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="setupManager.flushRedisDb(${index})">
                      <i class="fas fa-trash"></i> Flush
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * Render CA & Auth panel
   */
  renderCAAuthPanel() {
    const container = document.getElementById('caAuthContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-certificate"></i>
          Certificate Authority Configuration
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">CA Name</label>
            <input type="text" class="form-control" value="Exprsn Root CA" id="caName">
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">CA Domain</label>
            <input type="text" class="form-control" value="localhost" id="caDomain">
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">OCSP Enabled</label>
            <select class="form-select" id="ocspEnabled">
              <option value="true" selected>Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">OCSP Port</label>
            <input type="number" class="form-control" value="2560" id="ocspPort">
          </div>
        </div>
        <button class="btn btn-primary">
          <i class="fas fa-save"></i> Save CA Configuration
        </button>
      </div>

      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-key"></i>
          Authentication & Security
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="devAuthEnabled" checked>
          <label class="form-check-label" for="devAuthEnabled">
            <strong>Development Auth Bypass</strong>
            <p class="text-muted mb-0 small">Allow access without CA tokens in development mode (LOW_CODE_DEV_AUTH=true)</p>
          </label>
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="mfaEnabled">
          <label class="form-check-label" for="mfaEnabled">
            <strong>Multi-Factor Authentication</strong>
            <p class="text-muted mb-0 small">Require MFA for administrative access</p>
          </label>
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="samlEnabled">
          <label class="form-check-label" for="samlEnabled">
            <strong>SAML 2.0 SSO</strong>
            <p class="text-muted mb-0 small">Enable SAML-based single sign-on</p>
          </label>
        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-users"></i>
          Service Accounts & Tokens
        </div>
        <button class="btn btn-success mb-3" onclick="setupManager.generateServiceTokens()">
          <i class="fas fa-plus"></i> Generate Service Tokens
        </button>
        <div class="table-responsive">
          <table class="table table-hover">
            <thead>
              <tr>
                <th>Service</th>
                <th>Token ID</th>
                <th>Permissions</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="serviceTokensTable">
              <tr>
                <td colspan="5" class="text-center text-muted">No service tokens configured</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  /**
   * Render CA & Auth configuration panel
   */
  renderCAAuthPanel() {
    const container = document.getElementById('caAuthContainer');
    if (!container || !window.caAuthManager) {
      console.error('[Setup] CA Auth Manager not loaded');
      return;
    }

    // Delegate to the CA Auth Config Manager
    caAuthManager.render();
  }

  /**
   * Render Low-Code platform panel
   */
  renderLowCodePanel() {
    const container = document.getElementById('lowcodeContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-th"></i>
          Low-Code Platform Settings
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">Max Forms Per Application</label>
            <input type="number" class="form-control" value="500" id="maxForms">
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Max Entities Per Application</label>
            <input type="number" class="form-control" value="200" id="maxEntities">
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Max Grids Per Application</label>
            <input type="number" class="form-control" value="1000" id="maxGrids">
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Auto-Save Interval (seconds)</label>
            <input type="number" class="form-control" value="30" id="autoSaveInterval">
          </div>
        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-database"></i>
          Data Source Configuration
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="queryCachingEnabled" checked>
          <label class="form-check-label" for="queryCachingEnabled">
            <strong>Enable Query Caching</strong>
            <p class="text-muted mb-0 small">Cache data source query results for better performance</p>
          </label>
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">Query Cache TTL (seconds)</label>
            <input type="number" class="form-control" value="300" id="queryCacheTTL">
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Max Connections</label>
            <input type="number" class="form-control" value="100" id="maxConnections">
          </div>
        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-code"></i>
          Formula Engine & Functions
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">Max Execution Time (ms)</label>
            <input type="number" class="form-control" value="5000" id="maxExecutionTime">
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Max Recursion Depth</label>
            <input type="number" class="form-control" value="100" id="maxRecursionDepth">
          </div>
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="formulaCachingEnabled" checked>
          <label class="form-check-label" for="formulaCachingEnabled">
            <strong>Enable Formula Caching</strong>
            <p class="text-muted mb-0 small">Cache computed formula results</p>
          </label>
        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-file-code"></i>
          Templates & Components
        </div>
        <button class="btn btn-primary mb-3">
          <i class="fas fa-download"></i> Install Default Templates
        </button>
        <div class="row">
          <div class="col-md-4">
            <div class="info-card">
              <div class="info-label">Form Templates</div>
              <div class="info-value">0</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="info-card">
              <div class="info-label">Entity Templates</div>
              <div class="info-value">0</div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="info-card">
              <div class="info-label">Grid Templates</div>
              <div class="info-value">0</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Forge CRM/ERP/Groupware panel
   */
  renderForgePanel() {
    const container = document.getElementById('forgeContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-industry"></i>
          Forge Business Platform
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="forgeEnabled" checked>
          <label class="form-check-label" for="forgeEnabled">
            <strong>Enable Forge Integration</strong>
            <p class="text-muted mb-0 small">Integrate CRM, ERP, and Groupware modules</p>
          </label>
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">Forge Service URL</label>
            <input type="text" class="form-control" value="http://localhost:3016" id="forgeServiceUrl">
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Timeout (ms)</label>
            <input type="number" class="form-control" value="30000" id="forgeTimeout">
          </div>
        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-users-cog"></i>
          CRM Module Configuration
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="crmEnabled" checked>
          <label class="form-check-label" for="crmEnabled">
            <strong>Enable CRM Module</strong>
          </label>
        </div>
        <div class="row">
          <div class="col-md-3">
            <div class="info-card">
              <div class="info-label">Contacts</div>
              <div class="info-value">0</div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="info-card">
              <div class="info-label">Accounts</div>
              <div class="info-value">0</div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="info-card">
              <div class="info-label">Leads</div>
              <div class="info-value">0</div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="info-card">
              <div class="info-label">Opportunities</div>
              <div class="info-value">0</div>
            </div>
          </div>
        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-chart-line"></i>
          ERP Module Configuration
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="erpEnabled" checked>
          <label class="form-check-label" for="erpEnabled">
            <strong>Enable ERP Module</strong>
          </label>
        </div>
        <div class="row">
          <div class="col-md-6">
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="erpFinancial" checked>
              <label class="form-check-label" for="erpFinancial">Financial Management</label>
            </div>
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="erpInventory" checked>
              <label class="form-check-label" for="erpInventory">Inventory Management</label>
            </div>
          </div>
          <div class="col-md-6">
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="erpHR" checked>
              <label class="form-check-label" for="erpHR">Human Resources</label>
            </div>
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="erpAssets" checked>
              <label class="form-check-label" for="erpAssets">Asset Management</label>
            </div>
          </div>
        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-calendar-alt"></i>
          Groupware Configuration
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="groupwareEnabled" checked>
          <label class="form-check-label" for="groupwareEnabled">
            <strong>Enable Groupware Module</strong>
          </label>
        </div>
        <div class="row">
          <div class="col-md-6">
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="calendarEnabled" checked>
              <label class="form-check-label" for="calendarEnabled">Calendar (CalDAV)</label>
            </div>
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="emailEnabled">
              <label class="form-check-label" for="emailEnabled">Email Integration</label>
            </div>
          </div>
          <div class="col-md-6">
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="tasksEnabled" checked>
              <label class="form-check-label" for="tasksEnabled">Tasks Management</label>
            </div>
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="documentsEnabled" checked>
              <label class="form-check-label" for="documentsEnabled">Document Library</label>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render Advanced configuration panel
   */
  renderAdvancedPanel() {
    const container = document.getElementById('advancedContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-tachometer-alt"></i>
          Performance & Optimization
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">Max Concurrent Requests</label>
            <input type="number" class="form-control" value="100" id="maxConcurrentRequests">
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Cache TTL (seconds)</label>
            <input type="number" class="form-control" value="3600" id="cacheTTL">
          </div>
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="compressionEnabled" checked>
          <label class="form-check-label" for="compressionEnabled">
            <strong>Enable Compression</strong>
            <p class="text-muted mb-0 small">Compress HTTP responses for better performance</p>
          </label>
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="lazyLoadingEnabled" checked>
          <label class="form-check-label" for="lazyLoadingEnabled">
            <strong>Enable Lazy Loading</strong>
            <p class="text-muted mb-0 small">Load resources on demand</p>
          </label>
        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-shield-alt"></i>
          Security Settings
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="csrfProtection" checked>
          <label class="form-check-label" for="csrfProtection">
            <strong>CSRF Protection</strong>
          </label>
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="xssProtection" checked>
          <label class="form-check-label" for="xssProtection">
            <strong>XSS Protection</strong>
          </label>
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="rateLimiting" checked>
          <label class="form-check-label" for="rateLimiting">
            <strong>Rate Limiting</strong>
          </label>
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">Rate Limit Window (ms)</label>
            <input type="number" class="form-control" value="900000" id="rateLimitWindow">
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Max Requests Per Window</label>
            <input type="number" class="form-control" value="1000" id="rateLimitMax">
          </div>
        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-file-code"></i>
          Development Tools
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="gitIntegration">
          <label class="form-check-label" for="gitIntegration">
            <strong>Git Integration</strong>
            <p class="text-muted mb-0 small">Version control for applications</p>
          </label>
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">Git Provider</label>
            <select class="form-select" id="gitProvider">
              <option value="github">GitHub</option>
              <option value="gitlab">GitLab</option>
              <option value="bitbucket">Bitbucket</option>
            </select>
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Log Level</label>
            <select class="form-select" id="logLevel">
              <option value="error">Error</option>
              <option value="warn">Warning</option>
              <option value="info" selected>Info</option>
              <option value="debug">Debug</option>
            </select>
          </div>
        </div>
      </div>

      <div class="config-section">
        <div class="config-section-title">
          <i class="fas fa-database"></i>
          Backup & Recovery
        </div>
        <button class="btn btn-success mb-3">
          <i class="fas fa-download"></i> Backup All Databases
        </button>
        <button class="btn btn-warning mb-3">
          <i class="fas fa-upload"></i> Restore from Backup
        </button>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label class="form-label">Automatic Backup Schedule</label>
            <select class="form-select" id="backupSchedule">
              <option value="disabled">Disabled</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div class="col-md-6 mb-3">
            <label class="form-label">Retention Period (days)</label>
            <input type="number" class="form-control" value="90" id="backupRetention">
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate service tokens
   */
  generateServiceTokens() {
    alert('Generate Service Tokens - Coming soon');
  }

  /**
   * Handle service status update (WebSocket)
   */
  handleServiceStatusUpdate(data) {
    const { serviceId, status, responseTime, uptime } = data;

    if (this.serviceRegistry[serviceId]) {
      this.serviceRegistry[serviceId].status = status;
      this.serviceRegistry[serviceId].responseTime = responseTime;
      this.serviceRegistry[serviceId].uptime = uptime;

      // Update the service card if currently viewing services panel
      if (this.currentPanel === 'services') {
        const card = document.querySelector(`[data-service-id="${serviceId}"]`);
        if (card) {
          const badge = card.querySelector('.service-status-badge');
          badge.className = `service-status-badge ${status === 'running' ? 'running' : 'stopped'}`;
          badge.innerHTML = `<i class="fas fa-circle"></i> ${this.capitalizeFirst(status)}`;
        }
      }
    }
  }

  /**
   * Handle database status update (WebSocket)
   */
  handleDatabaseStatusUpdate(data) {
    const { databaseId, connected, tableCount, size } = data;

    if (this.databaseRegistry[databaseId]) {
      this.databaseRegistry[databaseId].connected = connected;
      this.databaseRegistry[databaseId].tableCount = tableCount;
      this.databaseRegistry[databaseId].size = size;

      // Update database card if currently viewing databases panel
      if (this.currentPanel === 'databases') {
        this.renderDatabases(Object.values(this.databaseRegistry));
      }
    }
  }

  /**
   * Switch panel
   */
  switchPanel(panelName) {
    // Update tabs
    document.querySelectorAll('.setup-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.panel === panelName);
    });

    // Update panels
    document.querySelectorAll('.setup-panel').forEach(panel => {
      panel.classList.remove('active');
    });

    const targetPanel = document.getElementById(`panel-${panelName}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
      this.currentPanel = panelName;

      // Call appropriate render function for each panel
      switch(panelName) {
        case 'overview':
          this.loadSystemHealth();
          break;
        case 'services':
          this.loadServices();
          break;
        case 'databases':
          this.loadDatabases();
          break;
        case 'redis':
          this.loadRedisConfig();
          break;
        case 'ca-auth':
          this.renderCAAuthPanel();
          break;
        case 'lowcode':
          this.renderLowCodePanel();
          break;
        case 'forge':
          this.renderForgePanel();
          break;
        case 'advanced':
          this.renderAdvancedPanel();
          break;
      }
    }
  }

  /**
   * Test service connection
   */
  async testService(serviceId) {
    try {
      this.showToast('Testing', `Testing connection to ${serviceId}...`, 'info');

      const response = await fetch(`/lowcode/api/setup/services/${serviceId}/test`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        this.showToast('Success', `${serviceId} is running (${data.responseTime}ms)`, 'success');
      } else {
        this.showToast('Failed', `${serviceId} is not responding`, 'danger');
      }
    } catch (error) {
      console.error('[Setup] Failed to test service:', error);
      this.showToast('Error', 'Failed to test service', 'danger');
    }
  }

  /**
   * Configure service
   */
  async configureService(serviceId) {
    // Service configuration mapping
    const serviceConfigs = {
      'exprsn-ca': {
        name: 'Certificate Authority (CA)',
        icon: 'certificate',
        containerId: 'caConfigContent',
        manager: window.caAuthManager,
        method: 'loadCAConfiguration'
      },
      'exprsn-auth': {
        name: 'Authentication & SSO',
        icon: 'key',
        containerId: 'authConfigContent',
        manager: window.caAuthManager,
        method: 'loadAuthConfiguration'
      },
      'exprsn-vault': {
        name: 'Secrets Management (Vault)',
        icon: 'vault',
        containerId: 'vaultConfigContent',
        manager: window.vaultManager,
        method: 'loadVaultConfiguration'
      },
      'exprsn-filevault': {
        name: 'File Management (FileVault)',
        icon: 'folder-open',
        containerId: 'filevaultConfigContent',
        manager: window.filevaultManager,
        method: 'loadFileVaultConfiguration'
      },
      'exprsn-herald': {
        name: 'Notifications (Herald)',
        icon: 'bell',
        containerId: 'heraldConfigContent',
        manager: window.heraldManager,
        method: 'loadHeraldConfiguration'
      },
      'exprsn-workflow': {
        name: 'Workflow Automation',
        icon: 'project-diagram',
        containerId: 'workflowConfigContent',
        manager: window.workflowManager,
        method: 'loadWorkflowConfiguration'
      },
      'exprsn-setup': {
        name: 'Service Discovery (Setup)',
        icon: 'search-location',
        containerId: 'setupServiceConfigContent',
        manager: window.setupServiceManager,
        method: 'loadSetupServiceConfiguration'
      },
      'exprsn-svr': {
        name: 'Business Hub (exprsn-svr)',
        icon: 'building',
        containerId: 'businessHubConfigContent',
        manager: window.businessHubManager,
        method: 'loadBusinessHubConfiguration'
      }
    };

    // Check if service has configuration
    const serviceConfig = serviceConfigs[serviceId];

    if (serviceConfig) {
      const modalElement = document.getElementById('serviceConfigModal');
      const modal = new bootstrap.Modal(modalElement);
      const modalTitle = document.getElementById('serviceConfigModalTitle');
      const modalBody = document.getElementById('serviceConfigModalBody');

      modalTitle.innerHTML = `<i class="fas fa-${serviceConfig.icon}"></i> ${serviceConfig.name} Configuration`;

      // Create appropriate container structure
      modalBody.innerHTML = `
        <div class="config-section">
          <div id="${serviceConfig.containerId}">
            <div class="text-center py-5">
              <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
              </div>
              <p class="mt-3 text-muted">Loading configuration...</p>
            </div>
          </div>
        </div>
      `;

      // Show modal
      modal.show();

      // Load configuration using appropriate manager
      if (serviceConfig.manager) {
        try {
          await serviceConfig.manager[serviceConfig.method]();
        } catch (error) {
          console.error('[Setup] Error loading configuration:', error);
          modalBody.innerHTML = `
            <div class="alert alert-danger">
              <i class="fas fa-exclamation-triangle"></i>
              Failed to load configuration: ${error.message}
            </div>
          `;
        }
      } else {
        console.error(`[Setup] ${serviceConfig.name} Manager not loaded`);
        modalBody.innerHTML = `
          <div class="alert alert-warning">
            <i class="fas fa-exclamation-triangle"></i>
            Configuration manager not available. Please refresh the page.
          </div>
        `;
      }
    } else {
      // Service doesn't have configuration panel yet
      alert(`Configuration for ${serviceId} not yet implemented`);
    }
  }

  /**
   * View service logs
   */
  viewServiceLogs(serviceId) {
    // TODO: Open logs modal
    alert(`View logs for ${serviceId} - Coming soon`);
  }

  /**
   * Run migrations for database
   */
  async runMigrations(databaseId) {
    if (!confirm('Run migrations for this database?')) return;

    try {
      this.showToast('Running', 'Running database migrations...', 'info');

      const response = await fetch(`/lowcode/api/setup/databases/${databaseId}/migrate`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        this.showToast('Success', 'Migrations completed successfully', 'success');
        await this.loadDatabases();
      } else {
        this.showToast('Failed', data.message || 'Migration failed', 'danger');
      }
    } catch (error) {
      console.error('[Setup] Migration failed:', error);
      this.showToast('Error', 'Failed to run migrations', 'danger');
    }
  }

  /**
   * Seed database
   */
  async seedDatabase(databaseId) {
    if (!confirm('Seed this database with sample data?')) return;

    try {
      const response = await fetch(`/lowcode/api/setup/databases/${databaseId}/seed`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        this.showToast('Success', 'Database seeded successfully', 'success');
      } else {
        this.showToast('Failed', data.message || 'Seeding failed', 'danger');
      }
    } catch (error) {
      console.error('[Setup] Seeding failed:', error);
      this.showToast('Error', 'Failed to seed database', 'danger');
    }
  }

  /**
   * Backup database
   */
  async backupDatabase(databaseId) {
    try {
      this.showToast('Backing up', 'Creating database backup...', 'info');

      const response = await fetch(`/lowcode/api/setup/databases/${databaseId}/backup`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        this.showToast('Success', 'Database backup created', 'success');
      } else {
        this.showToast('Failed', data.message || 'Backup failed', 'danger');
      }
    } catch (error) {
      console.error('[Setup] Backup failed:', error);
      this.showToast('Error', 'Failed to backup database', 'danger');
    }
  }

  /**
   * Test database connection
   */
  async testDatabaseConnection(databaseId) {
    try {
      const response = await fetch(`/lowcode/api/setup/databases/${databaseId}/test`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        this.showToast('Success', 'Database connection successful', 'success');
      } else {
        this.showToast('Failed', 'Database connection failed', 'danger');
      }
    } catch (error) {
      console.error('[Setup] Connection test failed:', error);
      this.showToast('Error', 'Failed to test connection', 'danger');
    }
  }

  /**
   * Test Redis connection
   */
  async testRedisConnection() {
    try {
      this.showToast('Testing', 'Testing Redis connection...', 'info');

      const response = await fetch('/lowcode/setup-config/api/redis/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: document.getElementById('redisHost').value,
          port: parseInt(document.getElementById('redisPort').value)
        })
      });
      const data = await response.json();

      if (data.success) {
        this.showToast('Success', `Redis connected (v${data.version})`, 'success');
      } else {
        this.showToast('Failed', 'Redis connection failed', 'danger');
      }
    } catch (error) {
      console.error('[Setup] Redis test failed:', error);
      this.showToast('Error', 'Failed to test Redis', 'danger');
    }
  }

  /**
   * Flush Redis database
   */
  async flushRedisDb(dbNumber) {
    if (!confirm(`Flush all keys in Redis DB ${dbNumber}? This cannot be undone!`)) return;

    try {
      const response = await fetch(`/lowcode/api/setup/redis/flush/${dbNumber}`, {
        method: 'POST'
      });
      const data = await response.json();

      if (data.success) {
        this.showToast('Success', `Redis DB ${dbNumber} flushed`, 'success');
        await this.loadRedisConfig();
      } else {
        this.showToast('Failed', data.message || 'Flush failed', 'danger');
      }
    } catch (error) {
      console.error('[Setup] Flush failed:', error);
      this.showToast('Error', 'Failed to flush Redis DB', 'danger');
    }
  }

  /**
   * Utility: Show toast notification
   */
  showToast(title, message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const iconMap = {
      success: 'fa-check-circle',
      danger: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">
          <i class="fas ${iconMap[type]} me-2"></i>
          <strong>${title}</strong> ${message}
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    `;

    container.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast, { autohide: true, delay: 3000 });
    bsToast.show();

    toast.addEventListener('hidden.bs.toast', () => {
      toast.remove();
    });
  }

  /**
   * Utility: Capitalize first letter
   */
  capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  /**
   * Utility: Format uptime
   */
  formatUptime(seconds) {
    if (!seconds) return 'N/A';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  /**
   * Utility: Format bytes
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';

    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * Utility: Format date
   */
  formatDate(dateString) {
    if (!dateString) return null;

    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = diffMs / 3600000;

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;
    if (diffHours < 168) return `${Math.floor(diffHours / 24)}d ago`;

    return date.toLocaleDateString();
  }
}

// Global functions for onclick handlers
let setupManager;

function switchPanel(panelName) {
  if (setupManager) {
    setupManager.switchPanel(panelName);
  }
}

function runAllMigrations() {
  alert('Run All Migrations - Coming soon');
}

function testAllConnections() {
  alert('Test All Connections - Coming soon');
}

function syncSchemas() {
  alert('Sync Schemas - Coming soon');
}

function generateTokens() {
  alert('Generate Tokens - Coming soon');
}

function viewLogs() {
  alert('View Logs - Coming soon');
}

function exportConfig() {
  alert('Export Configuration - Coming soon');
}

function saveConfiguration() {
  alert('Save Configuration - Coming soon');
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setupManager = new ExprsSetupManager();
});
