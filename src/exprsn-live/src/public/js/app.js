/**
 * Exprsn Live - Main Application
 * Orchestrates UI interactions and coordinates all components
 */

class LiveApp {
  constructor() {
    this.currentPage = 'dashboard';
    this.streams = [];
    this.rooms = [];
    this.recordings = [];
    this.currentFilter = {
      streams: 'all',
      rooms: 'all'
    };
    this.polling = {
      streams: null,
      rooms: null
    };
  }

  /**
   * Initialize application
   */
  async init() {
    console.log('Initializing Exprsn Live...');

    // Setup event listeners
    this.setupNavigation();
    this.setupModals();
    this.setupForms();
    this.setupFilters();
    this.setupSocketHandlers();

    // Load initial data
    await this.loadDashboard();

    console.log('Exprsn Live initialized');
  }

  /**
   * Setup page navigation
   */
  setupNavigation() {
    const navLinks = document.querySelectorAll('[data-page]');

    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        this.navigateTo(page);
      });
    });

    // Quick action cards
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const action = e.currentTarget.dataset.action;
        this.handleAction(action);
      });
    });
  }

  /**
   * Navigate to page
   */
  navigateTo(page) {
    // Update active nav link
    document.querySelectorAll('[data-page]').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });

    // Show page section
    document.querySelectorAll('.page-section').forEach(section => {
      section.classList.toggle('active', section.id === `${page}Page`);
    });

    this.currentPage = page;

    // Load page data
    switch (page) {
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'streams':
        this.loadStreams();
        break;
      case 'rooms':
        this.loadRooms();
        break;
      case 'recordings':
        this.loadRecordings();
        break;
    }
  }

  /**
   * Handle action buttons
   */
  handleAction(action) {
    switch (action) {
      case 'create-stream':
        this.showModal('createStreamModal');
        break;
      case 'create-room':
        this.showModal('createRoomModal');
        break;
      case 'join-room':
        this.showModal('joinRoomModal');
        break;
    }
  }

  /**
   * Setup modals
   */
  setupModals() {
    // Bootstrap modal instances are automatically handled
    // Add custom close handlers if needed
  }

  /**
   * Show modal
   */
  showModal(modalId) {
    const modal = new bootstrap.Modal(document.getElementById(modalId));
    modal.show();
  }

  /**
   * Hide modal
   */
  hideModal(modalId) {
    const modalEl = document.getElementById(modalId);
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) {
      modal.hide();
    }
  }

  /**
   * Setup forms
   */
  setupForms() {
    // Create stream form
    document.getElementById('createStreamForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleCreateStream(e);
    });

    // Create room form
    document.getElementById('createRoomForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleCreateRoom(e);
    });

    // Join room form
    document.getElementById('joinRoomForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleJoinRoom(e);
    });
  }

  /**
   * Setup filters
   */
  setupFilters() {
    // Stream filters
    document.querySelectorAll('.filter-btn[data-filter-type="streams"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.applyFilter('streams', e.currentTarget.dataset.filter);
      });
    });

    // Room filters
    document.querySelectorAll('.filter-btn[data-filter-type="rooms"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.applyFilter('rooms', e.currentTarget.dataset.filter);
      });
    });
  }

  /**
   * Apply filter
   */
  applyFilter(type, filter) {
    this.currentFilter[type] = filter;

    // Update active filter button
    document.querySelectorAll(`.filter-btn[data-filter-type="${type}"]`).forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    // Reload data
    if (type === 'streams') {
      this.loadStreams();
    } else if (type === 'rooms') {
      this.loadRooms();
    }
  }

  /**
   * Setup socket event handlers
   */
  setupSocketHandlers() {
    // Connection status
    liveSocket.on('connection-status', (status) => {
      console.log('Connection status:', status);
      if (status.connected) {
        this.showToast('Connected', 'Connected to live updates', 'success');
      }
    });

    // Stream events
    liveSocket.on('stream-started', (data) => {
      this.showToast('Stream Started', `Stream ${data.streamId} is now live!`, 'info');
      this.loadStreams();
    });

    liveSocket.on('stream-ended', (data) => {
      this.showToast('Stream Ended', 'The stream has ended', 'info');
      this.loadStreams();
    });

    liveSocket.on('viewer-count-updated', (data) => {
      this.updateViewerCount(data.streamId, data.count);
    });

    // Room events
    liveSocket.on('participant-joined', (data) => {
      this.showToast('Participant Joined', `${data.participant.displayName} joined`, 'info');
      this.loadRooms();
    });

    liveSocket.on('participant-left', (data) => {
      this.showToast('Participant Left', 'A participant left the room', 'info');
      this.loadRooms();
    });

    liveSocket.on('room-closed', (data) => {
      this.showToast('Room Closed', 'The room has been closed', 'warning');
      this.loadRooms();
    });
  }

  /**
   * Load dashboard
   */
  async loadDashboard() {
    try {
      // Load statistics
      const [streamsRes, roomsRes] = await Promise.all([
        api.getStreams({ status: 'live' }),
        api.getRooms({ status: 'active' })
      ]);

      // Update stats
      document.getElementById('liveStreamCount').textContent = streamsRes.streams?.length || 0;
      document.getElementById('activeRoomCount').textContent = roomsRes.rooms?.length || 0;

      // Load recent streams and rooms
      await Promise.all([
        this.loadStreams(),
        this.loadRooms()
      ]);

    } catch (error) {
      console.error('Failed to load dashboard:', error);
      this.showToast('Error', 'Failed to load dashboard', 'error');
    }
  }

  /**
   * Load streams
   */
  async loadStreams() {
    try {
      const filters = {};

      // Apply current filter
      if (this.currentFilter.streams === 'live') {
        filters.status = 'live';
      } else if (this.currentFilter.streams === 'mine') {
        // Would need user ID from auth
        filters.userId = localStorage.getItem('userId');
      }

      const response = await api.getStreams(filters);
      this.streams = response.streams || [];

      this.renderStreams();

    } catch (error) {
      console.error('Failed to load streams:', error);
      this.showToast('Error', 'Failed to load streams', 'error');
    }
  }

  /**
   * Render streams
   */
  renderStreams() {
    const container = document.getElementById('streamGrid');
    const emptyState = document.getElementById('streamsEmpty');

    if (this.streams.length === 0) {
      container.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    container.style.display = 'grid';
    emptyState.style.display = 'none';

    container.innerHTML = this.streams.map(stream => `
      <div class="stream-card" data-stream-id="${stream.id}">
        <div class="stream-thumbnail">
          <div class="thumbnail-placeholder">
            <i class="fas fa-broadcast-tower"></i>
            <p>Stream ${stream.title}</p>
          </div>
          ${stream.status === 'live' ? `
            <div class="live-badge">
              <span class="live-indicator"></span> LIVE
            </div>
          ` : ''}
          <div class="viewer-count">
            <i class="fas fa-eye"></i> ${stream.viewer_count || 0}
          </div>
        </div>
        <div class="card-body">
          <h5 class="stream-title">${this.escapeHtml(stream.title)}</h5>
          <div class="stream-meta">
            <span class="badge badge-${stream.visibility}">${stream.visibility}</span>
            <span>${this.formatDate(stream.created_at)}</span>
          </div>
          <div class="stream-actions">
            ${stream.status === 'live' ? `
              <button class="btn btn-sm btn-danger" onclick="app.watchStream('${stream.id}')">
                <i class="fas fa-play"></i> Watch
              </button>
            ` : `
              <button class="btn btn-sm btn-outline-danger" onclick="app.viewStream('${stream.id}')">
                <i class="fas fa-info-circle"></i> Details
              </button>
            `}
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Load rooms
   */
  async loadRooms() {
    try {
      const filters = {};

      // Apply current filter
      if (this.currentFilter.rooms === 'active') {
        filters.status = 'active';
      } else if (this.currentFilter.rooms === 'mine') {
        filters.userId = localStorage.getItem('userId');
      }

      const response = await api.getRooms(filters);
      this.rooms = response.rooms || [];

      this.renderRooms();

    } catch (error) {
      console.error('Failed to load rooms:', error);
      this.showToast('Error', 'Failed to load rooms', 'error');
    }
  }

  /**
   * Render rooms
   */
  renderRooms() {
    const container = document.getElementById('roomGrid');
    const emptyState = document.getElementById('roomsEmpty');

    if (this.rooms.length === 0) {
      container.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    container.style.display = 'grid';
    emptyState.style.display = 'none';

    container.innerHTML = this.rooms.map(room => `
      <div class="room-card" data-room-id="${room.id}">
        <div class="room-header">
          <div class="room-code">${room.room_code}</div>
          <span class="room-status">
            <span class="live-indicator"></span> ${room.status}
          </span>
        </div>
        <div class="card-body">
          <h5 class="room-name">${this.escapeHtml(room.name)}</h5>
          ${room.description ? `<p class="text-muted">${this.escapeHtml(room.description)}</p>` : ''}
          <div class="room-meta">
            <div class="room-participants">
              <i class="fas fa-users"></i>
              ${room.current_participant_count}/${room.max_participants}
            </div>
            ${room.is_private ? '<i class="fas fa-lock room-lock"></i>' : ''}
          </div>
          <div class="room-actions">
            <button class="btn btn-danger" onclick="app.joinRoomDirect('${room.id}', ${room.is_private})">
              <i class="fas fa-sign-in-alt"></i> Join Room
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Load recordings
   */
  async loadRecordings() {
    try {
      // Load recordings for all streams
      // This would need a dedicated endpoint or aggregate from streams
      this.showToast('Info', 'Recordings feature coming soon', 'info');
    } catch (error) {
      console.error('Failed to load recordings:', error);
      this.showToast('Error', 'Failed to load recordings', 'error');
    }
  }

  /**
   * Handle create stream
   */
  async handleCreateStream(e) {
    const form = e.target;
    const submitBtn = form.querySelector('[type="submit"]');

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creating...';

      const data = {
        title: document.getElementById('streamTitle').value,
        description: document.getElementById('streamDescription').value || '',
        visibility: document.getElementById('streamVisibility').value,
        isRecording: document.getElementById('streamRecording')?.checked ?? true
      };

      const response = await api.createStream(data);

      this.showToast('Success', LiveConfig.messages.streamCreated, 'success');
      this.hideModal('createStreamModal');
      form.reset();

      // Navigate to stream details or start page
      this.loadStreams();

    } catch (error) {
      console.error('Failed to create stream:', error);
      this.showToast('Error', error.message || 'Failed to create stream', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Stream';
    }
  }

  /**
   * Handle create room
   */
  async handleCreateRoom(e) {
    const form = e.target;
    const submitBtn = form.querySelector('[type="submit"]');

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Creating...';

      const isPrivate = document.getElementById('roomPrivate')?.checked ?? false;

      const data = {
        name: document.getElementById('roomName').value,
        description: document.getElementById('roomDescription').value || '',
        maxParticipants: parseInt(document.getElementById('roomMaxParticipants').value) || 10,
        isPrivate,
        password: isPrivate ? document.getElementById('roomPassword').value : undefined
      };

      const response = await api.createRoom(data);

      this.showToast('Success', LiveConfig.messages.roomCreated, 'success');
      this.hideModal('createRoomModal');
      form.reset();

      // Show room code
      alert(`Room created! Code: ${response.room.room_code}`);

      this.loadRooms();

    } catch (error) {
      console.error('Failed to create room:', error);
      this.showToast('Error', error.message || 'Failed to create room', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Room';
    }
  }

  /**
   * Handle join room by code
   */
  async handleJoinRoom(e) {
    const form = e.target;
    const submitBtn = form.querySelector('[type="submit"]');

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Joining...';

      // Get room code from inputs
      const code = Array.from(document.querySelectorAll('.room-code-input input'))
        .map(input => input.value)
        .join('');

      if (code.length !== 6) {
        throw new Error('Please enter complete room code');
      }

      // Find room by code
      const roomResponse = await api.getRoomByCode(code);
      const room = roomResponse.room;

      // Check if password needed
      if (room.is_private) {
        const password = prompt('This room is password protected. Enter password:');
        if (!password) {
          throw new Error('Password required');
        }

        await this.joinRoomWithPassword(room.id, password);
      } else {
        await this.joinRoomDirect(room.id, false);
      }

      this.hideModal('joinRoomModal');
      form.reset();

    } catch (error) {
      console.error('Failed to join room:', error);
      this.showToast('Error', error.message || 'Failed to join room', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Join Room';
    }
  }

  /**
   * Join room directly
   */
  async joinRoomDirect(roomId, requiresPassword) {
    if (requiresPassword) {
      const password = prompt('Enter room password:');
      if (!password) {
        return;
      }
      return this.joinRoomWithPassword(roomId, password);
    }

    // Redirect to room page (would be created separately)
    window.location.href = `/room.html?id=${roomId}`;
  }

  /**
   * Join room with password
   */
  async joinRoomWithPassword(roomId, password) {
    window.location.href = `/room.html?id=${roomId}&password=${encodeURIComponent(password)}`;
  }

  /**
   * Watch stream
   */
  watchStream(streamId) {
    window.location.href = `/stream.html?id=${streamId}`;
  }

  /**
   * View stream details
   */
  viewStream(streamId) {
    window.location.href = `/stream.html?id=${streamId}`;
  }

  /**
   * Update viewer count
   */
  updateViewerCount(streamId, count) {
    const card = document.querySelector(`[data-stream-id="${streamId}"]`);
    if (card) {
      const counter = card.querySelector('.viewer-count');
      if (counter) {
        counter.innerHTML = `<i class="fas fa-eye"></i> ${count}`;
      }
    }
  }

  /**
   * Show toast notification
   */
  showToast(title, message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toastId = `toast-${Date.now()}`;

    const toastHTML = `
      <div id="${toastId}" class="toast toast-${type}" role="alert">
        <div class="toast-header">
          <strong class="me-auto">${title}</strong>
          <button type="button" class="btn-close" data-bs-dismiss="toast"></button>
        </div>
        <div class="toast-body">${message}</div>
      </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHTML);

    const toastEl = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastEl, {
      autohide: true,
      delay: LiveConfig.ui.toastDuration
    });

    toast.show();

    // Remove from DOM after hide
    toastEl.addEventListener('hidden.bs.toast', () => {
      toastEl.remove();
    });
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Format date
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }

    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }

    // More than 24 hours
    return date.toLocaleDateString();
  }
}

// Create global app instance
const app = new LiveApp();

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app.init();
  });
} else {
  app.init();
}

// Make available globally
window.app = app;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LiveApp;
}
