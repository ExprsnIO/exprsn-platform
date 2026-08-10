#!/usr/bin/env node
/**
 * Complete Template Generator for Exprsn Services
 * Generates all EJS templates for Nexus and Workflow services
 */

const fs = require('fs');
const path = require('path');

// Helper to create navigation partial
function createNav(service, routes) {
  const serviceName = service.charAt(0).toUpperCase() + service.slice(1);
  const icon = service === 'nexus' ? 'diagram-3' : 'lightning-charge';

  return `<nav class="navbar navbar-expand-lg navbar-dark">
    <div class="container">
        <a class="navbar-brand" href="/">
            <i class="bi bi-${icon} me-2"></i>
            Exprsn ${serviceName}
        </a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav"
                aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navbarNav">
            <ul class="navbar-nav ms-auto">
${routes.map(r => `                <li class="nav-item">
                    <a class="nav-link <%= currentPath === '${r.path}' ? 'active' : '' %>" href="${r.path}">
                        <i class="bi bi-${r.icon} me-1"></i> ${r.label}
                    </a>
                </li>`).join('\n')}
                <% if (user) { %>
                <li class="nav-item dropdown">
                    <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown" role="button"
                       data-bs-toggle="dropdown" aria-expanded="false">
                        <i class="bi bi-person-circle me-1"></i> <%= user.username || 'User' %>
                    </a>
                    <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="navbarDropdown">
                        <li><a class="dropdown-item" href="/profile"><i class="bi bi-person me-2"></i> Profile</a></li>
                        <li><a class="dropdown-item" href="/settings"><i class="bi bi-gear me-2"></i> Settings</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item" href="/auth/logout"><i class="bi bi-box-arrow-right me-2"></i> Logout</a></li>
                    </ul>
                </li>
                <% } else { %>
                <li class="nav-item">
                    <a class="nav-link" href="/auth/login">
                        <i class="bi bi-box-arrow-in-right me-1"></i> Login
                    </a>
                </li>
                <% } %>
                <li class="nav-item">
                    <button id="theme-toggle" class="btn btn-link nav-link" aria-label="Toggle dark mode">
                        <i class="bi bi-moon-stars" id="theme-icon"></i>
                    </button>
                </li>
            </ul>
        </div>
    </div>
</nav>`;
}

// Helper to create base page template
function createPage(service, title, icon, content) {
  const serviceName = service.charAt(0).toUpperCase() + service.slice(1);
  return `<!DOCTYPE html>
<html lang="en" data-bs-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><%= title %> | Exprsn ${serviceName}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" rel="stylesheet">
    <%- include('partials/styles') %>
</head>
<body>
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <%- include('partials/nav') %>
    <main id="main-content">
        <div class="container">
            <h1 class="mb-4"><i class="bi bi-${icon} me-2"></i><%= title %></h1>
${content}
        </div>
    </main>
    <%- include('partials/footer') %>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
    <%- include('partials/scripts') %>
</body>
</html>`;
}

// Nexus templates
const nexusTemplates = {
  nav: createNav('nexus', [
    { path: '/', label: 'Home', icon: 'house-door' },
    { path: '/dashboard', label: 'Dashboard', icon: 'speedometer2' },
    { path: '/discover', label: 'Discover', icon: 'compass' },
    { path: '/groups', label: 'My Groups', icon: 'people' },
    { path: '/events', label: 'Events', icon: 'calendar-event' },
    { path: '/calendar', label: 'Calendar', icon: 'calendar3' }
  ]),

  index: createPage('nexus', 'Nexus', 'diagram-3', `            <div class="row g-4 mb-4">
                <div class="col-md-3"><div class="stat-card">
                    <div class="stat-icon" style="background: rgba(102, 126, 234, 0.1); color: var(--exprsn-primary);">
                        <i class="bi bi-people"></i>
                    </div>
                    <div class="stat-value"><%= stats.totalGroups %></div>
                    <div class="stat-label">Total Groups</div>
                </div></div>
                <div class="col-md-3"><div class="stat-card">
                    <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--exprsn-success);">
                        <i class="bi bi-check-circle"></i>
                    </div>
                    <div class="stat-value"><%= stats.activeGroups %></div>
                    <div class="stat-label">Active Groups</div>
                </div></div>
                <div class="col-md-3"><div class="stat-card">
                    <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--exprsn-info);">
                        <i class="bi bi-calendar-event"></i>
                    </div>
                    <div class="stat-value"><%= stats.totalEvents %></div>
                    <div class="stat-label">Total Events</div>
                </div></div>
                <div class="col-md-3"><div class="stat-card">
                    <div class="stat-icon" style="background: rgba(245, 158, 11, 0.1); color: var(--exprsn-warning);">
                        <i class="bi bi-person"></i>
                    </div>
                    <div class="stat-value"><%= stats.totalMembers %></div>
                    <div class="stat-label">Total Members</div>
                </div></div>
            </div>
            <div class="alert alert-info">
                <i class="bi bi-info-circle me-2"></i>
                Nexus service: Groups, Communities & Events Platform
            </div>`),

  dashboard: createPage('nexus', 'Dashboard', 'speedometer2', `            <div class="row g-4">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">My Groups</h5>
                            <p class="lead"><%= stats.myGroupsCount %></p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title">Upcoming Events</h5>
                            <p class="lead"><%= stats.upcomingEventsCount %></p>
                        </div>
                    </div>
                </div>
            </div>`),

  discover: createPage('nexus', 'Discover', 'compass', `            <div class="row g-4">
                <% if (trendingGroups.length === 0) { %>
                    <div class="col-12">
                        <div class="alert alert-info">No trending groups at the moment</div>
                    </div>
                <% } else { %>
                    <% trendingGroups.forEach(group => { %>
                        <div class="col-md-4">
                            <div class="card h-100">
                                <div class="card-body">
                                    <h5 class="card-title"><%= group.name %></h5>
                                    <p class="card-text"><%= group.description || 'No description' %></p>
                                    <a href="/groups/<%= group.id %>" class="btn btn-primary">View</a>
                                </div>
                            </div>
                        </div>
                    <% }); %>
                <% } %>
            </div>`),

  groups: createPage('nexus', 'My Groups', 'people', `            <div class="row g-4">
                <% if (memberships.length === 0) { %>
                    <div class="col-12">
                        <div class="alert alert-info">You are not a member of any groups yet</div>
                    </div>
                <% } else { %>
                    <% memberships.forEach(membership => { %>
                        <div class="col-md-4">
                            <div class="card">
                                <div class="card-body">
                                    <h5 class="card-title"><%= membership.group ? membership.group.name : 'Group' %></h5>
                                    <p class="text-muted small">Member since <%= new Date(membership.createdAt).toLocaleDateString() %></p>
                                </div>
                            </div>
                        </div>
                    <% }); %>
                <% } %>
            </div>`),

  events: createPage('nexus', 'Events', 'calendar-event', `            <div class="row g-4">
                <% if (events.length === 0) { %>
                    <div class="col-12">
                        <div class="alert alert-info">No upcoming events</div>
                    </div>
                <% } else { %>
                    <% events.forEach(event => { %>
                        <div class="col-md-6">
                            <div class="card">
                                <div class="card-body">
                                    <h5 class="card-title"><%= event.name %></h5>
                                    <p class="card-text"><%= event.description || 'No description' %></p>
                                    <p class="text-muted small">
                                        <i class="bi bi-calendar me-1"></i>
                                        <%= new Date(event.start_time).toLocaleString() %>
                                    </p>
                                </div>
                            </div>
                        </div>
                    <% }); %>
                <% } %>
            </div>`),

  calendar: createPage('nexus', 'Calendar', 'calendar3', `            <div class="card">
                <div class="card-body">
                    <div id="calendar-container">
                        <div class="alert alert-info">
                            <i class="bi bi-calendar3 me-2"></i>
                            Calendar integration - Connect to /api/calendar endpoint
                        </div>
                    </div>
                </div>
            </div>`),

  'group-detail': createPage('nexus', 'Group Detail', 'people', `            <div class="card mb-4">
                <div class="card-body">
                    <h2><%= group.name %></h2>
                    <p class="lead"><%= group.description || 'No description' %></p>
                </div>
            </div>
            <div class="row">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">Members</div>
                        <div class="card-body">
                            <% if (group.members && group.members.length > 0) { %>
                                <p><%= group.members.length %> members</p>
                            <% } else { %>
                                <p>No members yet</p>
                            <% } %>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">Events</div>
                        <div class="card-body">
                            <% if (group.events && group.events.length > 0) { %>
                                <p><%= group.events.length %> events</p>
                            <% } else { %>
                                <p>No events scheduled</p>
                            <% } %>
                        </div>
                    </div>
                </div>
            </div>`)
};

// Workflow templates
const workflowTemplates = {
  nav: createNav('workflow', [
    { path: '/', label: 'Home', icon: 'house-door' },
    { path: '/designer', label: 'Designer', icon: 'palette' },
    { path: '/workflows', label: 'My Workflows', icon: 'diagram-2' },
    { path: '/executions', label: 'Executions', icon: 'play-circle' },
    { path: '/templates', label: 'Templates', icon: 'file-earmark-code' }
  ]),

  index: createPage('workflow', 'Workflow', 'lightning-charge', `            <div class="row g-4 mb-4">
                <div class="col-md-3"><div class="stat-card">
                    <div class="stat-icon" style="background: rgba(102, 126, 234, 0.1); color: var(--exprsn-primary);">
                        <i class="bi bi-diagram-2"></i>
                    </div>
                    <div class="stat-value"><%= stats.totalWorkflows %></div>
                    <div class="stat-label">Total Workflows</div>
                </div></div>
                <div class="col-md-3"><div class="stat-card">
                    <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--exprsn-success);">
                        <i class="bi bi-check-circle"></i>
                    </div>
                    <div class="stat-value"><%= stats.activeWorkflows %></div>
                    <div class="stat-label">Active</div>
                </div></div>
                <div class="col-md-3"><div class="stat-card">
                    <div class="stat-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--exprsn-info);">
                        <i class="bi bi-play-circle"></i>
                    </div>
                    <div class="stat-value"><%= stats.totalExecutions %></div>
                    <div class="stat-label">Executions</div>
                </div></div>
                <div class="col-md-3"><div class="stat-card">
                    <div class="stat-icon" style="background: rgba(16, 185, 129, 0.1); color: var(--exprsn-success);">
                        <i class="bi bi-check2-circle"></i>
                    </div>
                    <div class="stat-value"><%= stats.successfulExecutions %></div>
                    <div class="stat-label">Successful</div>
                </div></div>
            </div>
            <div class="alert alert-info">
                <i class="bi bi-info-circle me-2"></i>
                Workflow service: Visual workflow automation engine
            </div>`),

  designer: createPage('workflow', 'Workflow Designer', 'palette', `            <div class="card">
                <div class="card-body">
                    <div id="workflow-designer" style="min-height: 600px; border: 2px dashed #ccc; border-radius: 8px;">
                        <div class="text-center py-5">
                            <i class="bi bi-palette" style="font-size: 4rem; color: #ccc;"></i>
                            <p class="mt-3 text-muted">Drag-and-drop workflow designer will load here</p>
                            <button class="btn btn-primary">Create New Workflow</button>
                        </div>
                    </div>
                </div>
            </div>`),

  workflows: createPage('workflow', 'My Workflows', 'diagram-2', `            <div class="row g-4 mb-4">
                <div class="col-md-4"><div class="stat-card">
                    <div class="stat-value"><%= stats.total %></div>
                    <div class="stat-label">Total</div>
                </div></div>
                <div class="col-md-4"><div class="stat-card">
                    <div class="stat-value"><%= stats.active %></div>
                    <div class="stat-label">Active</div>
                </div></div>
                <div class="col-md-4"><div class="stat-card">
                    <div class="stat-value"><%= stats.inactive %></div>
                    <div class="stat-label">Inactive</div>
                </div></div>
            </div>
            <div class="row g-4">
                <% if (workflows.length === 0) { %>
                    <div class="col-12">
                        <div class="alert alert-info">No workflows yet. Create your first workflow!</div>
                    </div>
                <% } else { %>
                    <% workflows.forEach(workflow => { %>
                        <div class="col-md-4">
                            <div class="card">
                                <div class="card-body">
                                    <h5 class="card-title"><%= workflow.name %></h5>
                                    <p class="card-text"><%= workflow.description || 'No description' %></p>
                                    <span class="badge bg-<%= workflow.is_active ? 'success' : 'secondary' %>">
                                        <%= workflow.is_active ? 'Active' : 'Inactive' %>
                                    </span>
                                </div>
                            </div>
                        </div>
                    <% }); %>
                <% } %>
            </div>`),

  executions: createPage('workflow', 'Executions', 'play-circle', `            <div class="row g-4 mb-4">
                <div class="col-md-3"><div class="stat-card">
                    <div class="stat-value"><%= stats.total %></div>
                    <div class="stat-label">Total</div>
                </div></div>
                <div class="col-md-3"><div class="stat-card">
                    <div class="stat-value"><%= stats.completed %></div>
                    <div class="stat-label">Completed</div>
                </div></div>
                <div class="col-md-3"><div class="stat-card">
                    <div class="stat-value"><%= stats.failed %></div>
                    <div class="stat-label">Failed</div>
                </div></div>
                <div class="col-md-3"><div class="stat-card">
                    <div class="stat-value"><%= stats.running %></div>
                    <div class="stat-label">Running</div>
                </div></div>
            </div>
            <div class="card">
                <div class="card-body">
                    <% if (executions.length === 0) { %>
                        <p class="text-muted">No executions yet</p>
                    <% } else { %>
                        <div class="table-responsive">
                            <table class="table">
                                <thead>
                                    <tr>
                                        <th>Workflow</th>
                                        <th>Status</th>
                                        <th>Started</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <% executions.forEach(exec => { %>
                                        <tr>
                                            <td><%= exec.workflow ? exec.workflow.name : 'Unknown' %></td>
                                            <td><span class="badge bg-<%= exec.status === 'completed' ? 'success' : exec.status === 'failed' ? 'danger' : 'primary' %>"><%= exec.status %></span></td>
                                            <td><%= new Date(exec.started_at).toLocaleString() %></td>
                                        </tr>
                                    <% }); %>
                                </tbody>
                            </table>
                        </div>
                    <% } %>
                </div>
            </div>`),

  templates: createPage('workflow', 'Workflow Templates', 'file-earmark-code', `            <div class="row g-4">
                <% if (templates.length === 0) { %>
                    <div class="col-12">
                        <div class="alert alert-info">No templates available</div>
                    </div>
                <% } else { %>
                    <% templates.forEach(template => { %>
                        <div class="col-md-4">
                            <div class="card">
                                <div class="card-body">
                                    <h5 class="card-title"><%= template.name %></h5>
                                    <p class="card-text"><%= template.description || 'No description' %></p>
                                    <button class="btn btn-primary btn-sm">Use Template</button>
                                </div>
                            </div>
                        </div>
                    <% }); %>
                <% } %>
            </div>`),

  'workflow-detail': createPage('workflow', 'Workflow Detail', 'diagram-2', `            <div class="card mb-4">
                <div class="card-body">
                    <h2><%= workflow.name %></h2>
                    <p class="lead"><%= workflow.description || 'No description' %></p>
                    <span class="badge bg-<%= workflow.is_active ? 'success' : 'secondary' %>">
                        <%= workflow.is_active ? 'Active' : 'Inactive' %>
                    </span>
                </div>
            </div>
            <div class="card">
                <div class="card-header">Recent Executions</div>
                <div class="card-body">
                    <% if (executions.length === 0) { %>
                        <p class="text-muted">No executions yet</p>
                    <% } else { %>
                        <div class="list-group">
                            <% executions.forEach(exec => { %>
                                <div class="list-group-item">
                                    <div class="d-flex justify-content-between">
                                        <span><%= exec.status %></span>
                                        <small class="text-muted"><%= new Date(exec.started_at).toLocaleString() %></small>
                                    </div>
                                </div>
                            <% }); %>
                        </div>
                    <% } %>
                </div>
            </div>`)
};

// Create template files
console.log('Creating Nexus templates...');
const nexusDir = path.join(__dirname, '..', 'src', 'exprsn-nexus', 'views');
Object.keys(nexusTemplates).forEach(template => {
  const filePath = path.join(nexusDir, template === 'nav' ? 'partials/nav.ejs' : `${template}.ejs`);
  fs.writeFileSync(filePath, nexusTemplates[template], 'utf8');
  console.log(`✓ Created nexus/${template}.ejs`);
});

console.log('\nCreating Workflow templates...');
const workflowDir = path.join(__dirname, '..', 'src', 'exprsn-workflow', 'views');
Object.keys(workflowTemplates).forEach(template => {
  const filePath = path.join(workflowDir, template === 'nav' ? 'partials/nav.ejs' : `${template}.ejs`);
  fs.writeFileSync(filePath, workflowTemplates[template], 'utf8');
  console.log(`✓ Created workflow/${template}.ejs`);
});

// Update footer partials
const nexusFooter = `<footer>
    <div class="container">
        <div class="row">
            <div class="col-md-6">
                <h5><i class="bi bi-diagram-3 me-2"></i> Exprsn Nexus</h5>
                <p class="text-muted mb-0">Groups, Communities & Events Platform</p>
            </div>
            <div class="col-md-6 text-md-end">
                <div class="mb-2">
                    <a href="/about" class="text-white text-decoration-none me-3">About</a>
                    <a href="/privacy" class="text-white text-decoration-none me-3">Privacy</a>
                    <a href="/terms" class="text-white text-decoration-none me-3">Terms</a>
                    <a href="/api/docs" class="text-white text-decoration-none">API</a>
                </div>
                <p class="text-muted mb-0">&copy; 2025 Exprsn. All rights reserved.</p>
            </div>
        </div>
    </div>
</footer>`;

const workflowFooter = `<footer>
    <div class="container">
        <div class="row">
            <div class="col-md-6">
                <h5><i class="bi bi-lightning-charge me-2"></i> Exprsn Workflow</h5>
                <p class="text-muted mb-0">Visual workflow automation engine</p>
            </div>
            <div class="col-md-6 text-md-end">
                <div class="mb-2">
                    <a href="/about" class="text-white text-decoration-none me-3">About</a>
                    <a href="/privacy" class="text-white text-decoration-none me-3">Privacy</a>
                    <a href="/terms" class="text-white text-decoration-none me-3">Terms</a>
                    <a href="/api/docs" class="text-white text-decoration-none">API</a>
                </div>
                <p class="text-muted mb-0">&copy; 2025 Exprsn. All rights reserved.</p>
            </div>
        </div>
    </div>
</footer>`;

fs.writeFileSync(path.join(nexusDir, 'partials', 'footer.ejs'), nexusFooter, 'utf8');
fs.writeFileSync(path.join(workflowDir, 'partials', 'footer.ejs'), workflowFooter, 'utf8');

console.log('\n✓ All templates generated successfully!');
console.log('\nGenerated:');
console.log('- Nexus: 7 page templates + nav partial');
console.log('- Workflow: 6 page templates + nav partial');
console.log('\nRun: node scripts/generate-all-templates.js');
