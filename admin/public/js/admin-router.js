/**
 * ═══════════════════════════════════════════════════════════════════════
 * Admin Router - SPA Navigation System
 * ═══════════════════════════════════════════════════════════════════════
 */

// Route mapping
const routes = {
  'dashboard': Pages.dashboard,
  'services': Pages.dashboard,
  'users': Pages.users,
  'tokens': Pages.tokens,
  'certificates': Pages.certificates,
  'config/database': Pages.configDatabase,
  'config-database': Pages.configDatabase,
  'config/redis': Pages.configRedis,
  'config-redis': Pages.configRedis,
  'config/security': Pages.configSecurity,
  'config-security': Pages.configSecurity,
  'config/global': Pages.configGlobal,
  'workflow': Pages.workflow,
  'workflow/designer': Pages.workflowDesigner,
  'workflow-designer': Pages.workflowDesigner,
  'crm': Pages.crm,
  'forge': Pages.crm,
  'service-forge': Pages.crm,
  'services/forge': Pages.crm,
  // Individual service pages
  'services/ca': () => Pages.serviceDetail('ca'),
  'service-ca': () => Pages.serviceDetail('ca'),
  'services/auth': () => Pages.serviceDetail('auth'),
  'service-auth': () => Pages.serviceDetail('auth'),
  'services/timeline': () => Pages.serviceDetail('timeline'),
  'service-timeline': () => Pages.serviceDetail('timeline'),
  'services/spark': () => Pages.serviceDetail('spark'),
  'service-spark': () => Pages.serviceDetail('spark'),
  'services/moderator': () => Pages.serviceDetail('moderator'),
  'service-moderator': () => Pages.serviceDetail('moderator'),
  // System pages
  'logs': Pages.logs,
  'monitoring': Pages.monitoring,
  'backups': Pages.backups,
  'settings': Pages.settings,
  'profile': Pages.settings
};

// Page titles
const pageTitles = {
  'dashboard': 'Dashboard',
  'services': 'Services',
  'users': 'User Management',
  'tokens': 'Token Management',
  'certificates': 'Certificate Management',
  'config/database': 'Database Configuration',
  'config-database': 'Database Configuration',
  'config/redis': 'Redis Configuration',
  'config-redis': 'Redis Configuration',
  'config/security': 'Security Configuration',
  'config-security': 'Security Configuration',
  'config/global': 'Global Settings',
  'workflow': 'Workflow Automation',
  'crm': 'Business Platform',
  'forge': 'Business Platform',
  'service-forge': 'Business Platform',
  'logs': 'System Logs',
  'monitoring': 'System Monitoring',
  'backups': 'Backup Management',
  'settings': 'Settings'
};

/**
 * Load a page
 */
async function loadPage(route) {
  const content = document.getElementById('admin-content');
  const pageTitle = document.getElementById('page-title');

  // Remove leading slash and hash
  route = route.replace(/^[/#]+/, '');

  // Default to dashboard
  if (!route) route = 'dashboard';

  // Update page title
  if (pageTitle) {
    pageTitle.textContent = pageTitles[route] || 'Admin Console';
  }

  // Update active nav link
  updateActiveNav(route);

  // Get the page function
  const pageFunction = routes[route];

  if (pageFunction) {
    try {
      // Show loading
      content.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';

      // Load the page
      const html = await pageFunction();
      content.innerHTML = html;
    } catch (error) {
      console.error('Error loading page:', error);
      content.innerHTML = `
        <div class="alert alert-danger" role="alert">
          <h4 class="alert-heading">Error Loading Page</h4>
          <p>Failed to load the page content. Please try again.</p>
          <hr>
          <p class="mb-0"><small>${error.message}</small></p>
        </div>
      `;
    }
  } else {
    // Page not found - show dashboard
    console.warn('Route not found:', route, '- Loading dashboard');
    const html = await Pages.dashboard();
    content.innerHTML = html;
  }
}

/**
 * Update active navigation link
 */
function updateActiveNav(route) {
  // Remove active class from all links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });

  // Add active class to current link
  const currentLink = document.querySelector(`.nav-link[href="#/${route}"]`) ||
                     document.querySelector(`.nav-link[data-page="${route}"]`);

  if (currentLink) {
    currentLink.classList.add('active');
  }
}

/**
 * Handle hash change
 */
function handleRoute() {
  const route = window.location.hash.slice(1); // Remove #
  loadPage(route);
}

/**
 * Initialize router
 */
function initRouter() {
  // Handle hash changes
  window.addEventListener('hashchange', handleRoute);

  // Handle initial load
  handleRoute();

  // Handle nav link clicks
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#/')) {
        e.preventDefault();
        window.location.hash = href;
      }
    });
  });
}

// Make loadPage globally available
window.loadPage = loadPage;

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRouter);
} else {
  initRouter();
}

console.log('Router initialized');
