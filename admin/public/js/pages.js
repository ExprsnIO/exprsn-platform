/**
 * ═══════════════════════════════════════════════════════════════════════
 * Page Components with Subgrid Layouts
 * ═══════════════════════════════════════════════════════════════════════
 */

const Pages = {
  dashboard: async () => {
    const [systemStatus, dbStats] = await Promise.all([
      fetch('/api/services/system/status').then(r => r.json()).catch(() => ({ status: {} })),
      fetch('/api/database/stats').then(r => r.json()).catch(() => ({ stats: {} }))
    ]);

    // Fallback to all 18 services if API doesn't return them
    let services = systemStatus.status?.services || [];
    if (services.length === 0) {
      services = [
        { name: 'ca', port: 3000, status: 'stopped', description: 'Certificate Authority', uptime: 0, pid: null },
        { name: 'auth', port: 3001, status: 'stopped', description: 'Authentication & OAuth2', uptime: 0, pid: null },
        { name: 'spark', port: 3002, status: 'stopped', description: 'Real-time Messaging', uptime: 0, pid: null },
        { name: 'timeline', port: 3004, status: 'stopped', description: 'Social Timeline', uptime: 0, pid: null },
        { name: 'prefetch', port: 3005, status: 'stopped', description: 'Timeline Cache', uptime: 0, pid: null },
        { name: 'moderator', port: 3006, status: 'stopped', description: 'AI Moderation', uptime: 0, pid: null },
        { name: 'filevault', port: 3007, status: 'stopped', description: 'File Storage', uptime: 0, pid: null },
        { name: 'gallery', port: 3008, status: 'stopped', description: 'Media Gallery', uptime: 0, pid: null },
        { name: 'live', port: 3009, status: 'stopped', description: 'Live Streaming', uptime: 0, pid: null },
        { name: 'bridge', port: 3010, status: 'stopped', description: 'API Gateway', uptime: 0, pid: null },
        { name: 'nexus', port: 3011, status: 'stopped', description: 'Groups & Events', uptime: 0, pid: null },
        { name: 'pulse', port: 3012, status: 'stopped', description: 'Analytics', uptime: 0, pid: null },
        { name: 'vault', port: 3013, status: 'stopped', description: 'Secrets Management', uptime: 0, pid: null },
        { name: 'herald', port: 3014, status: 'stopped', description: 'Notifications', uptime: 0, pid: null },
        { name: 'setup', port: 3015, status: 'stopped', description: 'Service Discovery', uptime: 0, pid: null },
        { name: 'forge', port: 3016, status: 'stopped', description: 'Business Platform', uptime: 0, pid: null },
        { name: 'workflow', port: 3017, status: 'stopped', description: 'Workflow Automation', uptime: 0, pid: null },
        { name: 'svr', port: 5000, status: 'stopped', description: 'Dynamic Pages', uptime: 0, pid: null }
      ];
    }

    const stats = {
      total: services.length,
      running: services.filter(s => s.status === 'running').length,
      stopped: services.filter(s => s.status === 'stopped').length
    };
    const dbStatsData = dbStats.stats || {};

    return `<div class="page-dashboard">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem">
        <h2 style="margin:0">Service Management</h2>
        <div style="display:flex;gap:0.5rem">
          <button class="btn btn-success" onclick="startAllServices()">
            <i class="bi bi-play-fill"></i> Start All
          </button>
          <button class="btn btn-warning" onclick="stopAllServices()">
            <i class="bi bi-stop-fill"></i> Stop All
          </button>
          <button class="btn btn-info" onclick="restartAllServices()">
            <i class="bi bi-arrow-clockwise"></i> Restart All
          </button>
        </div>
      </div>
      <div class="stats-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem">
        ${['Total Services','Running','Stopped','Databases'].map((label,i)=>`
          <div class="stat-card" style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
            <div class="stat-value" style="font-size:2rem;font-weight:bold;margin-bottom:0.5rem">${[stats.total,stats.running,stats.stopped,dbStatsData.totalDatabases||0][i]}</div>
            <div class="stat-label">${label}</div>
          </div>
        `).join('')}
      </div>
      <div class="service-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:1rem">
        ${services.map(s=>`
          <div class="service-card" style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);transition:transform 0.2s;cursor:pointer" onclick="window.location.hash='#/services/${s.name}'">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1rem">
              <div style="font-size:2rem">${getServiceIcon(s.name)}</div>
              <div style="flex:1;margin:0 1rem">
                <h4 style="margin:0 0 0.25rem 0">${s.name}</h4>
                <small style="color:#666">Port ${s.port}</small>
              </div>
              <span class="badge bg-${s.status==='running'?'success':'secondary'}">${s.status}</span>
            </div>
            <div style="margin-bottom:1rem;font-size:0.9rem">
              <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem">
                <span style="color:#666">Uptime:</span>
                <strong>${formatUptime(s.uptime)}</strong>
              </div>
              ${s.pid?`<div style="display:flex;justify-content:space-between">
                <span style="color:#666">PID:</span>
                <strong>${s.pid}</strong>
              </div>`:''}
            </div>
            <div class="service-actions" style="display:flex;gap:0.5rem" onclick="event.stopPropagation()">
              ${s.status==='running'?`
                <button class="btn btn-sm btn-warning" onclick="stopService('${s.name}')"><i class="bi bi-stop-fill"></i> Stop</button>
                <button class="btn btn-sm btn-info" onclick="restartService('${s.name}')"><i class="bi bi-arrow-clockwise"></i></button>
              `:`
                <button class="btn btn-sm btn-success" onclick="startService('${s.name}')"><i class="bi bi-play-fill"></i> Start</button>
              `}
              <button class="btn btn-sm btn-outline-secondary" onclick="window.location.hash='#/services/${s.name}'"><i class="bi bi-info-circle"></i></button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>`;
  },

  users: async () => {
    const [usersData, stats] = await Promise.all([
      fetch('/api/users?limit=100').then(r => r.json()).catch(() => ({ users: [] })),
      fetch('/api/users/stats').then(r => r.json()).catch(() => ({ data: {} }))
    ]);
    const users = usersData.users || usersData.data || [];
    const userStats = stats.data || { total: users.length, active: users.filter(u => u.status === 'active').length };

    return `<div class="page-users">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem">
        <div>
          <h2 style="margin:0">User Management</h2>
          <p style="color:#666;margin:0">Manage user accounts and permissions</p>
        </div>
        <button class="btn btn-primary" onclick="showUserCreateModal()">
          <i class="bi bi-plus-circle"></i> Create User
        </button>
      </div>

      <!-- Statistics -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem">
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Total Users</div>
          <div style="font-size:2rem;font-weight:bold">${userStats.total || 0}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Active Users</div>
          <div style="font-size:2rem;font-weight:bold;color:#28a745">${userStats.active || 0}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Inactive</div>
          <div style="font-size:2rem;font-weight:bold;color:#ffc107">${(userStats.total || 0) - (userStats.active || 0)}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">New Today</div>
          <div style="font-size:2rem;font-weight:bold">${users.filter(u => new Date(u.createdAt).toDateString() === new Date().toDateString()).length}</div>
        </div>
      </div>

      <!-- Filters & Search -->
      <div style="background:white;padding:1.5rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
        <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:1rem;align-items:end">
          <div>
            <label class="form-label">Search Users</label>
            <input type="text"
                   class="form-control"
                   id="user-search"
                   placeholder="Search by username, email, or name..."
                   onkeyup="filterUsers()">
          </div>
          <div>
            <label class="form-label">Status Filter</label>
            <select class="form-select" id="user-status-filter" onchange="filterUsers()">
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
          <div>
            <label class="form-label">Role Filter</label>
            <select class="form-select" id="user-role-filter" onchange="filterUsers()">
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="moderator">Moderator</option>
              <option value="user">User</option>
            </select>
          </div>
          <div>
            <button class="btn btn-outline-secondary" onclick="loadPage('users')">
              <i class="bi bi-arrow-clockwise"></i> Refresh
            </button>
          </div>
        </div>
      </div>

      <!-- Users Table -->
      <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
        <div style="overflow-x:auto">
          <table class="table table-hover" id="users-table">
            <thead style="background:#f8f9fa">
              <tr>
                <th style="width:30px">
                  <input type="checkbox" onchange="toggleAllUsers(this.checked)">
                </th>
                <th>Username</th>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Login</th>
                <th style="width:160px">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${users.length > 0 ? users.map(u=>`<tr class="user-row" data-status="${u.status || 'active'}" data-role="${u.role || 'user'}">
                <td><input type="checkbox" class="user-checkbox" value="${u.id}"></td>
                <td><strong>${u.username || 'N/A'}</strong></td>
                <td>${u.email || 'N/A'}</td>
                <td>${u.firstName || ''} ${u.lastName || ''}</td>
                <td><span class="badge bg-info">${u.role || 'user'}</span></td>
                <td><span class="badge bg-${u.status==='active'?'success':'secondary'}">${u.status || 'active'}</span></td>
                <td>${u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}</td>
                <td>${u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'}</td>
                <td style="white-space:nowrap">
                  <button class="btn btn-sm btn-outline-primary" onclick="editUser('${u.id}')" title="Edit">
                    <i class="bi bi-pencil"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-info" onclick="viewUserDetails('${u.id}')" title="View Details">
                    <i class="bi bi-eye"></i>
                  </button>
                  <button class="btn btn-sm btn-outline-danger" onclick="confirmDeleteUser('${u.id}','${u.username}')" title="Delete">
                    <i class="bi bi-trash"></i>
                  </button>
                </td>
              </tr>`).join('') : `<tr><td colspan="9" class="text-center text-muted py-4">No users found</td></tr>`}
            </tbody>
          </table>
        </div>

        <!-- Bulk Actions -->
        <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid #dee2e6">
          <strong>Bulk Actions:</strong>
          <button class="btn btn-sm btn-outline-success ms-2" onclick="bulkActivateUsers()">
            <i class="bi bi-check-circle"></i> Activate Selected
          </button>
          <button class="btn btn-sm btn-outline-warning ms-2" onclick="bulkDeactivateUsers()">
            <i class="bi bi-x-circle"></i> Deactivate Selected
          </button>
          <button class="btn btn-sm btn-outline-danger ms-2" onclick="bulkDeleteUsers()">
            <i class="bi bi-trash"></i> Delete Selected
          </button>
        </div>
      </div>

      <div id="user-modals-container"></div>
    </div>`;
  },

  certificates: async () => {
    const [certsData, stats] = await Promise.all([
      fetch('/api/certificates').then(r => r.json()).catch(() => ({ certificates: [] })),
      fetch('/api/certificates/stats').then(r => r.json()).catch(() => ({ stats: {} }))
    ]);
    const certificates = certsData.certificates || [];
    const certStats = stats.stats || {
      total: certificates.length,
      active: certificates.filter(c => c.status === 'active').length,
      revoked: certificates.filter(c => c.status === 'revoked').length,
      expired: certificates.filter(c => c.notAfter && new Date(c.notAfter) < new Date()).length
    };

    return `<div class="page-certificates">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem">
        <div>
          <h2 style="margin:0">Certificate Management</h2>
          <p style="color:#666;margin:0">X.509 certificates and certificate authority</p>
        </div>
        <button class="btn btn-primary" onclick="issueCertificate()">
          <i class="bi bi-plus-circle"></i> Issue Certificate
        </button>
      </div>

      <!-- Statistics -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem">
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Total Certificates</div>
          <div style="font-size:2rem;font-weight:bold">${certStats.total || 0}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Active</div>
          <div style="font-size:2rem;font-weight:bold;color:#28a745">${certStats.active || 0}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Revoked</div>
          <div style="font-size:2rem;font-weight:bold;color:#dc3545">${certStats.revoked || 0}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Expired</div>
          <div style="font-size:2rem;font-weight:bold;color:#ffc107">${certStats.expired || 0}</div>
        </div>
      </div>

      <!-- Filters & Search -->
      <div style="background:white;padding:1.5rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
        <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:1rem;align-items:end">
          <div>
            <label class="form-label">Search Certificates</label>
            <input type="text"
                   class="form-control"
                   id="cert-search"
                   placeholder="Search by common name, serial, or organization..."
                   onkeyup="filterCertificates()">
          </div>
          <div>
            <label class="form-label">Status Filter</label>
            <select class="form-select" id="cert-status-filter" onchange="filterCertificates()">
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="revoked">Revoked Only</option>
              <option value="expired">Expired Only</option>
            </select>
          </div>
          <div>
            <label class="form-label">Type Filter</label>
            <select class="form-select" id="cert-type-filter" onchange="filterCertificates()">
              <option value="all">All Types</option>
              <option value="server">Server</option>
              <option value="client">Client</option>
              <option value="ca">CA</option>
            </select>
          </div>
          <div>
            <button class="btn btn-outline-secondary" onclick="loadPage('certificates')">
              <i class="bi bi-arrow-clockwise"></i> Refresh
            </button>
          </div>
        </div>
      </div>

      <!-- Certificates Table -->
      <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
        <div style="overflow-x:auto">
          <table class="table table-hover" id="certificates-table">
            <thead style="background:#f8f9fa">
              <tr>
                <th style="width:30px">
                  <input type="checkbox" onchange="toggleAllCertificates(this.checked)">
                </th>
                <th>Common Name</th>
                <th>Serial Number</th>
                <th>Organization</th>
                <th>Type</th>
                <th>Status</th>
                <th>Valid From</th>
                <th>Valid Until</th>
                <th style="width:160px">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${certificates.length > 0 ? certificates.map(c => {
                const isExpired = c.notAfter && new Date(c.notAfter) < new Date();
                const status = isExpired ? 'expired' : (c.status || 'active');
                return `<tr class="cert-row" data-status="${status}" data-type="${c.type || 'server'}">
                  <td><input type="checkbox" class="cert-checkbox" value="${c.id}"></td>
                  <td><strong>${c.commonName || 'N/A'}</strong></td>
                  <td><code style="font-size:0.85rem">${c.serialNumber || 'N/A'}</code></td>
                  <td>${c.organization || 'N/A'}</td>
                  <td><span class="badge bg-info">${c.type || 'server'}</span></td>
                  <td><span class="badge bg-${status === 'active' ? 'success' : status === 'revoked' ? 'danger' : 'warning'}">${status}</span></td>
                  <td>${c.notBefore ? new Date(c.notBefore).toLocaleDateString() : 'N/A'}</td>
                  <td>${c.notAfter ? new Date(c.notAfter).toLocaleDateString() : 'N/A'}</td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-sm btn-outline-info" onclick="viewCertDetails('${c.id}')" title="View Details">
                      <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="downloadCertificate('${c.id}')" title="Download">
                      <i class="bi bi-download"></i>
                    </button>
                    ${status === 'active' ? `
                      <button class="btn btn-sm btn-outline-danger" onclick="revokeCertificate('${c.id}')" title="Revoke">
                        <i class="bi bi-x-circle"></i>
                      </button>
                    ` : ''}
                  </td>
                </tr>`;
              }).join('') : `<tr><td colspan="9" class="text-center text-muted py-4">No certificates found</td></tr>`}
            </tbody>
          </table>
        </div>

        <!-- Bulk Actions -->
        <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid #dee2e6">
          <strong>Bulk Actions:</strong>
          <button class="btn btn-sm btn-outline-danger ms-2" onclick="bulkRevokeCertificates()">
            <i class="bi bi-x-circle"></i> Revoke Selected
          </button>
          <button class="btn btn-sm btn-outline-secondary ms-2" onclick="bulkExportCertificates()">
            <i class="bi bi-download"></i> Export Selected
          </button>
          <button class="btn btn-sm btn-outline-warning ms-2" onclick="checkOCSPStatus()">
            <i class="bi bi-shield-check"></i> Check OCSP Status
          </button>
        </div>
      </div>
    </div>`;
  },

  tokens: async () => {
    const [tokensData, stats] = await Promise.all([
      fetch('/api/tokens').then(r => r.json()).catch(() => ({ tokens: [] })),
      fetch('/api/tokens/stats').then(r => r.json()).catch(() => ({ stats: {} }))
    ]);
    const tokens = tokensData.tokens || [];
    const tokenStats = stats.stats || {
      total: tokens.length,
      active: tokens.filter(t => t.status === 'active').length,
      revoked: tokens.filter(t => t.status === 'revoked').length,
      expired: tokens.filter(t => t.expiresAt && new Date(t.expiresAt) < new Date()).length
    };

    return `<div class="page-tokens">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem">
        <div>
          <h2 style="margin:0">Token Management</h2>
          <p style="color:#666;margin:0">Manage CA tokens and access credentials</p>
        </div>
        <button class="btn btn-primary" onclick="generateNewToken()">
          <i class="bi bi-plus-circle"></i> Generate Token
        </button>
      </div>

      <!-- Statistics -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem">
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Total Tokens</div>
          <div style="font-size:2rem;font-weight:bold">${tokenStats.total || 0}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Active</div>
          <div style="font-size:2rem;font-weight:bold;color:#28a745">${tokenStats.active || 0}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Revoked</div>
          <div style="font-size:2rem;font-weight:bold;color:#dc3545">${tokenStats.revoked || 0}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Expired</div>
          <div style="font-size:2rem;font-weight:bold;color:#ffc107">${tokenStats.expired || 0}</div>
        </div>
      </div>

      <!-- Filters & Search -->
      <div style="background:white;padding:1.5rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
        <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:1rem;align-items:end">
          <div>
            <label class="form-label">Search Tokens</label>
            <input type="text"
                   class="form-control"
                   id="token-search"
                   placeholder="Search by ID, resource, or permissions..."
                   onkeyup="filterTokens()">
          </div>
          <div>
            <label class="form-label">Status Filter</label>
            <select class="form-select" id="token-status-filter" onchange="filterTokens()">
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="revoked">Revoked Only</option>
              <option value="expired">Expired Only</option>
            </select>
          </div>
          <div>
            <label class="form-label">Type Filter</label>
            <select class="form-select" id="token-type-filter" onchange="filterTokens()">
              <option value="all">All Types</option>
              <option value="time">Time-based</option>
              <option value="usage">Usage-based</option>
              <option value="permanent">Permanent</option>
            </select>
          </div>
          <div>
            <button class="btn btn-outline-secondary" onclick="loadPage('tokens')">
              <i class="bi bi-arrow-clockwise"></i> Refresh
            </button>
          </div>
        </div>
      </div>

      <!-- Tokens Table -->
      <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
        <div style="overflow-x:auto">
          <table class="table table-hover" id="tokens-table">
            <thead style="background:#f8f9fa">
              <tr>
                <th style="width:30px">
                  <input type="checkbox" onchange="toggleAllTokens(this.checked)">
                </th>
                <th>Token ID</th>
                <th>Resource</th>
                <th>Permissions</th>
                <th>Type</th>
                <th>Status</th>
                <th>Created</th>
                <th>Expires</th>
                <th style="width:140px">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${tokens.length > 0 ? tokens.map(t => {
                const isExpired = t.expiresAt && new Date(t.expiresAt) < new Date();
                const status = isExpired ? 'expired' : (t.status || 'active');
                return `<tr class="token-row" data-status="${status}" data-type="${t.expiryType || 'time'}">
                  <td><input type="checkbox" class="token-checkbox" value="${t.id}"></td>
                  <td><code style="font-size:0.85rem">${t.id ? t.id.substring(0, 12) + '...' : 'N/A'}</code></td>
                  <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis" title="${t.resource?.value || 'N/A'}">${t.resource?.value || 'N/A'}</td>
                  <td>
                    ${t.permissions ? Object.entries(t.permissions).filter(([k, v]) => v).map(([k]) =>
                      `<span class="badge bg-secondary me-1">${k}</span>`
                    ).join('') : 'N/A'}
                  </td>
                  <td><span class="badge bg-info">${t.expiryType || 'time'}</span></td>
                  <td><span class="badge bg-${status === 'active' ? 'success' : status === 'revoked' ? 'danger' : 'warning'}">${status}</span></td>
                  <td>${t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'N/A'}</td>
                  <td>${t.expiresAt ? new Date(t.expiresAt).toLocaleDateString() : 'Never'}</td>
                  <td style="white-space:nowrap">
                    <button class="btn btn-sm btn-outline-info" onclick="viewTokenDetails('${t.id}')" title="View Details">
                      <i class="bi bi-eye"></i>
                    </button>
                    ${status === 'active' ? `
                      <button class="btn btn-sm btn-outline-danger" onclick="revokeToken('${t.id}')" title="Revoke">
                        <i class="bi bi-x-circle"></i>
                      </button>
                    ` : ''}
                  </td>
                </tr>`;
              }).join('') : `<tr><td colspan="9" class="text-center text-muted py-4">No tokens found</td></tr>`}
            </tbody>
          </table>
        </div>

        <!-- Bulk Actions -->
        <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid #dee2e6">
          <strong>Bulk Actions:</strong>
          <button class="btn btn-sm btn-outline-danger ms-2" onclick="bulkRevokeTokens()">
            <i class="bi bi-x-circle"></i> Revoke Selected
          </button>
          <button class="btn btn-sm btn-outline-secondary ms-2" onclick="bulkExportTokens()">
            <i class="bi bi-download"></i> Export Selected
          </button>
        </div>
      </div>
    </div>`;
  },

  configDatabase: async () => {
    const data = await fetch('/api/database/connections').then(r => r.json()).catch(() => ({
      connections: [
        { name: 'CA', database: 'exprsn_ca', host: 'localhost', port: 5432, status: 'unknown', tableCount: 12 },
        { name: 'Auth', database: 'exprsn_auth', host: 'localhost', port: 5432, status: 'unknown', tableCount: 8 },
        { name: 'Timeline', database: 'exprsn_timeline', host: 'localhost', port: 5432, status: 'unknown', tableCount: 10 },
        { name: 'Spark', database: 'exprsn_spark', host: 'localhost', port: 5432, status: 'unknown', tableCount: 7 },
        { name: 'Forge', database: 'exprsn_forge', host: 'localhost', port: 5432, status: 'unknown', tableCount: 45 },
        { name: 'Workflow', database: 'exprsn_workflow', host: 'localhost', port: 5432, status: 'unknown', tableCount: 5 },
        { name: 'Nexus', database: 'exprsn_nexus', host: 'localhost', port: 5432, status: 'unknown', tableCount: 12 }
      ]
    }));
    const connections = data.connections || [];

    return `<div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem">
        <div>
          <h2 style="margin:0">Database Browser</h2>
          <p style="color:#666;margin:0">Browse and manage database tables across all services</p>
        </div>
        <div>
          <button class="btn btn-outline-primary" onclick="refreshDatabases()">
            <i class="bi bi-arrow-clockwise"></i> Refresh
          </button>
        </div>
      </div>

      <!-- Database Tabs -->
      <div style="margin-bottom:1.5rem">
        <ul class="nav nav-tabs" id="database-tabs" role="tablist">
          ${connections.map((c, idx) => `
            <li class="nav-item" role="presentation">
              <button class="nav-link ${idx === 0 ? 'active' : ''}"
                      id="db-tab-${c.database}"
                      data-bs-toggle="tab"
                      data-bs-target="#db-content-${c.database}"
                      type="button"
                      role="tab"
                      onclick="loadDatabaseTables('${c.database}')">
                <i class="bi bi-database"></i> ${c.name}
                <span class="badge bg-${c.status==='connected'?'success':'secondary'} ms-2">${c.tableCount || 0}</span>
              </button>
            </li>
          `).join('')}
        </ul>
      </div>

      <!-- Tab Content -->
      <div class="tab-content" id="database-tab-content">
        ${connections.map((c, idx) => `
          <div class="tab-pane fade ${idx === 0 ? 'show active' : ''}"
               id="db-content-${c.database}"
               role="tabpanel">

            <!-- Connection Status -->
            <div style="background:white;padding:1rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem">
                <div>
                  <small class="text-muted">Database</small>
                  <div><strong>${c.database}</strong></div>
                </div>
                <div>
                  <small class="text-muted">Host</small>
                  <div>${c.host}:${c.port}</div>
                </div>
                <div>
                  <small class="text-muted">Tables</small>
                  <div>${c.tableCount || 0} tables</div>
                </div>
                <div>
                  <small class="text-muted">Status</small>
                  <div><span class="badge bg-${c.status==='connected'?'success':'secondary'}">${c.status || 'unknown'}</span></div>
                </div>
              </div>
            </div>

            <!-- Table List -->
            <div style="display:grid;grid-template-columns:300px 1fr;gap:1.5rem">
              <!-- Left: Table List -->
              <div style="background:white;padding:1rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);max-height:600px;overflow-y:auto">
                <div style="margin-bottom:1rem">
                  <input type="text"
                         class="form-control form-control-sm"
                         placeholder="Search tables..."
                         id="table-search-${c.database}"
                         onkeyup="filterTables('${c.database}')">
                </div>
                <div id="table-list-${c.database}">
                  <div class="text-center text-muted py-3">
                    <i class="bi bi-hourglass-split"></i> Loading tables...
                  </div>
                </div>
              </div>

              <!-- Right: Table Data Viewer -->
              <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
                <div id="table-viewer-${c.database}">
                  <div class="text-center text-muted py-5">
                    <i class="bi bi-table" style="font-size:3rem"></i>
                    <p style="margin-top:1rem">Select a table from the list to view its data</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <script>
      // Auto-load first database tables
      setTimeout(() => {
        loadDatabaseTables('${connections[0]?.database || 'exprsn_ca'}');
      }, 100);
    </script>
    `;
  },

  configRedis: async () => {
    const data = await fetch('/api/redis/status').then(r => r.json()).catch(() => ({
      status: {
        connected: false,
        config: {
          host: 'localhost',
          port: 6379,
          db: 0
        },
        stats: {
          usedMemory: '2.5MB',
          totalKeys: 1247,
          uptime: 86400
        },
        servicePrefixes: {
          ca: 'exprsn:ca',
          auth: 'exprsn:auth',
          timeline: 'exprsn:timeline',
          spark: 'exprsn:spark',
          moderator: 'exprsn:moderator',
          filevault: 'exprsn:filevault',
          gallery: 'exprsn:gallery',
          live: 'exprsn:live',
          bridge: 'exprsn:bridge',
          nexus: 'exprsn:nexus',
          pulse: 'exprsn:pulse',
          vault: 'exprsn:vault',
          herald: 'exprsn:herald',
          setup: 'exprsn:setup',
          forge: 'exprsn:forge',
          workflow: 'exprsn:workflow',
          svr: 'exprsn:svr',
          prefetch: 'exprsn:prefetch'
        }
      }
    }));
    const status = data.status || { connected: false };
    const servicePrefixes = status.servicePrefixes || {};

    return `<div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem">
        <div>
          <h2 style="margin:0">Redis Configuration</h2>
          <p style="color:#666;margin:0">Cache and session management</p>
        </div>
        <span class="badge bg-${status.connected?'success':'danger'} fs-5">
          ${status.connected?'✓ Connected':'✗ Disconnected'}
        </span>
      </div>

      <!-- Redis Statistics -->
      ${status.connected ? `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem">
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Memory Used</div>
          <div style="font-size:1.8rem;font-weight:bold">${status.stats?.usedMemory || '0 MB'}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Total Keys</div>
          <div style="font-size:1.8rem;font-weight:bold">${(status.stats?.totalKeys || 0).toLocaleString()}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Uptime</div>
          <div style="font-size:1.8rem;font-weight:bold">${Math.floor((status.stats?.uptime || 0) / 3600)}h</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Database</div>
          <div style="font-size:1.8rem;font-weight:bold">${status.config?.db || 0}</div>
        </div>
      </div>
      ` : ''}

      <!-- Connection Settings -->
      <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
        <h4 style="border-bottom:2px solid #667eea;padding-bottom:0.5rem;margin-bottom:1.5rem">
          <i class="bi bi-server"></i> Connection Settings
        </h4>
        <form id="redis-config-form">
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Host</label>
              <input type="text" name="host" class="form-control" value="${status.config?.host||'localhost'}">
            </div>
            <div class="col-md-3 mb-3">
              <label class="form-label">Port</label>
              <input type="number" name="port" class="form-control" value="${status.config?.port||6379}">
            </div>
            <div class="col-md-3 mb-3">
              <label class="form-label">Database</label>
              <input type="number" name="db" class="form-control" value="${status.config?.db||0}">
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Password (Optional)</label>
              <input type="password" name="password" class="form-control" placeholder="Leave blank for no password">
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">&nbsp;</label>
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-outline-primary flex-fill" onclick="testRedisConnection()">
                  <i class="bi bi-check-circle"></i> Test Connection
                </button>
                <button type="button" class="btn btn-outline-secondary flex-fill" onclick="saveRedisConfig()">
                  <i class="bi bi-save"></i> Save
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      <!-- Service Prefixes -->
      <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
          <h4 style="border-bottom:2px solid #667eea;padding-bottom:0.5rem;margin:0;flex:1">
            <i class="bi bi-tag"></i> Service Key Prefixes
          </h4>
          <button class="btn btn-sm btn-outline-primary" onclick="saveAllPrefixes()">
            <i class="bi bi-save"></i> Save All Prefixes
          </button>
        </div>
        <p style="color:#666;margin-bottom:1.5rem">Configure Redis key prefixes for each service to organize cached data</p>

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(350px,1fr));gap:1rem">
          ${Object.entries(servicePrefixes).map(([service, prefix]) => `
            <div style="padding:1rem;border:1px solid #e0e0e0;border-radius:6px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
                <strong style="text-transform:uppercase">${service}</strong>
                <button class="btn btn-xs btn-outline-secondary" onclick="resetPrefix('${service}')">
                  <i class="bi bi-arrow-counterclockwise"></i>
                </button>
              </div>
              <input type="text"
                     class="form-control form-control-sm"
                     id="prefix-${service}"
                     value="${prefix}"
                     placeholder="exprsn:${service}">
              <small class="text-muted">Example key: <code>${prefix}:session:abc123</code></small>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Danger Zone -->
      <div style="background:#fff5f5;padding:2rem;border-radius:8px;border-left:4px solid #dc3545;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
        <h4 style="color:#dc3545;margin-bottom:1rem">
          <i class="bi bi-exclamation-triangle"></i> Danger Zone
        </h4>
        <div style="display:flex;gap:1rem;flex-wrap:wrap">
          <button type="button" class="btn btn-outline-danger" onclick="flushRedis()">
            <i class="bi bi-trash"></i> Flush Database (Clear All Keys)
          </button>
          <button type="button" class="btn btn-outline-danger" onclick="flushServiceKeys()">
            <i class="bi bi-trash"></i> Flush Service Keys Only
          </button>
          <button type="button" class="btn btn-outline-warning" onclick="viewRedisKeys()">
            <i class="bi bi-eye"></i> View All Keys
          </button>
        </div>
      </div>
    </div>`;
  },

  workflow: async () => {
    const [workflowsData, stats] = await Promise.all([
      fetch('/api/workflows').then(r => r.json()).catch(() => ({ workflows: [] })),
      fetch('/api/workflows/stats').then(r => r.json()).catch(() => ({ stats: {} }))
    ]);
    const workflows = workflowsData.workflows || [];
    const workflowStats = stats.stats || { total: 0, active: 0, executions: 0 };

    return `<div><h2>Workflow Automation</h2>
      <div style="margin-bottom:2rem">
        <button class="btn btn-primary" onclick="window.location.hash='#/workflow/designer'">
          <i class="bi bi-plus-circle"></i> Create New Workflow
        </button>
        <button class="btn btn-secondary ms-2" onclick="loadWorkflowTemplates()">
          <i class="bi bi-collection"></i> Templates
        </button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:2rem">
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Total Workflows</div>
          <div style="font-size:2rem;font-weight:bold">${workflowStats.total || 3}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Active</div>
          <div style="font-size:2rem;font-weight:bold;color:#28a745">${workflowStats.active || 3}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Executions Today</div>
          <div style="font-size:2rem;font-weight:bold">${workflowStats.executions || 127}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Success Rate</div>
          <div style="font-size:2rem;font-weight:bold;color:#28a745">${workflowStats.successRate || 98}%</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:1.5rem">
        ${workflows.length > 0 ? workflows.map(w => `
          <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
            <div style="display:flex;justify-content:space-between;margin-bottom:1rem">
              <h4>${w.name}</h4>
              <span class="badge bg-${w.status === 'active' ? 'success' : 'secondary'}">${w.status}</span>
            </div>
            <div style="font-size:0.9rem;color:#666;margin-bottom:1rem">
              ${w.steps ? w.steps.slice(0, 4).map((s, i) => `<div>${i + 1}. ${s.name}</div>`).join('') : ''}
            </div>
            <div style="font-size:0.85rem;color:#888;margin-bottom:1rem">
              <span>Executions: ${w.executionCount || 0}</span> | <span>Success: ${w.successRate || 0}%</span>
            </div>
            <div style="display:flex;gap:0.5rem">
              <button class="btn btn-sm btn-primary" onclick="editWorkflow('${w.id}')">
                <i class="bi bi-pencil"></i> Edit
              </button>
              <button class="btn btn-sm btn-success" onclick="executeWorkflow('${w.id}')">
                <i class="bi bi-play-fill"></i> Run
              </button>
              <button class="btn btn-sm btn-danger" onclick="deleteWorkflow('${w.id}')">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        `).join('') : `
          <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
            <div style="display:flex;justify-content:space-between;margin-bottom:1rem">
              <h4>User Onboarding</h4><span class="badge bg-success">Active</span>
            </div>
            <div style="font-size:0.9rem;color:#666;margin-bottom:1rem">
              <div>1. Send Welcome Email</div>
              <div>2. Create User Profile</div>
              <div>3. Assign Permissions</div>
              <div>4. Issue Certificate</div>
            </div>
            <div style="font-size:0.85rem;color:#888">
              <span>Executions: 142</span> | <span>Success: 98%</span>
            </div>
          </div>
          <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
            <div style="display:flex;justify-content:space-between;margin-bottom:1rem">
              <h4>Certificate Renewal</h4><span class="badge bg-success">Active</span>
            </div>
            <div style="font-size:0.9rem;color:#666;margin-bottom:1rem">
              <div>1. Check Expiry Date</div>
              <div>2. Send Reminder</div>
              <div>3. Auto-Renew Certificate</div>
              <div>4. Update Records</div>
            </div>
            <div style="font-size:0.85rem;color:#888">
              <span>Executions: 87</span> | <span>Success: 100%</span>
            </div>
          </div>
          <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
            <div style="display:flex;justify-content:space-between;margin-bottom:1rem">
              <h4>Daily Backup</h4><span class="badge bg-success">Active</span>
            </div>
            <div style="font-size:0.9rem;color:#666;margin-bottom:1rem">
              <div>1. Backup Databases</div>
              <div>2. Export Certificates</div>
              <div>3. Archive Logs</div>
              <div>4. Upload to S3</div>
            </div>
            <div style="font-size:0.85rem;color:#888">
              <span>Executions: 365</span> | <span>Success: 99.7%</span>
            </div>
          </div>
        `}
      </div>
    </div>`;
  },

  workflowDesigner: async () => {
    return `<div id="workflow-designer-container" style="height:calc(100vh - 140px)">
      <!-- Workflow designer will be initialized here -->
      <div style="display:flex;align-items:center;justify-content:center;height:100%;background:#f5f7fa">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading designer...</span>
        </div>
      </div>
    </div>
    <script>
      // Initialize the workflow designer
      if (typeof initWorkflowDesigner === 'function') {
        setTimeout(() => initWorkflowDesigner(), 100);
      }
    </script>`;
  },

  crm: async () => {
    return `<div><h2>Business Platform (CRM/ERP)</h2>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin:2rem 0">
        <div style="background:white;padding:1rem;border-radius:8px;text-align:center"><i class="bi bi-people fs-2"></i><div>2,143 Contacts</div></div>
        <div style="background:white;padding:1rem;border-radius:8px;text-align:center"><i class="bi bi-briefcase fs-2"></i><div>87 Active Deals</div></div>
        <div style="background:white;padding:1rem;border-radius:8px;text-align:center"><i class="bi bi-cash-stack fs-2"></i><div>.2M Pipeline</div></div>
        <div style="background:white;padding:1rem;border-radius:8px;text-align:center"><i class="bi bi-exclamation-triangle fs-2"></i><div>12 Tasks</div></div>
      </div>
      <div style="background:white;padding:2rem;border-radius:8px">
        <h3>Sales Pipeline</h3>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-top:1rem">
          <div style="text-align:center;padding:1rem;background:#f8f9fa;border-radius:4px">
            <div><strong>Prospecting</strong></div>
            <div style="font-size:1.5rem;margin:0.5rem 0">K</div>
            <div><span class="badge bg-secondary">24 deals</span></div>
          </div>
          <div style="text-align:center;padding:1rem;background:#f8f9fa;border-radius:4px">
            <div><strong>Qualification</strong></div>
            <div style="font-size:1.5rem;margin:0.5rem 0">K</div>
            <div><span class="badge bg-info">18 deals</span></div>
          </div>
          <div style="text-align:center;padding:1rem;background:#f8f9fa;border-radius:4px">
            <div><strong>Proposal</strong></div>
            <div style="font-size:1.5rem;margin:0.5rem 0">K</div>
            <div><span class="badge bg-primary">15 deals</span></div>
          </div>
          <div style="text-align:center;padding:1rem;background:#f8f9fa;border-radius:4px">
            <div><strong>Closing</strong></div>
            <div style="font-size:1.5rem;margin:0.5rem 0">K</div>
            <div><span class="badge bg-success">8 deals</span></div>
          </div>
        </div>
      </div>
    </div>`;
  },

  configGlobal: async () => {
    // Fetch current global configuration
    const globalConfig = await fetch('/api/config/global').then(r => r.json()).catch(() => ({
      config: {
        platformName: 'Exprsn Platform',
        platformUrl: 'http://localhost:3000',
        adminEmail: 'admin@exprsn.com',
        timezone: 'America/New_York',
        locale: 'en-US',
        maintenanceMode: false,
        registrationEnabled: true,
        emailVerificationRequired: true,
        defaultUserRole: 'user',
        maxUploadSize: 10485760,
        allowedFileTypes: 'jpg,jpeg,png,gif,pdf,doc,docx',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpSecure: true,
        smtpUser: '',
        smtpFrom: 'noreply@exprsn.com',
        apiVersion: 'v1',
        apiRateLimit: 100,
        apiRateLimitWindow: 15,
        featureFlagsWorkflow: true,
        featureFlagsLiveStreaming: true,
        featureFlagsAIModeration: true,
        sessionTimeout: 24,
        passwordMinLength: 8,
        passwordRequireSpecialChar: true,
        mfaRequired: false
      }
    }));

    const config = globalConfig.config || {};

    return `<div><h2>Global Settings</h2>
      <p style="color:#666;margin-bottom:2rem">Platform-wide configuration settings</p>

      <form id="global-config-form">
        <!-- Platform Information -->
        <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <h4 style="border-bottom:2px solid #667eea;padding-bottom:0.5rem;margin-bottom:1.5rem">
            <i class="bi bi-building"></i> Platform Information
          </h4>
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Platform Name</label>
              <input type="text" class="form-control" name="platformName" value="${config.platformName || 'Exprsn Platform'}">
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Platform URL</label>
              <input type="url" class="form-control" name="platformUrl" value="${config.platformUrl || 'http://localhost:3000'}">
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Admin Email</label>
              <input type="email" class="form-control" name="adminEmail" value="${config.adminEmail || 'admin@exprsn.com'}">
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Default Timezone</label>
              <select class="form-select" name="timezone">
                <option ${config.timezone === 'America/New_York' ? 'selected' : ''}>America/New_York</option>
                <option ${config.timezone === 'America/Chicago' ? 'selected' : ''}>America/Chicago</option>
                <option ${config.timezone === 'America/Denver' ? 'selected' : ''}>America/Denver</option>
                <option ${config.timezone === 'America/Los_Angeles' ? 'selected' : ''}>America/Los_Angeles</option>
                <option ${config.timezone === 'Europe/London' ? 'selected' : ''}>Europe/London</option>
                <option ${config.timezone === 'Europe/Paris' ? 'selected' : ''}>Europe/Paris</option>
                <option ${config.timezone === 'Asia/Tokyo' ? 'selected' : ''}>Asia/Tokyo</option>
                <option ${config.timezone === 'UTC' ? 'selected' : ''}>UTC</option>
              </select>
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Default Locale</label>
              <select class="form-select" name="locale">
                <option ${config.locale === 'en-US' ? 'selected' : ''}>en-US</option>
                <option ${config.locale === 'en-GB' ? 'selected' : ''}>en-GB</option>
                <option ${config.locale === 'es-ES' ? 'selected' : ''}>es-ES</option>
                <option ${config.locale === 'fr-FR' ? 'selected' : ''}>fr-FR</option>
                <option ${config.locale === 'de-DE' ? 'selected' : ''}>de-DE</option>
                <option ${config.locale === 'ja-JP' ? 'selected' : ''}>ja-JP</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Email (SMTP) Settings -->
        <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <h4 style="border-bottom:2px solid #667eea;padding-bottom:0.5rem;margin-bottom:1.5rem">
            <i class="bi bi-envelope"></i> Email (SMTP) Settings
          </h4>
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">SMTP Host</label>
              <input type="text" class="form-control" name="smtpHost" value="${config.smtpHost || 'smtp.gmail.com'}">
            </div>
            <div class="col-md-3 mb-3">
              <label class="form-label">SMTP Port</label>
              <input type="number" class="form-control" name="smtpPort" value="${config.smtpPort || 587}">
            </div>
            <div class="col-md-3 mb-3">
              <label class="form-label">Secure (TLS)</label>
              <div class="form-check mt-2">
                <input class="form-check-input" type="checkbox" name="smtpSecure" ${config.smtpSecure !== false ? 'checked' : ''}>
                <label class="form-check-label">Enable TLS</label>
              </div>
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">SMTP Username</label>
              <input type="text" class="form-control" name="smtpUser" value="${config.smtpUser || ''}" placeholder="username@gmail.com">
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">SMTP Password</label>
              <input type="password" class="form-control" name="smtpPassword" placeholder="••••••••">
              <small class="text-muted">Leave blank to keep existing password</small>
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">From Email Address</label>
              <input type="email" class="form-control" name="smtpFrom" value="${config.smtpFrom || 'noreply@exprsn.com'}">
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">&nbsp;</label>
              <button type="button" class="btn btn-outline-primary w-100" onclick="testEmailConfig()">
                <i class="bi bi-send"></i> Test Email Connection
              </button>
            </div>
          </div>
        </div>

        <!-- User Registration & Authentication -->
        <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <h4 style="border-bottom:2px solid #667eea;padding-bottom:0.5rem;margin-bottom:1.5rem">
            <i class="bi bi-person-plus"></i> User Registration & Authentication
          </h4>
          <div class="row">
            <div class="col-md-6 mb-3">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" name="registrationEnabled" ${config.registrationEnabled !== false ? 'checked' : ''}>
                <label class="form-check-label">Allow New User Registration</label>
              </div>
            </div>
            <div class="col-md-6 mb-3">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" name="emailVerificationRequired" ${config.emailVerificationRequired !== false ? 'checked' : ''}>
                <label class="form-check-label">Require Email Verification</label>
              </div>
            </div>
            <div class="col-md-6 mb-3">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" name="mfaRequired" ${config.mfaRequired ? 'checked' : ''}>
                <label class="form-check-label">Require Multi-Factor Authentication</label>
              </div>
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Default User Role</label>
              <select class="form-select" name="defaultUserRole">
                <option ${config.defaultUserRole === 'user' ? 'selected' : ''}>user</option>
                <option ${config.defaultUserRole === 'member' ? 'selected' : ''}>member</option>
                <option ${config.defaultUserRole === 'guest' ? 'selected' : ''}>guest</option>
              </select>
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Session Timeout (hours)</label>
              <input type="number" class="form-control" name="sessionTimeout" value="${config.sessionTimeout || 24}">
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Minimum Password Length</label>
              <input type="number" class="form-control" name="passwordMinLength" value="${config.passwordMinLength || 8}">
            </div>
            <div class="col-md-6 mb-3">
              <div class="form-check mt-4">
                <input class="form-check-input" type="checkbox" name="passwordRequireSpecialChar" ${config.passwordRequireSpecialChar !== false ? 'checked' : ''}>
                <label class="form-check-label">Require Special Characters in Password</label>
              </div>
            </div>
          </div>
        </div>

        <!-- File Upload Settings -->
        <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <h4 style="border-bottom:2px solid #667eea;padding-bottom:0.5rem;margin-bottom:1.5rem">
            <i class="bi bi-cloud-upload"></i> File Upload Settings
          </h4>
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Max Upload Size (bytes)</label>
              <input type="number" class="form-control" name="maxUploadSize" value="${config.maxUploadSize || 10485760}">
              <small class="text-muted">Current: ${((config.maxUploadSize || 10485760) / 1048576).toFixed(2)} MB</small>
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Allowed File Types (comma-separated)</label>
              <input type="text" class="form-control" name="allowedFileTypes" value="${config.allowedFileTypes || 'jpg,jpeg,png,gif,pdf,doc,docx'}">
            </div>
          </div>
        </div>

        <!-- API Settings -->
        <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <h4 style="border-bottom:2px solid #667eea;padding-bottom:0.5rem;margin-bottom:1.5rem">
            <i class="bi bi-code-slash"></i> API Settings
          </h4>
          <div class="row">
            <div class="col-md-4 mb-3">
              <label class="form-label">API Version</label>
              <select class="form-select" name="apiVersion">
                <option ${config.apiVersion === 'v1' ? 'selected' : ''}>v1</option>
                <option ${config.apiVersion === 'v2' ? 'selected' : ''}>v2</option>
              </select>
            </div>
            <div class="col-md-4 mb-3">
              <label class="form-label">Rate Limit (requests)</label>
              <input type="number" class="form-control" name="apiRateLimit" value="${config.apiRateLimit || 100}">
            </div>
            <div class="col-md-4 mb-3">
              <label class="form-label">Rate Limit Window (minutes)</label>
              <input type="number" class="form-control" name="apiRateLimitWindow" value="${config.apiRateLimitWindow || 15}">
            </div>
          </div>
        </div>

        <!-- Feature Flags -->
        <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <h4 style="border-bottom:2px solid #667eea;padding-bottom:0.5rem;margin-bottom:1.5rem">
            <i class="bi bi-toggles"></i> Feature Flags
          </h4>
          <div class="row">
            <div class="col-md-4 mb-3">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" name="featureFlagsWorkflow" ${config.featureFlagsWorkflow !== false ? 'checked' : ''}>
                <label class="form-check-label">Workflow Automation</label>
              </div>
            </div>
            <div class="col-md-4 mb-3">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" name="featureFlagsLiveStreaming" ${config.featureFlagsLiveStreaming !== false ? 'checked' : ''}>
                <label class="form-check-label">Live Streaming</label>
              </div>
            </div>
            <div class="col-md-4 mb-3">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" name="featureFlagsAIModeration" ${config.featureFlagsAIModeration !== false ? 'checked' : ''}>
                <label class="form-check-label">AI Content Moderation</label>
              </div>
            </div>
          </div>
        </div>

        <!-- Maintenance Mode -->
        <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <h4 style="border-bottom:2px solid #667eea;padding-bottom:0.5rem;margin-bottom:1.5rem">
            <i class="bi bi-tools"></i> Maintenance Mode
          </h4>
          <div class="row">
            <div class="col-md-6 mb-3">
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" name="maintenanceMode" id="maintenance-mode" ${config.maintenanceMode ? 'checked' : ''}>
                <label class="form-check-label" for="maintenance-mode">
                  <strong>Enable Maintenance Mode</strong>
                </label>
              </div>
              <small class="text-danger">Warning: This will make the platform inaccessible to all users except admins</small>
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Maintenance Message</label>
              <textarea class="form-control" name="maintenanceMessage" rows="3" placeholder="The platform is currently undergoing maintenance...">${config.maintenanceMessage || ''}</textarea>
            </div>
          </div>
        </div>

        <div style="text-align:right">
          <button type="button" class="btn btn-outline-secondary me-2" onclick="loadPage('dashboard')">Cancel</button>
          <button type="button" class="btn btn-primary" onclick="saveGlobalConfig()">
            <i class="bi bi-save"></i> Save Global Settings
          </button>
        </div>
      </form>
    </div>`;
  },

  configSecurity: async () => {
    return `<div><h2>Security Configuration</h2>
      <div style="max-width:800px;margin-top:2rem">
        <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem">
          <h4>CORS Settings</h4>
          <form>
            <div class="mb-3">
              <label class="form-label">Allowed Origins</label>
              <textarea class="form-control" rows="3" placeholder="https://example.com&#10;https://app.example.com">http://localhost:3000&#10;http://localhost:5000</textarea>
            </div>
            <div class="mb-3">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="cors-credentials" checked>
                <label class="form-check-label" for="cors-credentials">Allow Credentials</label>
              </div>
            </div>
          </form>
        </div>

        <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem">
          <h4>Rate Limiting</h4>
          <form>
            <div class="mb-3">
              <label class="form-label">Requests per Window</label>
              <input type="number" class="form-control" value="100">
            </div>
            <div class="mb-3">
              <label class="form-label">Window Size (minutes)</label>
              <input type="number" class="form-control" value="15">
            </div>
            <div class="mb-3">
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="rate-limit-enabled" checked>
                <label class="form-check-label" for="rate-limit-enabled">Enable Rate Limiting</label>
              </div>
            </div>
          </form>
        </div>

        <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem">
          <h4>Session Management</h4>
          <form>
            <div class="mb-3">
              <label class="form-label">Session Timeout (hours)</label>
              <input type="number" class="form-control" value="24">
            </div>
            <div class="mb-3">
              <label class="form-label">Cookie Security</label>
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="cookie-secure" checked>
                <label class="form-check-label" for="cookie-secure">Secure (HTTPS only)</label>
              </div>
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="cookie-httponly" checked>
                <label class="form-check-label" for="cookie-httponly">HttpOnly</label>
              </div>
              <div class="form-check">
                <input class="form-check-input" type="checkbox" id="cookie-samesite" checked>
                <label class="form-check-label" for="cookie-samesite">SameSite (Strict)</label>
              </div>
            </div>
          </form>
        </div>

        <button class="btn btn-primary">Save Security Settings</button>
      </div>
    </div>`;
  },

  serviceDetail: async (serviceName) => {
    const statusRes = await fetch(`/api/services/${serviceName}`).catch(() => ({ json: () => ({}) }));
    const service = await statusRes.json();
    const logs = service.logs || [];
    const status = service.status || 'stopped';

    // Get service-specific configuration
    const serviceConfig = await fetch(`/api/services/${serviceName}/config`).then(r => r.json()).catch(() => ({}));

    // Render service-specific settings based on service name
    let settingsHTML = '';
    switch(serviceName) {
      case 'ca':
        settingsHTML = await Pages.caSettings(serviceConfig);
        break;
      case 'auth':
        settingsHTML = await Pages.authSettings(serviceConfig);
        break;
      case 'timeline':
        settingsHTML = await Pages.timelineSettings(serviceConfig);
        break;
      case 'spark':
        settingsHTML = await Pages.sparkSettings(serviceConfig);
        break;
      case 'moderator':
        settingsHTML = await Pages.moderatorSettings(serviceConfig);
        break;
      case 'forge':
        settingsHTML = await Pages.forgeSettings(serviceConfig);
        break;
      default:
        settingsHTML = '<div class="alert alert-info">Service-specific settings coming soon</div>';
    }

    return `<div><h2>Service: ${serviceName.toUpperCase()}</h2>
      <div style="margin-bottom:2rem">
        <span class="badge bg-${status==='running'?'success':'secondary'} fs-5">${status}</span>
        ${service.pid?`<span class="badge bg-info fs-6 ms-2">PID: ${service.pid}</span>`:''}
        ${service.port?`<span class="badge bg-secondary fs-6 ms-2">Port: ${service.port||''}</span>`:''}
      </div>

      <!-- Control Buttons -->
      <div style="margin-bottom:2rem">
        ${status==='running'?`
          <button class="btn btn-warning" onclick="stopService('${serviceName}')"><i class="bi bi-stop-fill"></i> Stop</button>
          <button class="btn btn-info" onclick="restartService('${serviceName}')"><i class="bi bi-arrow-clockwise"></i> Restart</button>
        `:`
          <button class="btn btn-success" onclick="startService('${serviceName}')"><i class="bi bi-play-fill"></i> Start</button>
        `}
        <button class="btn btn-secondary" onclick="viewServiceLogs('${serviceName}')"><i class="bi bi-journal-text"></i> View Logs</button>
      </div>

      <!-- Metrics -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem">
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Uptime</div>
          <div style="font-size:1.5rem;font-weight:bold">${formatUptime(service.uptime||0)}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">Memory</div>
          <div style="font-size:1.5rem;font-weight:bold">${service.memory||'N/A'}</div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
          <div style="font-size:0.9rem;color:#666">CPU</div>
          <div style="font-size:1.5rem;font-weight:bold">${service.cpu||'N/A'}</div>
        </div>
      </div>

      <!-- Service-Specific Settings -->
      <div style="margin-bottom:2rem">
        ${settingsHTML}
      </div>

      <!-- Logs -->
      <div style="background:white;padding:1.5rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
        <h4>Recent Logs</h4>
        <pre id="service-logs-${serviceName}" style="background:#1e1e1e;color:#d4d4d4;padding:1rem;border-radius:4px;max-height:400px;overflow-y:auto;font-size:0.85rem">${logs.slice(-50).join('\n')||'No logs available'}</pre>
      </div>
    </div>`;
  },

  caSettings: async (config) => {
    const caConfig = config.config || {
      // Root CA Settings
      root: {
        name: 'Exprsn Root CA',
        country: 'US',
        state: 'California',
        locality: 'San Francisco',
        organization: 'Exprsn IO',
        organizationalUnit: 'Certificate Authority',
        email: 'ca@exprsn.io',
        keySize: 4096,
        validityDays: 7300,
        algorithm: 'RSA-SHA256-PSS'
      },
      // Intermediate CA Settings
      intermediate: {
        enabled: true,
        keySize: 4096,
        validityDays: 3650,
        pathLength: 1
      },
      // End Entity Certificate Settings
      entity: {
        keySize: 2048,
        validityDays: 365,
        autoRenewalDays: 30,
        requireApproval: false
      },
      // Certificate Types
      types: {
        server: {
          enabled: true,
          defaultValidity: 365,
          requireDnsValidation: true,
          allowWildcard: true
        },
        client: {
          enabled: true,
          defaultValidity: 730,
          requireEmailValidation: true
        },
        codeSigning: {
          enabled: true,
          defaultValidity: 1095,
          requireExtendedValidation: true,
          timestampingEnabled: true
        },
        san: {
          enabled: true,
          maxSans: 100,
          allowIpAddresses: true,
          allowEmailAddresses: true
        }
      },
      // DNS Configuration
      dns: {
        enabled: false,
        provider: 'route53',
        autoValidation: true,
        validationMethod: 'dns-01',
        route53: {
          region: 'us-east-1',
          hostedZoneId: '',
          accessKeyId: '',
          secretAccessKey: ''
        },
        cloudflare: {
          apiToken: '',
          zoneId: ''
        },
        manual: {
          ttl: 300,
          verifyDelay: 60
        }
      },
      // OCSP Configuration
      ocsp: {
        enabled: true,
        port: 2560,
        url: 'http://localhost:2560',
        batchEnabled: true,
        batchTimeout: 100,
        cacheEnabled: true,
        cacheTtl: 300,
        responderCertValidity: 365,
        nonceRequired: true,
        maxRequestSize: 65536
      },
      // CRL Configuration
      crl: {
        enabled: true,
        url: 'http://localhost:3000/crl',
        updateInterval: 3600,
        nextUpdateDays: 7,
        crlNumber: 1,
        distributionPoints: ['http://localhost:3000/crl', 'http://backup.example.com/crl'],
        includeReasons: true,
        compression: 'gzip'
      },
      // Storage Configuration
      storage: {
        type: 'disk',
        disk: {
          basePath: './data/ca',
          certsPath: './data/ca/certs',
          keysPath: './data/ca/keys',
          crlPath: './data/ca/crl',
          ocspPath: './data/ca/ocsp',
          backupEnabled: true,
          backupPath: './data/ca/backups',
          backupSchedule: '0 2 * * *'
        },
        s3: {
          enabled: false,
          region: 'us-east-1',
          bucket: 'exprsn-ca-certificates',
          prefix: 'ca/',
          accessKeyId: '',
          secretAccessKey: '',
          encryption: true,
          versioningEnabled: true
        },
        postgresql: {
          enabled: false,
          storeCertificates: true,
          storeKeys: false,
          compression: true
        }
      },
      // LDAP/Directory Integration
      ldap: {
        enabled: false,
        url: 'ldap://localhost:389',
        bindDn: 'cn=admin,dc=exprsn,dc=io',
        bindPassword: '',
        baseDn: 'ou=certificates,dc=exprsn,dc=io',
        searchFilter: '(cn={username})',
        publishCertificates: true,
        publishCrl: true,
        tlsEnabled: true,
        tlsCertPath: '',
        tlsKeyPath: '',
        tlsCaPath: ''
      },
      // Revocation Management
      revocation: {
        reasonRequired: true,
        allowedReasons: ['unspecified', 'keyCompromise', 'caCompromise', 'affiliationChanged', 'superseded', 'cessationOfOperation', 'certificateHold'],
        notificationEnabled: true,
        notificationEmail: 'admin@exprsn.io',
        gracePeriodHours: 24,
        autoRevokeSuspended: true,
        autoRevokeDays: 30
      },
      // Security & Validation
      security: {
        requireStrongKeys: true,
        minKeySize: 2048,
        allowWeakAlgorithms: false,
        keyGenerationOnServer: true,
        privateKeyEncryption: true,
        hsm: {
          enabled: false,
          type: 'softhsm',
          slotId: 0,
          pin: '',
          keyLabel: 'exprsn-ca-root'
        },
        rateLimiting: {
          enabled: true,
          maxCertsPerDay: 100,
          maxCertsPerHour: 20,
          maxCertsPerMinute: 5
        },
        auditLogging: {
          enabled: true,
          logIssuance: true,
          logRevocation: true,
          logValidation: true,
          retentionDays: 365
        }
      },
      // Key Management
      keyManagement: {
        rotation: {
          enabled: false,
          autoRotate: false,
          rotationPeriodDays: 730,
          overlapPeriodDays: 30,
          notifyBeforeDays: 60
        },
        backup: {
          enabled: true,
          encrypted: true,
          location: './data/ca/key-backups',
          schedule: '0 3 * * 0',
          retentionCount: 10
        },
        escrow: {
          enabled: false,
          keyEscrowRequired: false,
          escrowAgents: [],
          threshold: 2
        }
      }
    };

    return `<div style="background:white;padding:2rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem">
        <h3 style="margin:0">Certificate Authority Configuration</h3>
        <button type="button" class="btn btn-primary" onclick="saveCAConfig()">
          <i class="bi bi-save"></i> Save All Changes
        </button>
      </div>

      <!-- Configuration Tabs -->
      <ul class="nav nav-tabs" id="ca-config-tabs" role="tablist">
        <li class="nav-item" role="presentation">
          <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#ca-root" type="button">
            <i class="bi bi-shield-lock"></i> Root CA
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#ca-certificates" type="button">
            <i class="bi bi-file-earmark-lock"></i> Certificates
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#ca-dns" type="button">
            <i class="bi bi-globe"></i> DNS
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#ca-ocsp" type="button">
            <i class="bi bi-check-circle"></i> OCSP
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#ca-crl" type="button">
            <i class="bi bi-x-circle"></i> CRL
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#ca-storage" type="button">
            <i class="bi bi-hdd"></i> Storage
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#ca-ldap" type="button">
            <i class="bi bi-diagram-3"></i> LDAP
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#ca-revocation" type="button">
            <i class="bi bi-slash-circle"></i> Revocation
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#ca-security" type="button">
            <i class="bi bi-shield-check"></i> Security
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#ca-keys" type="button">
            <i class="bi bi-key"></i> Key Mgmt
          </button>
        </li>
      </ul>

      <form id="ca-config-form">
        <div class="tab-content" id="ca-config-tab-content" style="margin-top:1.5rem">

          <!-- Root CA Configuration -->
          <div class="tab-pane fade show active" id="ca-root" role="tabpanel">
            <h5 class="mb-3">Root Certificate Authority Settings</h5>

            <h6 class="mb-3">Distinguished Name (DN)</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Common Name (CN)</label>
                <input type="text" class="form-control" name="root.name" value="${caConfig.root.name}" />
                <small class="text-muted">CA identity name</small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Email Address</label>
                <input type="email" class="form-control" name="root.email" value="${caConfig.root.email}" />
              </div>
            </div>

            <div class="row">
              <div class="col-md-3 mb-3">
                <label class="form-label">Country (C)</label>
                <input type="text" class="form-control" name="root.country" value="${caConfig.root.country}" maxlength="2" placeholder="US" />
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">State/Province (ST)</label>
                <input type="text" class="form-control" name="root.state" value="${caConfig.root.state}" />
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Locality (L)</label>
                <input type="text" class="form-control" name="root.locality" value="${caConfig.root.locality}" />
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Organization (O)</label>
                <input type="text" class="form-control" name="root.organization" value="${caConfig.root.organization}" />
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">Organizational Unit (OU)</label>
              <input type="text" class="form-control" name="root.organizationalUnit" value="${caConfig.root.organizationalUnit}" />
            </div>

            <h6 class="mt-4 mb-3">Cryptographic Settings</h6>
            <div class="row">
              <div class="col-md-4 mb-3">
                <label class="form-label">Key Size (bits)</label>
                <select class="form-select" name="root.keySize">
                  <option value="2048" ${caConfig.root.keySize===2048?'selected':''}>2048</option>
                  <option value="3072" ${caConfig.root.keySize===3072?'selected':''}>3072</option>
                  <option value="4096" ${caConfig.root.keySize===4096?'selected':''}>4096 (Recommended)</option>
                  <option value="8192" ${caConfig.root.keySize===8192?'selected':''}>8192</option>
                </select>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Signature Algorithm</label>
                <select class="form-select" name="root.algorithm">
                  <option value="RSA-SHA256-PSS" ${caConfig.root.algorithm==='RSA-SHA256-PSS'?'selected':''}>RSA-SHA256-PSS (Recommended)</option>
                  <option value="RSA-SHA384-PSS" ${caConfig.root.algorithm==='RSA-SHA384-PSS'?'selected':''}>RSA-SHA384-PSS</option>
                  <option value="RSA-SHA512-PSS" ${caConfig.root.algorithm==='RSA-SHA512-PSS'?'selected':''}>RSA-SHA512-PSS</option>
                  <option value="ECDSA-SHA256" ${caConfig.root.algorithm==='ECDSA-SHA256'?'selected':''}>ECDSA-SHA256</option>
                  <option value="ECDSA-SHA384" ${caConfig.root.algorithm==='ECDSA-SHA384'?'selected':''}>ECDSA-SHA384</option>
                </select>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Validity Period (days)</label>
                <input type="number" class="form-control" name="root.validityDays" value="${caConfig.root.validityDays}" />
                <small class="text-muted">${(caConfig.root.validityDays/365).toFixed(1)} years</small>
              </div>
            </div>

            <h6 class="mt-4 mb-3">Intermediate CA</h6>
            <div class="row">
              <div class="col-md-3 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="intermediate.enabled" ${caConfig.intermediate.enabled?'checked':''} />
                  <label class="form-check-label">Enable Intermediate CA</label>
                </div>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Key Size (bits)</label>
                <select class="form-select" name="intermediate.keySize">
                  <option value="2048" ${caConfig.intermediate.keySize===2048?'selected':''}>2048</option>
                  <option value="4096" ${caConfig.intermediate.keySize===4096?'selected':''}>4096</option>
                </select>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Validity (days)</label>
                <input type="number" class="form-control" name="intermediate.validityDays" value="${caConfig.intermediate.validityDays}" />
                <small class="text-muted">${(caConfig.intermediate.validityDays/365).toFixed(1)} years</small>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Path Length</label>
                <input type="number" class="form-control" name="intermediate.pathLength" value="${caConfig.intermediate.pathLength}" min="0" max="5" />
                <small class="text-muted">Max subordinate CAs</small>
              </div>
            </div>

            <h6 class="mt-4 mb-3">End Entity Certificates</h6>
            <div class="row">
              <div class="col-md-4 mb-3">
                <label class="form-label">Default Key Size</label>
                <select class="form-select" name="entity.keySize">
                  <option value="2048" ${caConfig.entity.keySize===2048?'selected':''}>2048</option>
                  <option value="3072" ${caConfig.entity.keySize===3072?'selected':''}>3072</option>
                  <option value="4096" ${caConfig.entity.keySize===4096?'selected':''}>4096</option>
                </select>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Default Validity (days)</label>
                <input type="number" class="form-control" name="entity.validityDays" value="${caConfig.entity.validityDays}" />
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Auto-Renewal Before (days)</label>
                <input type="number" class="form-control" name="entity.autoRenewalDays" value="${caConfig.entity.autoRenewalDays}" />
              </div>
            </div>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="entity.requireApproval" ${caConfig.entity.requireApproval?'checked':''} />
                  <label class="form-check-label">Require Manual Approval</label>
                </div>
                <small class="text-muted">All certificate requests need admin approval</small>
              </div>
            </div>
          </div>

          <!-- Certificate Types -->
          <div class="tab-pane fade" id="ca-certificates" role="tabpanel">
            <h5 class="mb-3">Certificate Type Configuration</h5>

            <!-- Server Certificates -->
            <div class="card mb-3">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-server"></i> Server Certificates (TLS/SSL)</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="types.server.enabled" ${caConfig.types.server.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Default Validity (days)</label>
                    <input type="number" class="form-control" name="types.server.defaultValidity" value="${caConfig.types.server.defaultValidity}" />
                  </div>
                  <div class="col-md-4 mb-3">
                    <div class="form-check form-switch" style="margin-top:2rem">
                      <input class="form-check-input" type="checkbox" name="types.server.requireDnsValidation" ${caConfig.types.server.requireDnsValidation?'checked':''} />
                      <label class="form-check-label">Require DNS Validation</label>
                    </div>
                  </div>
                  <div class="col-md-4 mb-3">
                    <div class="form-check form-switch" style="margin-top:2rem">
                      <input class="form-check-input" type="checkbox" name="types.server.allowWildcard" ${caConfig.types.server.allowWildcard?'checked':''} />
                      <label class="form-check-label">Allow Wildcard (*.example.com)</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Client Certificates -->
            <div class="card mb-3">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-person-badge"></i> Client Certificates</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="types.client.enabled" ${caConfig.types.client.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Default Validity (days)</label>
                    <input type="number" class="form-control" name="types.client.defaultValidity" value="${caConfig.types.client.defaultValidity}" />
                    <small class="text-muted">${(caConfig.types.client.defaultValidity/365).toFixed(1)} years</small>
                  </div>
                  <div class="col-md-6 mb-3">
                    <div class="form-check form-switch" style="margin-top:2rem">
                      <input class="form-check-input" type="checkbox" name="types.client.requireEmailValidation" ${caConfig.types.client.requireEmailValidation?'checked':''} />
                      <label class="form-check-label">Require Email Validation</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Code Signing Certificates -->
            <div class="card mb-3">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-code-square"></i> Code Signing Certificates</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="types.codeSigning.enabled" ${caConfig.types.codeSigning.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Default Validity (days)</label>
                    <input type="number" class="form-control" name="types.codeSigning.defaultValidity" value="${caConfig.types.codeSigning.defaultValidity}" />
                    <small class="text-muted">${(caConfig.types.codeSigning.defaultValidity/365).toFixed(1)} years</small>
                  </div>
                  <div class="col-md-4 mb-3">
                    <div class="form-check form-switch" style="margin-top:2rem">
                      <input class="form-check-input" type="checkbox" name="types.codeSigning.requireExtendedValidation" ${caConfig.types.codeSigning.requireExtendedValidation?'checked':''} />
                      <label class="form-check-label">Require EV</label>
                    </div>
                  </div>
                  <div class="col-md-4 mb-3">
                    <div class="form-check form-switch" style="margin-top:2rem">
                      <input class="form-check-input" type="checkbox" name="types.codeSigning.timestampingEnabled" ${caConfig.types.codeSigning.timestampingEnabled?'checked':''} />
                      <label class="form-check-label">Timestamping</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- SAN Certificates -->
            <div class="card">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-diagram-3"></i> Subject Alternative Names (SAN)</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="types.san.enabled" ${caConfig.types.san.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Max SANs per Certificate</label>
                    <input type="number" class="form-control" name="types.san.maxSans" value="${caConfig.types.san.maxSans}" />
                  </div>
                  <div class="col-md-4 mb-3">
                    <div class="form-check form-switch" style="margin-top:2rem">
                      <input class="form-check-input" type="checkbox" name="types.san.allowIpAddresses" ${caConfig.types.san.allowIpAddresses?'checked':''} />
                      <label class="form-check-label">Allow IP Addresses</label>
                    </div>
                  </div>
                  <div class="col-md-4 mb-3">
                    <div class="form-check form-switch" style="margin-top:2rem">
                      <input class="form-check-input" type="checkbox" name="types.san.allowEmailAddresses" ${caConfig.types.san.allowEmailAddresses?'checked':''} />
                      <label class="form-check-label">Allow Email Addresses</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- DNS Configuration -->
          <div class="tab-pane fade" id="ca-dns" role="tabpanel">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
              <h5 style="margin:0">DNS-Based Validation</h5>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" name="dns.enabled" ${caConfig.dns.enabled?'checked':''} />
                <label class="form-check-label">DNS Validation Enabled</label>
              </div>
            </div>

            <div class="row mb-3">
              <div class="col-md-6 mb-3">
                <label class="form-label">DNS Provider</label>
                <select class="form-select" name="dns.provider">
                  <option value="route53" ${caConfig.dns.provider==='route53'?'selected':''}>AWS Route53</option>
                  <option value="cloudflare" ${caConfig.dns.provider==='cloudflare'?'selected':''}>Cloudflare</option>
                  <option value="manual" ${caConfig.dns.provider==='manual'?'selected':''}>Manual DNS</option>
                </select>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Validation Method</label>
                <select class="form-select" name="dns.validationMethod">
                  <option value="dns-01" ${caConfig.dns.validationMethod==='dns-01'?'selected':''}>DNS-01 (TXT Record)</option>
                  <option value="http-01" ${caConfig.dns.validationMethod==='http-01'?'selected':''}>HTTP-01 (Web Server)</option>
                </select>
              </div>
            </div>

            <div class="row">
              <div class="col-md-12 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="dns.autoValidation" ${caConfig.dns.autoValidation?'checked':''} />
                  <label class="form-check-label">Automatic Validation</label>
                </div>
                <small class="text-muted">Automatically create and verify DNS records</small>
              </div>
            </div>

            <!-- Route53 Settings -->
            <div class="card mb-3">
              <div class="card-header"><strong>AWS Route53 Configuration</strong></div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-4 mb-3">
                    <label class="form-label">AWS Region</label>
                    <input type="text" class="form-control" name="dns.route53.region" value="${caConfig.dns.route53.region}" placeholder="us-east-1" />
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Access Key ID</label>
                    <input type="text" class="form-control" name="dns.route53.accessKeyId" value="${caConfig.dns.route53.accessKeyId}" />
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Secret Access Key</label>
                    <input type="password" class="form-control" name="dns.route53.secretAccessKey" value="${caConfig.dns.route53.secretAccessKey}" />
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Hosted Zone ID</label>
                  <input type="text" class="form-control" name="dns.route53.hostedZoneId" value="${caConfig.dns.route53.hostedZoneId}" placeholder="Z1234567890ABC" />
                </div>
              </div>
            </div>

            <!-- Cloudflare Settings -->
            <div class="card mb-3">
              <div class="card-header"><strong>Cloudflare Configuration</strong></div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">API Token</label>
                    <input type="password" class="form-control" name="dns.cloudflare.apiToken" value="${caConfig.dns.cloudflare.apiToken}" />
                    <small class="text-muted">Requires Zone:DNS:Edit permission</small>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Zone ID</label>
                    <input type="text" class="form-control" name="dns.cloudflare.zoneId" value="${caConfig.dns.cloudflare.zoneId}" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Manual DNS Settings -->
            <div class="card">
              <div class="card-header"><strong>Manual DNS Configuration</strong></div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Record TTL (seconds)</label>
                    <input type="number" class="form-control" name="dns.manual.ttl" value="${caConfig.dns.manual.ttl}" />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Verification Delay (seconds)</label>
                    <input type="number" class="form-control" name="dns.manual.verifyDelay" value="${caConfig.dns.manual.verifyDelay}" />
                    <small class="text-muted">Wait time after DNS record creation</small>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- OCSP Configuration -->
          <div class="tab-pane fade" id="ca-ocsp" role="tabpanel">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
              <h5 style="margin:0">OCSP (Online Certificate Status Protocol)</h5>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" name="ocsp.enabled" ${caConfig.ocsp.enabled?'checked':''} />
                <label class="form-check-label">OCSP Enabled</label>
              </div>
            </div>

            <h6 class="mb-3">OCSP Responder Settings</h6>
            <div class="row">
              <div class="col-md-4 mb-3">
                <label class="form-label">OCSP Port</label>
                <input type="number" class="form-control" name="ocsp.port" value="${caConfig.ocsp.port}" />
              </div>
              <div class="col-md-8 mb-3">
                <label class="form-label">OCSP URL</label>
                <input type="text" class="form-control" name="ocsp.url" value="${caConfig.ocsp.url}" placeholder="http://ocsp.example.com" />
                <small class="text-muted">Public OCSP responder URL</small>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Responder Certificate Validity (days)</label>
                <input type="number" class="form-control" name="ocsp.responderCertValidity" value="${caConfig.ocsp.responderCertValidity}" />
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Max Request Size (bytes)</label>
                <input type="number" class="form-control" name="ocsp.maxRequestSize" value="${caConfig.ocsp.maxRequestSize}" />
              </div>
            </div>

            <h6 class="mt-4 mb-3">Performance Settings</h6>
            <div class="row">
              <div class="col-md-4 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="ocsp.batchEnabled" ${caConfig.ocsp.batchEnabled?'checked':''} />
                  <label class="form-check-label">Batch Requests</label>
                </div>
                <small class="text-muted">Process multiple OCSP requests together</small>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Batch Timeout (ms)</label>
                <input type="number" class="form-control" name="ocsp.batchTimeout" value="${caConfig.ocsp.batchTimeout}" />
              </div>
            </div>

            <h6 class="mt-4 mb-3">Caching Settings</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="ocsp.cacheEnabled" ${caConfig.ocsp.cacheEnabled?'checked':''} />
                  <label class="form-check-label">Enable Response Caching</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Cache TTL (seconds)</label>
                <input type="number" class="form-control" name="ocsp.cacheTtl" value="${caConfig.ocsp.cacheTtl}" />
              </div>
            </div>

            <h6 class="mt-4 mb-3">Security Settings</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="ocsp.nonceRequired" ${caConfig.ocsp.nonceRequired?'checked':''} />
                  <label class="form-check-label">Require Nonce</label>
                </div>
                <small class="text-muted">Prevents replay attacks</small>
              </div>
            </div>
          </div>

          <!-- CRL Configuration -->
          <div class="tab-pane fade" id="ca-crl" role="tabpanel">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
              <h5 style="margin:0">CRL (Certificate Revocation List)</h5>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" name="crl.enabled" ${caConfig.crl.enabled?'checked':''} />
                <label class="form-check-label">CRL Enabled</label>
              </div>
            </div>

            <h6 class="mb-3">CRL Publishing Settings</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">CRL URL</label>
                <input type="text" class="form-control" name="crl.url" value="${caConfig.crl.url}" placeholder="http://crl.example.com/ca.crl" />
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Update Interval (seconds)</label>
                <input type="number" class="form-control" name="crl.updateInterval" value="${caConfig.crl.updateInterval}" />
                <small class="text-muted">${(caConfig.crl.updateInterval/3600).toFixed(1)} hours</small>
              </div>
            </div>

            <div class="row">
              <div class="col-md-4 mb-3">
                <label class="form-label">Next Update (days)</label>
                <input type="number" class="form-control" name="crl.nextUpdateDays" value="${caConfig.crl.nextUpdateDays}" />
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">CRL Number</label>
                <input type="number" class="form-control" name="crl.crlNumber" value="${caConfig.crl.crlNumber}" readonly />
                <small class="text-muted">Auto-incremented</small>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Compression</label>
                <select class="form-select" name="crl.compression">
                  <option value="none" ${caConfig.crl.compression==='none'?'selected':''}>None</option>
                  <option value="gzip" ${caConfig.crl.compression==='gzip'?'selected':''}>GZip</option>
                  <option value="deflate" ${caConfig.crl.compression==='deflate'?'selected':''}>Deflate</option>
                </select>
              </div>
            </div>

            <h6 class="mt-4 mb-3">Distribution Points</h6>
            <div class="mb-3">
              <label class="form-label">CRL Distribution Points (one per line)</label>
              <textarea class="form-control" name="crl.distributionPoints" rows="4">${caConfig.crl.distributionPoints.join('\n')}</textarea>
              <small class="text-muted">Multiple URLs for redundancy</small>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="crl.includeReasons" ${caConfig.crl.includeReasons?'checked':''} />
                  <label class="form-check-label">Include Revocation Reasons</label>
                </div>
              </div>
            </div>
          </div>

          <!-- Storage Configuration -->
          <div class="tab-pane fade" id="ca-storage" role="tabpanel">
            <h5 class="mb-3">Certificate Storage Configuration</h5>

            <div class="mb-3">
              <label class="form-label">Primary Storage Type</label>
              <select class="form-select" name="storage.type">
                <option value="disk" ${caConfig.storage.type==='disk'?'selected':''}>Disk Storage</option>
                <option value="s3" ${caConfig.storage.type==='s3'?'selected':''}>AWS S3</option>
                <option value="postgresql" ${caConfig.storage.type==='postgresql'?'selected':''}>PostgreSQL</option>
              </select>
            </div>

            <!-- Disk Storage -->
            <div class="card mb-3">
              <div class="card-header"><strong><i class="bi bi-hdd"></i> Disk Storage</strong></div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Base Path</label>
                    <input type="text" class="form-control" name="storage.disk.basePath" value="${caConfig.storage.disk.basePath}" />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Certificates Path</label>
                    <input type="text" class="form-control" name="storage.disk.certsPath" value="${caConfig.storage.disk.certsPath}" />
                  </div>
                </div>
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Private Keys Path</label>
                    <input type="text" class="form-control" name="storage.disk.keysPath" value="${caConfig.storage.disk.keysPath}" />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">CRL Path</label>
                    <input type="text" class="form-control" name="storage.disk.crlPath" value="${caConfig.storage.disk.crlPath}" />
                  </div>
                </div>

                <h6 class="mt-4 mb-3">Backup Settings</h6>
                <div class="row">
                  <div class="col-md-4 mb-3">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" name="storage.disk.backupEnabled" ${caConfig.storage.disk.backupEnabled?'checked':''} />
                      <label class="form-check-label">Enable Backups</label>
                    </div>
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Backup Path</label>
                    <input type="text" class="form-control" name="storage.disk.backupPath" value="${caConfig.storage.disk.backupPath}" />
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Backup Schedule (cron)</label>
                    <input type="text" class="form-control" name="storage.disk.backupSchedule" value="${caConfig.storage.disk.backupSchedule}" placeholder="0 2 * * *" />
                    <small class="text-muted">Daily at 2 AM</small>
                  </div>
                </div>
              </div>
            </div>

            <!-- S3 Storage -->
            <div class="card mb-3">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-cloud"></i> AWS S3 Storage</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="storage.s3.enabled" ${caConfig.storage.s3.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">AWS Region</label>
                    <input type="text" class="form-control" name="storage.s3.region" value="${caConfig.storage.s3.region}" placeholder="us-east-1" />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Bucket Name</label>
                    <input type="text" class="form-control" name="storage.s3.bucket" value="${caConfig.storage.s3.bucket}" />
                  </div>
                </div>
                <div class="row">
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Bucket Prefix</label>
                    <input type="text" class="form-control" name="storage.s3.prefix" value="${caConfig.storage.s3.prefix}" placeholder="ca/" />
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Access Key ID</label>
                    <input type="text" class="form-control" name="storage.s3.accessKeyId" value="${caConfig.storage.s3.accessKeyId}" />
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Secret Access Key</label>
                    <input type="password" class="form-control" name="storage.s3.secretAccessKey" value="${caConfig.storage.s3.secretAccessKey}" />
                  </div>
                </div>
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" name="storage.s3.encryption" ${caConfig.storage.s3.encryption?'checked':''} />
                      <label class="form-check-label">Server-Side Encryption (SSE)</label>
                    </div>
                  </div>
                  <div class="col-md-6 mb-3">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" name="storage.s3.versioningEnabled" ${caConfig.storage.s3.versioningEnabled?'checked':''} />
                      <label class="form-check-label">Enable Versioning</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- PostgreSQL Storage -->
            <div class="card">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-database"></i> PostgreSQL Storage</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="storage.postgresql.enabled" ${caConfig.storage.postgresql.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-4 mb-3">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" name="storage.postgresql.storeCertificates" ${caConfig.storage.postgresql.storeCertificates?'checked':''} />
                      <label class="form-check-label">Store Certificates</label>
                    </div>
                  </div>
                  <div class="col-md-4 mb-3">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" name="storage.postgresql.storeKeys" ${caConfig.storage.postgresql.storeKeys?'checked':''} />
                      <label class="form-check-label">Store Private Keys</label>
                    </div>
                    <small class="text-muted text-danger">Not recommended for security</small>
                  </div>
                  <div class="col-md-4 mb-3">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" name="storage.postgresql.compression" ${caConfig.storage.postgresql.compression?'checked':''} />
                      <label class="form-check-label">Compress Data</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- LDAP Configuration -->
          <div class="tab-pane fade" id="ca-ldap" role="tabpanel">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
              <h5 style="margin:0">LDAP/Directory Integration</h5>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" name="ldap.enabled" ${caConfig.ldap.enabled?'checked':''} />
                <label class="form-check-label">LDAP Enabled</label>
              </div>
            </div>

            <h6 class="mb-3">LDAP Connection Settings</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">LDAP URL</label>
                <input type="text" class="form-control" name="ldap.url" value="${caConfig.ldap.url}" placeholder="ldap://localhost:389" />
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Base DN</label>
                <input type="text" class="form-control" name="ldap.baseDn" value="${caConfig.ldap.baseDn}" placeholder="ou=certificates,dc=exprsn,dc=io" />
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Bind DN</label>
                <input type="text" class="form-control" name="ldap.bindDn" value="${caConfig.ldap.bindDn}" placeholder="cn=admin,dc=exprsn,dc=io" />
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Bind Password</label>
                <input type="password" class="form-control" name="ldap.bindPassword" value="${caConfig.ldap.bindPassword}" />
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">Search Filter</label>
              <input type="text" class="form-control" name="ldap.searchFilter" value="${caConfig.ldap.searchFilter}" placeholder="(cn={username})" />
              <small class="text-muted">Use {username} as placeholder</small>
            </div>

            <h6 class="mt-4 mb-3">Publishing Settings</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="ldap.publishCertificates" ${caConfig.ldap.publishCertificates?'checked':''} />
                  <label class="form-check-label">Publish Certificates to LDAP</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="ldap.publishCrl" ${caConfig.ldap.publishCrl?'checked':''} />
                  <label class="form-check-label">Publish CRL to LDAP</label>
                </div>
              </div>
            </div>

            <h6 class="mt-4 mb-3">TLS/SSL Settings</h6>
            <div class="row">
              <div class="col-md-3 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="ldap.tlsEnabled" ${caConfig.ldap.tlsEnabled?'checked':''} />
                  <label class="form-check-label">Enable TLS</label>
                </div>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">TLS Certificate</label>
                <input type="text" class="form-control" name="ldap.tlsCertPath" value="${caConfig.ldap.tlsCertPath}" placeholder="/path/to/cert.pem" />
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">TLS Key</label>
                <input type="text" class="form-control" name="ldap.tlsKeyPath" value="${caConfig.ldap.tlsKeyPath}" placeholder="/path/to/key.pem" />
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">TLS CA</label>
                <input type="text" class="form-control" name="ldap.tlsCaPath" value="${caConfig.ldap.tlsCaPath}" placeholder="/path/to/ca.pem" />
              </div>
            </div>
          </div>

          <!-- Revocation Management -->
          <div class="tab-pane fade" id="ca-revocation" role="tabpanel">
            <h5 class="mb-3">Certificate Revocation Management</h5>

            <h6 class="mb-3">Revocation Policy</h6>
            <div class="row">
              <div class="col-md-12 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="revocation.reasonRequired" ${caConfig.revocation.reasonRequired?'checked':''} />
                  <label class="form-check-label">Require Revocation Reason</label>
                </div>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">Allowed Revocation Reasons</label>
              <div class="row">
                ${caConfig.revocation.allowedReasons.map(reason => `
                  <div class="col-md-4">
                    <div class="form-check">
                      <input class="form-check-input" type="checkbox" name="revocation.allowedReasons.${reason}" checked />
                      <label class="form-check-label">${reason}</label>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>

            <h6 class="mt-4 mb-3">Notification Settings</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="revocation.notificationEnabled" ${caConfig.revocation.notificationEnabled?'checked':''} />
                  <label class="form-check-label">Email Notifications</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Notification Email</label>
                <input type="email" class="form-control" name="revocation.notificationEmail" value="${caConfig.revocation.notificationEmail}" />
              </div>
            </div>

            <h6 class="mt-4 mb-3">Grace Period & Auto-Revocation</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Grace Period (hours)</label>
                <input type="number" class="form-control" name="revocation.gracePeriodHours" value="${caConfig.revocation.gracePeriodHours}" />
                <small class="text-muted">Delay before revocation takes effect</small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Auto-Revoke Suspended After (days)</label>
                <input type="number" class="form-control" name="revocation.autoRevokeDays" value="${caConfig.revocation.autoRevokeDays}" />
              </div>
            </div>

            <div class="row">
              <div class="col-md-12 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="revocation.autoRevokeSuspended" ${caConfig.revocation.autoRevokeSuspended?'checked':''} />
                  <label class="form-check-label">Auto-Revoke Suspended Certificates</label>
                </div>
                <small class="text-muted">Automatically revoke certificates that have been suspended beyond the grace period</small>
              </div>
            </div>
          </div>

          <!-- Security Settings -->
          <div class="tab-pane fade" id="ca-security" role="tabpanel">
            <h5 class="mb-3">Security & Validation Settings</h5>

            <h6 class="mb-3">Key Generation & Validation</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.requireStrongKeys" ${caConfig.security.requireStrongKeys?'checked':''} />
                  <label class="form-check-label">Require Strong Keys</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Minimum Key Size (bits)</label>
                <input type="number" class="form-control" name="security.minKeySize" value="${caConfig.security.minKeySize}" />
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.allowWeakAlgorithms" ${caConfig.security.allowWeakAlgorithms?'checked':''} />
                  <label class="form-check-label">Allow Weak Algorithms</label>
                </div>
                <small class="text-muted text-danger">Not recommended - allows MD5, SHA1</small>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.keyGenerationOnServer" ${caConfig.security.keyGenerationOnServer?'checked':''} />
                  <label class="form-check-label">Server-Side Key Generation</label>
                </div>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.privateKeyEncryption" ${caConfig.security.privateKeyEncryption?'checked':''} />
                  <label class="form-check-label">Encrypt Private Keys at Rest</label>
                </div>
              </div>
            </div>

            <h6 class="mt-4 mb-3">Hardware Security Module (HSM)</h6>
            <div class="row">
              <div class="col-md-3 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.hsm.enabled" ${caConfig.security.hsm.enabled?'checked':''} />
                  <label class="form-check-label">Enable HSM</label>
                </div>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">HSM Type</label>
                <select class="form-select" name="security.hsm.type">
                  <option value="softhsm" ${caConfig.security.hsm.type==='softhsm'?'selected':''}>SoftHSM</option>
                  <option value="pkcs11" ${caConfig.security.hsm.type==='pkcs11'?'selected':''}>PKCS#11</option>
                  <option value="aws-cloudhsm" ${caConfig.security.hsm.type==='aws-cloudhsm'?'selected':''}>AWS CloudHSM</option>
                </select>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Slot ID</label>
                <input type="number" class="form-control" name="security.hsm.slotId" value="${caConfig.security.hsm.slotId}" />
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">PIN</label>
                <input type="password" class="form-control" name="security.hsm.pin" value="${caConfig.security.hsm.pin}" />
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label">Key Label</label>
              <input type="text" class="form-control" name="security.hsm.keyLabel" value="${caConfig.security.hsm.keyLabel}" />
            </div>

            <h6 class="mt-4 mb-3">Rate Limiting</h6>
            <div class="row">
              <div class="col-md-3 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.rateLimiting.enabled" ${caConfig.security.rateLimiting.enabled?'checked':''} />
                  <label class="form-check-label">Enable Rate Limiting</label>
                </div>
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Max Certs/Day</label>
                <input type="number" class="form-control" name="security.rateLimiting.maxCertsPerDay" value="${caConfig.security.rateLimiting.maxCertsPerDay}" />
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Max Certs/Hour</label>
                <input type="number" class="form-control" name="security.rateLimiting.maxCertsPerHour" value="${caConfig.security.rateLimiting.maxCertsPerHour}" />
              </div>
              <div class="col-md-3 mb-3">
                <label class="form-label">Max Certs/Minute</label>
                <input type="number" class="form-control" name="security.rateLimiting.maxCertsPerMinute" value="${caConfig.security.rateLimiting.maxCertsPerMinute}" />
              </div>
            </div>

            <h6 class="mt-4 mb-3">Audit Logging</h6>
            <div class="row">
              <div class="col-md-3 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.auditLogging.enabled" ${caConfig.security.auditLogging.enabled?'checked':''} />
                  <label class="form-check-label">Enable Audit Logging</label>
                </div>
              </div>
              <div class="col-md-3 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.auditLogging.logIssuance" ${caConfig.security.auditLogging.logIssuance?'checked':''} />
                  <label class="form-check-label">Log Issuance</label>
                </div>
              </div>
              <div class="col-md-3 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.auditLogging.logRevocation" ${caConfig.security.auditLogging.logRevocation?'checked':''} />
                  <label class="form-check-label">Log Revocation</label>
                </div>
              </div>
              <div class="col-md-3 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.auditLogging.logValidation" ${caConfig.security.auditLogging.logValidation?'checked':''} />
                  <label class="form-check-label">Log Validation</label>
                </div>
              </div>
            </div>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Log Retention (days)</label>
                <input type="number" class="form-control" name="security.auditLogging.retentionDays" value="${caConfig.security.auditLogging.retentionDays}" />
              </div>
            </div>
          </div>

          <!-- Key Management -->
          <div class="tab-pane fade" id="ca-keys" role="tabpanel">
            <h5 class="mb-3">Key Management & Rotation</h5>

            <h6 class="mb-3">Key Rotation</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="keyManagement.rotation.enabled" ${caConfig.keyManagement.rotation.enabled?'checked':''} />
                  <label class="form-check-label">Enable Key Rotation</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="keyManagement.rotation.autoRotate" ${caConfig.keyManagement.rotation.autoRotate?'checked':''} />
                  <label class="form-check-label">Automatic Rotation</label>
                </div>
              </div>
            </div>

            <div class="row">
              <div class="col-md-4 mb-3">
                <label class="form-label">Rotation Period (days)</label>
                <input type="number" class="form-control" name="keyManagement.rotation.rotationPeriodDays" value="${caConfig.keyManagement.rotation.rotationPeriodDays}" />
                <small class="text-muted">${(caConfig.keyManagement.rotation.rotationPeriodDays/365).toFixed(1)} years</small>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Overlap Period (days)</label>
                <input type="number" class="form-control" name="keyManagement.rotation.overlapPeriodDays" value="${caConfig.keyManagement.rotation.overlapPeriodDays}" />
                <small class="text-muted">Both keys valid during overlap</small>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Notify Before (days)</label>
                <input type="number" class="form-control" name="keyManagement.rotation.notifyBeforeDays" value="${caConfig.keyManagement.rotation.notifyBeforeDays}" />
              </div>
            </div>

            <h6 class="mt-4 mb-3">Key Backup</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="keyManagement.backup.enabled" ${caConfig.keyManagement.backup.enabled?'checked':''} />
                  <label class="form-check-label">Enable Key Backups</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="keyManagement.backup.encrypted" ${caConfig.keyManagement.backup.encrypted?'checked':''} />
                  <label class="form-check-label">Encrypt Backups</label>
                </div>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Backup Location</label>
                <input type="text" class="form-control" name="keyManagement.backup.location" value="${caConfig.keyManagement.backup.location}" />
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Backup Schedule (cron)</label>
                <input type="text" class="form-control" name="keyManagement.backup.schedule" value="${caConfig.keyManagement.backup.schedule}" placeholder="0 3 * * 0" />
                <small class="text-muted">Weekly on Sunday at 3 AM</small>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Retention Count</label>
                <input type="number" class="form-control" name="keyManagement.backup.retentionCount" value="${caConfig.keyManagement.backup.retentionCount}" />
                <small class="text-muted">Number of backups to keep</small>
              </div>
            </div>

            <h6 class="mt-4 mb-3">Key Escrow</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="keyManagement.escrow.enabled" ${caConfig.keyManagement.escrow.enabled?'checked':''} />
                  <label class="form-check-label">Enable Key Escrow</label>
                </div>
                <small class="text-muted">Split key material across multiple escrow agents</small>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="keyManagement.escrow.keyEscrowRequired" ${caConfig.keyManagement.escrow.keyEscrowRequired?'checked':''} />
                  <label class="form-check-label">Require Key Escrow</label>
                </div>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Escrow Threshold</label>
                <input type="number" class="form-control" name="keyManagement.escrow.threshold" value="${caConfig.keyManagement.escrow.threshold}" min="2" />
                <small class="text-muted">Minimum agents required to recover key</small>
              </div>
            </div>
          </div>

        </div>
      </form>

      <!-- Save Button (Fixed at Bottom) -->
      <div style="margin-top:2rem;padding-top:1rem;border-top:1px solid #dee2e6;display:flex;justify-content:flex-end;gap:1rem">
        <button type="button" class="btn btn-outline-secondary" onclick="loadPage('services/ca')">
          <i class="bi bi-x-circle"></i> Cancel
        </button>
        <button type="button" class="btn btn-primary" onclick="saveCAConfig()">
          <i class="bi bi-save"></i> Save All Changes
        </button>
      </div>
    </div>`;
  },

  authSettings: async (config) => {
    const authConfig = config.config || {
      // JWT Configuration
      jwt: {
        accessTokenExpiry: '1h',
        refreshTokenExpiry: '7d',
        algorithm: 'RS256',
        issuer: 'exprsn-auth',
        audience: 'exprsn-services',
        clockTolerance: 60
      },
      // OAuth2 Configuration
      oauth2: {
        enabled: true,
        providers: {
          google: {
            enabled: false,
            clientId: '',
            clientSecret: '***hidden***',
            scopes: ['openid', 'email', 'profile'],
            callbackUrl: 'http://localhost:3001/auth/oauth2/google/callback'
          },
          github: {
            enabled: false,
            clientId: '',
            clientSecret: '***hidden***',
            scopes: ['user:email', 'read:user'],
            callbackUrl: 'http://localhost:3001/auth/oauth2/github/callback'
          },
          microsoft: {
            enabled: false,
            clientId: '',
            clientSecret: '***hidden***',
            tenant: 'common',
            scopes: ['openid', 'email', 'profile'],
            callbackUrl: 'http://localhost:3001/auth/oauth2/microsoft/callback'
          }
        },
        allowAutoRegistration: true,
        requireEmailVerification: true
      },
      // SAML Configuration
      saml: {
        enabled: false,
        entryPoint: 'https://idp.example.com/saml/sso',
        issuer: 'exprsn-auth',
        callbackUrl: 'http://localhost:3001/auth/saml/callback',
        cert: '***hidden***',
        privateKey: '***hidden***',
        signatureAlgorithm: 'sha256',
        attributeMapping: {
          email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
          firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
          lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
          username: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'
        }
      },
      // MFA Configuration
      mfa: {
        enabled: true,
        enforcement: 'optional',
        methods: {
          totp: {
            enabled: true,
            issuer: 'Exprsn',
            window: 1,
            step: 30
          },
          sms: {
            enabled: false,
            provider: 'twilio',
            twilioAccountSid: '',
            twilioAuthToken: '***hidden***',
            twilioPhoneNumber: ''
          },
          email: {
            enabled: true,
            tokenExpiry: 600
          },
          backupCodes: {
            enabled: true,
            count: 10
          }
        },
        gracePeriodDays: 7,
        rememberDeviceDays: 30
      },
      // Session Management
      session: {
        timeout: 3600,
        slidingExpiration: true,
        maxConcurrentSessions: 5,
        rememberMe: {
          enabled: true,
          duration: '30d'
        },
        cookieName: 'exprsn.sid',
        cookieSecure: true,
        cookieSameSite: 'lax',
        ipBinding: false,
        userAgentBinding: false
      },
      // Password Policies
      password: {
        minLength: 8,
        maxLength: 128,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        preventCommonPasswords: true,
        preventUserInfo: true,
        expirationDays: 90,
        historyCount: 5,
        lockoutThreshold: 5,
        lockoutDuration: 900
      },
      // Rate Limiting
      rateLimit: {
        login: {
          windowMs: 900000,
          maxAttempts: 5,
          skipSuccessful: true
        },
        registration: {
          windowMs: 3600000,
          maxAttempts: 3
        },
        passwordReset: {
          windowMs: 3600000,
          maxAttempts: 3
        },
        tokenRefresh: {
          windowMs: 60000,
          maxAttempts: 10
        }
      },
      // Security Settings
      security: {
        requireEmailVerification: true,
        allowPasswordReset: true,
        allowSelfRegistration: true,
        allowSocialLogin: true,
        enforceStrongPasswords: true,
        logSecurityEvents: true,
        notifyPasswordChange: true,
        notifyNewDevice: true,
        ipWhitelist: [],
        ipBlacklist: [],
        allowedOrigins: ['http://localhost:3000', 'http://localhost:3001']
      }
    };

    return `<div style="background:white;padding:2rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem">
        <h3 style="margin:0">Authentication Service Configuration</h3>
        <button type="button" class="btn btn-primary" onclick="saveAuthConfig()">
          <i class="bi bi-save"></i> Save All Changes
        </button>
      </div>

      <!-- Configuration Tabs -->
      <ul class="nav nav-tabs" id="auth-config-tabs" role="tablist">
        <li class="nav-item" role="presentation">
          <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#auth-jwt" type="button">
            <i class="bi bi-key"></i> JWT
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#auth-oauth2" type="button">
            <i class="bi bi-share"></i> OAuth2
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#auth-saml" type="button">
            <i class="bi bi-shield-lock"></i> SAML
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#auth-mfa" type="button">
            <i class="bi bi-phone"></i> MFA
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#auth-session" type="button">
            <i class="bi bi-clock-history"></i> Sessions
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#auth-password" type="button">
            <i class="bi bi-lock"></i> Passwords
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#auth-ratelimit" type="button">
            <i class="bi bi-speedometer"></i> Rate Limits
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#auth-security" type="button">
            <i class="bi bi-shield-check"></i> Security
          </button>
        </li>
      </ul>

      <form id="auth-config-form">
        <div class="tab-content" id="auth-config-tab-content" style="margin-top:1.5rem">

          <!-- JWT Configuration -->
          <div class="tab-pane fade show active" id="auth-jwt" role="tabpanel">
            <h5 class="mb-3">JWT Token Settings</h5>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Access Token Expiry</label>
                <input type="text" class="form-control" name="jwt.accessTokenExpiry" value="${authConfig.jwt.accessTokenExpiry}" />
                <small class="text-muted">Format: 1h, 30m, 7d</small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Refresh Token Expiry</label>
                <input type="text" class="form-control" name="jwt.refreshTokenExpiry" value="${authConfig.jwt.refreshTokenExpiry}" />
                <small class="text-muted">Format: 7d, 30d, 90d</small>
              </div>
            </div>
            <div class="row">
              <div class="col-md-4 mb-3">
                <label class="form-label">Algorithm</label>
                <select class="form-select" name="jwt.algorithm">
                  <option value="RS256" ${authConfig.jwt.algorithm==='RS256'?'selected':''}>RS256 (Recommended)</option>
                  <option value="HS256" ${authConfig.jwt.algorithm==='HS256'?'selected':''}>HS256</option>
                  <option value="ES256" ${authConfig.jwt.algorithm==='ES256'?'selected':''}>ES256</option>
                </select>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Issuer</label>
                <input type="text" class="form-control" name="jwt.issuer" value="${authConfig.jwt.issuer}" />
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Audience</label>
                <input type="text" class="form-control" name="jwt.audience" value="${authConfig.jwt.audience}" />
              </div>
            </div>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Clock Tolerance (seconds)</label>
                <input type="number" class="form-control" name="jwt.clockTolerance" value="${authConfig.jwt.clockTolerance}" />
                <small class="text-muted">Allows for time differences between servers</small>
              </div>
            </div>
          </div>

          <!-- OAuth2 Configuration -->
          <div class="tab-pane fade" id="auth-oauth2" role="tabpanel">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
              <h5 style="margin:0">OAuth2 Provider Settings</h5>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" name="oauth2.enabled" ${authConfig.oauth2.enabled?'checked':''} />
                <label class="form-check-label">OAuth2 Enabled</label>
              </div>
            </div>

            <!-- Google Provider -->
            <div class="card mb-3">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-google"></i> Google OAuth</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="oauth2.providers.google.enabled" ${authConfig.oauth2.providers.google.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Client ID</label>
                    <input type="text" class="form-control" name="oauth2.providers.google.clientId" value="${authConfig.oauth2.providers.google.clientId}" placeholder="your-client-id.apps.googleusercontent.com" />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Client Secret</label>
                    <input type="password" class="form-control" name="oauth2.providers.google.clientSecret" value="${authConfig.oauth2.providers.google.clientSecret}" />
                  </div>
                </div>
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Callback URL</label>
                    <input type="text" class="form-control" name="oauth2.providers.google.callbackUrl" value="${authConfig.oauth2.providers.google.callbackUrl}" />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Scopes</label>
                    <input type="text" class="form-control" name="oauth2.providers.google.scopes" value="${authConfig.oauth2.providers.google.scopes.join(', ')}" />
                    <small class="text-muted">Comma-separated: openid, email, profile</small>
                  </div>
                </div>
              </div>
            </div>

            <!-- GitHub Provider -->
            <div class="card mb-3">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-github"></i> GitHub OAuth</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="oauth2.providers.github.enabled" ${authConfig.oauth2.providers.github.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Client ID</label>
                    <input type="text" class="form-control" name="oauth2.providers.github.clientId" value="${authConfig.oauth2.providers.github.clientId}" />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Client Secret</label>
                    <input type="password" class="form-control" name="oauth2.providers.github.clientSecret" value="${authConfig.oauth2.providers.github.clientSecret}" />
                  </div>
                </div>
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Callback URL</label>
                    <input type="text" class="form-control" name="oauth2.providers.github.callbackUrl" value="${authConfig.oauth2.providers.github.callbackUrl}" />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Scopes</label>
                    <input type="text" class="form-control" name="oauth2.providers.github.scopes" value="${authConfig.oauth2.providers.github.scopes.join(', ')}" />
                    <small class="text-muted">Comma-separated: user:email, read:user</small>
                  </div>
                </div>
              </div>
            </div>

            <!-- Microsoft Provider -->
            <div class="card mb-3">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-microsoft"></i> Microsoft OAuth</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="oauth2.providers.microsoft.enabled" ${authConfig.oauth2.providers.microsoft.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Client ID</label>
                    <input type="text" class="form-control" name="oauth2.providers.microsoft.clientId" value="${authConfig.oauth2.providers.microsoft.clientId}" />
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Client Secret</label>
                    <input type="password" class="form-control" name="oauth2.providers.microsoft.clientSecret" value="${authConfig.oauth2.providers.microsoft.clientSecret}" />
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Tenant</label>
                    <input type="text" class="form-control" name="oauth2.providers.microsoft.tenant" value="${authConfig.oauth2.providers.microsoft.tenant}" placeholder="common or tenant-id" />
                  </div>
                </div>
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Callback URL</label>
                    <input type="text" class="form-control" name="oauth2.providers.microsoft.callbackUrl" value="${authConfig.oauth2.providers.microsoft.callbackUrl}" />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Scopes</label>
                    <input type="text" class="form-control" name="oauth2.providers.microsoft.scopes" value="${authConfig.oauth2.providers.microsoft.scopes.join(', ')}" />
                    <small class="text-muted">Comma-separated: openid, email, profile</small>
                  </div>
                </div>
              </div>
            </div>

            <!-- OAuth2 Global Settings -->
            <div class="card">
              <div class="card-header"><strong>Global OAuth2 Settings</strong></div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" name="oauth2.allowAutoRegistration" ${authConfig.oauth2.allowAutoRegistration?'checked':''} />
                      <label class="form-check-label">Allow Auto-Registration</label>
                    </div>
                    <small class="text-muted">Create account automatically on first OAuth login</small>
                  </div>
                  <div class="col-md-6 mb-3">
                    <div class="form-check form-switch">
                      <input class="form-check-input" type="checkbox" name="oauth2.requireEmailVerification" ${authConfig.oauth2.requireEmailVerification?'checked':''} />
                      <label class="form-check-label">Require Email Verification</label>
                    </div>
                    <small class="text-muted">Verify email even for OAuth registrations</small>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SAML Configuration -->
          <div class="tab-pane fade" id="auth-saml" role="tabpanel">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
              <h5 style="margin:0">SAML 2.0 SSO Settings</h5>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" name="saml.enabled" ${authConfig.saml.enabled?'checked':''} />
                <label class="form-check-label">SAML Enabled</label>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">IdP Entry Point (SSO URL)</label>
                <input type="text" class="form-control" name="saml.entryPoint" value="${authConfig.saml.entryPoint}" placeholder="https://idp.example.com/saml/sso" />
                <small class="text-muted">Identity Provider SSO endpoint</small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Issuer (Entity ID)</label>
                <input type="text" class="form-control" name="saml.issuer" value="${authConfig.saml.issuer}" />
                <small class="text-muted">Service Provider entity identifier</small>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Callback URL (ACS URL)</label>
                <input type="text" class="form-control" name="saml.callbackUrl" value="${authConfig.saml.callbackUrl}" />
                <small class="text-muted">Assertion Consumer Service URL</small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Signature Algorithm</label>
                <select class="form-select" name="saml.signatureAlgorithm">
                  <option value="sha256" ${authConfig.saml.signatureAlgorithm==='sha256'?'selected':''}>SHA-256</option>
                  <option value="sha512" ${authConfig.saml.signatureAlgorithm==='sha512'?'selected':''}>SHA-512</option>
                  <option value="sha1" ${authConfig.saml.signatureAlgorithm==='sha1'?'selected':''}>SHA-1 (Legacy)</option>
                </select>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">IdP Certificate (X.509)</label>
              <textarea class="form-control" name="saml.cert" rows="4" placeholder="-----BEGIN CERTIFICATE-----">${authConfig.saml.cert === '***hidden***' ? '' : authConfig.saml.cert}</textarea>
              <small class="text-muted">Public certificate from your Identity Provider</small>
            </div>

            <div class="mb-3">
              <label class="form-label">SP Private Key (X.509)</label>
              <textarea class="form-control" name="saml.privateKey" rows="4" placeholder="-----BEGIN PRIVATE KEY-----">${authConfig.saml.privateKey === '***hidden***' ? '' : authConfig.saml.privateKey}</textarea>
              <small class="text-muted">Service Provider private key for signing requests</small>
            </div>

            <h6 class="mt-4 mb-3">SAML Attribute Mapping</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Email Attribute</label>
                <input type="text" class="form-control" name="saml.attributeMapping.email" value="${authConfig.saml.attributeMapping.email}" />
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Username Attribute</label>
                <input type="text" class="form-control" name="saml.attributeMapping.username" value="${authConfig.saml.attributeMapping.username}" />
              </div>
            </div>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">First Name Attribute</label>
                <input type="text" class="form-control" name="saml.attributeMapping.firstName" value="${authConfig.saml.attributeMapping.firstName}" />
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Last Name Attribute</label>
                <input type="text" class="form-control" name="saml.attributeMapping.lastName" value="${authConfig.saml.attributeMapping.lastName}" />
              </div>
            </div>
          </div>

          <!-- MFA Configuration -->
          <div class="tab-pane fade" id="auth-mfa" role="tabpanel">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
              <h5 style="margin:0">Multi-Factor Authentication</h5>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" name="mfa.enabled" ${authConfig.mfa.enabled?'checked':''} />
                <label class="form-check-label">MFA Enabled</label>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">MFA Enforcement Policy</label>
              <select class="form-select" name="mfa.enforcement">
                <option value="optional" ${authConfig.mfa.enforcement==='optional'?'selected':''}>Optional (User Choice)</option>
                <option value="required" ${authConfig.mfa.enforcement==='required'?'selected':''}>Required (All Users)</option>
                <option value="admin-only" ${authConfig.mfa.enforcement==='admin-only'?'selected':''}>Required for Admins Only</option>
                <option value="role-based" ${authConfig.mfa.enforcement==='role-based'?'selected':''}>Role-Based</option>
              </select>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Grace Period (days)</label>
                <input type="number" class="form-control" name="mfa.gracePeriodDays" value="${authConfig.mfa.gracePeriodDays}" />
                <small class="text-muted">Days before MFA becomes mandatory after enabling</small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Remember Device (days)</label>
                <input type="number" class="form-control" name="mfa.rememberDeviceDays" value="${authConfig.mfa.rememberDeviceDays}" />
                <small class="text-muted">How long to remember trusted devices</small>
              </div>
            </div>

            <!-- TOTP Settings -->
            <div class="card mb-3">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-qr-code"></i> TOTP (Authenticator Apps)</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="mfa.methods.totp.enabled" ${authConfig.mfa.methods.totp.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Issuer Name</label>
                    <input type="text" class="form-control" name="mfa.methods.totp.issuer" value="${authConfig.mfa.methods.totp.issuer}" />
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Time Window</label>
                    <input type="number" class="form-control" name="mfa.methods.totp.window" value="${authConfig.mfa.methods.totp.window}" />
                    <small class="text-muted">Periods before/after to accept (default: 1)</small>
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Time Step (seconds)</label>
                    <input type="number" class="form-control" name="mfa.methods.totp.step" value="${authConfig.mfa.methods.totp.step}" />
                    <small class="text-muted">Code refresh interval (default: 30)</small>
                  </div>
                </div>
              </div>
            </div>

            <!-- SMS Settings -->
            <div class="card mb-3">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-phone"></i> SMS Authentication</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="mfa.methods.sms.enabled" ${authConfig.mfa.methods.sms.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Provider</label>
                    <select class="form-select" name="mfa.methods.sms.provider">
                      <option value="twilio" ${authConfig.mfa.methods.sms.provider==='twilio'?'selected':''}>Twilio</option>
                      <option value="aws-sns" ${authConfig.mfa.methods.sms.provider==='aws-sns'?'selected':''}>AWS SNS</option>
                      <option value="nexmo" ${authConfig.mfa.methods.sms.provider==='nexmo'?'selected':''}>Nexmo/Vonage</option>
                    </select>
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Twilio Account SID</label>
                    <input type="text" class="form-control" name="mfa.methods.sms.twilioAccountSid" value="${authConfig.mfa.methods.sms.twilioAccountSid}" />
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Twilio Auth Token</label>
                    <input type="password" class="form-control" name="mfa.methods.sms.twilioAuthToken" value="${authConfig.mfa.methods.sms.twilioAuthToken}" />
                  </div>
                </div>
                <div class="mb-3">
                  <label class="form-label">Twilio Phone Number</label>
                  <input type="text" class="form-control" name="mfa.methods.sms.twilioPhoneNumber" value="${authConfig.mfa.methods.sms.twilioPhoneNumber}" placeholder="+15551234567" />
                </div>
              </div>
            </div>

            <!-- Email MFA Settings -->
            <div class="card mb-3">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-envelope"></i> Email Authentication</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="mfa.methods.email.enabled" ${authConfig.mfa.methods.email.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="mb-3">
                  <label class="form-label">Token Expiry (seconds)</label>
                  <input type="number" class="form-control" name="mfa.methods.email.tokenExpiry" value="${authConfig.mfa.methods.email.tokenExpiry}" />
                  <small class="text-muted">How long email codes remain valid (default: 600 = 10 minutes)</small>
                </div>
              </div>
            </div>

            <!-- Backup Codes Settings -->
            <div class="card">
              <div class="card-header">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <strong><i class="bi bi-key"></i> Backup Codes</strong>
                  <div class="form-check form-switch">
                    <input class="form-check-input" type="checkbox" name="mfa.methods.backupCodes.enabled" ${authConfig.mfa.methods.backupCodes.enabled?'checked':''} />
                    <label class="form-check-label">Enabled</label>
                  </div>
                </div>
              </div>
              <div class="card-body">
                <div class="mb-3">
                  <label class="form-label">Number of Backup Codes</label>
                  <input type="number" class="form-control" name="mfa.methods.backupCodes.count" value="${authConfig.mfa.methods.backupCodes.count}" />
                  <small class="text-muted">Generated per user (default: 10)</small>
                </div>
              </div>
            </div>
          </div>

          <!-- Session Management -->
          <div class="tab-pane fade" id="auth-session" role="tabpanel">
            <h5 class="mb-3">Session Management Settings</h5>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Session Timeout (seconds)</label>
                <input type="number" class="form-control" name="session.timeout" value="${authConfig.session.timeout}" />
                <small class="text-muted">Idle session timeout (default: 3600 = 1 hour)</small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Max Concurrent Sessions</label>
                <input type="number" class="form-control" name="session.maxConcurrentSessions" value="${authConfig.session.maxConcurrentSessions}" />
                <small class="text-muted">Maximum simultaneous logins per user (0 = unlimited)</small>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="session.slidingExpiration" ${authConfig.session.slidingExpiration?'checked':''} />
                  <label class="form-check-label">Sliding Expiration</label>
                </div>
                <small class="text-muted">Reset timeout on each request</small>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="session.ipBinding" ${authConfig.session.ipBinding?'checked':''} />
                  <label class="form-check-label">IP Address Binding</label>
                </div>
                <small class="text-muted">Invalidate session if IP changes</small>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="session.userAgentBinding" ${authConfig.session.userAgentBinding?'checked':''} />
                  <label class="form-check-label">User Agent Binding</label>
                </div>
                <small class="text-muted">Invalidate session if browser changes</small>
              </div>
            </div>

            <h6 class="mt-4 mb-3">Cookie Settings</h6>
            <div class="row">
              <div class="col-md-4 mb-3">
                <label class="form-label">Cookie Name</label>
                <input type="text" class="form-control" name="session.cookieName" value="${authConfig.session.cookieName}" />
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">SameSite Policy</label>
                <select class="form-select" name="session.cookieSameSite">
                  <option value="strict" ${authConfig.session.cookieSameSite==='strict'?'selected':''}>Strict</option>
                  <option value="lax" ${authConfig.session.cookieSameSite==='lax'?'selected':''}>Lax</option>
                  <option value="none" ${authConfig.session.cookieSameSite==='none'?'selected':''}>None</option>
                </select>
              </div>
              <div class="col-md-4 mb-3">
                <div class="form-check form-switch" style="margin-top:2rem">
                  <input class="form-check-input" type="checkbox" name="session.cookieSecure" ${authConfig.session.cookieSecure?'checked':''} />
                  <label class="form-check-label">Secure Cookies (HTTPS Only)</label>
                </div>
              </div>
            </div>

            <h6 class="mt-4 mb-3">Remember Me Settings</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="session.rememberMe.enabled" ${authConfig.session.rememberMe.enabled?'checked':''} />
                  <label class="form-check-label">Enable "Remember Me"</label>
                </div>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Remember Me Duration</label>
                <input type="text" class="form-control" name="session.rememberMe.duration" value="${authConfig.session.rememberMe.duration}" />
                <small class="text-muted">Format: 30d, 60d, 90d</small>
              </div>
            </div>
          </div>

          <!-- Password Policies -->
          <div class="tab-pane fade" id="auth-password" role="tabpanel">
            <h5 class="mb-3">Password Policy Settings</h5>

            <h6 class="mb-3">Complexity Requirements</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Minimum Length</label>
                <input type="number" class="form-control" name="password.minLength" value="${authConfig.password.minLength}" min="6" max="128" />
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Maximum Length</label>
                <input type="number" class="form-control" name="password.maxLength" value="${authConfig.password.maxLength}" min="8" max="256" />
              </div>
            </div>

            <div class="row">
              <div class="col-md-3 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="password.requireUppercase" ${authConfig.password.requireUppercase?'checked':''} />
                  <label class="form-check-label">Require Uppercase (A-Z)</label>
                </div>
              </div>
              <div class="col-md-3 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="password.requireLowercase" ${authConfig.password.requireLowercase?'checked':''} />
                  <label class="form-check-label">Require Lowercase (a-z)</label>
                </div>
              </div>
              <div class="col-md-3 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="password.requireNumbers" ${authConfig.password.requireNumbers?'checked':''} />
                  <label class="form-check-label">Require Numbers (0-9)</label>
                </div>
              </div>
              <div class="col-md-3 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="password.requireSpecialChars" ${authConfig.password.requireSpecialChars?'checked':''} />
                  <label class="form-check-label">Require Special Chars (!@#$)</label>
                </div>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="password.preventCommonPasswords" ${authConfig.password.preventCommonPasswords?'checked':''} />
                  <label class="form-check-label">Prevent Common Passwords</label>
                </div>
                <small class="text-muted">Block passwords from common password lists</small>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="password.preventUserInfo" ${authConfig.password.preventUserInfo?'checked':''} />
                  <label class="form-check-label">Prevent User Info in Password</label>
                </div>
                <small class="text-muted">Block passwords containing username/email</small>
              </div>
            </div>

            <h6 class="mt-4 mb-3">Expiration & History</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Password Expiration (days)</label>
                <input type="number" class="form-control" name="password.expirationDays" value="${authConfig.password.expirationDays}" />
                <small class="text-muted">0 = never expire</small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Password History Count</label>
                <input type="number" class="form-control" name="password.historyCount" value="${authConfig.password.historyCount}" />
                <small class="text-muted">Prevent reusing last N passwords</small>
              </div>
            </div>

            <h6 class="mt-4 mb-3">Account Lockout</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Lockout Threshold (failed attempts)</label>
                <input type="number" class="form-control" name="password.lockoutThreshold" value="${authConfig.password.lockoutThreshold}" />
                <small class="text-muted">0 = disable lockout</small>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Lockout Duration (seconds)</label>
                <input type="number" class="form-control" name="password.lockoutDuration" value="${authConfig.password.lockoutDuration}" />
                <small class="text-muted">${(authConfig.password.lockoutDuration/60).toFixed(0)} minutes</small>
              </div>
            </div>
          </div>

          <!-- Rate Limiting -->
          <div class="tab-pane fade" id="auth-ratelimit" role="tabpanel">
            <h5 class="mb-3">Rate Limiting Configuration</h5>

            <!-- Login Rate Limit -->
            <div class="card mb-3">
              <div class="card-header"><strong><i class="bi bi-box-arrow-in-right"></i> Login Attempts</strong></div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Time Window (ms)</label>
                    <input type="number" class="form-control" name="rateLimit.login.windowMs" value="${authConfig.rateLimit.login.windowMs}" />
                    <small class="text-muted">${(authConfig.rateLimit.login.windowMs/60000).toFixed(0)} minutes</small>
                  </div>
                  <div class="col-md-4 mb-3">
                    <label class="form-label">Max Attempts</label>
                    <input type="number" class="form-control" name="rateLimit.login.maxAttempts" value="${authConfig.rateLimit.login.maxAttempts}" />
                  </div>
                  <div class="col-md-4 mb-3">
                    <div class="form-check form-switch" style="margin-top:2rem">
                      <input class="form-check-input" type="checkbox" name="rateLimit.login.skipSuccessful" ${authConfig.rateLimit.login.skipSuccessful?'checked':''} />
                      <label class="form-check-label">Skip Successful Logins</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Registration Rate Limit -->
            <div class="card mb-3">
              <div class="card-header"><strong><i class="bi bi-person-plus"></i> Registration</strong></div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Time Window (ms)</label>
                    <input type="number" class="form-control" name="rateLimit.registration.windowMs" value="${authConfig.rateLimit.registration.windowMs}" />
                    <small class="text-muted">${(authConfig.rateLimit.registration.windowMs/60000).toFixed(0)} minutes</small>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Max Attempts</label>
                    <input type="number" class="form-control" name="rateLimit.registration.maxAttempts" value="${authConfig.rateLimit.registration.maxAttempts}" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Password Reset Rate Limit -->
            <div class="card mb-3">
              <div class="card-header"><strong><i class="bi bi-key"></i> Password Reset</strong></div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Time Window (ms)</label>
                    <input type="number" class="form-control" name="rateLimit.passwordReset.windowMs" value="${authConfig.rateLimit.passwordReset.windowMs}" />
                    <small class="text-muted">${(authConfig.rateLimit.passwordReset.windowMs/60000).toFixed(0)} minutes</small>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Max Attempts</label>
                    <input type="number" class="form-control" name="rateLimit.passwordReset.maxAttempts" value="${authConfig.rateLimit.passwordReset.maxAttempts}" />
                  </div>
                </div>
              </div>
            </div>

            <!-- Token Refresh Rate Limit -->
            <div class="card">
              <div class="card-header"><strong><i class="bi bi-arrow-repeat"></i> Token Refresh</strong></div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Time Window (ms)</label>
                    <input type="number" class="form-control" name="rateLimit.tokenRefresh.windowMs" value="${authConfig.rateLimit.tokenRefresh.windowMs}" />
                    <small class="text-muted">${(authConfig.rateLimit.tokenRefresh.windowMs/1000).toFixed(0)} seconds</small>
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Max Attempts</label>
                    <input type="number" class="form-control" name="rateLimit.tokenRefresh.maxAttempts" value="${authConfig.rateLimit.tokenRefresh.maxAttempts}" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Security Settings -->
          <div class="tab-pane fade" id="auth-security" role="tabpanel">
            <h5 class="mb-3">Security & Access Control</h5>

            <h6 class="mb-3">User Registration & Access</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.allowSelfRegistration" ${authConfig.security.allowSelfRegistration?'checked':''} />
                  <label class="form-check-label">Allow Self-Registration</label>
                </div>
                <small class="text-muted">Users can create their own accounts</small>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.requireEmailVerification" ${authConfig.security.requireEmailVerification?'checked':''} />
                  <label class="form-check-label">Require Email Verification</label>
                </div>
                <small class="text-muted">Verify email before account activation</small>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.allowPasswordReset" ${authConfig.security.allowPasswordReset?'checked':''} />
                  <label class="form-check-label">Allow Password Reset</label>
                </div>
                <small class="text-muted">Enable forgot password functionality</small>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.allowSocialLogin" ${authConfig.security.allowSocialLogin?'checked':''} />
                  <label class="form-check-label">Allow Social Login</label>
                </div>
                <small class="text-muted">Enable OAuth2/SAML login methods</small>
              </div>
            </div>

            <h6 class="mt-4 mb-3">Security Enforcement</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.enforceStrongPasswords" ${authConfig.security.enforceStrongPasswords?'checked':''} />
                  <label class="form-check-label">Enforce Strong Passwords</label>
                </div>
                <small class="text-muted">Apply password complexity rules</small>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.logSecurityEvents" ${authConfig.security.logSecurityEvents?'checked':''} />
                  <label class="form-check-label">Log Security Events</label>
                </div>
                <small class="text-muted">Audit login attempts, password changes, etc.</small>
              </div>
            </div>

            <h6 class="mt-4 mb-3">User Notifications</h6>
            <div class="row">
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.notifyPasswordChange" ${authConfig.security.notifyPasswordChange?'checked':''} />
                  <label class="form-check-label">Notify on Password Change</label>
                </div>
                <small class="text-muted">Email user when password is changed</small>
              </div>
              <div class="col-md-6 mb-3">
                <div class="form-check form-switch">
                  <input class="form-check-input" type="checkbox" name="security.notifyNewDevice" ${authConfig.security.notifyNewDevice?'checked':''} />
                  <label class="form-check-label">Notify on New Device Login</label>
                </div>
                <small class="text-muted">Email user when logging in from new device</small>
              </div>
            </div>

            <h6 class="mt-4 mb-3">IP Access Control</h6>
            <div class="mb-3">
              <label class="form-label">IP Whitelist (comma-separated)</label>
              <textarea class="form-control" name="security.ipWhitelist" rows="3" placeholder="192.168.1.0/24, 10.0.0.1">${authConfig.security.ipWhitelist.join(', ')}</textarea>
              <small class="text-muted">Leave empty to allow all IPs. Use CIDR notation for ranges.</small>
            </div>

            <div class="mb-3">
              <label class="form-label">IP Blacklist (comma-separated)</label>
              <textarea class="form-control" name="security.ipBlacklist" rows="3" placeholder="203.0.113.0/24">${authConfig.security.ipBlacklist.join(', ')}</textarea>
              <small class="text-muted">Block specific IPs or ranges</small>
            </div>

            <h6 class="mt-4 mb-3">CORS Settings</h6>
            <div class="mb-3">
              <label class="form-label">Allowed Origins (comma-separated)</label>
              <textarea class="form-control" name="security.allowedOrigins" rows="3" placeholder="http://localhost:3000, https://app.example.com">${authConfig.security.allowedOrigins.join(', ')}</textarea>
              <small class="text-muted">Origins permitted to make cross-origin requests</small>
            </div>
          </div>

        </div>
      </form>

      <!-- Save Button (Fixed at Bottom) -->
      <div style="margin-top:2rem;padding-top:1rem;border-top:1px solid #dee2e6;display:flex;justify-content:flex-end;gap:1rem">
        <button type="button" class="btn btn-outline-secondary" onclick="loadPage('services/auth')">
          <i class="bi bi-x-circle"></i> Cancel
        </button>
        <button type="button" class="btn btn-primary" onclick="saveAuthConfig()">
          <i class="bi bi-save"></i> Save All Changes
        </button>
      </div>
    </div>`;
  },

  timelineSettings: async (config) => {
    const timelineConfig = config.config || {
      // Feed & Content
      feed: {
        maxPostLength: 5000,
        minPostLength: 1,
        allowEmptyPosts: false,
        maxMediaAttachments: 4,
        supportedMediaTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'],
        maxMediaSize: 10485760, // 10MB
        defaultPrivacy: 'public',
        allowedPrivacyLevels: ['public', 'followers', 'private'],
        postsPerPage: 20,
        maxPageSize: 100,
        enableThreads: true,
        maxThreadDepth: 10
      },

      // Prefetching
      prefetch: {
        enabled: true,
        serviceUrl: 'http://localhost:3005',
        hotCacheTTL: 300,
        warmCacheTTL: 1800,
        hotCacheMaxSize: 10000,
        warmCacheMaxSize: 50000,
        prefetchInterval: 60000,
        prefetchBatchSize: 100,
        strategies: {
          userTimeline: true,
          homeFeed: true,
          listTimeline: true,
          predictive: false
        },
        cacheWarming: {
          enabled: true,
          schedule: '0 */6 * * *',
          offPeakOnly: true
        }
      },

      // Moderation
      moderation: {
        enabled: true,
        serviceUrl: 'http://localhost:3006',
        autoModeration: true,
        requireApproval: false,
        contentFilters: true,
        spamDetection: true,
        flagThreshold: 3,
        userReporting: true,
        filters: {
          profanity: true,
          hate: true,
          violence: true,
          nsfw: true,
          spam: true
        },
        actions: {
          autoFlag: true,
          autoHide: false,
          autoDelete: false,
          notifyModerators: true
        },
        aiModeration: {
          enabled: true,
          confidence: 0.8,
          models: ['toxicity', 'spam', 'nsfw']
        }
      },

      // Search & Elasticsearch
      search: {
        enabled: true,
        elasticsearchEnabled: true,
        elasticsearchNode: 'http://localhost:9200',
        elasticsearchIndex: 'exprsn_posts',
        fallbackToPostgres: true,
        indexing: {
          realtime: true,
          batchSize: 100,
          batchInterval: 5000
        },
        features: {
          fuzzyMatching: true,
          wildcards: true,
          facets: true,
          highlighting: true
        },
        limits: {
          maxResults: 1000,
          defaultResults: 20
        }
      },

      // Queue & Background Jobs
      queue: {
        enabled: true,
        redisHost: 'localhost',
        redisPort: 6379,
        queueName: 'timeline',
        jobs: {
          fanout: {
            enabled: true,
            concurrency: 5,
            attempts: 3,
            backoff: 2000
          },
          trending: {
            enabled: true,
            interval: '*/15 * * * *',
            lookbackHours: 24
          },
          indexing: {
            enabled: true,
            concurrency: 10,
            batchSize: 100
          },
          cleanup: {
            enabled: true,
            schedule: '0 2 * * *',
            retentionDays: 90
          }
        }
      },

      // Herald Integration
      herald: {
        enabled: true,
        serviceUrl: 'http://localhost:3014',
        notifications: {
          likes: true,
          reposts: true,
          replies: true,
          mentions: true,
          follows: true
        },
        delivery: {
          realtime: true,
          batching: false,
          batchInterval: 60000,
          retryAttempts: 3
        },
        preferences: {
          allowUserControl: true,
          defaultOptIn: true
        }
      },

      // Rate Limiting
      rateLimit: {
        enabled: true,
        global: {
          max: 1000,
          windowMs: 900000
        },
        posts: {
          create: { max: 10, windowMs: 60000 },
          update: { max: 20, windowMs: 60000 },
          delete: { max: 20, windowMs: 60000 }
        },
        interactions: {
          like: { max: 100, windowMs: 60000 },
          repost: { max: 50, windowMs: 60000 },
          bookmark: { max: 100, windowMs: 60000 }
        },
        search: {
          max: 30,
          windowMs: 60000
        }
      },

      // Features & Capabilities
      features: {
        search: true,
        reactions: true,
        reposts: true,
        bookmarks: true,
        lists: true,
        hashtags: true,
        mentions: true,
        trending: true,
        polls: false,
        stories: false,
        quoteReposts: true,
        pinnedPosts: true,
        scheduledPosts: false
      },

      // Real-time & WebSocket
      realtime: {
        enabled: true,
        socketPath: '/socket.io',
        pingInterval: 25000,
        pingTimeout: 60000,
        maxConnections: 10000,
        events: {
          newPost: true,
          postUpdated: true,
          postDeleted: true,
          newLike: true,
          newReply: true
        },
        rooms: {
          enabled: true,
          userTimeline: true,
          homeFeed: true,
          hashtagFeeds: true
        }
      },

      // Performance & Caching
      performance: {
        caching: {
          enabled: true,
          redisEnabled: true,
          ttl: 300,
          invalidateOnUpdate: true
        },
        compression: {
          enabled: true,
          level: 6,
          threshold: 1024
        },
        pagination: {
          cursorBased: true,
          offsetBased: true,
          defaultLimit: 20,
          maxLimit: 100
        },
        database: {
          poolSize: 20,
          connectionTimeout: 30000,
          readReplicas: false
        }
      }
    };

    return `<div style="background:white;padding:2rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
      <h2 style="margin-bottom:1.5rem">
        <i class="bi bi-clock-history"></i> Timeline Service Configuration
      </h2>

      <ul class="nav nav-tabs" id="timeline-config-tabs" role="tablist" style="margin-bottom:1.5rem">
        <li class="nav-item" role="presentation">
          <button class="nav-link active" id="timeline-feed-tab" data-bs-toggle="tab" data-bs-target="#timeline-feed" type="button">
            <i class="bi bi-file-text"></i> Feed & Content
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="timeline-prefetch-tab" data-bs-toggle="tab" data-bs-target="#timeline-prefetch" type="button">
            <i class="bi bi-lightning"></i> Prefetching
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="timeline-moderation-tab" data-bs-toggle="tab" data-bs-target="#timeline-moderation" type="button">
            <i class="bi bi-shield-check"></i> Moderation
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="timeline-search-tab" data-bs-toggle="tab" data-bs-target="#timeline-search" type="button">
            <i class="bi bi-search"></i> Search
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="timeline-queue-tab" data-bs-toggle="tab" data-bs-target="#timeline-queue" type="button">
            <i class="bi bi-list-task"></i> Queues
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="timeline-herald-tab" data-bs-toggle="tab" data-bs-target="#timeline-herald" type="button">
            <i class="bi bi-bell"></i> Notifications
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="timeline-ratelimit-tab" data-bs-toggle="tab" data-bs-target="#timeline-ratelimit" type="button">
            <i class="bi bi-speedometer"></i> Rate Limiting
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="timeline-features-tab" data-bs-toggle="tab" data-bs-target="#timeline-features" type="button">
            <i class="bi bi-toggles"></i> Features
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="timeline-realtime-tab" data-bs-toggle="tab" data-bs-target="#timeline-realtime" type="button">
            <i class="bi bi-broadcast"></i> Real-time
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="timeline-performance-tab" data-bs-toggle="tab" data-bs-target="#timeline-performance" type="button">
            <i class="bi bi-graph-up"></i> Performance
          </button>
        </li>
      </ul>

      <form id="timeline-config-form">
        <div class="tab-content" id="timeline-config-tabContent">

          <!-- Feed & Content Tab -->
          <div class="tab-pane fade show active" id="timeline-feed" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-file-text"></i> Post Settings</strong>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Max Post Length (characters)</label>
                      <input type="number" class="form-control" name="feed.maxPostLength" value="${timelineConfig.feed.maxPostLength}" />
                      <small class="text-muted">Maximum characters allowed in a post</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Min Post Length (characters)</label>
                      <input type="number" class="form-control" name="feed.minPostLength" value="${timelineConfig.feed.minPostLength}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="feed.allowEmptyPosts" ${timelineConfig.feed.allowEmptyPosts?'checked':''} />
                      <label class="form-check-label">Allow Empty Posts (media-only)</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="feed.enableThreads" ${timelineConfig.feed.enableThreads?'checked':''} />
                      <label class="form-check-label">Enable Threaded Conversations</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Thread Depth</label>
                      <input type="number" class="form-control" name="feed.maxThreadDepth" value="${timelineConfig.feed.maxThreadDepth}" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-image"></i> Media Settings</strong>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Max Media Attachments</label>
                      <input type="number" class="form-control" name="feed.maxMediaAttachments" value="${timelineConfig.feed.maxMediaAttachments}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Media Size (bytes)</label>
                      <input type="number" class="form-control" name="feed.maxMediaSize" value="${timelineConfig.feed.maxMediaSize}" />
                      <small class="text-muted">Current: ${(timelineConfig.feed.maxMediaSize/1024/1024).toFixed(2)} MB</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Default Privacy Level</label>
                      <select class="form-select" name="feed.defaultPrivacy">
                        <option value="public" ${timelineConfig.feed.defaultPrivacy==='public'?'selected':''}>Public</option>
                        <option value="followers" ${timelineConfig.feed.defaultPrivacy==='followers'?'selected':''}>Followers Only</option>
                        <option value="private" ${timelineConfig.feed.defaultPrivacy==='private'?'selected':''}>Private</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-layout-three-columns"></i> Pagination</strong>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Posts Per Page</label>
                      <input type="number" class="form-control" name="feed.postsPerPage" value="${timelineConfig.feed.postsPerPage}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Page Size</label>
                      <input type="number" class="form-control" name="feed.maxPageSize" value="${timelineConfig.feed.maxPageSize}" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Prefetching Tab -->
          <div class="tab-pane fade" id="timeline-prefetch" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-lightning-fill"></i> Prefetch Service</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="prefetch.enabled" ${timelineConfig.prefetch.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Prefetch Service URL</label>
                      <input type="text" class="form-control" name="prefetch.serviceUrl" value="${timelineConfig.prefetch.serviceUrl}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Prefetch Interval (ms)</label>
                      <input type="number" class="form-control" name="prefetch.prefetchInterval" value="${timelineConfig.prefetch.prefetchInterval}" />
                      <small class="text-muted">How often to prefetch timelines</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Batch Size</label>
                      <input type="number" class="form-control" name="prefetch.prefetchBatchSize" value="${timelineConfig.prefetch.prefetchBatchSize}" />
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-thermometer-half"></i> Cache Tiers</strong>
                  </div>
                  <div class="card-body">
                    <h6>Hot Cache (Frequently Accessed)</h6>
                    <div class="mb-3">
                      <label class="form-label">TTL (seconds)</label>
                      <input type="number" class="form-control" name="prefetch.hotCacheTTL" value="${timelineConfig.prefetch.hotCacheTTL}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Size (items)</label>
                      <input type="number" class="form-control" name="prefetch.hotCacheMaxSize" value="${timelineConfig.prefetch.hotCacheMaxSize}" />
                    </div>

                    <hr />

                    <h6>Warm Cache (Less Frequently Accessed)</h6>
                    <div class="mb-3">
                      <label class="form-label">TTL (seconds)</label>
                      <input type="number" class="form-control" name="prefetch.warmCacheTTL" value="${timelineConfig.prefetch.warmCacheTTL}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Size (items)</label>
                      <input type="number" class="form-control" name="prefetch.warmCacheMaxSize" value="${timelineConfig.prefetch.warmCacheMaxSize}" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-diagram-3"></i> Prefetch Strategies</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="prefetch.strategies.userTimeline" ${timelineConfig.prefetch.strategies.userTimeline?'checked':''} />
                      <label class="form-check-label">User Timeline Prefetching</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="prefetch.strategies.homeFeed" ${timelineConfig.prefetch.strategies.homeFeed?'checked':''} />
                      <label class="form-check-label">Home Feed Prefetching</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="prefetch.strategies.listTimeline" ${timelineConfig.prefetch.strategies.listTimeline?'checked':''} />
                      <label class="form-check-label">List Timeline Prefetching</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="prefetch.strategies.predictive" ${timelineConfig.prefetch.strategies.predictive?'checked':''} />
                      <label class="form-check-label">Predictive Prefetching (AI-based)</label>
                      <small class="text-muted d-block">Uses user activity patterns to predict which feeds to prefetch</small>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-fire"></i> Cache Warming</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="prefetch.cacheWarming.enabled" ${timelineConfig.prefetch.cacheWarming.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Warming Schedule (cron)</label>
                      <input type="text" class="form-control" name="prefetch.cacheWarming.schedule" value="${timelineConfig.prefetch.cacheWarming.schedule}" />
                      <small class="text-muted">Example: 0 */6 * * * (every 6 hours)</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="prefetch.cacheWarming.offPeakOnly" ${timelineConfig.prefetch.cacheWarming.offPeakOnly?'checked':''} />
                      <label class="form-check-label">Off-Peak Hours Only</label>
                      <small class="text-muted d-block">Only warm cache during low-traffic periods</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Moderation Tab -->
          <div class="tab-pane fade" id="timeline-moderation" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-shield-fill-check"></i> Moderator Service</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="moderation.enabled" ${timelineConfig.moderation.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Moderator Service URL</label>
                      <input type="text" class="form-control" name="moderation.serviceUrl" value="${timelineConfig.moderation.serviceUrl}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="moderation.autoModeration" ${timelineConfig.moderation.autoModeration?'checked':''} />
                      <label class="form-check-label">Automatic Moderation</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="moderation.requireApproval" ${timelineConfig.moderation.requireApproval?'checked':''} />
                      <label class="form-check-label">Require Approval for New Posts</label>
                      <small class="text-muted d-block">Posts must be approved before appearing</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Auto-Flag Threshold</label>
                      <input type="number" class="form-control" name="moderation.flagThreshold" value="${timelineConfig.moderation.flagThreshold}" />
                      <small class="text-muted">Number of user reports before auto-flagging</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="moderation.userReporting" ${timelineConfig.moderation.userReporting?'checked':''} />
                      <label class="form-check-label">Enable User Reporting</label>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-funnel"></i> Content Filters</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="moderation.filters.profanity" ${timelineConfig.moderation.filters.profanity?'checked':''} />
                      <label class="form-check-label">Profanity Filter</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="moderation.filters.hate" ${timelineConfig.moderation.filters.hate?'checked':''} />
                      <label class="form-check-label">Hate Speech Detection</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="moderation.filters.violence" ${timelineConfig.moderation.filters.violence?'checked':''} />
                      <label class="form-check-label">Violence Detection</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="moderation.filters.nsfw" ${timelineConfig.moderation.filters.nsfw?'checked':''} />
                      <label class="form-check-label">NSFW Content Detection</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="moderation.filters.spam" ${timelineConfig.moderation.filters.spam?'checked':''} />
                      <label class="form-check-label">Spam Detection</label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-exclamation-triangle"></i> Moderation Actions</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="moderation.actions.autoFlag" ${timelineConfig.moderation.actions.autoFlag?'checked':''} />
                      <label class="form-check-label">Auto-Flag Problematic Content</label>
                      <small class="text-muted d-block">Flag content for manual review</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="moderation.actions.autoHide" ${timelineConfig.moderation.actions.autoHide?'checked':''} />
                      <label class="form-check-label">Auto-Hide Problematic Content</label>
                      <small class="text-muted d-block">Hide from timelines until reviewed</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="moderation.actions.autoDelete" ${timelineConfig.moderation.actions.autoDelete?'checked':''} />
                      <label class="form-check-label">Auto-Delete Severe Violations</label>
                      <small class="text-muted d-block text-danger">Use with caution</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="moderation.actions.notifyModerators" ${timelineConfig.moderation.actions.notifyModerators?'checked':''} />
                      <label class="form-check-label">Notify Moderators</label>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-robot"></i> AI Moderation</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="moderation.aiModeration.enabled" ${timelineConfig.moderation.aiModeration.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Confidence Threshold</label>
                      <input type="number" step="0.1" min="0" max="1" class="form-control" name="moderation.aiModeration.confidence" value="${timelineConfig.moderation.aiModeration.confidence}" />
                      <small class="text-muted">0.0 - 1.0 (higher = more strict)</small>
                    </div>
                    <p class="mb-2"><strong>Active Models:</strong></p>
                    <div class="form-check mb-2">
                      <input class="form-check-input" type="checkbox" checked disabled />
                      <label class="form-check-label">Toxicity Detection</label>
                    </div>
                    <div class="form-check mb-2">
                      <input class="form-check-input" type="checkbox" checked disabled />
                      <label class="form-check-label">Spam Classification</label>
                    </div>
                    <div class="form-check mb-2">
                      <input class="form-check-input" type="checkbox" checked disabled />
                      <label class="form-check-label">NSFW Image Detection</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Search Tab -->
          <div class="tab-pane fade" id="timeline-search" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-search"></i> Search Configuration</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="search.enabled" ${timelineConfig.search.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="search.elasticsearchEnabled" ${timelineConfig.search.elasticsearchEnabled?'checked':''} />
                      <label class="form-check-label">Use Elasticsearch</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Elasticsearch Node URL</label>
                      <input type="text" class="form-control" name="search.elasticsearchNode" value="${timelineConfig.search.elasticsearchNode}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Index Name</label>
                      <input type="text" class="form-control" name="search.elasticsearchIndex" value="${timelineConfig.search.elasticsearchIndex}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="search.fallbackToPostgres" ${timelineConfig.search.fallbackToPostgres?'checked':''} />
                      <label class="form-check-label">Fallback to PostgreSQL</label>
                      <small class="text-muted d-block">Use PostgreSQL when Elasticsearch unavailable</small>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-gear"></i> Search Features</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="search.features.fuzzyMatching" ${timelineConfig.search.features.fuzzyMatching?'checked':''} />
                      <label class="form-check-label">Fuzzy Matching</label>
                      <small class="text-muted d-block">Handle typos and misspellings</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="search.features.wildcards" ${timelineConfig.search.features.wildcards?'checked':''} />
                      <label class="form-check-label">Wildcard Searches</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="search.features.facets" ${timelineConfig.search.features.facets?'checked':''} />
                      <label class="form-check-label">Faceted Search</label>
                      <small class="text-muted d-block">Filter by categories, dates, users</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="search.features.highlighting" ${timelineConfig.search.features.highlighting?'checked':''} />
                      <label class="form-check-label">Result Highlighting</label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-file-earmark-arrow-up"></i> Indexing Configuration</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="search.indexing.realtime" ${timelineConfig.search.indexing.realtime?'checked':''} />
                      <label class="form-check-label">Real-time Indexing</label>
                      <small class="text-muted d-block">Index posts immediately upon creation</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Batch Size</label>
                      <input type="number" class="form-control" name="search.indexing.batchSize" value="${timelineConfig.search.indexing.batchSize}" />
                      <small class="text-muted">Number of posts to index at once</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Batch Interval (ms)</label>
                      <input type="number" class="form-control" name="search.indexing.batchInterval" value="${timelineConfig.search.indexing.batchInterval}" />
                      <small class="text-muted">Wait time before processing batch</small>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-list-ol"></i> Search Limits</strong>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Max Results</label>
                      <input type="number" class="form-control" name="search.limits.maxResults" value="${timelineConfig.search.limits.maxResults}" />
                      <small class="text-muted">Maximum total results to return</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Default Results Per Page</label>
                      <input type="number" class="form-control" name="search.limits.defaultResults" value="${timelineConfig.search.limits.defaultResults}" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Queue Tab -->
          <div class="tab-pane fade" id="timeline-queue" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-list-task"></i> Bull Queue Configuration</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="queue.enabled" ${timelineConfig.queue.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Redis Host</label>
                      <input type="text" class="form-control" name="queue.redisHost" value="${timelineConfig.queue.redisHost}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Redis Port</label>
                      <input type="number" class="form-control" name="queue.redisPort" value="${timelineConfig.queue.redisPort}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Queue Name</label>
                      <input type="text" class="form-control" name="queue.queueName" value="${timelineConfig.queue.queueName}" />
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-diagram-3"></i> Fan-out Jobs</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="queue.jobs.fanout.enabled" ${timelineConfig.queue.jobs.fanout.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <p class="text-muted small">Distribute posts to followers' timelines</p>
                    <div class="mb-3">
                      <label class="form-label">Concurrency</label>
                      <input type="number" class="form-control" name="queue.jobs.fanout.concurrency" value="${timelineConfig.queue.jobs.fanout.concurrency}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Retry Attempts</label>
                      <input type="number" class="form-control" name="queue.jobs.fanout.attempts" value="${timelineConfig.queue.jobs.fanout.attempts}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Backoff Delay (ms)</label>
                      <input type="number" class="form-control" name="queue.jobs.fanout.backoff" value="${timelineConfig.queue.jobs.fanout.backoff}" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-graph-up-arrow"></i> Trending Jobs</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="queue.jobs.trending.enabled" ${timelineConfig.queue.jobs.trending.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <p class="text-muted small">Calculate trending content</p>
                    <div class="mb-3">
                      <label class="form-label">Calculation Interval (cron)</label>
                      <input type="text" class="form-control" name="queue.jobs.trending.interval" value="${timelineConfig.queue.jobs.trending.interval}" />
                      <small class="text-muted">Example: */15 * * * * (every 15 min)</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Lookback Period (hours)</label>
                      <input type="number" class="form-control" name="queue.jobs.trending.lookbackHours" value="${timelineConfig.queue.jobs.trending.lookbackHours}" />
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-file-earmark-arrow-up"></i> Indexing Jobs</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="queue.jobs.indexing.enabled" ${timelineConfig.queue.jobs.indexing.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <p class="text-muted small">Background search indexing</p>
                    <div class="mb-3">
                      <label class="form-label">Concurrency</label>
                      <input type="number" class="form-control" name="queue.jobs.indexing.concurrency" value="${timelineConfig.queue.jobs.indexing.concurrency}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Batch Size</label>
                      <input type="number" class="form-control" name="queue.jobs.indexing.batchSize" value="${timelineConfig.queue.jobs.indexing.batchSize}" />
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-trash"></i> Cleanup Jobs</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="queue.jobs.cleanup.enabled" ${timelineConfig.queue.jobs.cleanup.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <p class="text-muted small">Clean up old data</p>
                    <div class="mb-3">
                      <label class="form-label">Schedule (cron)</label>
                      <input type="text" class="form-control" name="queue.jobs.cleanup.schedule" value="${timelineConfig.queue.jobs.cleanup.schedule}" />
                      <small class="text-muted">Example: 0 2 * * * (daily at 2 AM)</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Retention Days</label>
                      <input type="number" class="form-control" name="queue.jobs.cleanup.retentionDays" value="${timelineConfig.queue.jobs.cleanup.retentionDays}" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Herald Tab -->
          <div class="tab-pane fade" id="timeline-herald" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-bell-fill"></i> Herald Integration</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="herald.enabled" ${timelineConfig.herald.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Herald Service URL</label>
                      <input type="text" class="form-control" name="herald.serviceUrl" value="${timelineConfig.herald.serviceUrl}" />
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-list-check"></i> Notification Types</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="herald.notifications.likes" ${timelineConfig.herald.notifications.likes?'checked':''} />
                      <label class="form-check-label">Post Likes</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="herald.notifications.reposts" ${timelineConfig.herald.notifications.reposts?'checked':''} />
                      <label class="form-check-label">Reposts</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="herald.notifications.replies" ${timelineConfig.herald.notifications.replies?'checked':''} />
                      <label class="form-check-label">Replies</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="herald.notifications.mentions" ${timelineConfig.herald.notifications.mentions?'checked':''} />
                      <label class="form-check-label">Mentions</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="herald.notifications.follows" ${timelineConfig.herald.notifications.follows?'checked':''} />
                      <label class="form-check-label">New Followers</label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-send"></i> Delivery Configuration</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="herald.delivery.realtime" ${timelineConfig.herald.delivery.realtime?'checked':''} />
                      <label class="form-check-label">Real-time Delivery</label>
                      <small class="text-muted d-block">Send notifications immediately</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="herald.delivery.batching" ${timelineConfig.herald.delivery.batching?'checked':''} />
                      <label class="form-check-label">Batch Notifications</label>
                      <small class="text-muted d-block">Group similar notifications</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Batch Interval (ms)</label>
                      <input type="number" class="form-control" name="herald.delivery.batchInterval" value="${timelineConfig.herald.delivery.batchInterval}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Retry Attempts</label>
                      <input type="number" class="form-control" name="herald.delivery.retryAttempts" value="${timelineConfig.herald.delivery.retryAttempts}" />
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-person-check"></i> User Preferences</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="herald.preferences.allowUserControl" ${timelineConfig.herald.preferences.allowUserControl?'checked':''} />
                      <label class="form-check-label">Allow User Control</label>
                      <small class="text-muted d-block">Let users manage notification preferences</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="herald.preferences.defaultOptIn" ${timelineConfig.herald.preferences.defaultOptIn?'checked':''} />
                      <label class="form-check-label">Default Opt-in</label>
                      <small class="text-muted d-block">New users receive all notifications by default</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Rate Limiting Tab -->
          <div class="tab-pane fade" id="timeline-ratelimit" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-speedometer"></i> Global Rate Limiting</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="rateLimit.enabled" ${timelineConfig.rateLimit.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Max Requests</label>
                      <input type="number" class="form-control" name="rateLimit.global.max" value="${timelineConfig.rateLimit.global.max}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Window (ms)</label>
                      <input type="number" class="form-control" name="rateLimit.global.windowMs" value="${timelineConfig.rateLimit.global.windowMs}" />
                      <small class="text-muted">Current: ${(timelineConfig.rateLimit.global.windowMs/60000).toFixed(0)} minutes</small>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-file-text"></i> Post Operations</strong>
                  </div>
                  <div class="card-body">
                    <h6>Create Posts</h6>
                    <div class="row mb-3">
                      <div class="col-6">
                        <label class="form-label">Max Requests</label>
                        <input type="number" class="form-control" name="rateLimit.posts.create.max" value="${timelineConfig.rateLimit.posts.create.max}" />
                      </div>
                      <div class="col-6">
                        <label class="form-label">Window (ms)</label>
                        <input type="number" class="form-control" name="rateLimit.posts.create.windowMs" value="${timelineConfig.rateLimit.posts.create.windowMs}" />
                      </div>
                    </div>

                    <h6>Update Posts</h6>
                    <div class="row mb-3">
                      <div class="col-6">
                        <label class="form-label">Max Requests</label>
                        <input type="number" class="form-control" name="rateLimit.posts.update.max" value="${timelineConfig.rateLimit.posts.update.max}" />
                      </div>
                      <div class="col-6">
                        <label class="form-label">Window (ms)</label>
                        <input type="number" class="form-control" name="rateLimit.posts.update.windowMs" value="${timelineConfig.rateLimit.posts.update.windowMs}" />
                      </div>
                    </div>

                    <h6>Delete Posts</h6>
                    <div class="row">
                      <div class="col-6">
                        <label class="form-label">Max Requests</label>
                        <input type="number" class="form-control" name="rateLimit.posts.delete.max" value="${timelineConfig.rateLimit.posts.delete.max}" />
                      </div>
                      <div class="col-6">
                        <label class="form-label">Window (ms)</label>
                        <input type="number" class="form-control" name="rateLimit.posts.delete.windowMs" value="${timelineConfig.rateLimit.posts.delete.windowMs}" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-heart"></i> Interaction Operations</strong>
                  </div>
                  <div class="card-body">
                    <h6>Likes</h6>
                    <div class="row mb-3">
                      <div class="col-6">
                        <label class="form-label">Max Requests</label>
                        <input type="number" class="form-control" name="rateLimit.interactions.like.max" value="${timelineConfig.rateLimit.interactions.like.max}" />
                      </div>
                      <div class="col-6">
                        <label class="form-label">Window (ms)</label>
                        <input type="number" class="form-control" name="rateLimit.interactions.like.windowMs" value="${timelineConfig.rateLimit.interactions.like.windowMs}" />
                      </div>
                    </div>

                    <h6>Reposts</h6>
                    <div class="row mb-3">
                      <div class="col-6">
                        <label class="form-label">Max Requests</label>
                        <input type="number" class="form-control" name="rateLimit.interactions.repost.max" value="${timelineConfig.rateLimit.interactions.repost.max}" />
                      </div>
                      <div class="col-6">
                        <label class="form-label">Window (ms)</label>
                        <input type="number" class="form-control" name="rateLimit.interactions.repost.windowMs" value="${timelineConfig.rateLimit.interactions.repost.windowMs}" />
                      </div>
                    </div>

                    <h6>Bookmarks</h6>
                    <div class="row">
                      <div class="col-6">
                        <label class="form-label">Max Requests</label>
                        <input type="number" class="form-control" name="rateLimit.interactions.bookmark.max" value="${timelineConfig.rateLimit.interactions.bookmark.max}" />
                      </div>
                      <div class="col-6">
                        <label class="form-label">Window (ms)</label>
                        <input type="number" class="form-control" name="rateLimit.interactions.bookmark.windowMs" value="${timelineConfig.rateLimit.interactions.bookmark.windowMs}" />
                      </div>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-search"></i> Search Operations</strong>
                  </div>
                  <div class="card-body">
                    <div class="row">
                      <div class="col-6">
                        <label class="form-label">Max Requests</label>
                        <input type="number" class="form-control" name="rateLimit.search.max" value="${timelineConfig.rateLimit.search.max}" />
                      </div>
                      <div class="col-6">
                        <label class="form-label">Window (ms)</label>
                        <input type="number" class="form-control" name="rateLimit.search.windowMs" value="${timelineConfig.rateLimit.search.windowMs}" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Features Tab -->
          <div class="tab-pane fade" id="timeline-features" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-toggles"></i> Core Features</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.search" ${timelineConfig.features.search?'checked':''} />
                      <label class="form-check-label">Search Functionality</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.reactions" ${timelineConfig.features.reactions?'checked':''} />
                      <label class="form-check-label">Reactions (Likes)</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.reposts" ${timelineConfig.features.reposts?'checked':''} />
                      <label class="form-check-label">Reposts</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.quoteReposts" ${timelineConfig.features.quoteReposts?'checked':''} />
                      <label class="form-check-label">Quote Reposts</label>
                      <small class="text-muted d-block">Repost with commentary</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.bookmarks" ${timelineConfig.features.bookmarks?'checked':''} />
                      <label class="form-check-label">Bookmarks</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.lists" ${timelineConfig.features.lists?'checked':''} />
                      <label class="form-check-label">Custom Lists</label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-star"></i> Advanced Features</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.hashtags" ${timelineConfig.features.hashtags?'checked':''} />
                      <label class="form-check-label">Hashtags</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.mentions" ${timelineConfig.features.mentions?'checked':''} />
                      <label class="form-check-label">User Mentions (@)</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.trending" ${timelineConfig.features.trending?'checked':''} />
                      <label class="form-check-label">Trending Content</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.pinnedPosts" ${timelineConfig.features.pinnedPosts?'checked':''} />
                      <label class="form-check-label">Pinned Posts</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.scheduledPosts" ${timelineConfig.features.scheduledPosts?'checked':''} />
                      <label class="form-check-label">Scheduled Posts</label>
                      <small class="text-muted d-block">Post scheduling (Beta)</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.polls" ${timelineConfig.features.polls?'checked':''} />
                      <label class="form-check-label">Polls</label>
                      <small class="text-muted d-block text-warning">Coming soon</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="features.stories" ${timelineConfig.features.stories?'checked':''} />
                      <label class="form-check-label">Stories (24hr posts)</label>
                      <small class="text-muted d-block text-warning">Coming soon</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Real-time Tab -->
          <div class="tab-pane fade" id="timeline-realtime" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-broadcast"></i> Socket.IO Configuration</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="realtime.enabled" ${timelineConfig.realtime.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Socket Path</label>
                      <input type="text" class="form-control" name="realtime.socketPath" value="${timelineConfig.realtime.socketPath}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Ping Interval (ms)</label>
                      <input type="number" class="form-control" name="realtime.pingInterval" value="${timelineConfig.realtime.pingInterval}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Ping Timeout (ms)</label>
                      <input type="number" class="form-control" name="realtime.pingTimeout" value="${timelineConfig.realtime.pingTimeout}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Connections</label>
                      <input type="number" class="form-control" name="realtime.maxConnections" value="${timelineConfig.realtime.maxConnections}" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-broadcast-pin"></i> Real-time Events</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.events.newPost" ${timelineConfig.realtime.events.newPost?'checked':''} />
                      <label class="form-check-label">New Post Events</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.events.postUpdated" ${timelineConfig.realtime.events.postUpdated?'checked':''} />
                      <label class="form-check-label">Post Updated Events</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.events.postDeleted" ${timelineConfig.realtime.events.postDeleted?'checked':''} />
                      <label class="form-check-label">Post Deleted Events</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.events.newLike" ${timelineConfig.realtime.events.newLike?'checked':''} />
                      <label class="form-check-label">New Like Events</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.events.newReply" ${timelineConfig.realtime.events.newReply?'checked':''} />
                      <label class="form-check-label">New Reply Events</label>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-door-open"></i> Room Configuration</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="realtime.rooms.enabled" ${timelineConfig.realtime.rooms.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.rooms.userTimeline" ${timelineConfig.realtime.rooms.userTimeline?'checked':''} />
                      <label class="form-check-label">User Timeline Rooms</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.rooms.homeFeed" ${timelineConfig.realtime.rooms.homeFeed?'checked':''} />
                      <label class="form-check-label">Home Feed Rooms</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.rooms.hashtagFeeds" ${timelineConfig.realtime.rooms.hashtagFeeds?'checked':''} />
                      <label class="form-check-label">Hashtag Feed Rooms</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Performance Tab -->
          <div class="tab-pane fade" id="timeline-performance" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-speedometer2"></i> Caching</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="performance.caching.enabled" ${timelineConfig.performance.caching.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="performance.caching.redisEnabled" ${timelineConfig.performance.caching.redisEnabled?'checked':''} />
                      <label class="form-check-label">Redis Caching</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Cache TTL (seconds)</label>
                      <input type="number" class="form-control" name="performance.caching.ttl" value="${timelineConfig.performance.caching.ttl}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="performance.caching.invalidateOnUpdate" ${timelineConfig.performance.caching.invalidateOnUpdate?'checked':''} />
                      <label class="form-check-label">Invalidate on Update</label>
                      <small class="text-muted d-block">Clear cache when content changes</small>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-file-zip"></i> Compression</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="performance.compression.enabled" ${timelineConfig.performance.compression.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Compression Level (1-9)</label>
                      <input type="number" min="1" max="9" class="form-control" name="performance.compression.level" value="${timelineConfig.performance.compression.level}" />
                      <small class="text-muted">Higher = better compression, slower</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Threshold (bytes)</label>
                      <input type="number" class="form-control" name="performance.compression.threshold" value="${timelineConfig.performance.compression.threshold}" />
                      <small class="text-muted">Only compress responses larger than this</small>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-layout-three-columns"></i> Pagination</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="performance.pagination.cursorBased" ${timelineConfig.performance.pagination.cursorBased?'checked':''} />
                      <label class="form-check-label">Cursor-based Pagination</label>
                      <small class="text-muted d-block">Efficient for infinite scroll</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="performance.pagination.offsetBased" ${timelineConfig.performance.pagination.offsetBased?'checked':''} />
                      <label class="form-check-label">Offset-based Pagination</label>
                      <small class="text-muted d-block">Traditional page numbers</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Default Limit</label>
                      <input type="number" class="form-control" name="performance.pagination.defaultLimit" value="${timelineConfig.performance.pagination.defaultLimit}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Limit</label>
                      <input type="number" class="form-control" name="performance.pagination.maxLimit" value="${timelineConfig.performance.pagination.maxLimit}" />
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-database"></i> Database</strong>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Connection Pool Size</label>
                      <input type="number" class="form-control" name="performance.database.poolSize" value="${timelineConfig.performance.database.poolSize}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Connection Timeout (ms)</label>
                      <input type="number" class="form-control" name="performance.database.connectionTimeout" value="${timelineConfig.performance.database.connectionTimeout}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="performance.database.readReplicas" ${timelineConfig.performance.database.readReplicas?'checked':''} />
                      <label class="form-check-label">Use Read Replicas</label>
                      <small class="text-muted d-block">Distribute read load across replicas</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </form>

      <div style="margin-top:2rem;padding-top:1.5rem;border-top:2px solid #dee2e6;display:flex;justify-content:space-between">
        <button type="button" class="btn btn-outline-secondary" onclick="loadPage('services/timeline')">
          <i class="bi bi-x-circle"></i> Cancel
        </button>
        <button type="button" class="btn btn-primary" onclick="saveTimelineConfig()">
          <i class="bi bi-save"></i> Save All Changes
        </button>
      </div>
    </div>`;
  },

  sparkSettings: async (config) => {
    const sparkConfig = config.config || {
      // Messaging & Conversations
      messaging: {
        maxMessageLength: 10000,
        minMessageLength: 1,
        allowEmptyMessages: false,
        maxEditTime: 900000, // 15 minutes
        deleteMode: 'soft', // soft, hard
        threadingEnabled: true,
        maxThreadDepth: 5,
        mentionsEnabled: true,
        maxMentionsPerMessage: 20
      },

      // Groups & Participants
      groups: {
        enabled: true,
        maxGroupSize: 500,
        allowPublicGroups: true,
        groupAdminsEnabled: true,
        maxAdminsPerGroup: 10,
        allowGroupRoles: true,
        groupDescriptionMaxLength: 500
      },

      // End-to-End Encryption
      encryption: {
        e2eeEnabled: false,
        algorithm: 'AES-256-GCM',
        keyRotationEnabled: false,
        keyRotationDays: 90,
        deviceVerificationRequired: false,
        encryptMetadata: true,
        perfectForwardSecrecy: true,
        keyDerivationFunction: 'PBKDF2'
      },

      // File Sharing & Media
      fileSharing: {
        enabled: true,
        maxFileSize: 104857600, // 100MB
        maxAttachmentsPerMessage: 10,
        allowedMimeTypes: ['image/*', 'video/*', 'audio/*', 'application/pdf', 'text/*'],
        storageType: 'filevault', // local, s3, filevault
        storageLocal: {
          path: './uploads/spark',
          servePath: '/uploads/spark'
        },
        storageS3: {
          bucket: 'exprsn-spark-files',
          region: 'us-east-1',
          accessKeyId: '',
          secretAccessKey: ''
        },
        storageFilevault: {
          serviceUrl: 'http://localhost:3007',
          enabled: true
        },
        mediaProcessing: {
          enabled: true,
          generateThumbnails: true,
          thumbnailSizes: [150, 300, 600],
          compressImages: true,
          imageQuality: 85,
          videoTranscodingEnabled: false
        }
      },

      // Real-time Features
      realtime: {
        socketEnabled: true,
        socketPort: 3003,
        socketPath: '/socket.io',
        pingInterval: 25000,
        pingTimeout: 60000,
        maxConnections: 10000,
        typingIndicators: {
          enabled: true,
          timeout: 5000,
          throttle: 1000
        },
        readReceipts: {
          enabled: true,
          deliveryReceipts: true,
          sendReadEvents: true
        },
        presence: {
          enabled: true,
          statusOptions: ['online', 'away', 'busy', 'offline'],
          autoAwayTimeout: 300000, // 5 minutes
          shareLastSeen: true
        },
        liveUpdates: {
          messageEdits: true,
          messageDeletions: true,
          reactions: true,
          conversationUpdates: true
        }
      },

      // Reactions & Interactions
      reactions: {
        enabled: true,
        maxReactionsPerMessage: 50,
        maxUniqueEmojis: 20,
        customEmojisEnabled: false,
        reactionNotifications: true,
        allowedEmojis: ['👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🎉']
      },

      // Search & Discovery
      search: {
        enabled: true,
        elasticsearchEnabled: false,
        elasticsearchUrl: 'http://localhost:9200',
        elasticsearchIndexPrefix: 'spark_',
        fullTextSearch: true,
        searchHistory: true,
        maxSearchResults: 100,
        indexing: {
          realtime: true,
          batchSize: 100
        }
      },

      // Notifications & Herald
      notifications: {
        enabled: true,
        heraldServiceUrl: 'http://localhost:3014',
        notifyOnMessage: true,
        notifyOnMention: true,
        notifyOnReaction: true,
        notifyOnGroupInvite: true,
        mutedConversations: true,
        userNotificationPreferences: true,
        quietHours: {
          enabled: false,
          startTime: '22:00',
          endTime: '08:00'
        }
      },

      // Voice & Video Calls
      calls: {
        enabled: false, // Planned feature
        webrtcSignaling: true,
        stunServers: ['stun:stun.l.google.com:19302'],
        turnServers: [],
        maxCallParticipants: 50,
        recordingEnabled: false,
        screenShareEnabled: true,
        callQuality: 'high', // low, medium, high
        callTimeout: 60000
      },

      // Background Jobs & Queues
      queues: {
        enabled: false, // Planned feature
        redisHost: 'localhost',
        redisPort: 6379,
        queueName: 'spark',
        jobs: {
          notifications: {
            enabled: true,
            concurrency: 5,
            attempts: 3
          },
          fileProcessing: {
            enabled: true,
            concurrency: 3,
            timeout: 300000
          },
          searchIndexing: {
            enabled: false,
            concurrency: 10,
            batchSize: 100
          }
        }
      },

      // Rate Limiting
      rateLimit: {
        enabled: true,
        messages: {
          perMinute: 60,
          perHour: 1000,
          burstAllowed: 10
        },
        uploads: {
          perHour: 50,
          perDay: 200
        },
        api: {
          global: {
            max: 1000,
            windowMs: 900000
          },
          perEndpoint: {
            conversations: { max: 100, windowMs: 60000 },
            messages: { max: 200, windowMs: 60000 },
            search: { max: 50, windowMs: 60000 }
          }
        }
      },

      // Security & Privacy
      security: {
        contentScanningEnabled: true,
        linkPreviewEnabled: true,
        linkPreviewTimeout: 5000,
        allowExternalEmbeds: false,
        spamDetection: true,
        moderationServiceUrl: 'http://localhost:3006',
        messageRetentionDays: 0, // 0 = forever
        autoDeleteEnabled: false,
        autoDeleteDays: 90,
        dataEncryptionAtRest: true,
        auditLogging: {
          enabled: true,
          logMessages: false, // Privacy
          logEvents: true,
          retentionDays: 365
        }
      },

      // Performance & Caching
      performance: {
        caching: {
          enabled: true,
          redisEnabled: true,
          redisHost: 'localhost',
          redisPort: 6379,
          ttl: {
            conversations: 300,
            messages: 600,
            presence: 60
          }
        },
        pagination: {
          defaultLimit: 50,
          maxLimit: 200,
          cursorBased: true
        },
        database: {
          poolSize: 20,
          connectionTimeout: 30000,
          readReplicas: false
        },
        compression: {
          enabled: true,
          threshold: 1024
        }
      },

      // Advanced Features
      features: {
        messageForwarding: false, // Planned
        messagePinning: false, // Planned
        messageScheduling: false, // Planned
        pollsEnabled: false, // Planned
        locationSharingEnabled: false, // Planned
        contactSharingEnabled: true,
        voiceMessagesEnabled: true,
        richTextFormatting: false, // Planned
        codeBlocksEnabled: false // Planned
      }
    };

    return `<div style="background:white;padding:2rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
      <h2 style="margin-bottom:1.5rem">
        <i class="bi bi-chat-dots"></i> Spark Messaging Service Configuration
      </h2>

      <ul class="nav nav-tabs" id="spark-config-tabs" role="tablist" style="margin-bottom:1.5rem">
        <li class="nav-item" role="presentation">
          <button class="nav-link active" id="spark-messaging-tab" data-bs-toggle="tab" data-bs-target="#spark-messaging" type="button">
            <i class="bi bi-chat-text"></i> Messaging
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="spark-groups-tab" data-bs-toggle="tab" data-bs-target="#spark-groups" type="button">
            <i class="bi bi-people"></i> Groups
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="spark-encryption-tab" data-bs-toggle="tab" data-bs-target="#spark-encryption" type="button">
            <i class="bi bi-shield-lock"></i> Encryption
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="spark-files-tab" data-bs-toggle="tab" data-bs-target="#spark-files" type="button">
            <i class="bi bi-paperclip"></i> File Sharing
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="spark-realtime-tab" data-bs-toggle="tab" data-bs-target="#spark-realtime" type="button">
            <i class="bi bi-broadcast"></i> Real-time
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="spark-reactions-tab" data-bs-toggle="tab" data-bs-target="#spark-reactions" type="button">
            <i class="bi bi-emoji-smile"></i> Reactions
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="spark-search-tab" data-bs-toggle="tab" data-bs-target="#spark-search" type="button">
            <i class="bi bi-search"></i> Search
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="spark-notifications-tab" data-bs-toggle="tab" data-bs-target="#spark-notifications" type="button">
            <i class="bi bi-bell"></i> Notifications
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="spark-calls-tab" data-bs-toggle="tab" data-bs-target="#spark-calls" type="button">
            <i class="bi bi-telephone"></i> Calls
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="spark-security-tab" data-bs-toggle="tab" data-bs-target="#spark-security" type="button">
            <i class="bi bi-shield-check"></i> Security
          </button>
        </li>
        <li class="nav-item" role="presentation">
          <button class="nav-link" id="spark-performance-tab" data-bs-toggle="tab" data-bs-target="#spark-performance" type="button">
            <i class="bi bi-speedometer2"></i> Performance
          </button>
        </li>
      </ul>

      <form id="spark-config-form">
        <div class="tab-content" id="spark-config-tabContent">

          <!-- Messaging Tab -->
          <div class="tab-pane fade show active" id="spark-messaging" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-chat-square-text"></i> Message Settings</strong>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Max Message Length (characters)</label>
                      <input type="number" class="form-control" name="messaging.maxMessageLength" value="${sparkConfig.messaging.maxMessageLength}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Min Message Length (characters)</label>
                      <input type="number" class="form-control" name="messaging.minMessageLength" value="${sparkConfig.messaging.minMessageLength}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="messaging.allowEmptyMessages" ${sparkConfig.messaging.allowEmptyMessages?'checked':''} />
                      <label class="form-check-label">Allow Empty Messages (attachments-only)</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Edit Time (ms)</label>
                      <input type="number" class="form-control" name="messaging.maxEditTime" value="${sparkConfig.messaging.maxEditTime}" />
                      <small class="text-muted">Current: ${(sparkConfig.messaging.maxEditTime/60000).toFixed(0)} minutes</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Delete Mode</label>
                      <select class="form-select" name="messaging.deleteMode">
                        <option value="soft" ${sparkConfig.messaging.deleteMode==='soft'?'selected':''}>Soft Delete (recoverable)</option>
                        <option value="hard" ${sparkConfig.messaging.deleteMode==='hard'?'selected':''}>Hard Delete (permanent)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-reply"></i> Threading & Mentions</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="messaging.threadingEnabled" ${sparkConfig.messaging.threadingEnabled?'checked':''} />
                      <label class="form-check-label">Enable Message Threading</label>
                      <small class="text-muted d-block">Allow replies to specific messages</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Thread Depth</label>
                      <input type="number" class="form-control" name="messaging.maxThreadDepth" value="${sparkConfig.messaging.maxThreadDepth}" />
                    </div>
                    <hr />
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="messaging.mentionsEnabled" ${sparkConfig.messaging.mentionsEnabled?'checked':''} />
                      <label class="form-check-label">Enable User Mentions (@)</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Mentions Per Message</label>
                      <input type="number" class="form-control" name="messaging.maxMentionsPerMessage" value="${sparkConfig.messaging.maxMentionsPerMessage}" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Groups Tab -->
          <div class="tab-pane fade" id="spark-groups" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-people-fill"></i> Group Configuration</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="groups.enabled" ${sparkConfig.groups.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Max Group Size (participants)</label>
                      <input type="number" class="form-control" name="groups.maxGroupSize" value="${sparkConfig.groups.maxGroupSize}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="groups.allowPublicGroups" ${sparkConfig.groups.allowPublicGroups?'checked':''} />
                      <label class="form-check-label">Allow Public Groups</label>
                      <small class="text-muted d-block">Groups that anyone can join</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Group Description Max Length</label>
                      <input type="number" class="form-control" name="groups.groupDescriptionMaxLength" value="${sparkConfig.groups.groupDescriptionMaxLength}" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-person-badge"></i> Group Administration</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="groups.groupAdminsEnabled" ${sparkConfig.groups.groupAdminsEnabled?'checked':''} />
                      <label class="form-check-label">Enable Group Admins</label>
                      <small class="text-muted d-block">Allow admin roles in groups</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Admins Per Group</label>
                      <input type="number" class="form-control" name="groups.maxAdminsPerGroup" value="${sparkConfig.groups.maxAdminsPerGroup}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="groups.allowGroupRoles" ${sparkConfig.groups.allowGroupRoles?'checked':''} />
                      <label class="form-check-label">Allow Custom Group Roles</label>
                      <small class="text-muted d-block">Beyond owner/admin/member</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Encryption Tab -->
          <div class="tab-pane fade" id="spark-encryption" role="tabpanel">
            <div class="alert alert-warning">
              <i class="bi bi-info-circle"></i> <strong>Note:</strong> End-to-end encryption is a planned feature currently in development.
            </div>
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-lock-fill"></i> E2EE Configuration</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="encryption.e2eeEnabled" ${sparkConfig.encryption.e2eeEnabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Encryption Algorithm</label>
                      <select class="form-select" name="encryption.algorithm">
                        <option value="AES-256-GCM" ${sparkConfig.encryption.algorithm==='AES-256-GCM'?'selected':''}>AES-256-GCM</option>
                        <option value="ChaCha20-Poly1305" ${sparkConfig.encryption.algorithm==='ChaCha20-Poly1305'?'selected':''}>ChaCha20-Poly1305</option>
                      </select>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Key Derivation Function</label>
                      <select class="form-select" name="encryption.keyDerivationFunction">
                        <option value="PBKDF2" ${sparkConfig.encryption.keyDerivationFunction==='PBKDF2'?'selected':''}>PBKDF2</option>
                        <option value="Argon2" ${sparkConfig.encryption.keyDerivationFunction==='Argon2'?'selected':''}>Argon2</option>
                        <option value="scrypt" ${sparkConfig.encryption.keyDerivationFunction==='scrypt'?'selected':''}>scrypt</option>
                      </select>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="encryption.deviceVerificationRequired" ${sparkConfig.encryption.deviceVerificationRequired?'checked':''} />
                      <label class="form-check-label">Require Device Verification</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="encryption.encryptMetadata" ${sparkConfig.encryption.encryptMetadata?'checked':''} />
                      <label class="form-check-label">Encrypt Message Metadata</label>
                      <small class="text-muted d-block">Timestamps, sender info, etc.</small>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-arrow-repeat"></i> Key Management</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="encryption.keyRotationEnabled" ${sparkConfig.encryption.keyRotationEnabled?'checked':''} />
                      <label class="form-check-label">Enable Key Rotation</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Key Rotation Period (days)</label>
                      <input type="number" class="form-control" name="encryption.keyRotationDays" value="${sparkConfig.encryption.keyRotationDays}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="encryption.perfectForwardSecrecy" ${sparkConfig.encryption.perfectForwardSecrecy?'checked':''} />
                      <label class="form-check-label">Perfect Forward Secrecy</label>
                      <small class="text-muted d-block">Generate new keys for each session</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- File Sharing Tab -->
          <div class="tab-pane fade" id="spark-files" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-file-earmark"></i> File Upload Settings</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="fileSharing.enabled" ${sparkConfig.fileSharing.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Max File Size (bytes)</label>
                      <input type="number" class="form-control" name="fileSharing.maxFileSize" value="${sparkConfig.fileSharing.maxFileSize}" />
                      <small class="text-muted">Current: ${(sparkConfig.fileSharing.maxFileSize/1024/1024).toFixed(2)} MB</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Attachments Per Message</label>
                      <input type="number" class="form-control" name="fileSharing.maxAttachmentsPerMessage" value="${sparkConfig.fileSharing.maxAttachmentsPerMessage}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Storage Type</label>
                      <select class="form-select" name="fileSharing.storageType">
                        <option value="local" ${sparkConfig.fileSharing.storageType==='local'?'selected':''}>Local Disk</option>
                        <option value="s3" ${sparkConfig.fileSharing.storageType==='s3'?'selected':''}>Amazon S3</option>
                        <option value="filevault" ${sparkConfig.fileSharing.storageType==='filevault'?'selected':''}>FileVault Service</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-cloud-upload"></i> Storage Configuration</strong>
                  </div>
                  <div class="card-body">
                    <h6>Local Storage</h6>
                    <div class="mb-3">
                      <label class="form-label">Local Path</label>
                      <input type="text" class="form-control" name="fileSharing.storageLocal.path" value="${sparkConfig.fileSharing.storageLocal.path}" />
                    </div>

                    <hr />

                    <h6>FileVault Service</h6>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="fileSharing.storageFilevault.enabled" ${sparkConfig.fileSharing.storageFilevault.enabled?'checked':''} />
                      <label class="form-check-label">Use FileVault Service</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">FileVault URL</label>
                      <input type="text" class="form-control" name="fileSharing.storageFilevault.serviceUrl" value="${sparkConfig.fileSharing.storageFilevault.serviceUrl}" />
                    </div>

                    <hr />

                    <h6>Amazon S3</h6>
                    <div class="mb-3">
                      <label class="form-label">S3 Bucket Name</label>
                      <input type="text" class="form-control" name="fileSharing.storageS3.bucket" value="${sparkConfig.fileSharing.storageS3.bucket}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">S3 Region</label>
                      <input type="text" class="form-control" name="fileSharing.storageS3.region" value="${sparkConfig.fileSharing.storageS3.region}" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-image"></i> Media Processing</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="fileSharing.mediaProcessing.enabled" ${sparkConfig.fileSharing.mediaProcessing.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="fileSharing.mediaProcessing.generateThumbnails" ${sparkConfig.fileSharing.mediaProcessing.generateThumbnails?'checked':''} />
                      <label class="form-check-label">Generate Thumbnails</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="fileSharing.mediaProcessing.compressImages" ${sparkConfig.fileSharing.mediaProcessing.compressImages?'checked':''} />
                      <label class="form-check-label">Compress Images</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Image Quality (1-100)</label>
                      <input type="number" min="1" max="100" class="form-control" name="fileSharing.mediaProcessing.imageQuality" value="${sparkConfig.fileSharing.mediaProcessing.imageQuality}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="fileSharing.mediaProcessing.videoTranscodingEnabled" ${sparkConfig.fileSharing.mediaProcessing.videoTranscodingEnabled?'checked':''} />
                      <label class="form-check-label">Video Transcoding</label>
                      <small class="text-muted d-block">Convert videos to web-friendly formats</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Real-time Tab -->
          <div class="tab-pane fade" id="spark-realtime" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-broadcast"></i> WebSocket Configuration</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="realtime.socketEnabled" ${sparkConfig.realtime.socketEnabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">WebSocket Port</label>
                      <input type="number" class="form-control" name="realtime.socketPort" value="${sparkConfig.realtime.socketPort}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Socket Path</label>
                      <input type="text" class="form-control" name="realtime.socketPath" value="${sparkConfig.realtime.socketPath}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Ping Interval (ms)</label>
                      <input type="number" class="form-control" name="realtime.pingInterval" value="${sparkConfig.realtime.pingInterval}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Ping Timeout (ms)</label>
                      <input type="number" class="form-control" name="realtime.pingTimeout" value="${sparkConfig.realtime.pingTimeout}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Connections</label>
                      <input type="number" class="form-control" name="realtime.maxConnections" value="${sparkConfig.realtime.maxConnections}" />
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-chat-dots"></i> Typing Indicators</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="realtime.typingIndicators.enabled" ${sparkConfig.realtime.typingIndicators.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Timeout (ms)</label>
                      <input type="number" class="form-control" name="realtime.typingIndicators.timeout" value="${sparkConfig.realtime.typingIndicators.timeout}" />
                      <small class="text-muted">How long indicator shows after last keystroke</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Throttle (ms)</label>
                      <input type="number" class="form-control" name="realtime.typingIndicators.throttle" value="${sparkConfig.realtime.typingIndicators.throttle}" />
                      <small class="text-muted">Minimum time between updates</small>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-check-circle"></i> Read Receipts</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="realtime.readReceipts.enabled" ${sparkConfig.realtime.readReceipts.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.readReceipts.deliveryReceipts" ${sparkConfig.realtime.readReceipts.deliveryReceipts?'checked':''} />
                      <label class="form-check-label">Delivery Receipts</label>
                      <small class="text-muted d-block">Show when message delivered</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.readReceipts.sendReadEvents" ${sparkConfig.realtime.readReceipts.sendReadEvents?'checked':''} />
                      <label class="form-check-label">Send Read Events</label>
                      <small class="text-muted d-block">Notify senders when messages read</small>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-person-circle"></i> Presence System</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="realtime.presence.enabled" ${sparkConfig.realtime.presence.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Auto-Away Timeout (ms)</label>
                      <input type="number" class="form-control" name="realtime.presence.autoAwayTimeout" value="${sparkConfig.realtime.presence.autoAwayTimeout}" />
                      <small class="text-muted">Current: ${(sparkConfig.realtime.presence.autoAwayTimeout/60000).toFixed(0)} minutes</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.presence.shareLastSeen" ${sparkConfig.realtime.presence.shareLastSeen?'checked':''} />
                      <label class="form-check-label">Share "Last Seen" Timestamp</label>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-arrow-repeat"></i> Live Updates</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.liveUpdates.messageEdits" ${sparkConfig.realtime.liveUpdates.messageEdits?'checked':''} />
                      <label class="form-check-label">Message Edits</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.liveUpdates.messageDeletions" ${sparkConfig.realtime.liveUpdates.messageDeletions?'checked':''} />
                      <label class="form-check-label">Message Deletions</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.liveUpdates.reactions" ${sparkConfig.realtime.liveUpdates.reactions?'checked':''} />
                      <label class="form-check-label">Reactions</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="realtime.liveUpdates.conversationUpdates" ${sparkConfig.realtime.liveUpdates.conversationUpdates?'checked':''} />
                      <label class="form-check-label">Conversation Updates</label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Reactions Tab -->
          <div class="tab-pane fade" id="spark-reactions" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-emoji-smile-fill"></i> Reaction Settings</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="reactions.enabled" ${sparkConfig.reactions.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Max Reactions Per Message</label>
                      <input type="number" class="form-control" name="reactions.maxReactionsPerMessage" value="${sparkConfig.reactions.maxReactionsPerMessage}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Unique Emojis</label>
                      <input type="number" class="form-control" name="reactions.maxUniqueEmojis" value="${sparkConfig.reactions.maxUniqueEmojis}" />
                      <small class="text-muted">Different emoji types per message</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="reactions.customEmojisEnabled" ${sparkConfig.reactions.customEmojisEnabled?'checked':''} />
                      <label class="form-check-label">Custom Emojis</label>
                      <small class="text-muted d-block">Allow custom emoji uploads (Planned)</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="reactions.reactionNotifications" ${sparkConfig.reactions.reactionNotifications?'checked':''} />
                      <label class="form-check-label">Reaction Notifications</label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-emoji-laughing"></i> Allowed Emojis</strong>
                  </div>
                  <div class="card-body">
                    <p class="text-muted small">Default allowed reaction emojis:</p>
                    <div style="font-size:2rem;display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem">
                      ${sparkConfig.reactions.allowedEmojis.map(emoji => `<span>${emoji}</span>`).join('')}
                    </div>
                    <p class="text-muted small"><em>Emoji customization available in future release</em></p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Search Tab -->
          <div class="tab-pane fade" id="spark-search" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-search"></i> Search Configuration</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="search.enabled" ${sparkConfig.search.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="search.fullTextSearch" ${sparkConfig.search.fullTextSearch?'checked':''} />
                      <label class="form-check-label">Full-Text Search</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="search.searchHistory" ${sparkConfig.search.searchHistory?'checked':''} />
                      <label class="form-check-label">Search History</label>
                      <small class="text-muted d-block">Save user search history</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Search Results</label>
                      <input type="number" class="form-control" name="search.maxSearchResults" value="${sparkConfig.search.maxSearchResults}" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-diagram-3"></i> Elasticsearch (Planned)</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="search.elasticsearchEnabled" ${sparkConfig.search.elasticsearchEnabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Elasticsearch URL</label>
                      <input type="text" class="form-control" name="search.elasticsearchUrl" value="${sparkConfig.search.elasticsearchUrl}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Index Prefix</label>
                      <input type="text" class="form-control" name="search.elasticsearchIndexPrefix" value="${sparkConfig.search.elasticsearchIndexPrefix}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="search.indexing.realtime" ${sparkConfig.search.indexing.realtime?'checked':''} />
                      <label class="form-check-label">Real-time Indexing</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Index Batch Size</label>
                      <input type="number" class="form-control" name="search.indexing.batchSize" value="${sparkConfig.search.indexing.batchSize}" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Notifications Tab -->
          <div class="tab-pane fade" id="spark-notifications" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-bell-fill"></i> Herald Integration</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="notifications.enabled" ${sparkConfig.notifications.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Herald Service URL</label>
                      <input type="text" class="form-control" name="notifications.heraldServiceUrl" value="${sparkConfig.notifications.heraldServiceUrl}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="notifications.notifyOnMessage" ${sparkConfig.notifications.notifyOnMessage?'checked':''} />
                      <label class="form-check-label">Notify on New Message</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="notifications.notifyOnMention" ${sparkConfig.notifications.notifyOnMention?'checked':''} />
                      <label class="form-check-label">Notify on Mention</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="notifications.notifyOnReaction" ${sparkConfig.notifications.notifyOnReaction?'checked':''} />
                      <label class="form-check-label">Notify on Reaction</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="notifications.notifyOnGroupInvite" ${sparkConfig.notifications.notifyOnGroupInvite?'checked':''} />
                      <label class="form-check-label">Notify on Group Invite</label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-gear"></i> Notification Preferences</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="notifications.mutedConversations" ${sparkConfig.notifications.mutedConversations?'checked':''} />
                      <label class="form-check-label">Allow Muted Conversations</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="notifications.userNotificationPreferences" ${sparkConfig.notifications.userNotificationPreferences?'checked':''} />
                      <label class="form-check-label">User-Controlled Preferences</label>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-moon"></i> Quiet Hours</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="notifications.quietHours.enabled" ${sparkConfig.notifications.quietHours.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Start Time</label>
                      <input type="time" class="form-control" name="notifications.quietHours.startTime" value="${sparkConfig.notifications.quietHours.startTime}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">End Time</label>
                      <input type="time" class="form-control" name="notifications.quietHours.endTime" value="${sparkConfig.notifications.quietHours.endTime}" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Calls Tab -->
          <div class="tab-pane fade" id="spark-calls" role="tabpanel">
            <div class="alert alert-warning">
              <i class="bi bi-info-circle"></i> <strong>Note:</strong> Voice and video calling is a planned feature currently in development.
            </div>
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-telephone-fill"></i> Call Configuration</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="calls.enabled" ${sparkConfig.calls.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="calls.webrtcSignaling" ${sparkConfig.calls.webrtcSignaling?'checked':''} />
                      <label class="form-check-label">WebRTC Signaling</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Call Participants</label>
                      <input type="number" class="form-control" name="calls.maxCallParticipants" value="${sparkConfig.calls.maxCallParticipants}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="calls.recordingEnabled" ${sparkConfig.calls.recordingEnabled?'checked':''} />
                      <label class="form-check-label">Call Recording</label>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="calls.screenShareEnabled" ${sparkConfig.calls.screenShareEnabled?'checked':''} />
                      <label class="form-check-label">Screen Sharing</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Call Quality</label>
                      <select class="form-select" name="calls.callQuality">
                        <option value="low" ${sparkConfig.calls.callQuality==='low'?'selected':''}>Low (saves bandwidth)</option>
                        <option value="medium" ${sparkConfig.calls.callQuality==='medium'?'selected':''}>Medium</option>
                        <option value="high" ${sparkConfig.calls.callQuality==='high'?'selected':''}>High</option>
                      </select>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Call Timeout (ms)</label>
                      <input type="number" class="form-control" name="calls.callTimeout" value="${sparkConfig.calls.callTimeout}" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-hdd-network"></i> STUN/TURN Servers</strong>
                  </div>
                  <div class="card-body">
                    <p class="text-muted small">Required for NAT traversal and peer connectivity</p>
                    <div class="mb-3">
                      <label class="form-label">STUN Servers (one per line)</label>
                      <textarea class="form-control" rows="3" name="calls.stunServers" readonly>${sparkConfig.calls.stunServers.join('\n')}</textarea>
                      <small class="text-muted">Using Google's public STUN server</small>
                    </div>
                    <p class="text-muted small"><em>TURN server configuration available in future release</em></p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Security Tab -->
          <div class="tab-pane fade" id="spark-security" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-shield-fill-check"></i> Security Settings</strong>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="security.contentScanningEnabled" ${sparkConfig.security.contentScanningEnabled?'checked':''} />
                      <label class="form-check-label">Content Scanning</label>
                      <small class="text-muted d-block">Scan for malicious content</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="security.spamDetection" ${sparkConfig.security.spamDetection?'checked':''} />
                      <label class="form-check-label">Spam Detection</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Moderator Service URL</label>
                      <input type="text" class="form-control" name="security.moderationServiceUrl" value="${sparkConfig.security.moderationServiceUrl}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="security.dataEncryptionAtRest" ${sparkConfig.security.dataEncryptionAtRest?'checked':''} />
                      <label class="form-check-label">Data Encryption at Rest</label>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-link-45deg"></i> Link Previews</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="security.linkPreviewEnabled" ${sparkConfig.security.linkPreviewEnabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Preview Timeout (ms)</label>
                      <input type="number" class="form-control" name="security.linkPreviewTimeout" value="${sparkConfig.security.linkPreviewTimeout}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="security.allowExternalEmbeds" ${sparkConfig.security.allowExternalEmbeds?'checked':''} />
                      <label class="form-check-label">Allow External Embeds</label>
                      <small class="text-muted d-block">YouTube, etc.</small>
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-clock-history"></i> Message Retention</strong>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Retention Days (0 = forever)</label>
                      <input type="number" class="form-control" name="security.messageRetentionDays" value="${sparkConfig.security.messageRetentionDays}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="security.autoDeleteEnabled" ${sparkConfig.security.autoDeleteEnabled?'checked':''} />
                      <label class="form-check-label">Auto-Delete Old Messages</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Auto-Delete After (days)</label>
                      <input type="number" class="form-control" name="security.autoDeleteDays" value="${sparkConfig.security.autoDeleteDays}" />
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-journal-text"></i> Audit Logging</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="security.auditLogging.enabled" ${sparkConfig.security.auditLogging.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="security.auditLogging.logMessages" ${sparkConfig.security.auditLogging.logMessages?'checked':''} />
                      <label class="form-check-label">Log Message Content</label>
                      <small class="text-muted d-block text-danger">Privacy concern</small>
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="security.auditLogging.logEvents" ${sparkConfig.security.auditLogging.logEvents?'checked':''} />
                      <label class="form-check-label">Log Events</label>
                      <small class="text-muted d-block">User actions, system events</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Retention Days</label>
                      <input type="number" class="form-control" name="security.auditLogging.retentionDays" value="${sparkConfig.security.auditLogging.retentionDays}" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Performance Tab -->
          <div class="tab-pane fade" id="spark-performance" role="tabpanel">
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-speedometer2"></i> Caching</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="performance.caching.enabled" ${sparkConfig.performance.caching.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="performance.caching.redisEnabled" ${sparkConfig.performance.caching.redisEnabled?'checked':''} />
                      <label class="form-check-label">Redis Caching</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Redis Host</label>
                      <input type="text" class="form-control" name="performance.caching.redisHost" value="${sparkConfig.performance.caching.redisHost}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Redis Port</label>
                      <input type="number" class="form-control" name="performance.caching.redisPort" value="${sparkConfig.performance.caching.redisPort}" />
                    </div>
                    <hr />
                    <h6>Cache TTL (seconds)</h6>
                    <div class="mb-3">
                      <label class="form-label">Conversations</label>
                      <input type="number" class="form-control" name="performance.caching.ttl.conversations" value="${sparkConfig.performance.caching.ttl.conversations}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Messages</label>
                      <input type="number" class="form-control" name="performance.caching.ttl.messages" value="${sparkConfig.performance.caching.ttl.messages}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Presence</label>
                      <input type="number" class="form-control" name="performance.caching.ttl.presence" value="${sparkConfig.performance.caching.ttl.presence}" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-layout-three-columns"></i> Pagination</strong>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Default Limit</label>
                      <input type="number" class="form-control" name="performance.pagination.defaultLimit" value="${sparkConfig.performance.pagination.defaultLimit}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Max Limit</label>
                      <input type="number" class="form-control" name="performance.pagination.maxLimit" value="${sparkConfig.performance.pagination.maxLimit}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="performance.pagination.cursorBased" ${sparkConfig.performance.pagination.cursorBased?'checked':''} />
                      <label class="form-check-label">Cursor-Based Pagination</label>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-database"></i> Database</strong>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Connection Pool Size</label>
                      <input type="number" class="form-control" name="performance.database.poolSize" value="${sparkConfig.performance.database.poolSize}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Connection Timeout (ms)</label>
                      <input type="number" class="form-control" name="performance.database.connectionTimeout" value="${sparkConfig.performance.database.connectionTimeout}" />
                    </div>
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="performance.database.readReplicas" ${sparkConfig.performance.database.readReplicas?'checked':''} />
                      <label class="form-check-label">Use Read Replicas</label>
                    </div>
                  </div>
                </div>

                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-file-zip"></i> Compression</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="performance.compression.enabled" ${sparkConfig.performance.compression.enabled?'checked':''} />
                      <label class="form-check-label">Enabled</label>
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">Threshold (bytes)</label>
                      <input type="number" class="form-control" name="performance.compression.threshold" value="${sparkConfig.performance.compression.threshold}" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </form>

      <div style="margin-top:2rem;padding-top:1.5rem;border-top:2px solid #dee2e6;display:flex;justify-content:space-between">
        <button type="button" class="btn btn-outline-secondary" onclick="loadPage('services/spark')">
          <i class="bi bi-x-circle"></i> Cancel
        </button>
        <button type="button" class="btn btn-primary" onclick="saveSparkConfig()">
          <i class="bi bi-save"></i> Save All Changes
        </button>
      </div>
    </div>`;
  },

  moderatorSettings: async (config) => {
    const moderatorConfig = config.config || {
      // AI Providers
      aiProviders: {
        claude: {
          enabled: true,
          apiKey: '',
          model: 'claude-3-5-sonnet-20241022',
          priority: 1,
          maxRetries: 3,
          timeout: 30000
        },
        openai: {
          enabled: true,
          apiKey: '',
          model: 'gpt-4-turbo-preview',
          priority: 2,
          maxRetries: 3,
          timeout: 30000
        },
        deepseek: {
          enabled: false,
          apiKey: '',
          model: 'deepseek-chat',
          priority: 3,
          maxRetries: 2,
          timeout: 30000
        },
        failoverEnabled: true,
        cacheResults: true,
        cacheTTL: 3600
      },

      // Thresholds & Scoring
      thresholds: {
        autoApprove: 30,
        manualReview: 51,
        autoReject: 91,
        riskLevels: {
          safe: { min: 0, max: 30, color: 'success' },
          low: { min: 31, max: 50, color: 'info' },
          medium: { min: 51, max: 70, color: 'warning' },
          high: { min: 71, max: 90, color: 'danger' },
          critical: { min: 91, max: 100, color: 'dark' }
        },
        categoryWeights: {
          toxicity: 1.5,
          hate: 2.0,
          violence: 1.8,
          nsfw: 1.2,
          spam: 0.8
        }
      },

      // Detection Categories
      detection: {
        toxicity: {
          enabled: true,
          threshold: 0.7,
          weight: 1.5,
          autoAction: 'flag'
        },
        hate: {
          enabled: true,
          threshold: 0.8,
          weight: 2.0,
          autoAction: 'remove'
        },
        violence: {
          enabled: true,
          threshold: 0.75,
          weight: 1.8,
          autoAction: 'flag'
        },
        nsfw: {
          enabled: true,
          threshold: 0.7,
          weight: 1.2,
          autoAction: 'flag'
        },
        spam: {
          enabled: true,
          threshold: 0.6,
          weight: 0.8,
          autoAction: 'flag'
        },
        pii: {
          enabled: false,
          threshold: 0.9,
          weight: 1.5,
          autoAction: 'redact'
        }
      },

      // Automation & Workflows
      automation: {
        autoModeration: true,
        autoApprove: true,
        autoReject: true,
        autoFlag: true,
        workflows: {
          contentApproval: {
            enabled: true,
            steps: ['ai_analysis', 'rule_check', 'auto_decision'],
            escalateToHuman: true,
            escalateThreshold: 51
          },
          userReporting: {
            enabled: true,
            threshold: 3,
            autoEscalate: true
          },
          appealProcess: {
            enabled: true,
            autoApprove: false,
            requireReview: true,
            deadlineDays: 7
          }
        }
      },

      // Rules Engine
      rules: {
        enabled: true,
        customRules: [],
        templates: [
          {
            id: 'profanity-filter',
            name: 'Profanity Filter',
            description: 'Block posts containing profanity',
            enabled: true,
            conditions: [
              { field: 'content', operator: 'contains', value: 'profanity_list', caseSensitive: false }
            ],
            action: 'flag',
            severity: 'medium'
          },
          {
            id: 'spam-detection',
            name: 'Spam Link Detection',
            description: 'Flag posts with excessive links',
            enabled: true,
            conditions: [
              { field: 'linkCount', operator: 'greaterThan', value: 3 }
            ],
            action: 'flag',
            severity: 'low'
          },
          {
            id: 'hate-speech',
            name: 'Hate Speech Protection',
            description: 'Remove hate speech content',
            enabled: true,
            conditions: [
              { field: 'hateScore', operator: 'greaterThan', value: 0.8 }
            ],
            action: 'remove',
            severity: 'high'
          }
        ]
      },

      // Review Queue
      reviewQueue: {
        enabled: true,
        priorityLevels: ['low', 'medium', 'high', 'urgent'],
        assignment: {
          automatic: true,
          roundRobin: true,
          loadBalancing: true
        },
        sla: {
          urgent: 1,    // hours
          high: 4,
          medium: 24,
          low: 72
        },
        notifications: {
          onAssignment: true,
          onEscalation: true,
          onDeadline: true
        }
      },

      // Appeals System
      appeals: {
        enabled: true,
        allowAppeals: true,
        maxAppealsPerCase: 2,
        appealWindow: 30,  // days
        requireReason: true,
        autoReviewEnabled: false,
        notifyOnDecision: true,
        deadlineDays: 7
      },

      // User Actions & Penalties
      userActions: {
        enabled: true,
        actions: {
          warn: {
            enabled: true,
            threshold: 3,
            resetAfterDays: 90
          },
          tempSuspend: {
            enabled: true,
            threshold: 5,
            duration: 7,  // days
            escalateToPerma: true
          },
          permanentBan: {
            enabled: true,
            threshold: 10,
            appealable: true
          },
          contentRestriction: {
            enabled: true,
            duration: 30,  // days
            restrictions: ['no_posts', 'no_comments', 'no_messages']
          }
        },
        escalationRules: {
          enabled: true,
          warnBeforeSuspend: true,
          suspendBeforeBan: true,
          allowAppeal: true
        }
      },

      // Roles & Permissions
      roles: {
        moderator: {
          name: 'Moderator',
          permissions: [
            'review_content',
            'flag_content',
            'approve_content',
            'reject_content',
            'warn_user',
            'view_reports'
          ],
          restrictions: ['cannot_ban', 'cannot_delete_appeals']
        },
        seniorModerator: {
          name: 'Senior Moderator',
          permissions: [
            'review_content',
            'flag_content',
            'approve_content',
            'reject_content',
            'warn_user',
            'suspend_user',
            'view_reports',
            'handle_appeals',
            'edit_rules'
          ],
          restrictions: ['cannot_permanent_ban']
        },
        admin: {
          name: 'Administrator',
          permissions: ['*'],
          restrictions: []
        }
      },

      // Audit & Logging
      audit: {
        enabled: true,
        logActions: true,
        logAIDecisions: true,
        logHumanReviews: true,
        logAppeals: true,
        retentionDays: 365,
        exportEnabled: true
      },

      // Integration
      integration: {
        timeline: {
          enabled: true,
          serviceUrl: 'http://localhost:3004',
          webhooks: true
        },
        spark: {
          enabled: true,
          serviceUrl: 'http://localhost:3002',
          webhooks: true
        },
        herald: {
          enabled: true,
          serviceUrl: 'http://localhost:3014',
          notifyModerators: true,
          notifyUsers: true
        }
      },

      // Performance
      performance: {
        caching: {
          enabled: true,
          redisEnabled: true,
          ttl: 3600
        },
        queue: {
          enabled: true,
          concurrency: 5,
          batchSize: 10
        },
        rateLimit: {
          enabled: true,
          maxPerMinute: 100,
          maxPerHour: 5000
        }
      }
    };

    return `<div style="background:white;padding:2rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
      <h2 style="margin-bottom:1.5rem">
        <i class="bi bi-shield-check"></i> Moderation Service Configuration
      </h2>

      <ul class="nav nav-tabs" id="moderator-config-tabs" role="tablist" style="margin-bottom:1.5rem">
        <li class="nav-item">
          <button class="nav-link active" data-bs-toggle="tab" data-bs-target="#mod-ai" type="button">
            <i class="bi bi-robot"></i> AI Providers
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#mod-detection" type="button">
            <i class="bi bi-search"></i> Detection
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#mod-thresholds" type="button">
            <i class="bi bi-sliders"></i> Thresholds
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#mod-rules" type="button">
            <i class="bi bi-list-check"></i> Rules
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#mod-workflows" type="button">
            <i class="bi bi-diagram-3"></i> Workflows
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#mod-queue" type="button">
            <i class="bi bi-list-task"></i> Review Queue
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#mod-appeals" type="button">
            <i class="bi bi-arrow-counterclockwise"></i> Appeals
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#mod-actions" type="button">
            <i class="bi bi-exclamation-triangle"></i> User Actions
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#mod-roles" type="button">
            <i class="bi bi-person-badge"></i> Roles
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link" data-bs-toggle="tab" data-bs-target="#mod-integration" type="button">
            <i class="bi bi-box-arrow-in-right"></i> Integration
          </button>
        </li>
      </ul>

      <form id="moderator-config-form">
        <div class="tab-content">

          <!-- AI Providers Tab -->
          <div class="tab-pane fade show active" id="mod-ai" role="tabpanel">
            <div class="row">
              <div class="col-md-4">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-chat-square-dots"></i> Claude (Anthropic)</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="aiProviders.claude.enabled" ${moderatorConfig.aiProviders.claude.enabled?'checked':''} />
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">API Key</label>
                      <input type="password" class="form-control" name="aiProviders.claude.apiKey" value="${moderatorConfig.aiProviders.claude.apiKey}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Model</label>
                      <select class="form-select" name="aiProviders.claude.model">
                        <option value="claude-3-5-sonnet-20241022" ${moderatorConfig.aiProviders.claude.model==='claude-3-5-sonnet-20241022'?'selected':''}>Claude 3.5 Sonnet</option>
                        <option value="claude-3-opus-20240229" ${moderatorConfig.aiProviders.claude.model==='claude-3-opus-20240229'?'selected':''}>Claude 3 Opus</option>
                      </select>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Priority</label>
                      <input type="number" class="form-control" name="aiProviders.claude.priority" value="${moderatorConfig.aiProviders.claude.priority}" />
                      <small class="text-muted">Lower = higher priority</small>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Timeout (ms)</label>
                      <input type="number" class="form-control" name="aiProviders.claude.timeout" value="${moderatorConfig.aiProviders.claude.timeout}" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-4">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-lightbulb"></i> OpenAI (GPT-4)</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="aiProviders.openai.enabled" ${moderatorConfig.aiProviders.openai.enabled?'checked':''} />
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">API Key</label>
                      <input type="password" class="form-control" name="aiProviders.openai.apiKey" value="${moderatorConfig.aiProviders.openai.apiKey}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Model</label>
                      <select class="form-select" name="aiProviders.openai.model">
                        <option value="gpt-4-turbo-preview" ${moderatorConfig.aiProviders.openai.model==='gpt-4-turbo-preview'?'selected':''}>GPT-4 Turbo</option>
                        <option value="gpt-4" ${moderatorConfig.aiProviders.openai.model==='gpt-4'?'selected':''}>GPT-4</option>
                      </select>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Priority</label>
                      <input type="number" class="form-control" name="aiProviders.openai.priority" value="${moderatorConfig.aiProviders.openai.priority}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Timeout (ms)</label>
                      <input type="number" class="form-control" name="aiProviders.openai.timeout" value="${moderatorConfig.aiProviders.openai.timeout}" />
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-md-4">
                <div class="card mb-3">
                  <div class="card-header">
                    <strong><i class="bi bi-cpu"></i> DeepSeek</strong>
                    <div class="form-check form-switch float-end">
                      <input class="form-check-input" type="checkbox" name="aiProviders.deepseek.enabled" ${moderatorConfig.aiProviders.deepseek.enabled?'checked':''} />
                    </div>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <label class="form-label">API Key</label>
                      <input type="password" class="form-control" name="aiProviders.deepseek.apiKey" value="${moderatorConfig.aiProviders.deepseek.apiKey}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Model</label>
                      <input type="text" class="form-control" name="aiProviders.deepseek.model" value="${moderatorConfig.aiProviders.deepseek.model}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Priority</label>
                      <input type="number" class="form-control" name="aiProviders.deepseek.priority" value="${moderatorConfig.aiProviders.deepseek.priority}" />
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Timeout (ms)</label>
                      <input type="number" class="form-control" name="aiProviders.deepseek.timeout" value="${moderatorConfig.aiProviders.deepseek.timeout}" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="row">
              <div class="col-md-6">
                <div class="card">
                  <div class="card-header"><strong>Failover Settings</strong></div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="aiProviders.failoverEnabled" ${moderatorConfig.aiProviders.failoverEnabled?'checked':''} />
                      <label class="form-check-label">Enable Automatic Failover</label>
                      <small class="text-muted d-block">Automatically switch to next provider on failure</small>
                    </div>
                  </div>
                </div>
              </div>
              <div class="col-md-6">
                <div class="card">
                  <div class="card-header"><strong>Caching</strong></div>
                  <div class="card-body">
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="aiProviders.cacheResults" ${moderatorConfig.aiProviders.cacheResults?'checked':''} />
                      <label class="form-check-label">Cache AI Results</label>
                    </div>
                    <div class="mb-3">
                      <label class="form-label">Cache TTL (seconds)</label>
                      <input type="number" class="form-control" name="aiProviders.cacheTTL" value="${moderatorConfig.aiProviders.cacheTTL}" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Detection Tab -->
          <div class="tab-pane fade" id="mod-detection" role="tabpanel">
            ${Object.entries(moderatorConfig.detection).map(([category, settings]) => `
              <div class="card mb-3">
                <div class="card-header">
                  <strong>${category.charAt(0).toUpperCase() + category.slice(1)} Detection</strong>
                  <div class="form-check form-switch float-end">
                    <input class="form-check-input" type="checkbox" name="detection.${category}.enabled" ${settings.enabled?'checked':''} />
                  </div>
                </div>
                <div class="card-body">
                  <div class="row">
                    <div class="col-md-3">
                      <label class="form-label">Threshold</label>
                      <input type="number" step="0.1" min="0" max="1" class="form-control" name="detection.${category}.threshold" value="${settings.threshold}" />
                    </div>
                    <div class="col-md-3">
                      <label class="form-label">Weight</label>
                      <input type="number" step="0.1" min="0" max="3" class="form-control" name="detection.${category}.weight" value="${settings.weight}" />
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Auto Action</label>
                      <select class="form-select" name="detection.${category}.autoAction">
                        <option value="none" ${settings.autoAction==='none'?'selected':''}>None</option>
                        <option value="flag" ${settings.autoAction==='flag'?'selected':''}>Flag for Review</option>
                        <option value="hide" ${settings.autoAction==='hide'?'selected':''}>Hide Content</option>
                        <option value="remove" ${settings.autoAction==='remove'?'selected':''}>Remove Content</option>
                        ${category==='pii'?'<option value="redact" '+(settings.autoAction==='redact'?'selected':'')+'>Redact PII</option>':''}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Thresholds Tab -->
          <div class="tab-pane fade" id="mod-thresholds" role="tabpanel">
            <div class="card mb-3">
              <div class="card-header"><strong>Risk Score Thresholds</strong></div>
              <div class="card-body">
                <div class="row mb-3">
                  <div class="col-md-4">
                    <label class="form-label">Auto-Approve Threshold (0-100)</label>
                    <input type="number" min="0" max="100" class="form-control" name="thresholds.autoApprove" value="${moderatorConfig.thresholds.autoApprove}" />
                    <small class="text-muted">Content ≤ this score is auto-approved</small>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Manual Review Threshold (0-100)</label>
                    <input type="number" min="0" max="100" class="form-control" name="thresholds.manualReview" value="${moderatorConfig.thresholds.manualReview}" />
                    <small class="text-muted">Content between approve & reject goes to queue</small>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Auto-Reject Threshold (0-100)</label>
                    <input type="number" min="0" max="100" class="form-control" name="thresholds.autoReject" value="${moderatorConfig.thresholds.autoReject}" />
                    <small class="text-muted">Content ≥ this score is auto-rejected</small>
                  </div>
                </div>

                <h6 class="mt-4">Risk Level Ranges</h6>
                ${Object.entries(moderatorConfig.thresholds.riskLevels).map(([level, range]) => `
                  <div class="row mb-2">
                    <div class="col-md-3">
                      <strong class="text-${range.color}">${level.toUpperCase()}</strong>
                    </div>
                    <div class="col-md-3">
                      <input type="number" min="0" max="100" class="form-control form-control-sm" name="thresholds.riskLevels.${level}.min" value="${range.min}" />
                    </div>
                    <div class="col-md-3">
                      <input type="number" min="0" max="100" class="form-control form-control-sm" name="thresholds.riskLevels.${level}.max" value="${range.max}" />
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Rules Tab -->
          <div class="tab-pane fade" id="mod-rules" role="tabpanel">
            <div class="alert alert-info">
              <i class="bi bi-info-circle"></i> <strong>Rules Engine:</strong> Define custom rules to automatically flag, hide, or remove content based on conditions.
            </div>

            <div class="form-check form-switch mb-3">
              <input class="form-check-input" type="checkbox" name="rules.enabled" ${moderatorConfig.rules.enabled?'checked':''} />
              <label class="form-check-label">Enable Rules Engine</label>
            </div>

            <h5>Rule Templates</h5>
            ${moderatorConfig.rules.templates.map((template, idx) => `
              <div class="card mb-3">
                <div class="card-header">
                  <strong>${template.name}</strong>
                  <div class="form-check form-switch float-end">
                    <input class="form-check-input" type="checkbox" name="rules.templates.${idx}.enabled" ${template.enabled?'checked':''} />
                  </div>
                </div>
                <div class="card-body">
                  <p class="text-muted">${template.description}</p>
                  <div class="row">
                    <div class="col-md-6">
                      <label class="form-label">Action</label>
                      <select class="form-select" name="rules.templates.${idx}.action">
                        <option value="flag" ${template.action==='flag'?'selected':''}>Flag for Review</option>
                        <option value="hide" ${template.action==='hide'?'selected':''}>Hide Content</option>
                        <option value="remove" ${template.action==='remove'?'selected':''}>Remove Content</option>
                      </select>
                    </div>
                    <div class="col-md-6">
                      <label class="form-label">Severity</label>
                      <select class="form-select" name="rules.templates.${idx}.severity">
                        <option value="low" ${template.severity==='low'?'selected':''}>Low</option>
                        <option value="medium" ${template.severity==='medium'?'selected':''}>Medium</option>
                        <option value="high" ${template.severity==='high'?'selected':''}>High</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Workflows Tab -->
          <div class="tab-pane fade" id="mod-workflows" role="tabpanel">
            <div class="form-check form-switch mb-3">
              <input class="form-check-input" type="checkbox" name="automation.autoModeration" ${moderatorConfig.automation.autoModeration?'checked':''} />
              <label class="form-check-label">Enable Automatic Moderation</label>
            </div>

            <div class="card mb-3">
              <div class="card-header"><strong>Content Approval Workflow</strong></div>
              <div class="card-body">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="automation.workflows.contentApproval.enabled" ${moderatorConfig.automation.workflows.contentApproval.enabled?'checked':''} />
                  <label class="form-check-label">Enable Content Approval Workflow</label>
                </div>
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="automation.workflows.contentApproval.escalateToHuman" ${moderatorConfig.automation.workflows.contentApproval.escalateToHuman?'checked':''} />
                  <label class="form-check-label">Escalate to Human Review</label>
                </div>
                <div class="mb-3">
                  <label class="form-label">Escalation Threshold</label>
                  <input type="number" class="form-control" name="automation.workflows.contentApproval.escalateThreshold" value="${moderatorConfig.automation.workflows.contentApproval.escalateThreshold}" />
                </div>
              </div>
            </div>

            <div class="card mb-3">
              <div class="card-header"><strong>User Reporting Workflow</strong></div>
              <div class="card-body">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="automation.workflows.userReporting.enabled" ${moderatorConfig.automation.workflows.userReporting.enabled?'checked':''} />
                  <label class="form-check-label">Enable User Reporting</label>
                </div>
                <div class="mb-3">
                  <label class="form-label">Auto-Escalate Threshold</label>
                  <input type="number" class="form-control" name="automation.workflows.userReporting.threshold" value="${moderatorConfig.automation.workflows.userReporting.threshold}" />
                  <small class="text-muted">Number of reports before auto-escalation</small>
                </div>
              </div>
            </div>
          </div>

          <!-- Review Queue Tab -->
          <div class="tab-pane fade" id="mod-queue" role="tabpanel">
            <div class="form-check form-switch mb-3">
              <input class="form-check-input" type="checkbox" name="reviewQueue.enabled" ${moderatorConfig.reviewQueue.enabled?'checked':''} />
              <label class="form-check-label">Enable Review Queue</label>
            </div>

            <div class="card mb-3">
              <div class="card-header"><strong>Assignment Settings</strong></div>
              <div class="card-body">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="reviewQueue.assignment.automatic" ${moderatorConfig.reviewQueue.assignment.automatic?'checked':''} />
                  <label class="form-check-label">Automatic Assignment</label>
                </div>
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="reviewQueue.assignment.roundRobin" ${moderatorConfig.reviewQueue.assignment.roundRobin?'checked':''} />
                  <label class="form-check-label">Round-Robin Distribution</label>
                </div>
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="reviewQueue.assignment.loadBalancing" ${moderatorConfig.reviewQueue.assignment.loadBalancing?'checked':''} />
                  <label class="form-check-label">Load Balancing</label>
                </div>
              </div>
            </div>

            <div class="card mb-3">
              <div class="card-header"><strong>SLA Deadlines (hours)</strong></div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-3 mb-3">
                    <label class="form-label">Urgent</label>
                    <input type="number" class="form-control" name="reviewQueue.sla.urgent" value="${moderatorConfig.reviewQueue.sla.urgent}" />
                  </div>
                  <div class="col-md-3 mb-3">
                    <label class="form-label">High</label>
                    <input type="number" class="form-control" name="reviewQueue.sla.high" value="${moderatorConfig.reviewQueue.sla.high}" />
                  </div>
                  <div class="col-md-3 mb-3">
                    <label class="form-label">Medium</label>
                    <input type="number" class="form-control" name="reviewQueue.sla.medium" value="${moderatorConfig.reviewQueue.sla.medium}" />
                  </div>
                  <div class="col-md-3 mb-3">
                    <label class="form-label">Low</label>
                    <input type="number" class="form-control" name="reviewQueue.sla.low" value="${moderatorConfig.reviewQueue.sla.low}" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Appeals Tab -->
          <div class="tab-pane fade" id="mod-appeals" role="tabpanel">
            <div class="form-check form-switch mb-3">
              <input class="form-check-input" type="checkbox" name="appeals.enabled" ${moderatorConfig.appeals.enabled?'checked':''} />
              <label class="form-check-label">Enable Appeals System</label>
            </div>

            <div class="card">
              <div class="card-body">
                <div class="row">
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Max Appeals Per Case</label>
                    <input type="number" class="form-control" name="appeals.maxAppealsPerCase" value="${moderatorConfig.appeals.maxAppealsPerCase}" />
                  </div>
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Appeal Window (days)</label>
                    <input type="number" class="form-control" name="appeals.appealWindow" value="${moderatorConfig.appeals.appealWindow}" />
                  </div>
                </div>
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="appeals.requireReason" ${moderatorConfig.appeals.requireReason?'checked':''} />
                  <label class="form-check-label">Require Reason for Appeal</label>
                </div>
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="appeals.notifyOnDecision" ${moderatorConfig.appeals.notifyOnDecision?'checked':''} />
                  <label class="form-check-label">Notify User on Decision</label>
                </div>
                <div class="mb-3">
                  <label class="form-label">Appeal Review Deadline (days)</label>
                  <input type="number" class="form-control" name="appeals.deadlineDays" value="${moderatorConfig.appeals.deadlineDays}" />
                </div>
              </div>
            </div>
          </div>

          <!-- User Actions Tab -->
          <div class="tab-pane fade" id="mod-actions" role="tabpanel">
            <div class="form-check form-switch mb-3">
              <input class="form-check-input" type="checkbox" name="userActions.enabled" ${moderatorConfig.userActions.enabled?'checked':''} />
              <label class="form-check-label">Enable User Actions</label>
            </div>

            ${Object.entries(moderatorConfig.userActions.actions).map(([action, settings]) => `
              <div class="card mb-3">
                <div class="card-header">
                  <strong>${action.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</strong>
                  <div class="form-check form-switch float-end">
                    <input class="form-check-input" type="checkbox" name="userActions.actions.${action}.enabled" ${settings.enabled?'checked':''} />
                  </div>
                </div>
                <div class="card-body">
                  <div class="row">
                    <div class="col-md-6 mb-3">
                      <label class="form-label">Violation Threshold</label>
                      <input type="number" class="form-control" name="userActions.actions.${action}.threshold" value="${settings.threshold}" />
                    </div>
                    ${settings.duration !== undefined ? `
                      <div class="col-md-6 mb-3">
                        <label class="form-label">Duration (days)</label>
                        <input type="number" class="form-control" name="userActions.actions.${action}.duration" value="${settings.duration}" />
                      </div>
                    ` : ''}
                  </div>
                </div>
              </div>
            `).join('')}

            <div class="card">
              <div class="card-header"><strong>Escalation Rules</strong></div>
              <div class="card-body">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="userActions.escalationRules.warnBeforeSuspend" ${moderatorConfig.userActions.escalationRules.warnBeforeSuspend?'checked':''} />
                  <label class="form-check-label">Warn Before Suspend</label>
                </div>
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="userActions.escalationRules.suspendBeforeBan" ${moderatorConfig.userActions.escalationRules.suspendBeforeBan?'checked':''} />
                  <label class="form-check-label">Suspend Before Permanent Ban</label>
                </div>
              </div>
            </div>
          </div>

          <!-- Roles Tab -->
          <div class="tab-pane fade" id="mod-roles" role="tabpanel">
            <div class="alert alert-info">
              <i class="bi bi-info-circle"></i> Moderator roles define what actions team members can perform.
            </div>

            ${Object.entries(moderatorConfig.roles).map(([roleKey, role]) => `
              <div class="card mb-3">
                <div class="card-header"><strong>${role.name}</strong></div>
                <div class="card-body">
                  <h6>Permissions</h6>
                  <div class="mb-3">
                    ${role.permissions.map(perm => `
                      <span class="badge bg-success me-1 mb-1">${perm}</span>
                    `).join('')}
                  </div>
                  ${role.restrictions.length > 0 ? `
                    <h6>Restrictions</h6>
                    <div>
                      ${role.restrictions.map(rest => `
                        <span class="badge bg-danger me-1 mb-1">${rest}</span>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>

          <!-- Integration Tab -->
          <div class="tab-pane fade" id="mod-integration" role="tabpanel">
            ${Object.entries(moderatorConfig.integration).map(([service, settings]) => `
              <div class="card mb-3">
                <div class="card-header">
                  <strong>${service.charAt(0).toUpperCase() + service.slice(1)} Integration</strong>
                  <div class="form-check form-switch float-end">
                    <input class="form-check-input" type="checkbox" name="integration.${service}.enabled" ${settings.enabled?'checked':''} />
                  </div>
                </div>
                <div class="card-body">
                  <div class="mb-3">
                    <label class="form-label">Service URL</label>
                    <input type="text" class="form-control" name="integration.${service}.serviceUrl" value="${settings.serviceUrl}" />
                  </div>
                  ${settings.webhooks !== undefined ? `
                    <div class="form-check form-switch mb-3">
                      <input class="form-check-input" type="checkbox" name="integration.${service}.webhooks" ${settings.webhooks?'checked':''} />
                      <label class="form-check-label">Enable Webhooks</label>
                    </div>
                  ` : ''}
                </div>
              </div>
            `).join('')}

            <div class="card">
              <div class="card-header"><strong>Audit & Logging</strong></div>
              <div class="card-body">
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="audit.enabled" ${moderatorConfig.audit.enabled?'checked':''} />
                  <label class="form-check-label">Enable Audit Logging</label>
                </div>
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="audit.logAIDecisions" ${moderatorConfig.audit.logAIDecisions?'checked':''} />
                  <label class="form-check-label">Log AI Decisions</label>
                </div>
                <div class="form-check form-switch mb-3">
                  <input class="form-check-input" type="checkbox" name="audit.logHumanReviews" ${moderatorConfig.audit.logHumanReviews?'checked':''} />
                  <label class="form-check-label">Log Human Reviews</label>
                </div>
                <div class="mb-3">
                  <label class="form-label">Log Retention (days)</label>
                  <input type="number" class="form-control" name="audit.retentionDays" value="${moderatorConfig.audit.retentionDays}" />
                </div>
              </div>
            </div>
          </div>

        </div>
      </form>

      <div style="margin-top:2rem;padding-top:1.5rem;border-top:2px solid #dee2e6;display:flex;justify-content:space-between">
        <button type="button" class="btn btn-outline-secondary" onclick="loadPage('services/moderator')">
          <i class="bi bi-x-circle"></i> Cancel
        </button>
        <button type="button" class="btn btn-primary" onclick="saveModeratorConfig()">
          <i class="bi bi-save"></i> Save All Changes
        </button>
      </div>
    </div>`;
  },

  forgeSettings: async (config) => {
    const forgeConfig = config.config || {
      crmEnabled: true,
      erpEnabled: true,
      groupwareEnabled: true,
      workflowsEnabled: true,
      reportingEnabled: true
    };

    return `<div style="background:white;padding:2rem;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1)">
      <h3>Business Platform Configuration</h3>
      <form id="forge-config-form">
        <h5>Module Toggles</h5>
        <div class="row">
          <div class="col-md-4 mb-3">
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" name="crmEnabled" ${forgeConfig.crmEnabled?'checked':''} />
              <label class="form-check-label">CRM Module (100%)</label>
            </div>
          </div>
          <div class="col-md-4 mb-3">
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" name="erpEnabled" ${forgeConfig.erpEnabled?'checked':''} />
              <label class="form-check-label">ERP Module (85%)</label>
            </div>
          </div>
          <div class="col-md-4 mb-3">
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" name="groupwareEnabled" ${forgeConfig.groupwareEnabled?'checked':''} />
              <label class="form-check-label">Groupware (95%)</label>
            </div>
          </div>
        </div>
        <div class="row">
          <div class="col-md-4 mb-3">
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" name="workflowsEnabled" ${forgeConfig.workflowsEnabled?'checked':''} />
              <label class="form-check-label">Workflows (95%)</label>
            </div>
          </div>
          <div class="col-md-4 mb-3">
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" name="reportingEnabled" ${forgeConfig.reportingEnabled?'checked':''} />
              <label class="form-check-label">Reporting (90%)</label>
            </div>
          </div>
        </div>
        <button type="button" class="btn btn-primary" onclick="saveServiceConfig('forge')">
          <i class="bi bi-save"></i> Save Configuration
        </button>
      </form>
    </div>`;
  },

  logs: async () => {
    return `<div><h2>System Logs</h2>
      <div style="margin-bottom:1rem">
        <button class="btn btn-primary" onclick="refreshLogs()"><i class="bi bi-arrow-clockwise"></i> Refresh</button>
        <button class="btn btn-secondary" onclick="clearLogs()"><i class="bi bi-trash"></i> Clear</button>
        <select class="form-select d-inline-block w-auto ms-2" id="log-level-filter">
          <option value="all">All Levels</option>
          <option value="error">Errors Only</option>
          <option value="warn">Warnings</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
        </select>
        <select class="form-select d-inline-block w-auto ms-2" id="log-service-filter">
          <option value="all">All Services</option>
          <option value="ca">CA</option>
          <option value="auth">Auth</option>
          <option value="timeline">Timeline</option>
          <option value="spark">Spark</option>
          <option value="workflow">Workflow</option>
        </select>
      </div>
      <div style="background:white;padding:1.5rem;border-radius:8px">
        <pre id="system-logs" style="background:#1e1e1e;color:#d4d4d4;padding:1rem;border-radius:4px;height:600px;overflow-y:auto;font-size:0.85rem">Loading logs...</pre>
      </div>
    </div>`;
  },

  monitoring: async () => {
    const systemStatus = await fetch('/api/services/system/status').then(r => r.json()).catch(() => ({status:{}}));
    const stats = systemStatus.status || {};

    return `<div><h2>System Monitoring</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1rem;margin-bottom:2rem">
        <div style="background:white;padding:1.5rem;border-radius:8px;border-left:4px solid #28a745">
          <div style="font-size:0.9rem;color:#666">CPU Usage</div>
          <div style="font-size:2rem;font-weight:bold">42%</div>
          <div class="progress mt-2" style="height:8px"><div class="progress-bar bg-success" style="width:42%"></div></div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;border-left:4px solid #007bff">
          <div style="font-size:0.9rem;color:#666">Memory Usage</div>
          <div style="font-size:2rem;font-weight:bold">3.2GB / 8GB</div>
          <div class="progress mt-2" style="height:8px"><div class="progress-bar bg-primary" style="width:40%"></div></div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;border-left:4px solid #ffc107">
          <div style="font-size:0.9rem;color:#666">Disk Usage</div>
          <div style="font-size:2rem;font-weight:bold">127GB / 500GB</div>
          <div class="progress mt-2" style="height:8px"><div class="progress-bar bg-warning" style="width:25%"></div></div>
        </div>
        <div style="background:white;padding:1.5rem;border-radius:8px;border-left:4px solid #17a2b8">
          <div style="font-size:0.9rem;color:#666">Network I/O</div>
          <div style="font-size:2rem;font-weight:bold">1.2 MB/s</div>
          <div style="font-size:0.8rem;color:#666">↑ 600KB/s ↓ 600KB/s</div>
        </div>
      </div>
      <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:2rem">
        <h4>Service Health</h4>
        <table class="table">
          <thead><tr><th>Service</th><th>Status</th><th>Response Time</th><th>Uptime</th><th>Requests/min</th></tr></thead>
          <tbody>
            <tr><td>CA</td><td><span class="badge bg-success">Healthy</span></td><td>12ms</td><td>99.9%</td><td>1,234</td></tr>
            <tr><td>Auth</td><td><span class="badge bg-success">Healthy</span></td><td>8ms</td><td>99.8%</td><td>2,456</td></tr>
            <tr><td>Timeline</td><td><span class="badge bg-success">Healthy</span></td><td>15ms</td><td>99.7%</td><td>3,789</td></tr>
            <tr><td>Spark</td><td><span class="badge bg-warning">Degraded</span></td><td>45ms</td><td>98.2%</td><td>567</td></tr>
          </tbody>
        </table>
      </div>
      <div style="background:white;padding:2rem;border-radius:8px">
        <h4>Recent Alerts</h4>
        <div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i> <strong>Spark</strong> response time above threshold (2 min ago)</div>
        <div class="alert alert-info"><i class="bi bi-info-circle"></i> <strong>Timeline</strong> cache cleared successfully (15 min ago)</div>
      </div>
    </div>`;
  },

  backups: async () => {
    return `<div><h2>Backup Management</h2>
      <div style="margin-bottom:2rem">
        <button class="btn btn-primary" onclick="createBackup()"><i class="bi bi-plus-circle"></i> Create Backup</button>
        <button class="btn btn-secondary" onclick="configureBackups()"><i class="bi bi-gear"></i> Configure</button>
      </div>
      <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:2rem">
        <h4>Backup Schedule</h4>
        <table class="table">
          <tbody>
            <tr><td><strong>Full Backup</strong></td><td>Daily at 2:00 AM</td><td><span class="badge bg-success">Active</span></td></tr>
            <tr><td><strong>Incremental Backup</strong></td><td>Every 6 hours</td><td><span class="badge bg-success">Active</span></td></tr>
            <tr><td><strong>Database Export</strong></td><td>Daily at 3:00 AM</td><td><span class="badge bg-success">Active</span></td></tr>
            <tr><td><strong>Certificate Backup</strong></td><td>Weekly on Sunday</td><td><span class="badge bg-success">Active</span></td></tr>
          </tbody>
        </table>
      </div>
      <div style="background:white;padding:2rem;border-radius:8px">
        <h4>Recent Backups</h4>
        <table class="table">
          <thead><tr><th>Date</th><th>Type</th><th>Size</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            <tr>
              <td>2025-12-19 02:00</td><td>Full</td><td>2.4 GB</td><td><span class="badge bg-success">Complete</span></td>
              <td><button class="btn btn-sm btn-primary" onclick="restoreBackup('backup-20251219')"><i class="bi bi-arrow-counterclockwise"></i> Restore</button>
              <button class="btn btn-sm btn-secondary" onclick="downloadBackup('backup-20251219')"><i class="bi bi-download"></i></button></td>
            </tr>
            <tr>
              <td>2025-12-18 02:00</td><td>Full</td><td>2.3 GB</td><td><span class="badge bg-success">Complete</span></td>
              <td><button class="btn btn-sm btn-primary" onclick="restoreBackup('backup-20251218')"><i class="bi bi-arrow-counterclockwise"></i> Restore</button>
              <button class="btn btn-sm btn-secondary" onclick="downloadBackup('backup-20251218')"><i class="bi bi-download"></i></button></td>
            </tr>
            <tr>
              <td>2025-12-17 02:00</td><td>Full</td><td>2.2 GB</td><td><span class="badge bg-success">Complete</span></td>
              <td><button class="btn btn-sm btn-primary" onclick="restoreBackup('backup-20251217')"><i class="bi bi-arrow-counterclockwise"></i> Restore</button>
              <button class="btn btn-sm btn-secondary" onclick="downloadBackup('backup-20251217')"><i class="bi bi-download"></i></button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`;
  },

  settings: async () => {
    return `<div><h2>Admin Console Settings</h2>
      <div style="max-width:800px">
        <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem">
          <h4>Appearance</h4>
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" id="dark-mode-toggle" onchange="toggleTheme()">
            <label class="form-check-label" for="dark-mode-toggle">Dark Mode</label>
          </div>
          <div class="mt-3">
            <label class="form-label">Dashboard Refresh Rate</label>
            <select class="form-select">
              <option>5 seconds</option>
              <option selected>10 seconds</option>
              <option>30 seconds</option>
              <option>1 minute</option>
              <option>Manual only</option>
            </select>
          </div>
        </div>
        <div style="background:white;padding:2rem;border-radius:8px;margin-bottom:1.5rem">
          <h4>Notifications</h4>
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="notify-service-changes" checked>
            <label class="form-check-label" for="notify-service-changes">Service Status Changes</label>
          </div>
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="notify-user-changes" checked>
            <label class="form-check-label" for="notify-user-changes">User Changes</label>
          </div>
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="notify-errors">
            <label class="form-check-label" for="notify-errors">Error Notifications</label>
          </div>
        </div>
        <div style="background:white;padding:2rem;border-radius:8px">
          <h4>About</h4>
          <p><strong>Exprsn Admin Console</strong></p>
          <p>Version: 1.0.0</p>
          <p>Managing 18 Exprsn platform services</p>
          <p class="text-muted">Built with Express.js, Socket.IO, and Bootstrap 5</p>
        </div>
      </div>
    </div>`;
  }
};
