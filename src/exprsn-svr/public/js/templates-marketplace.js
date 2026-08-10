// Template Marketplace Application Logic

let templates = [];
let selectedTemplate = null;
let currentCategory = 'all';
let searchQuery = '';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadTemplates();
    setupEventListeners();
});

// Load templates from API
async function loadTemplates() {
    try {
        const response = await fetch('/api/templates');
        const data = await response.json();

        if (data.templates) {
            templates = data.templates;
            renderTemplates();
            updateCount();
        }
    } catch (error) {
        console.error('Failed to load templates:', error);
        showNotification('Failed to load templates', 'danger');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Category filter
    document.querySelectorAll('.category-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentCategory = pill.dataset.category;
            renderTemplates();
        });
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            renderTemplates();
        });
    }

    // Sort
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', () => {
            renderTemplates();
        });
    }

    // Use template button
    document.getElementById('useTemplateBtn')?.addEventListener('click', () => {
        if (selectedTemplate) {
            showCreatePageModal(selectedTemplate);
        }
    });

    // Create page form
    document.getElementById('createPageBtn')?.addEventListener('click', createPageFromTemplate);

    // Auto-generate slug from title
    document.getElementById('pageTitle')?.addEventListener('input', (e) => {
        const slug = e.target.value
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
        document.getElementById('pageSlug').value = slug;
    });
}

// Render templates
function renderTemplates() {
    const grid = document.getElementById('templateGrid');
    const emptyState = document.getElementById('emptyState');

    if (!grid) return;

    // Filter templates
    let filtered = templates;

    // Filter by category
    if (currentCategory !== 'all') {
        filtered = filtered.filter(t => t.category === currentCategory);
    }

    // Filter by search
    if (searchQuery) {
        filtered = filtered.filter(t =>
            t.name.toLowerCase().includes(searchQuery) ||
            t.description.toLowerCase().includes(searchQuery) ||
            t.tags.some(tag => tag.toLowerCase().includes(searchQuery))
        );
    }

    // Sort
    const sortBy = document.getElementById('sortSelect')?.value || 'popularity';
    filtered = sortTemplates(filtered, sortBy);

    // Show/hide empty state
    if (filtered.length === 0) {
        grid.classList.add('d-none');
        emptyState?.classList.remove('d-none');
    } else {
        grid.classList.remove('d-none');
        emptyState?.classList.add('d-none');
    }

    // Render template cards
    grid.innerHTML = filtered.map(template => createTemplateCard(template)).join('');

    // Attach click handlers
    grid.querySelectorAll('.template-card').forEach((card, index) => {
        card.addEventListener('click', () => showTemplateDetail(filtered[index]));
    });

    updateCount(filtered.length);
}

// Create template card HTML
function createTemplateCard(template) {
    const difficultyClass = `difficulty-${template.difficulty}`;

    return `
        <div class="template-card" data-template-id="${template.id}">
            <div class="template-preview">
                <span class="template-badge">${template.category}</span>
            </div>
            <div class="template-info">
                <h3 class="template-title">${template.name}</h3>
                <p class="template-description">${template.description}</p>
                <div class="template-tags">
                    ${template.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
                <div class="template-meta">
                    <span class="difficulty-badge ${difficultyClass}">
                        ${template.difficulty}
                    </span>
                    <div class="stats-row">
                        <div class="stat-item">
                            <i class="bi bi-star-fill"></i>
                            <span>${template.rating || 4.5}</span>
                        </div>
                        <div class="stat-item">
                            <i class="bi bi-download"></i>
                            <span>${template.uses || 0}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Sort templates
function sortTemplates(templates, sortBy) {
    const sorted = [...templates];

    switch (sortBy) {
        case 'popularity':
            return sorted.sort((a, b) => (b.uses || 0) - (a.uses || 0));
        case 'newest':
            return sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        case 'name':
            return sorted.sort((a, b) => a.name.localeCompare(b.name));
        case 'difficulty':
            const difficultyOrder = { beginner: 0, intermediate: 1, advanced: 2 };
            return sorted.sort((a, b) => difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty]);
        default:
            return sorted;
    }
}

// Show template detail modal
function showTemplateDetail(template) {
    selectedTemplate = template;

    document.getElementById('modalTemplateTitle').textContent = template.name;
    document.getElementById('modalDescription').innerHTML = `
        <p>${template.description}</p>
        <div class="template-tags mt-3">
            ${template.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
    `;

    // Update preview
    document.getElementById('modalPreviewImage').style.background =
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

    // Update features
    const features = [
        `Difficulty: ${template.difficulty}`,
        `Category: ${template.category}`,
        `Author: ${template.author}`,
        `Version: ${template.version}`,
        template.definition.isStatic ? 'Static HTML' : 'Dynamic EJS',
        template.definition.socketEvents?.length ? 'Real-time updates' : 'Standard page',
        template.definition.isPublic ? 'Public access' : 'Private page'
    ];

    document.getElementById('modalFeatures').innerHTML = features
        .map(feature => `<li>${feature}</li>`)
        .join('');

    const modal = new bootstrap.Modal(document.getElementById('templateModal'));
    modal.show();
}

// Show create page modal
function showCreatePageModal(template) {
    // Hide template detail modal
    bootstrap.Modal.getInstance(document.getElementById('templateModal'))?.hide();

    // Pre-fill form
    document.getElementById('pageTitle').value = template.name;
    document.getElementById('pageSlug').value = template.id;
    document.getElementById('pageDescription').value = template.description;
    document.getElementById('pageIsPublic').checked = template.definition.isPublic;

    const modal = new bootstrap.Modal(document.getElementById('createPageModal'));
    modal.show();
}

// Create page from template
async function createPageFromTemplate() {
    if (!selectedTemplate) return;

    const title = document.getElementById('pageTitle').value.trim();
    const slug = document.getElementById('pageSlug').value.trim();
    const description = document.getElementById('pageDescription').value.trim();
    const isPublic = document.getElementById('pageIsPublic').checked;

    if (!title || !slug) {
        showNotification('Please fill in all required fields', 'warning');
        return;
    }

    const createBtn = document.getElementById('createPageBtn');
    createBtn.disabled = true;
    createBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creating...';

    try {
        const response = await fetch(`/api/templates/${selectedTemplate.id}/create-page`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({
                title,
                slug,
                description,
                isPublic,
                customizations: {}
            })
        });

        const result = await response.json();

        if (response.ok && result.page) {
            showNotification('Page created successfully!', 'success');

            // Hide modal
            bootstrap.Modal.getInstance(document.getElementById('createPageModal'))?.hide();

            // Redirect to editor
            setTimeout(() => {
                window.location.href = `/editor/pages/${result.page.slug}/edit`;
            }, 1000);
        } else {
            throw new Error(result.message || 'Failed to create page');
        }
    } catch (error) {
        console.error('Error creating page:', error);
        showNotification(error.message || 'Failed to create page', 'danger');
    } finally {
        createBtn.disabled = false;
        createBtn.innerHTML = '<i class="bi bi-check-circle me-2"></i>Create Page';
    }
}

// Update template count
function updateCount(count) {
    const total = count !== undefined ? count : templates.length;
    document.getElementById('templateCount').textContent = `${total} template${total !== 1 ? 's' : ''}`;
}

// Show notification
function showNotification(message, type = 'info') {
    const alertClass = `alert-${type}`;
    const alert = document.createElement('div');
    alert.className = `alert ${alertClass} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
    alert.style.zIndex = '9999';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alert);

    setTimeout(() => alert.remove(), 3000);
}
