/**
 * ═══════════════════════════════════════════════════════════
 * Application-HTML Integration Service
 * Converts Low-Code applications to HTML projects and vice versa
 * ═══════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const db = require('../models');

class AppHtmlIntegrationService {
  /**
   * Get or create HTML project for a Low-Code application
   * @param {string} appId - Application ID
   * @param {string} userId - User ID
   * @returns {Promise<Object>} HTML project
   */
  static async getOrCreateHtmlProject(appId, userId) {
    try {
      // Check if application exists
      const app = await db.Application.findByPk(appId);
      if (!app) {
        throw new Error('Application not found');
      }

      // Check if HTML project already exists for this app
      let htmlProject = await db.HtmlProject.findOne({
        where: {
          metadata: {
            linkedAppId: appId
          }
        }
      });

      if (htmlProject) {
        return { success: true, project: htmlProject, created: false };
      }

      // Create new HTML project linked to application
      htmlProject = await db.HtmlProject.create({
        id: uuidv4(),
        name: `${app.displayName} (HTML)`,
        description: `HTML version of ${app.displayName} Low-Code application`,
        type: 'application',
        status: 'active',
        createdBy: userId,
        metadata: {
          linkedAppId: appId,
          syncEnabled: true,
          lastSyncAt: new Date()
        }
      });

      // Create initial file structure
      await this.createInitialFiles(htmlProject.id, app, userId);

      return { success: true, project: htmlProject, created: true };
    } catch (error) {
      console.error('Error getting/creating HTML project:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create initial HTML files for application
   * @param {string} projectId - HTML project ID
   * @param {Object} app - Application object
   * @param {string} userId - User ID
   */
  static async createInitialFiles(projectId, app, userId) {
    try {
      // Create index.html
      const indexHtml = await db.HtmlFile.create({
        id: uuidv4(),
        projectId,
        name: 'index.html',
        path: '/index.html',
        type: 'html',
        content: this.generateIndexHtml(app),
        isEntryPoint: true,
        createdBy: userId
      });

      // Create app.css
      await db.HtmlFile.create({
        id: uuidv4(),
        projectId,
        name: 'app.css',
        path: '/app.css',
        type: 'css',
        content: this.generateAppCss(app),
        createdBy: userId
      });

      // Create app.js
      await db.HtmlFile.create({
        id: uuidv4(),
        projectId,
        name: 'app.js',
        path: '/app.js',
        type: 'javascript',
        content: this.generateAppJs(app),
        createdBy: userId
      });

      // Create forms folder
      const formsFolder = await db.HtmlFile.create({
        id: uuidv4(),
        projectId,
        name: 'forms',
        path: '/forms',
        type: 'folder',
        createdBy: userId
      });

      // Load all forms for this application
      const forms = await db.Form.findAll({
        where: { applicationId: app.id },
        order: [['displayName', 'ASC']]
      });

      // Create HTML file for each form
      for (const form of forms) {
        await db.HtmlFile.create({
          id: uuidv4(),
          projectId,
          parentId: formsFolder.id,
          name: `${this.sanitizeFilename(form.name)}.html`,
          path: `/forms/${this.sanitizeFilename(form.name)}.html`,
          type: 'html',
          content: await this.generateFormHtml(form),
          createdBy: userId,
          metadata: {
            formId: form.id,
            formName: form.name
          }
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Error creating initial files:', error);
      throw error;
    }
  }

  /**
   * Generate index.html for application
   * @param {Object} app - Application object
   * @returns {string} HTML content
   */
  static generateIndexHtml(app) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${app.displayName}</title>

  <!-- Bootstrap CSS -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">

  <!-- Font Awesome -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

  <!-- Application CSS -->
  <link rel="stylesheet" href="app.css">
</head>
<body>
  <!-- Navigation -->
  <nav class="navbar navbar-expand-lg navbar-dark" style="background-color: ${app.color || '#0078D4'};">
    <div class="container-fluid">
      <a class="navbar-brand" href="#">
        <i class="${app.icon || 'fas fa-rocket'}"></i>
        ${app.displayName}
      </a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item">
            <a class="nav-link active" href="#">Home</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="#forms">Forms</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" href="#about">About</a>
          </li>
        </ul>
      </div>
    </div>
  </nav>

  <!-- Main Content -->
  <div class="container mt-5">
    <div class="row">
      <div class="col-lg-12">
        <div class="hero-section text-center mb-5">
          <h1 class="display-4">${app.displayName}</h1>
          <p class="lead">${app.description || 'A powerful low-code application'}</p>
          <div class="mt-4">
            <button class="btn btn-primary btn-lg" onclick="loadForms()">
              <i class="fas fa-rocket"></i> Get Started
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Forms Section -->
    <div class="row" id="forms">
      <div class="col-lg-12">
        <h2 class="mb-4">Available Forms</h2>
        <div id="forms-container" class="row">
          <!-- Forms will be loaded here dynamically -->
        </div>
      </div>
    </div>
  </div>

  <!-- Bootstrap JS -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>

  <!-- Application JS -->
  <script src="app.js"></script>
</body>
</html>`;
  }

  /**
   * Generate app.css
   * @param {Object} app - Application object
   * @returns {string} CSS content
   */
  static generateAppCss(app) {
    return `/* ${app.displayName} - Application Styles */

:root {
  --primary-color: ${app.color || '#0078D4'};
  --secondary-color: #6c757d;
  --success-color: #28a745;
  --danger-color: #dc3545;
  --warning-color: #ffc107;
  --info-color: #17a2b8;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  background-color: #f8f9fa;
}

.hero-section {
  padding: 60px 20px;
  background: linear-gradient(135deg, var(--primary-color) 0%, #1565c0 100%);
  color: white;
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.form-card {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: pointer;
}

.form-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.form-card-icon {
  font-size: 3rem;
  color: var(--primary-color);
  margin-bottom: 15px;
}

.form-card-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 10px;
}

.form-card-description {
  color: #6c757d;
  font-size: 0.9rem;
}

.btn-primary {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
}

.btn-primary:hover {
  background-color: #1565c0;
  border-color: #1565c0;
}

/* Form Styles */
.form-container {
  background: white;
  border-radius: 8px;
  padding: 30px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-label {
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.required::after {
  content: " *";
  color: var(--danger-color);
}

/* Responsive */
@media (max-width: 768px) {
  .hero-section {
    padding: 40px 15px;
  }

  .hero-section h1 {
    font-size: 2rem;
  }
}`;
  }

  /**
   * Generate app.js
   * @param {Object} app - Application object
   * @returns {string} JavaScript content
   */
  static generateAppJs(app) {
    return `// ${app.displayName} - Application Logic

// Application Configuration
const APP_CONFIG = {
  id: '${app.id}',
  name: '${app.name}',
  displayName: '${app.displayName}',
  version: '${app.version}',
  apiBaseUrl: '/lowcode/api'
};

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
  console.log(\`\${APP_CONFIG.displayName} v\${APP_CONFIG.version} initialized\`);
  loadForms();
});

// Load forms from API
async function loadForms() {
  try {
    const response = await fetch(\`\${APP_CONFIG.apiBaseUrl}/applications/\${APP_CONFIG.id}/forms\`);
    const result = await response.json();

    if (result.success) {
      renderForms(result.forms);
    } else {
      console.error('Failed to load forms:', result.error);
    }
  } catch (error) {
    console.error('Error loading forms:', error);
  }
}

// Render forms as cards
function renderForms(forms) {
  const container = document.getElementById('forms-container');

  if (!forms || forms.length === 0) {
    container.innerHTML = \`
      <div class="col-12">
        <div class="alert alert-info">
          <i class="fas fa-info-circle"></i>
          No forms available yet. Create forms in the Low-Code designer.
        </div>
      </div>
    \`;
    return;
  }

  container.innerHTML = forms.map(form => \`
    <div class="col-md-4 col-sm-6">
      <div class="form-card" onclick="openForm('\${form.id}')">
        <div class="form-card-icon">
          <i class="fas fa-file-alt"></i>
        </div>
        <div class="form-card-title">\${form.displayName}</div>
        <div class="form-card-description">
          \${form.description || 'Click to open this form'}
        </div>
      </div>
    </div>
  \`).join('');
}

// Open form
function openForm(formId) {
  // For HTML version, load form page
  window.location.href = \`forms/\${formId}.html\`;
}

// Utility: Show notification
function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = \`alert alert-\${type} position-fixed top-0 end-0 m-3\`;
  toast.style.zIndex = '9999';
  toast.innerHTML = \`
    <i class="fas fa-\${type === 'success' ? 'check-circle' : 'info-circle'}"></i>
    \${message}
  \`;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Utility: API request helper
async function apiRequest(endpoint, options = {}) {
  try {
    const response = await fetch(\`\${APP_CONFIG.apiBaseUrl}\${endpoint}\`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      },
      ...options
    });

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}`;
  }

  /**
   * Generate HTML for a form
   * @param {Object} form - Form object
   * @returns {Promise<string>} HTML content
   */
  static async generateFormHtml(form) {
    const components = form.components || [];

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${form.displayName}</title>

  <!-- Bootstrap CSS -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">

  <!-- Font Awesome -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

  <!-- Application CSS -->
  <link rel="stylesheet" href="../app.css">
</head>
<body>
  <!-- Navigation -->
  <nav class="navbar navbar-light bg-light">
    <div class="container-fluid">
      <a class="navbar-brand" href="../index.html">
        <i class="fas fa-arrow-left"></i> Back to Application
      </a>
    </div>
  </nav>

  <!-- Form Container -->
  <div class="container mt-4">
    <div class="row justify-content-center">
      <div class="col-lg-8">
        <div class="form-container">
          <h2 class="mb-4">${form.displayName}</h2>
          ${form.description ? `<p class="text-muted mb-4">${form.description}</p>` : ''}

          <form id="mainForm" onsubmit="return handleSubmit(event)">
            ${this.generateFormComponents(components)}

            <div class="mt-4">
              <button type="submit" class="btn btn-primary">
                <i class="fas fa-save"></i> Submit
              </button>
              <button type="button" class="btn btn-secondary ms-2" onclick="window.history.back()">
                <i class="fas fa-times"></i> Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>

  <!-- Bootstrap JS -->
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>

  <script>
    // Form submission handler
    async function handleSubmit(event) {
      event.preventDefault();

      const formData = new FormData(event.target);
      const data = Object.fromEntries(formData.entries());

      console.log('Form data:', data);

      try {
        // Send to API
        const response = await fetch('/lowcode/api/forms/${form.id}/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
          alert('Form submitted successfully!');
          event.target.reset();
        } else {
          alert('Error: ' + result.error);
        }
      } catch (error) {
        console.error('Submission error:', error);
        alert('Failed to submit form');
      }

      return false;
    }
  </script>
</body>
</html>`;
  }

  /**
   * Generate HTML for form components
   * @param {Array} components - Form components
   * @returns {string} HTML
   */
  static generateFormComponents(components) {
    if (!components || components.length === 0) {
      return '<p class="text-muted">This form has no components yet.</p>';
    }

    return components.map(comp => {
      const props = comp.properties || {};

      switch (comp.type) {
        case 'textinput':
          return `
            <div class="form-group mb-3">
              <label class="form-label ${props.required ? 'required' : ''}">${props.label || 'Text Input'}</label>
              <input type="text" class="form-control" name="${comp.id}"
                     placeholder="${props.placeholder || ''}"
                     ${props.required ? 'required' : ''}>
              ${props.helpText ? `<small class="form-text text-muted">${props.helpText}</small>` : ''}
            </div>`;

        case 'email':
          return `
            <div class="form-group mb-3">
              <label class="form-label ${props.required ? 'required' : ''}">${props.label || 'Email'}</label>
              <input type="email" class="form-control" name="${comp.id}"
                     placeholder="${props.placeholder || ''}"
                     ${props.required ? 'required' : ''}>
            </div>`;

        case 'textarea':
          return `
            <div class="form-group mb-3">
              <label class="form-label ${props.required ? 'required' : ''}">${props.label || 'Text Area'}</label>
              <textarea class="form-control" name="${comp.id}" rows="${props.rows || 3}"
                        placeholder="${props.placeholder || ''}"
                        ${props.required ? 'required' : ''}></textarea>
            </div>`;

        case 'dropdown':
          const options = props.options || [];
          return `
            <div class="form-group mb-3">
              <label class="form-label ${props.required ? 'required' : ''}">${props.label || 'Dropdown'}</label>
              <select class="form-select" name="${comp.id}" ${props.required ? 'required' : ''}>
                <option value="">Select...</option>
                ${options.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
              </select>
            </div>`;

        case 'checkbox':
          return `
            <div class="form-check mb-3">
              <input class="form-check-input" type="checkbox" name="${comp.id}" id="${comp.id}">
              <label class="form-check-label" for="${comp.id}">
                ${props.label || 'Checkbox'}
              </label>
            </div>`;

        case 'button':
          return `
            <div class="mb-3">
              <button type="${props.buttonType || 'button'}" class="btn btn-${props.variant || 'primary'}">
                ${props.text || 'Button'}
              </button>
            </div>`;

        case 'heading':
          const level = props.level || 'h3';
          return `<${level} class="mb-3">${props.text || 'Heading'}</${level}>`;

        case 'paragraph':
          return `<p class="mb-3">${props.text || 'Paragraph text'}</p>`;

        case 'divider':
          return `<hr class="my-4">`;

        default:
          return `<!-- Component type "${comp.type}" not yet implemented -->`;
      }
    }).join('\n');
  }

  /**
   * Sanitize filename
   * @param {string} name - Original name
   * @returns {string} Sanitized name
   */
  static sanitizeFilename(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Sync application changes to HTML project
   * @param {string} appId - Application ID
   * @returns {Promise<Object>} Sync result
   */
  static async syncAppToHtml(appId) {
    try {
      const htmlProject = await db.HtmlProject.findOne({
        where: {
          metadata: {
            linkedAppId: appId
          }
        }
      });

      if (!htmlProject) {
        return { success: false, error: 'No linked HTML project found' };
      }

      // Reload application and forms
      const app = await db.Application.findByPk(appId);
      const forms = await db.Form.findAll({
        where: { applicationId: appId }
      });

      // Update index.html
      const indexFile = await db.HtmlFile.findOne({
        where: {
          projectId: htmlProject.id,
          isEntryPoint: true
        }
      });

      if (indexFile) {
        indexFile.content = this.generateIndexHtml(app);
        await indexFile.save();
      }

      // Update/create form files
      const formsFolder = await db.HtmlFile.findOne({
        where: {
          projectId: htmlProject.id,
          name: 'forms',
          type: 'folder'
        }
      });

      for (const form of forms) {
        const filename = `${this.sanitizeFilename(form.name)}.html`;

        let formFile = await db.HtmlFile.findOne({
          where: {
            projectId: htmlProject.id,
            parentId: formsFolder.id,
            'metadata.formId': form.id
          }
        });

        const formHtml = await this.generateFormHtml(form);

        if (formFile) {
          formFile.content = formHtml;
          await formFile.save();
        } else {
          await db.HtmlFile.create({
            id: uuidv4(),
            projectId: htmlProject.id,
            parentId: formsFolder.id,
            name: filename,
            path: `/forms/${filename}`,
            type: 'html',
            content: formHtml,
            createdBy: app.ownerId,
            metadata: {
              formId: form.id,
              formName: form.name
            }
          });
        }
      }

      // Update metadata
      htmlProject.metadata = {
        ...htmlProject.metadata,
        lastSyncAt: new Date()
      };
      await htmlProject.save();

      return { success: true, message: 'Application synced to HTML project' };
    } catch (error) {
      console.error('Error syncing app to HTML:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = AppHtmlIntegrationService;
