let templates = [];
let categories = {};
let selectedCategory = 'all';
let selectedTemplate = null;
let searchTerm = '';

// Load templates on page load
document.addEventListener('DOMContentLoaded', () => {
    loadTemplates();
    loadCategories();

    // Search input handler
    document.getElementById('search-input').addEventListener('input', (e) => {
        searchTerm = e.target.value;
        filterAndRender();
    });
});

async function loadTemplates() {
    try {
        const token = localStorage.getItem('caToken');
        const res = await fetch('/api/workflows/templates/all', {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        }).then(r => r.json());

        if (res.success) {
            templates = res.data;
            filterAndRender();
        } else {
            showError('Failed to load templates');
        }
    } catch (error) {
        showError('Error loading templates: ' + error.message);
    }
}

async function loadCategories() {
    try {
        const token = localStorage.getItem('caToken');
        const res = await fetch('/api/workflows/templates/categories', {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        }).then(r => r.json());

        if (res.success) {
            // Convert array to object with counts
            const categoryCounts = {};
            templates.forEach(t => {
                const cat = t.category || 'general';
                categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            });
            categories = categoryCounts;
            renderCategories();
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

function renderCategories() {
    const container = document.getElementById('categories-list');

    // Calculate total count
    const totalCount = Object.values(categories).reduce((sum, count) => sum + count, 0);
    document.getElementById('count-all').textContent = totalCount;

    // Render category items
    let html = `
        <div class="category-item ${selectedCategory === 'all' ? 'active' : ''}"
             data-category="all" onclick="selectCategory('all')">
            All Templates
            <span class="badge bg-secondary float-end">${totalCount}</span>
        </div>
    `;

    for (const [category, count] of Object.entries(categories)) {
        html += `
            <div class="category-item ${selectedCategory === category ? 'active' : ''}"
                 data-category="${category}" onclick="selectCategory('${category}')">
                ${category}
                <span class="badge bg-secondary float-end">${count}</span>
            </div>
        `;
    }

    container.innerHTML = html;
}

function selectCategory(category) {
    selectedCategory = category;

    // Update UI
    document.querySelectorAll('.category-item').forEach(item => {
        item.classList.toggle('active', item.dataset.category === category);
    });

    filterAndRender();
}

function filterAndRender() {
    let filtered = templates;

    // Filter by category
    if (selectedCategory !== 'all') {
        filtered = filtered.filter(t => t.category === selectedCategory);
    }

    // Filter by search term
    if (searchTerm) {
        const search = searchTerm.toLowerCase();
        filtered = filtered.filter(t =>
            t.name.toLowerCase().includes(search) ||
            t.description?.toLowerCase().includes(search) ||
            t.tags?.some(tag => tag.toLowerCase().includes(search))
        );
    }

    renderTemplates(filtered);
}

function renderTemplates(templateList) {
    const grid = document.getElementById('templates-grid');
    const emptyState = document.getElementById('empty-state');

    if (templateList.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'flex';
    emptyState.style.display = 'none';

    grid.innerHTML = templateList.map(template => {
        const stepCount = template.definition?.steps?.length || 0;

        return `
            <div class="col">
                <div class="card template-card h-100" onclick="viewTemplate('${template.id}')">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h5 class="card-title">${template.icon || '📋'} ${escapeHtml(template.name)}</h5>
                            <span class="badge bg-primary category-badge">${template.category || 'general'}</span>
                        </div>

                        <p class="card-text text-muted small">${escapeHtml(template.description || '')}</p>

                        <div class="mb-2">
                            ${(template.tags || []).map(tag =>
                                `<span class="tag">${escapeHtml(tag)}</span>`
                            ).join('')}
                        </div>

                        <div class="d-flex justify-content-between align-items-center mt-3">
                            <small class="text-muted">
                                <i class="bi bi-diagram-3"></i> ${stepCount} step${stepCount !== 1 ? 's' : ''}
                                <span class="ms-2 badge bg-info">${template.difficulty || 'intermediate'}</span>
                            </small>
                            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); useTemplate('${template.id}')">
                                Use Template
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function viewTemplate(templateId) {
    try {
        const token = localStorage.getItem('caToken');
        const res = await fetch(`/api/workflows/templates/${templateId}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        }).then(r => r.json());

        if (res.success) {
            selectedTemplate = res.data;
            showTemplateDetails(res.data);
        } else {
            showError('Failed to load template details');
        }
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

function showTemplateDetails(template) {
    const modal = new bootstrap.Modal(document.getElementById('templateModal'));
    const title = document.getElementById('template-modal-title');
    const body = document.getElementById('template-modal-body');

    title.textContent = template.name;

    const stepCount = template.definition?.steps?.length || 0;
    const connectionCount = template.definition?.connections?.length || 0;

    body.innerHTML = `
        <div class="mb-3">
            <span class="badge bg-primary">${template.category || 'general'}</span>
            ${(template.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
            <span class="badge bg-info ms-2">${template.difficulty || 'intermediate'}</span>
            <span class="badge bg-secondary ms-2">~${template.estimatedSetupTime || 10} min setup</span>
        </div>

        <h6>Description</h6>
        <p>${escapeHtml(template.description || 'No description available')}</p>

        <h6 class="mt-3">Workflow Structure</h6>
        <ul>
            <li><strong>Steps:</strong> ${stepCount}</li>
            <li><strong>Difficulty:</strong> ${template.difficulty || 'intermediate'}</li>
            <li><strong>Estimated Setup Time:</strong> ${template.estimatedSetupTime || 10} minutes</li>
        </ul>

        <h6 class="mt-3">Steps Overview</h6>
        <div class="list-group">
            ${(template.definition?.steps || []).map(step => `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <strong>${escapeHtml(step.name)}</strong>
                            <br>
                            <small class="text-muted">Type: ${step.type}</small>
                        </div>
                        <span class="badge bg-secondary">${step.step_id}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Set up the "Use Template" button
    document.getElementById('use-template-btn').onclick = () => {
        modal.hide();
        useTemplate(template.id);
    };

    modal.show();
}

async function useTemplate(templateId) {
    try {
        const token = localStorage.getItem('caToken');
        const template = await fetch(`/api/workflows/templates/${templateId}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        }).then(r => r.json());

        if (!template.success) {
            showError('Failed to load template');
            return;
        }

        selectedTemplate = template.data;

        // Show customization modal
        const modal = new bootstrap.Modal(document.getElementById('customizeModal'));

        // Pre-fill with template data
        document.getElementById('workflow-name').value = `${selectedTemplate.name} (Copy)`;
        document.getElementById('workflow-description').value = selectedTemplate.description || '';
        document.getElementById('workflow-category').value = selectedTemplate.category || '';

        modal.show();
    } catch (error) {
        showError('Error: ' + error.message);
    }
}

document.getElementById('create-workflow-btn').addEventListener('click', async () => {
    const name = document.getElementById('workflow-name').value.trim();
    const description = document.getElementById('workflow-description').value.trim();
    const category = document.getElementById('workflow-category').value.trim();

    if (!name) {
        alert('Please enter a workflow name');
        return;
    }

    if (!selectedTemplate) {
        alert('No template selected');
        return;
    }

    try {
        const token = localStorage.getItem('caToken') || prompt('Enter CA Token:');
        if (!token) {
            alert('Authentication required');
            return;
        }

        const res = await fetch(`/api/workflows/templates/${selectedTemplate.id}/create`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                description,
                variables: {}
            })
        }).then(r => r.json());

        if (res.success) {
            // Close modal
            bootstrap.Modal.getInstance(document.getElementById('customizeModal')).hide();

            // Redirect to designer with new workflow
            alert('Workflow created successfully!');
            window.location.href = `/designer.html?id=${res.data.id}`;
        } else {
            showError('Failed to create workflow: ' + res.error);
        }
    } catch (error) {
        showError('Error creating workflow: ' + error.message);
    }
});

function showError(message) {
    alert(message);
    console.error(message);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
