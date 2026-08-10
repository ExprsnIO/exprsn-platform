/**
 * Monaco Editor Integration for Exprsn Server
 * Handles code editing, preview, and page saving
 */

(function() {
  'use strict';

  let editors = {};
  let currentEditor = 'html';
  let previewVisible = false;

  /**
   * Initialize Monaco Editors
   */
  function initEditors() {
    require.config({
      paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' }
    });

    require(['vs/editor/editor.main'], function() {
      // HTML Editor
      editors.html = monaco.editor.create(document.getElementById('htmlEditor'), {
        value: window.pageData?.html_content || getDefaultHTML(),
        language: 'html',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 14,
        wordWrap: 'on'
      });

      // CSS Editor
      editors.css = monaco.editor.create(document.getElementById('cssEditor'), {
        value: window.pageData?.css_content || '',
        language: 'css',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 14
      });

      // JavaScript Editor
      editors.javascript = monaco.editor.create(document.getElementById('jsEditor'), {
        value: window.pageData?.javascript_content || getDefaultJS(),
        language: 'javascript',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 14
      });

      // Server Code Editor
      editors.serverCode = monaco.editor.create(document.getElementById('serverEditor'), {
        value: window.pageData?.server_code || getDefaultServerCode(),
        language: 'javascript',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: true },
        fontSize: 14
      });

      // Page Data Editor (JSON)
      editors.settings = monaco.editor.create(document.getElementById('pageDataEditor'), {
        value: JSON.stringify(window.pageData?.page_data || {}, null, 2),
        language: 'json',
        theme: 'vs-dark',
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14
      });

      console.log('Monaco editors initialized');
    });
  }

  /**
   * Get default HTML template
   */
  function getDefaultHTML() {
    return `<div class="container my-5">
  <h1>Hello, World!</h1>
  <p>This is your new page. Edit the HTML, CSS, and JavaScript to customize it.</p>
  
  <div id="content">
    <p>Dynamic content will appear here.</p>
  </div>
</div>
`;
  }

  /**
   * Get default JavaScript template
   */
  function getDefaultJS() {
    return `// Client-side JavaScript
// You can access serverData from the server code

console.log('Page loaded:', pageId);
console.log('Server data:', serverData);

// Example: Update content on page load
document.addEventListener('DOMContentLoaded', () => {
  const contentDiv = document.getElementById('content');
  if (contentDiv && serverData.message) {
    contentDiv.innerHTML = '<p class="alert alert-info">' + serverData.message + '</p>';
  }
});

// Example: Listen for Socket.IO events
if (typeof socket !== 'undefined') {
  window.addEventListener('socket:data:updated', (event) => {
    console.log('Data updated via socket:', event.detail);
  });
}
`;
  }

  /**
   * Get default server code template
   */
  function getDefaultServerCode() {
    return `// Server-side JavaScript (Node.js)
// This code runs on the server before the page is rendered
// Return an object that will be available as 'serverData' in the client

return {
  message: 'Hello from server code!',
  timestamp: Date.now(),
  pageTitle: page.title,
  // Add your data here
};
`;
  }

  /**
   * Save page
   */
  async function savePage() {
    const pageData = {
      title: document.getElementById('pageTitle').value,
      slug: document.getElementById('pageSlug').value,
      description: '',
      status: document.getElementById('pageStatus').value,
      isStatic: document.getElementById('isStatic').checked,
      isPublic: document.getElementById('isPublic').checked,
      htmlContent: editors.html.getValue(),
      cssContent: editors.css.getValue(),
      javascriptContent: editors.javascript.getValue(),
      serverCode: editors.serverCode.getValue(),
      socketEvents: JSON.parse(document.getElementById('socketEvents').value || '[]'),
      apiRoutes: JSON.parse(document.getElementById('apiRoutes').value || '[]'),
      pageData: JSON.parse(editors.settings.getValue() || '{}')
    };

    try {
      const token = localStorage.getItem('caToken');
      if (!token) {
        alert('No CA token found. Please authenticate first.');
        return;
      }

      const url = window.editorMode === 'create' 
        ? '/api/pages'
        : '/api/pages/' + window.pageData.id;
      
      const method = window.editorMode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(pageData)
      });

      const result = await response.json();

      if (result.success) {
        alert('Page saved successfully!');
        if (window.editorMode === 'create') {
          window.location.href = '/editor/edit/' + result.data.page.id;
        }
      } else {
        alert('Error saving page: ' + (result.error?.message || 'Unknown error'));
      }
    } catch (error) {
      alert('Error saving page: ' + error.message);
      console.error('Save error:', error);
    }
  }

  /**
   * Toggle preview
   */
  function togglePreview() {
    previewVisible = !previewVisible;
    const previewPane = document.getElementById('previewPane');
    const previewText = document.getElementById('previewText');

    if (previewVisible) {
      previewPane.style.display = 'block';
      previewText.textContent = 'Hide Preview';
      updatePreview();
    } else {
      previewPane.style.display = 'none';
      previewText.textContent = 'Show Preview';
    }
  }

  /**
   * Update preview iframe
   */
  function updatePreview() {
    const previewFrame = document.getElementById('previewFrame');
    const html = editors.html.getValue();
    const css = editors.css.getValue();
    const js = editors.javascript.getValue();

    const fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <style>${css}</style>
</head>
<body>
  ${html}
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script>
    const pageId = 'preview';
    const serverData = {};
  </script>
  <script>${js}</script>
</body>
</html>
`;

    previewFrame.srcdoc = fullHTML;
  }

  /**
   * Initialize event listeners
   */
  function initEventListeners() {
    document.getElementById('saveBtn').addEventListener('click', savePage);
    document.getElementById('previewBtn').addEventListener('click', togglePreview);

    // Update preview on editor changes (debounced)
    let previewTimeout;
    Object.values(editors).forEach(editor => {
      if (editor && editor.onDidChangeModelContent) {
        editor.onDidChangeModelContent(() => {
          if (previewVisible) {
            clearTimeout(previewTimeout);
            previewTimeout = setTimeout(updatePreview, 500);
          }
        });
      }
    });

    // Auto-generate slug from title
    document.getElementById('pageTitle').addEventListener('input', (e) => {
      if (!window.pageData || !window.pageData.slug) {
        const slug = e.target.value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        document.getElementById('pageSlug').value = slug;
      }
    });
  }

  /**
   * Initialize on page load
   */
  window.addEventListener('load', () => {
    initEditors();
    setTimeout(() => {
      initEventListeners();
    }, 1000);
  });
})();
