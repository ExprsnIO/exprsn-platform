/**
 * Exprsn Spark - Main Application
 * Application initialization and orchestration
 */

class SparkApp {
  constructor() {
    this.user = null;
    this.token = null;
    this.initialized = false;
  }

  /**
   * Initialize the application
   */
  async init() {
    if (this.initialized) {
      console.warn('[Spark App] Already initialized');
      return;
    }

    console.log('[Spark App] Initializing Spark...');

    try {
      // Check authentication
      await this.checkAuth();

      // Initialize UI
      window.sparkUI.init();

      // Setup UI event listeners
      this.setupUIEventListeners();

      // Connect to Socket.IO
      this.connectSocket();

      // Setup Socket.IO event listeners
      this.setupSocketEventListeners();

      // Load initial data
      await this.loadInitialData();

      this.initialized = true;
      console.log('[Spark App] Spark initialized successfully');
    } catch (error) {
      console.error('[Spark App] Initialization failed:', error);
      this.handleInitializationError(error);
    }
  }

  /**
   * Check authentication
   */
  async checkAuth() {
    // Get token from localStorage or cookie
    this.token = localStorage.getItem(SparkConfig.storage.token);

    if (!this.token) {
      throw new Error('Not authenticated');
    }

    // Get user info
    const userStr = localStorage.getItem(SparkConfig.storage.user);
    if (userStr) {
      this.user = JSON.parse(userStr);
      window.sparkUI.currentUserId = this.user.id;
    } else {
      // Fetch user info from API
      await this.fetchUserInfo();
    }

    console.log('[Spark App] Authenticated as:', this.user);
  }

  /**
   * Fetch user info
   */
  async fetchUserInfo() {
    try {
      const response = await this.apiRequest('/api/spark/me');
      this.user = response.user;
      window.sparkUI.currentUserId = this.user.id;

      // Save to localStorage
      localStorage.setItem(SparkConfig.storage.user, JSON.stringify(this.user));
    } catch (error) {
      console.error('[Spark App] Failed to fetch user info:', error);
      throw error;
    }
  }

  /**
   * Connect to Socket.IO
   */
  connectSocket() {
    console.log('[Spark App] Connecting to Socket.IO...');
    window.sparkSocket.connect(this.token);
  }

  /**
   * Setup UI event listeners
   */
  setupUIEventListeners() {
    // Load users for conversation
    window.sparkUI.on('load-users-for-conversation', async () => {
      await this.loadUsersForConversation();
    });

    // Create conversation
    window.sparkUI.on('create-conversation', async () => {
      await this.createConversation();
    });

    // Search conversations
    window.sparkUI.on('search-conversations', async ({ query }) => {
      await this.searchConversations(query);
    });

    // Filter conversations
    window.sparkUI.on('filter-conversations', async ({ filter }) => {
      await this.filterConversations(filter);
    });

    // Load messages
    window.sparkUI.on('load-messages', async ({ conversationId }) => {
      await this.loadMessages(conversationId);
    });

    // Load more messages
    window.sparkUI.on('load-more-messages', async ({ conversationId }) => {
      await this.loadMoreMessages(conversationId);
    });

    // Send message
    window.sparkUI.on('send-message', async (message) => {
      await this.sendMessage(message);
    });

    // Attach files
    window.sparkUI.on('attach-files', async ({ files }) => {
      await this.attachFiles(files);
    });

    // Mark conversation as read
    window.sparkUI.on('mark-conversation-read', async ({ conversationId }) => {
      await this.markConversationAsRead(conversationId);
    });

    // Context menu actions
    window.sparkUI.on('context-menu-action', async ({ action, messageId }) => {
      await this.handleContextMenuAction(action, messageId);
    });
  }

  /**
   * Setup Socket.IO event listeners
   */
  setupSocketEventListeners() {
    // Connection events
    window.sparkSocket.on('spark:connected', () => {
      console.log('[Spark App] Socket connected');
      window.sparkUI.showToast('Connected to server', 'success');
    });

    window.sparkSocket.on('spark:disconnected', ({ reason }) => {
      console.log('[Spark App] Socket disconnected:', reason);
      if (reason !== 'io client disconnect') {
        window.sparkUI.showToast('Disconnected from server', 'warning');
      }
    });

    window.sparkSocket.on('spark:connection-error', ({ error }) => {
      console.error('[Spark App] Socket connection error:', error);
      window.sparkUI.showToast('Connection error', 'error');
    });

    window.sparkSocket.on('spark:reconnected', () => {
      console.log('[Spark App] Socket reconnected');
      window.sparkUI.showToast('Reconnected', 'success');
      // Reload conversations
      this.loadConversations();
    });

    // Message events
    window.sparkSocket.on('spark:message-received', (data) => {
      this.handleMessageReceived(data);
    });

    window.sparkSocket.on('spark:message-updated', (data) => {
      this.handleMessageUpdated(data);
    });

    window.sparkSocket.on('spark:message-deleted', (data) => {
      this.handleMessageDeleted(data);
    });

    window.sparkSocket.on('spark:message-read', (data) => {
      this.handleMessageRead(data);
    });

    window.sparkSocket.on('spark:message-reaction', (data) => {
      this.handleMessageReaction(data);
    });

    // Typing indicators
    window.sparkSocket.on('spark:user-typing', (data) => {
      window.sparkUI.showUserTyping(data.userId, data.conversationId);
    });

    window.sparkSocket.on('spark:user-stopped-typing', (data) => {
      window.sparkUI.hideUserTyping(data.userId);
    });

    // Conversation events
    window.sparkSocket.on('spark:conversation-created', (data) => {
      this.handleConversationCreated(data);
    });

    window.sparkSocket.on('spark:conversation-updated', (data) => {
      this.handleConversationUpdated(data);
    });

    window.sparkSocket.on('spark:conversation-deleted', (data) => {
      this.handleConversationDeleted(data);
    });

    // User presence
    window.sparkSocket.on('spark:user-online', (data) => {
      this.handleUserOnline(data);
    });

    window.sparkSocket.on('spark:user-offline', (data) => {
      this.handleUserOffline(data);
    });

    // Errors
    window.sparkSocket.on('spark:error', (error) => {
      console.error('[Spark App] Socket error:', error);
      window.sparkUI.showToast(error.message || 'An error occurred', 'error');
    });

    window.sparkSocket.on('spark:unauthorized', () => {
      console.error('[Spark App] Unauthorized');
      window.sparkUI.showToast('Authentication failed. Please log in again.', 'error');
      // Redirect to login
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    });
  }

  /**
   * Load initial data
   */
  async loadInitialData() {
    console.log('[Spark App] Loading initial data...');

    // Load conversations
    await this.loadConversations();

    // Restore last active conversation
    if (window.sparkUI.savedConversationId) {
      setTimeout(() => {
        window.sparkUI.selectConversation(window.sparkUI.savedConversationId);
      }, 500);
    }
  }

  /**
   * Load conversations
   */
  async loadConversations() {
    try {
      const response = await this.apiRequest('/api/spark/conversations', {
        method: 'GET',
        params: {
          limit: SparkConfig.pagination.conversationsLimit
        }
      });

      window.sparkUI.renderConversations(response.conversations);
      window.sparkUI.updateUnreadBadge();
    } catch (error) {
      console.error('[Spark App] Failed to load conversations:', error);
      window.sparkUI.showToast('Failed to load conversations', 'error');
    }
  }

  /**
   * Search conversations
   */
  async searchConversations(query) {
    try {
      const response = await this.apiRequest('/api/spark/conversations/search', {
        method: 'GET',
        params: { query }
      });

      window.sparkUI.renderConversations(response.conversations);
    } catch (error) {
      console.error('[Spark App] Failed to search conversations:', error);
      window.sparkUI.showToast('Search failed', 'error');
    }
  }

  /**
   * Filter conversations
   */
  async filterConversations(filter) {
    try {
      const params = {
        limit: SparkConfig.pagination.conversationsLimit
      };

      if (filter === 'unread') {
        params.unreadOnly = true;
      } else if (filter === 'groups') {
        params.type = 'group';
      } else if (filter === 'direct') {
        params.type = 'direct';
      }

      const response = await this.apiRequest('/api/spark/conversations', {
        method: 'GET',
        params
      });

      window.sparkUI.renderConversations(response.conversations);
    } catch (error) {
      console.error('[Spark App] Failed to filter conversations:', error);
      window.sparkUI.showToast('Filter failed', 'error');
    }
  }

  /**
   * Load messages
   */
  async loadMessages(conversationId) {
    try {
      // Show loading
      const messagesList = document.getElementById('messagesList');
      if (messagesList) {
        messagesList.innerHTML = '<div class="messages-loading"><i class="fas fa-spinner fa-spin"></i><p>Loading messages...</p></div>';
      }

      const response = await this.apiRequest(`/api/spark/conversations/${conversationId}/messages`, {
        method: 'GET',
        params: {
          limit: SparkConfig.pagination.messagesLimit
        }
      });

      window.sparkUI.renderMessages(response.messages);
    } catch (error) {
      console.error('[Spark App] Failed to load messages:', error);
      window.sparkUI.showToast('Failed to load messages', 'error');
    }
  }

  /**
   * Load more messages
   */
  async loadMoreMessages(conversationId) {
    try {
      const oldestMessage = Array.from(window.sparkUI.messages.values())
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];

      if (!oldestMessage) return;

      const response = await this.apiRequest(`/api/spark/conversations/${conversationId}/messages`, {
        method: 'GET',
        params: {
          limit: SparkConfig.pagination.messagesLimit,
          before: oldestMessage.createdAt
        }
      });

      if (response.messages.length > 0) {
        // Prepend messages
        const messagesList = document.getElementById('messagesList');
        const scrollHeight = messagesList.scrollHeight;

        response.messages.reverse().forEach(message => {
          const messageElement = window.sparkUI.createMessageElement(message, 0, [message]);
          messagesList.prepend(messageElement);
          window.sparkUI.messages.set(message.id, message);
        });

        // Maintain scroll position
        messagesList.scrollTop = messagesList.scrollHeight - scrollHeight;
      }
    } catch (error) {
      console.error('[Spark App] Failed to load more messages:', error);
    }
  }

  /**
   * Send message
   */
  async sendMessage(message) {
    if (window.sparkSocket.isConnected()) {
      // Send via Socket.IO for real-time
      window.sparkSocket.sendMessage(message.conversationId, message.content, {
        replyToId: message.replyToId
      });

      // Optimistically add message to UI
      this.addOptimisticMessage(message);
    } else {
      // Fallback to REST API
      try {
        const response = await this.apiRequest(`/api/spark/conversations/${message.conversationId}/messages`, {
          method: 'POST',
          body: {
            content: message.content,
            replyToId: message.replyToId
          }
        });

        this.handleMessageReceived({ message: response.message });
      } catch (error) {
        console.error('[Spark App] Failed to send message:', error);
        window.sparkUI.showToast(SparkConfig.errors.messageSendFailed, 'error');
      }
    }
  }

  /**
   * Add optimistic message (temporary message while waiting for server)
   */
  addOptimisticMessage(message) {
    const optimisticMessage = {
      id: 'temp-' + Date.now(),
      conversationId: message.conversationId,
      senderId: this.user.id,
      senderName: this.user.name,
      content: message.content,
      status: 'sending',
      createdAt: new Date().toISOString(),
      replyToId: message.replyToId
    };

    const messagesList = document.getElementById('messagesList');
    if (messagesList) {
      const messageElement = window.sparkUI.createMessageElement(optimisticMessage, 0, [optimisticMessage]);
      messagesList.appendChild(messageElement);
      window.sparkUI.scrollToBottom();
    }
  }

  /**
   * Attach files
   */
  async attachFiles(files) {
    try {
      // Validate files
      for (const file of files) {
        if (file.size > SparkConfig.message.maxAttachmentSize) {
          window.sparkUI.showToast(`File ${file.name} is too large`, 'error');
          return;
        }
        if (!SparkConfig.message.allowedAttachmentTypes.includes(file.type)) {
          window.sparkUI.showToast(`File type ${file.type} not allowed`, 'error');
          return;
        }
      }

      // Upload files
      const formData = new FormData();
      files.forEach(file => {
        formData.append('files', file);
      });

      const response = await this.apiRequest('/api/spark/upload', {
        method: 'POST',
        body: formData,
        isFormData: true
      });

      // Send message with attachments
      if (window.sparkUI.activeConversation) {
        this.sendMessage({
          conversationId: window.sparkUI.activeConversation.id,
          content: '',
          attachments: response.files
        });
      }

      window.sparkUI.showToast('Files uploaded successfully', 'success');
    } catch (error) {
      console.error('[Spark App] Failed to upload files:', error);
      window.sparkUI.showToast(SparkConfig.errors.fileUploadFailed, 'error');
    }
  }

  /**
   * Load users for conversation
   */
  async loadUsersForConversation() {
    try {
      const response = await this.apiRequest('/api/spark/users', {
        method: 'GET',
        params: {
          limit: SparkConfig.pagination.usersLimit
        }
      });

      this.renderUsersForConversation(response.users);
    } catch (error) {
      console.error('[Spark App] Failed to load users:', error);
      window.sparkUI.showToast('Failed to load users', 'error');
    }
  }

  /**
   * Render users for conversation creation
   */
  renderUsersForConversation(users) {
    const usersList = document.getElementById('usersList');
    if (!usersList) return;

    usersList.innerHTML = users.map(user => `
      <div class="user-item" data-user-id="${user.id}">
        <div class="avatar small">
          <i class="fas fa-user"></i>
        </div>
        <div class="user-info">
          <div class="user-name">${this.escapeHtml(user.name)}</div>
          <div class="user-status">${user.online ? 'Online' : 'Offline'}</div>
        </div>
        <button class="btn-icon select-user">
          <i class="fas fa-plus"></i>
        </button>
      </div>
    `).join('');

    // Add click handlers
    usersList.querySelectorAll('.select-user').forEach((btn, index) => {
      btn.addEventListener('click', () => this.selectUserForConversation(users[index]));
    });
  }

  /**
   * Select user for conversation
   */
  selectUserForConversation(user) {
    const selectedUsers = document.getElementById('selectedUsers');
    if (!selectedUsers) return;

    // Check if already selected
    if (selectedUsers.querySelector(`[data-user-id="${user.id}"]`)) {
      return;
    }

    const userChip = document.createElement('div');
    userChip.className = 'user-chip';
    userChip.dataset.userId = user.id;
    userChip.innerHTML = `
      <span>${this.escapeHtml(user.name)}</span>
      <button class="remove-user">
        <i class="fas fa-times"></i>
      </button>
    `;

    userChip.querySelector('.remove-user').addEventListener('click', () => {
      userChip.remove();
    });

    selectedUsers.appendChild(userChip);
  }

  /**
   * Create conversation
   */
  async createConversation() {
    try {
      const selectedUsers = Array.from(document.querySelectorAll('#selectedUsers .user-chip'))
        .map(chip => chip.dataset.userId);

      if (selectedUsers.length === 0) {
        window.sparkUI.showToast('Please select at least one user', 'warning');
        return;
      }

      const typeBtn = document.querySelector('.type-btn.active');
      const type = typeBtn ? typeBtn.dataset.type : 'direct';

      const data = {
        type,
        memberIds: selectedUsers
      };

      if (type === 'group') {
        const groupName = document.getElementById('groupName').value.trim();
        const groupDescription = document.getElementById('groupDescription').value.trim();

        if (!groupName) {
          window.sparkUI.showToast('Please enter a group name', 'warning');
          return;
        }

        data.name = groupName;
        data.description = groupDescription;
      }

      const response = await this.apiRequest('/api/spark/conversations', {
        method: 'POST',
        body: data
      });

      window.sparkUI.hideNewConversationModal();
      window.sparkUI.showToast(SparkConfig.success.conversationCreated, 'success');

      // Select new conversation
      window.sparkUI.selectConversation(response.conversation.id);

      // Reload conversations list
      await this.loadConversations();
    } catch (error) {
      console.error('[Spark App] Failed to create conversation:', error);
      window.sparkUI.showToast('Failed to create conversation', 'error');
    }
  }

  /**
   * Mark conversation as read
   */
  async markConversationAsRead(conversationId) {
    try {
      await this.apiRequest(`/api/spark/conversations/${conversationId}/read`, {
        method: 'POST'
      });
    } catch (error) {
      console.error('[Spark App] Failed to mark as read:', error);
    }
  }

  /**
   * Handle context menu action
   */
  async handleContextMenuAction(action, messageId) {
    const message = window.sparkUI.messages.get(messageId);
    if (!message) return;

    switch (action) {
      case 'reply':
        window.sparkUI.replyingTo = message;
        const replyPreview = document.getElementById('replyPreview');
        const replyText = document.getElementById('replyText');
        if (replyPreview && replyText) {
          replyText.textContent = message.content;
          replyPreview.classList.remove('hidden');
        }
        document.getElementById('messageInput').focus();
        break;

      case 'copy':
        navigator.clipboard.writeText(message.content);
        window.sparkUI.showToast('Message copied', 'success');
        break;

      case 'edit':
        if (message.senderId === this.user.id) {
          const newContent = prompt('Edit message:', message.content);
          if (newContent && newContent.trim()) {
            await this.updateMessage(messageId, newContent.trim());
          }
        }
        break;

      case 'delete':
        if (message.senderId === this.user.id) {
          if (confirm('Delete this message?')) {
            await this.deleteMessage(messageId);
          }
        }
        break;

      case 'forward':
        // TODO: Implement forward
        window.sparkUI.showToast('Forward feature coming soon', 'info');
        break;

      case 'select':
        // TODO: Implement select
        window.sparkUI.showToast('Select feature coming soon', 'info');
        break;
    }
  }

  /**
   * Update message
   */
  async updateMessage(messageId, content) {
    try {
      if (window.sparkSocket.isConnected()) {
        window.sparkSocket.updateMessage(messageId, content);
      } else {
        await this.apiRequest(`/api/spark/messages/${messageId}`, {
          method: 'PUT',
          body: { content }
        });
      }

      window.sparkUI.showToast('Message updated', 'success');
    } catch (error) {
      console.error('[Spark App] Failed to update message:', error);
      window.sparkUI.showToast('Failed to update message', 'error');
    }
  }

  /**
   * Delete message
   */
  async deleteMessage(messageId) {
    try {
      if (window.sparkSocket.isConnected()) {
        window.sparkSocket.deleteMessage(messageId);
      } else {
        await this.apiRequest(`/api/spark/messages/${messageId}`, {
          method: 'DELETE'
        });
      }

      window.sparkUI.showToast('Message deleted', 'success');
    } catch (error) {
      console.error('[Spark App] Failed to delete message:', error);
      window.sparkUI.showToast('Failed to delete message', 'error');
    }
  }

  /**
   * Handle message received
   */
  handleMessageReceived(data) {
    const { message } = data;

    // Remove optimistic message if exists
    const optimisticElement = document.querySelector(`[data-message-id^="temp-"]`);
    if (optimisticElement && message.senderId === this.user.id) {
      optimisticElement.remove();
    }

    // Add message to UI if in active conversation
    if (window.sparkUI.activeConversation && message.conversationId === window.sparkUI.activeConversation.id) {
      const messagesList = document.getElementById('messagesList');
      if (messagesList) {
        const messageElement = window.sparkUI.createMessageElement(message, 0, [message]);
        messagesList.appendChild(messageElement);
        window.sparkUI.scrollToBottom();
      }

      // Mark as read if message from others
      if (message.senderId !== this.user.id) {
        window.sparkSocket.markAsRead(message.conversationId, message.id);
      }
    }

    // Update conversations list
    this.updateConversationPreview(message.conversationId, message);

    // Show notification if not in active conversation
    if (!window.sparkUI.activeConversation || message.conversationId !== window.sparkUI.activeConversation.id) {
      if (message.senderId !== this.user.id) {
        this.showNotification(message);
      }
    }
  }

  /**
   * Handle message updated
   */
  handleMessageUpdated(data) {
    const { message } = data;
    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);

    if (messageElement) {
      const messageText = messageElement.querySelector('.message-text');
      if (messageText) {
        messageText.innerHTML = window.sparkUI.formatMessageText(message.content);
      }
    }

    // Update in map
    window.sparkUI.messages.set(message.id, message);
  }

  /**
   * Handle message deleted
   */
  handleMessageDeleted(data) {
    const { messageId } = data;
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);

    if (messageElement) {
      messageElement.remove();
    }

    // Remove from map
    window.sparkUI.messages.delete(messageId);
  }

  /**
   * Handle message read
   */
  handleMessageRead(data) {
    const { messageId, userId } = data;

    if (userId === this.user.id) return;

    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      const statusIcon = messageElement.querySelector('.message-status');
      if (statusIcon) {
        statusIcon.className = 'fas fa-check-double message-status read';
      }
    }
  }

  /**
   * Handle message reaction
   */
  handleMessageReaction(data) {
    const { messageId, emoji, userId } = data;
    const message = window.sparkUI.messages.get(messageId);

    if (message) {
      if (!message.reactions) {
        message.reactions = [];
      }

      message.reactions.push({ emoji, userId });

      // Re-render message
      const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
      if (messageElement) {
        const reactionsContainer = messageElement.querySelector('.message-reactions');
        if (reactionsContainer) {
          reactionsContainer.outerHTML = window.sparkUI.renderReactions(message.reactions);
        }
      }
    }
  }

  /**
   * Handle conversation created
   */
  handleConversationCreated(data) {
    const { conversation } = data;
    window.sparkUI.conversations.set(conversation.id, conversation);

    // Reload conversations list
    this.loadConversations();
  }

  /**
   * Handle conversation updated
   */
  handleConversationUpdated(data) {
    const { conversation } = data;
    window.sparkUI.conversations.set(conversation.id, conversation);

    const convElement = document.querySelector(`[data-conversation-id="${conversation.id}"]`);
    if (convElement) {
      // Update conversation element
      const nameElement = convElement.querySelector('.conversation-name');
      if (nameElement) {
        nameElement.textContent = conversation.name;
      }
    }

    // Update chat header if active
    if (window.sparkUI.activeConversation && window.sparkUI.activeConversation.id === conversation.id) {
      window.sparkUI.updateChatHeader(conversation);
    }
  }

  /**
   * Handle conversation deleted
   */
  handleConversationDeleted(data) {
    const { conversationId } = data;
    window.sparkUI.conversations.delete(conversationId);

    const convElement = document.querySelector(`[data-conversation-id="${conversationId}"]`);
    if (convElement) {
      convElement.remove();
    }

    // Close chat if active
    if (window.sparkUI.activeConversation && window.sparkUI.activeConversation.id === conversationId) {
      window.sparkUI.activeConversation = null;
      const welcomeScreen = document.getElementById('welcomeScreen');
      const chatContainer = document.getElementById('chatContainer');
      if (welcomeScreen) welcomeScreen.classList.remove('hidden');
      if (chatContainer) chatContainer.classList.add('hidden');
    }
  }

  /**
   * Handle user online
   */
  handleUserOnline(data) {
    const { userId } = data;
    this.updateUserOnlineStatus(userId, true);
  }

  /**
   * Handle user offline
   */
  handleUserOffline(data) {
    const { userId } = data;
    this.updateUserOnlineStatus(userId, false);
  }

  /**
   * Update user online status
   */
  updateUserOnlineStatus(userId, online) {
    // Update in active conversation if direct
    if (window.sparkUI.activeConversation &&
        window.sparkUI.activeConversation.type === 'direct') {
      const indicator = document.getElementById('onlineIndicator');
      const status = document.getElementById('chatStatus');

      if (indicator) {
        indicator.className = 'online-indicator' + (online ? ' online' : '');
      }

      if (status) {
        status.textContent = online ? 'Online' : 'Offline';
      }
    }
  }

  /**
   * Update conversation preview
   */
  updateConversationPreview(conversationId, message) {
    const convElement = document.querySelector(`[data-conversation-id="${conversationId}"]`);
    if (!convElement) return;

    const lastMessage = convElement.querySelector('.last-message');
    const timeElement = convElement.querySelector('.conversation-time');

    if (lastMessage) {
      lastMessage.textContent = message.content;
    }

    if (timeElement) {
      timeElement.textContent = window.sparkUI.formatTimestamp(message.createdAt);
    }

    // Mark as unread if not in active conversation
    if (!window.sparkUI.activeConversation || conversationId !== window.sparkUI.activeConversation.id) {
      if (message.senderId !== this.user.id) {
        convElement.classList.add('unread');

        const unreadCount = convElement.querySelector('.unread-count');
        if (unreadCount) {
          unreadCount.textContent = parseInt(unreadCount.textContent) + 1;
        } else {
          const preview = convElement.querySelector('.conversation-preview');
          if (preview) {
            preview.innerHTML += '<span class="unread-count">1</span>';
          }
        }

        window.sparkUI.updateUnreadBadge();
      }
    }

    // Move conversation to top
    const list = document.getElementById('conversationsList');
    if (list) {
      list.prepend(convElement);
    }
  }

  /**
   * Show notification
   */
  showNotification(message) {
    if ('Notification' in window && Notification.permission === 'granted') {
      const notification = new Notification('New Message', {
        body: `${message.senderName}: ${message.content}`,
        icon: '/images/logo.png',
        tag: message.conversationId
      });

      notification.onclick = () => {
        window.focus();
        window.sparkUI.selectConversation(message.conversationId);
        notification.close();
      };
    }
  }

  /**
   * Handle initialization error
   */
  handleInitializationError(error) {
    console.error('[Spark App] Initialization error:', error);

    if (error.message === 'Not authenticated') {
      // Redirect to login
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    } else {
      window.sparkUI.showToast('Failed to initialize Spark. Please refresh the page.', 'error');
    }
  }

  /**
   * Make API request
   */
  async apiRequest(endpoint, options = {}) {
    const {
      method = 'GET',
      body = null,
      params = null,
      isFormData = false
    } = options;

    let url = SparkConfig.api.baseUrl + endpoint;

    // Add query params
    if (params) {
      const searchParams = new URLSearchParams(params);
      url += '?' + searchParams.toString();
    }

    const headers = {
      'Authorization': `Bearer ${this.token}`
    };

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const fetchOptions = {
      method,
      headers
    };

    if (body) {
      fetchOptions.body = isFormData ? body : JSON.stringify(body);
    }

    try {
      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Request failed');
      }

      return await response.json();
    } catch (error) {
      console.error('[Spark App] API request failed:', error);
      throw error;
    }
  }

  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Request notification permission
   */
  requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  /**
   * Cleanup on page unload
   */
  cleanup() {
    console.log('[Spark App] Cleaning up...');

    // Save state
    window.sparkUI.saveState();

    // Disconnect socket
    if (window.sparkSocket) {
      window.sparkSocket.disconnect();
    }
  }
}

// Create global instance
window.sparkApp = new SparkApp();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.sparkApp.init();

  // Request notification permission
  window.sparkApp.requestNotificationPermission();

  // Cleanup on unload
  window.addEventListener('beforeunload', () => {
    window.sparkApp.cleanup();
  });
});
