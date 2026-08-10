/**
 * Task Inbox - User Task Management
 * Displays and manages user tasks from process instances
 */

class TaskInbox {
  constructor(options) {
    this.tasksElement = options.tasksElement;
    this.detailsElement = options.detailsElement;

    // State
    this.tasks = [];
    this.selectedTaskId = null;
    this.filter = 'all';
    this.autoRefresh = true;
    this.refreshInterval = null;

    // Initialize
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadTasks();
    this.startAutoRefresh();
  }

  setupEventListeners() {
    // Header buttons
    document.getElementById('refresh-btn')?.addEventListener('click', () => this.refresh());

    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this.filter = e.target.dataset.filter;
        this.filterTasks();
      });
    });
  }

  async loadTasks() {
    try {
      // In a real implementation, this would fetch tasks from the API
      // For now, we'll simulate by fetching waiting process instances
      const response = await fetch('/lowcode/api/processes/instances?status=waiting');

      if (!response.ok) {
        // If endpoint doesn't exist, show empty state
        this.tasks = [];
        this.renderTasksList();
        return;
      }

      const data = await response.json();
      if (data.success) {
        // Convert waiting instances to tasks
        this.tasks = (data.instances || []).filter(instance =>
          instance.waitingFor && instance.waitingFor.type === 'user-task'
        ).map(instance => ({
          id: instance.id,
          name: instance.waitingFor.elementId || 'User Task',
          processId: instance.processId,
          processName: 'Process',
          instanceId: instance.id,
          assignee: instance.waitingFor.assignee,
          dueDate: instance.waitingFor.dueDate,
          formKey: instance.waitingFor.formKey,
          createdAt: instance.createdAt,
          priority: this.calculatePriority(instance),
          instance
        }));

        this.renderTasksList();
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
      this.tasks = [];
      this.renderTasksList();
    }
  }

  calculatePriority(instance) {
    // Calculate priority based on due date or other factors
    if (!instance.waitingFor?.dueDate) return 'low';

    const due = new Date(instance.waitingFor.dueDate);
    const now = new Date();
    const hoursUntilDue = (due - now) / (1000 * 60 * 60);

    if (hoursUntilDue < 0) return 'high'; // Overdue
    if (hoursUntilDue < 24) return 'high'; // Due within 24 hours
    if (hoursUntilDue < 72) return 'medium'; // Due within 3 days
    return 'low';
  }

  renderTasksList() {
    if (this.tasks.length === 0) {
      this.tasksElement.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-inbox"></i>
          <p>No tasks in your inbox</p>
        </div>
      `;
      document.getElementById('task-count').textContent = '0';
      return;
    }

    const filteredTasks = this.getFilteredTasks();
    document.getElementById('task-count').textContent = filteredTasks.length;

    this.tasksElement.innerHTML = filteredTasks.map(task => {
      const isSelected = task.id === this.selectedTaskId;
      const createdAt = new Date(task.createdAt).toLocaleString();
      const isUrgent = task.priority === 'high';

      let dueInfo = '';
      if (task.dueDate) {
        const due = new Date(task.dueDate);
        const now = new Date();
        const hoursUntilDue = (due - now) / (1000 * 60 * 60);

        if (hoursUntilDue < 0) {
          dueInfo = `Overdue by ${Math.abs(Math.round(hoursUntilDue))}h`;
        } else if (hoursUntilDue < 24) {
          dueInfo = `Due in ${Math.round(hoursUntilDue)}h`;
        } else {
          dueInfo = `Due ${due.toLocaleDateString()}`;
        }
      }

      return `
        <div class="task-item ${isSelected ? 'selected' : ''} ${isUrgent ? 'urgent' : ''}"
             data-task-id="${task.id}">
          <div class="task-header">
            <div>
              <div class="task-name">${task.name}</div>
              <div class="task-process">${task.processName}</div>
            </div>
            <span class="task-priority ${task.priority}">${task.priority}</span>
          </div>
          <div class="task-meta">
            ${task.assignee ? `
              <div class="task-meta-item">
                <i class="fas fa-user"></i>
                <span>${task.assignee}</span>
              </div>
            ` : ''}
            ${dueInfo ? `
              <div class="task-meta-item">
                <i class="fas fa-clock"></i>
                <span>${dueInfo}</span>
              </div>
            ` : ''}
            <div class="task-meta-item">
              <i class="fas fa-calendar"></i>
              <span>${createdAt}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Add click listeners
    this.tasksElement.querySelectorAll('.task-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectTask(item.dataset.taskId);
      });
    });
  }

  getFilteredTasks() {
    if (this.filter === 'all') {
      return this.tasks;
    } else if (this.filter === 'mine') {
      // Filter for tasks assigned to current user
      // In a real implementation, would check against req.user.id
      return this.tasks.filter(task => task.assignee);
    } else if (this.filter === 'group') {
      // Filter for tasks assigned to user's groups
      return this.tasks.filter(task => !task.assignee);
    }
    return this.tasks;
  }

  filterTasks() {
    this.renderTasksList();
  }

  selectTask(taskId) {
    this.selectedTaskId = taskId;
    this.renderTasksList(); // Re-render to show selection

    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      this.renderTaskDetails(task);
    }
  }

  renderTaskDetails(task) {
    const createdAt = new Date(task.createdAt).toLocaleString();
    const dueDate = task.dueDate
      ? new Date(task.dueDate).toLocaleString()
      : 'No due date';

    this.detailsElement.innerHTML = `
      <div class="task-details">
        <div class="details-header">
          <div class="details-title">${task.name}</div>
          <div class="details-subtitle">
            ${task.processName} • Instance ${task.instanceId.split('-')[0]}
          </div>
        </div>

        <div class="details-section">
          <div class="section-title">Task Information</div>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-label">Priority</div>
              <div class="info-value">
                <span class="task-priority ${task.priority}">${task.priority}</span>
              </div>
            </div>

            <div class="info-item">
              <div class="info-label">Assignee</div>
              <div class="info-value">${task.assignee || 'Unassigned'}</div>
            </div>

            <div class="info-item">
              <div class="info-label">Created</div>
              <div class="info-value">${createdAt}</div>
            </div>

            <div class="info-item">
              <div class="info-label">Due Date</div>
              <div class="info-value">${dueDate}</div>
            </div>

            <div class="info-item">
              <div class="info-label">Process Instance</div>
              <div class="info-value" style="font-family: monospace; font-size: 0.875rem;">
                ${task.instanceId}
              </div>
            </div>

            ${task.formKey ? `
              <div class="info-item">
                <div class="info-label">Form Key</div>
                <div class="info-value">${task.formKey}</div>
              </div>
            ` : ''}
          </div>
        </div>

        <div class="details-section">
          <div class="section-title">Process Variables</div>
          ${this.renderProcessVariables(task.instance)}
        </div>

        <div class="details-section">
          <div class="section-title">Complete Task</div>
          ${this.renderTaskForm(task)}
        </div>
      </div>
    `;

    this.setupTaskFormListeners(task);
  }

  renderProcessVariables(instance) {
    const variables = instance.variables || {};
    const varCount = Object.keys(variables).length;

    if (varCount === 0) {
      return `
        <div class="info-item">
          <div class="info-label">No Variables</div>
          <div class="info-value">This process has no variables</div>
        </div>
      `;
    }

    return `
      <div class="task-form">
        ${Object.entries(variables).map(([key, value]) => `
          <div class="form-field">
            <label class="form-label">${key}</label>
            <input type="text" class="form-input" value="${this.formatValue(value)}" readonly>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderTaskForm(task) {
    return `
      <div class="task-form">
        <div class="form-field">
          <label class="form-label">Task Completion Data</label>
          <textarea
            class="form-textarea"
            id="task-data"
            placeholder='Enter task completion data as JSON&#10;Example:&#10;{&#10;  "approved": true,&#10;  "comments": "Looks good!",&#10;  "nextAction": "proceed"&#10;}'
          >{
  "completed": true
}</textarea>
          <div class="form-hint">
            Enter the task completion data as valid JSON. This data will be merged into the process variables.
          </div>
        </div>

        <div class="form-actions">
          <button class="btn btn-primary" id="complete-task-btn">
            <i class="fas fa-check"></i> Complete Task
          </button>
          <button class="btn btn-secondary" id="view-process-btn">
            <i class="fas fa-chart-line"></i> View Process Instance
          </button>
        </div>
      </div>
    `;
  }

  setupTaskFormListeners(task) {
    // Complete task button
    document.getElementById('complete-task-btn')?.addEventListener('click', () => {
      this.completeTask(task);
    });

    // View process button
    document.getElementById('view-process-btn')?.addEventListener('click', () => {
      window.location.href = `/lowcode/processes/${task.processId}/monitor`;
    });
  }

  async completeTask(task) {
    const taskDataInput = document.getElementById('task-data');
    const taskDataStr = taskDataInput.value.trim();

    if (!taskDataStr) {
      alert('Please enter task completion data');
      return;
    }

    try {
      const taskData = JSON.parse(taskDataStr);

      if (!confirm('Complete this task? This action cannot be undone.')) {
        return;
      }

      const response = await fetch(
        `/lowcode/api/processes/instances/${task.instanceId}/complete-task`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskData })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to complete task');
      }

      const result = await response.json();
      if (result.success) {
        alert('Task completed successfully!');
        this.selectedTaskId = null;
        await this.refresh();
      }
    } catch (error) {
      console.error('Failed to complete task:', error);
      alert('Failed to complete task: ' + error.message);
    }
  }

  async refresh() {
    await this.loadTasks();
  }

  startAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    if (this.autoRefresh) {
      this.refreshInterval = setInterval(() => {
        this.refresh();
      }, 10000); // Refresh every 10 seconds
    }
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  formatValue(value) {
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }
}
