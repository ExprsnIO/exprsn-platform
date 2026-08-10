/**
 * Exprsn Spark - Socket.IO Integration
 * WebSocket connection management and real-time event handlers
 */

class SparkSocket {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.authenticated = false;
    this.reconnectAttempts = 0;
    this.eventHandlers = new Map();
    this.messageQueue = [];
  }

  /**
   * Initialize Socket.IO connection
   */
  connect(token) {
    if (this.socket && this.socket.connected) {
      console.log('[Spark Socket] Already connected');
      return;
    }

    console.log('[Spark Socket] Connecting to server...');

    // Create socket connection
    this.socket = io(SparkConfig.socket.url, {
      ...SparkConfig.socket.options,
      auth: {
        token: token
      }
    });

    // Setup event listeners
    this.setupConnectionHandlers();
    this.setupMessageHandlers();
    this.setupConversationHandlers();
    this.setupUserHandlers();
    this.setupErrorHandlers();
  }

  /**
   * Setup connection event handlers
   */
  setupConnectionHandlers() {
    this.socket.on('connect', () => {
      console.log('[Spark Socket] Connected to server');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('spark:connected');
      this.updateConnectionStatus('connected');

      // Process queued messages
      this.processMessageQueue();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Spark Socket] Disconnected:', reason);
      this.connected = false;
      this.authenticated = false;
      this.emit('spark:disconnected', { reason });
      this.updateConnectionStatus('disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('[Spark Socket] Connection error:', error);
      this.reconnectAttempts++;
      this.emit('spark:connection-error', { error, attempt: this.reconnectAttempts });
      this.updateConnectionStatus('error');
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('[Spark Socket] Reconnected after', attemptNumber, 'attempts');
      this.emit('spark:reconnected', { attempts: attemptNumber });
      this.updateConnectionStatus('connected');
    });

    this.socket.on('reconnecting', (attemptNumber) => {
      console.log('[Spark Socket] Reconnecting... Attempt', attemptNumber);
      this.emit('spark:reconnecting', { attempt: attemptNumber });
      this.updateConnectionStatus('reconnecting');
    });

    this.socket.on('authenticated', () => {
      console.log('[Spark Socket] Authenticated successfully');
      this.authenticated = true;
      this.emit('spark:authenticated');
    });
  }

  /**
   * Setup message event handlers
   */
  setupMessageHandlers() {
    // New message received
    this.socket.on('message:new', (data) => {
      console.log('[Spark Socket] New message:', data);
      this.emit('spark:message-received', data);
    });

    // Message updated
    this.socket.on('message:updated', (data) => {
      console.log('[Spark Socket] Message updated:', data);
      this.emit('spark:message-updated', data);
    });

    // Message deleted
    this.socket.on('message:deleted', (data) => {
      console.log('[Spark Socket] Message deleted:', data);
      this.emit('spark:message-deleted', data);
    });

    // Message read
    this.socket.on('message:read', (data) => {
      console.log('[Spark Socket] Message read:', data);
      this.emit('spark:message-read', data);
    });

    // Message reaction added
    this.socket.on('message:reaction', (data) => {
      console.log('[Spark Socket] Message reaction:', data);
      this.emit('spark:message-reaction', data);
    });

    // Typing indicator
    this.socket.on('user:typing', (data) => {
      this.emit('spark:user-typing', data);
    });

    this.socket.on('user:stopped-typing', (data) => {
      this.emit('spark:user-stopped-typing', data);
    });
  }

  /**
   * Setup conversation event handlers
   */
  setupConversationHandlers() {
    // Conversation created
    this.socket.on('conversation:created', (data) => {
      console.log('[Spark Socket] Conversation created:', data);
      this.emit('spark:conversation-created', data);
    });

    // Conversation updated
    this.socket.on('conversation:updated', (data) => {
      console.log('[Spark Socket] Conversation updated:', data);
      this.emit('spark:conversation-updated', data);
    });

    // Conversation deleted
    this.socket.on('conversation:deleted', (data) => {
      console.log('[Spark Socket] Conversation deleted:', data);
      this.emit('spark:conversation-deleted', data);
    });

    // Member added to conversation
    this.socket.on('conversation:member-added', (data) => {
      console.log('[Spark Socket] Member added:', data);
      this.emit('spark:member-added', data);
    });

    // Member removed from conversation
    this.socket.on('conversation:member-removed', (data) => {
      console.log('[Spark Socket] Member removed:', data);
      this.emit('spark:member-removed', data);
    });

    // Member role changed
    this.socket.on('conversation:member-role-changed', (data) => {
      console.log('[Spark Socket] Member role changed:', data);
      this.emit('spark:member-role-changed', data);
    });
  }

  /**
   * Setup user event handlers
   */
  setupUserHandlers() {
    // User online status
    this.socket.on('user:online', (data) => {
      this.emit('spark:user-online', data);
    });

    this.socket.on('user:offline', (data) => {
      this.emit('spark:user-offline', data);
    });

    // User presence update
    this.socket.on('user:presence', (data) => {
      this.emit('spark:user-presence', data);
    });
  }

  /**
   * Setup error handlers
   */
  setupErrorHandlers() {
    this.socket.on('error', (error) => {
      console.error('[Spark Socket] Error:', error);
      this.emit('spark:error', error);
    });

    this.socket.on('unauthorized', (error) => {
      console.error('[Spark Socket] Unauthorized:', error);
      this.emit('spark:unauthorized', error);
    });
  }

  /**
   * Send a message
   */
  sendMessage(conversationId, content, options = {}) {
    if (!this.connected) {
      console.warn('[Spark Socket] Not connected. Queueing message...');
      this.messageQueue.push({ conversationId, content, options });
      return;
    }

    this.socket.emit('message:send', {
      conversationId,
      content,
      ...options
    });
  }

  /**
   * Update a message
   */
  updateMessage(messageId, content) {
    this.socket.emit('message:update', {
      messageId,
      content
    });
  }

  /**
   * Delete a message
   */
  deleteMessage(messageId) {
    this.socket.emit('message:delete', {
      messageId
    });
  }

  /**
   * Mark message as read
   */
  markAsRead(conversationId, messageId) {
    this.socket.emit('message:mark-read', {
      conversationId,
      messageId
    });
  }

  /**
   * Add reaction to message
   */
  addReaction(messageId, emoji) {
    this.socket.emit('message:react', {
      messageId,
      emoji
    });
  }

  /**
   * Send typing indicator
   */
  sendTyping(conversationId) {
    this.socket.emit('user:typing', {
      conversationId
    });
  }

  /**
   * Stop typing indicator
   */
  stopTyping(conversationId) {
    this.socket.emit('user:stopped-typing', {
      conversationId
    });
  }

  /**
   * Join a conversation room
   */
  joinConversation(conversationId) {
    this.socket.emit('conversation:join', {
      conversationId
    });
  }

  /**
   * Leave a conversation room
   */
  leaveConversation(conversationId) {
    this.socket.emit('conversation:leave', {
      conversationId
    });
  }

  /**
   * Update user presence
   */
  updatePresence(status) {
    this.socket.emit('user:presence', {
      status
    });
  }

  /**
   * Process queued messages
   */
  processMessageQueue() {
    if (this.messageQueue.length === 0) return;

    console.log('[Spark Socket] Processing', this.messageQueue.length, 'queued messages');

    while (this.messageQueue.length > 0) {
      const { conversationId, content, options } = this.messageQueue.shift();
      this.sendMessage(conversationId, content, options);
    }
  }

  /**
   * Register event handler
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Unregister event handler
   */
  off(event, handler) {
    if (!this.eventHandlers.has(event)) return;

    const handlers = this.eventHandlers.get(event);
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit custom event to registered handlers
   */
  emit(event, data) {
    if (!this.eventHandlers.has(event)) return;

    this.eventHandlers.get(event).forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error('[Spark Socket] Error in event handler:', error);
      }
    });
  }

  /**
   * Update connection status UI
   */
  updateConnectionStatus(status) {
    const statusElement = document.getElementById('connectionStatus');
    const statusText = document.getElementById('connectionText');

    if (!statusElement || !statusText) return;

    statusElement.classList.remove('hidden');

    switch (status) {
      case 'connected':
        statusElement.className = 'connection-status success';
        statusText.innerHTML = '<i class="fas fa-check-circle"></i> Connected';

        // Hide after 2 seconds
        setTimeout(() => {
          statusElement.classList.add('hidden');
        }, 2000);
        break;

      case 'disconnected':
        statusElement.className = 'connection-status error';
        statusText.innerHTML = '<i class="fas fa-exclamation-circle"></i> Disconnected';
        break;

      case 'reconnecting':
        statusElement.className = 'connection-status warning';
        statusText.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Reconnecting...';
        break;

      case 'error':
        statusElement.className = 'connection-status error';
        statusText.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Connection Error';
        break;
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.socket) {
      console.log('[Spark Socket] Disconnecting...');
      this.socket.disconnect();
      this.connected = false;
      this.authenticated = false;
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.socket && this.socket.connected;
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return this.authenticated;
  }
}

// Create global instance
window.sparkSocket = new SparkSocket();
