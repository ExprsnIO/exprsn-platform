/**
 * Exprsn Spark - UI Controller
 * DOM manipulation and UI state management
 */

class SparkUI {
  constructor() {
    this.activeConversation = null;
    this.conversations = new Map();
    this.messages = new Map();
    this.users = new Map();
    this.typingUsers = new Map();
    this.currentFilter = 'all';
    this.searchQuery = '';
    this.theme = 'light';
    this.replyingTo = null;

    // Initialize theme
    this.initTheme();
  }

  /**
   * Initialize the UI
   */
  init() {
    console.log('[Spark UI] Initializing UI...');

    // Setup event listeners
    this.setupEventListeners();

    // Load saved state
    this.loadState();

    // Initialize emoji picker
    this.initEmojiPicker();

    console.log('[Spark UI] UI initialized');
  }

  /**
   * Setup all event listeners
   */
  setupEventListeners() {
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    // New conversation
    const newConversationBtn = document.getElementById('newConversation');
    const startNewChatBtn = document.getElementById('startNewChat');
    if (newConversationBtn) {
      newConversationBtn.addEventListener('click', () => this.showNewConversationModal());
    }
    if (startNewChatBtn) {
      startNewChatBtn.addEventListener('click', () => this.showNewConversationModal());
    }

    // Close new conversation modal
    const closeNewConversation = document.getElementById('closeNewConversation');
    const cancelNewConversation = document.getElementById('cancelNewConversation');
    if (closeNewConversation) {
      closeNewConversation.addEventListener('click', () => this.hideNewConversationModal());
    }
    if (cancelNewConversation) {
      cancelNewConversation.addEventListener('click', () => this.hideNewConversationModal());
    }

    // Create conversation
    const createConversation = document.getElementById('createConversation');
    if (createConversation) {
      createConversation.addEventListener('click', () => this.createConversation());
    }

    // Conversation type selector
    const typeButtons = document.querySelectorAll('.type-btn');
    typeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        typeButtons.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.updateConversationType(e.currentTarget.dataset.type);
      });
    });

    // Search conversations
    const searchInput = document.getElementById('searchConversations');
    const clearSearch = document.getElementById('clearSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleSearchInput(e));
    }
    if (clearSearch) {
      clearSearch.addEventListener('click', () => this.clearSearch());
    }

    // Filter conversations
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        filterButtons.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.filterConversations(e.currentTarget.dataset.filter);
      });
    });

    // Message input
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.addEventListener('input', () => this.handleMessageInput());
      messageInput.addEventListener('keydown', (e) => this.handleMessageKeydown(e));
      messageInput.addEventListener('paste', (e) => this.handlePaste(e));
    }

    // Send message
    const sendButton = document.getElementById('sendMessage');
    if (sendButton) {
      sendButton.addEventListener('click', () => this.sendMessage());
    }

    // Cancel reply
    const cancelReply = document.getElementById('cancelReply');
    if (cancelReply) {
      cancelReply.addEventListener('click', () => this.cancelReply());
    }

    // Attach file
    const attachFile = document.getElementById('attachFile');
    if (attachFile) {
      attachFile.addEventListener('click', () => this.attachFile());
    }

    // Insert emoji
    const insertEmoji = document.getElementById('insertEmoji');
    if (insertEmoji) {
      insertEmoji.addEventListener('click', () => this.toggleEmojiPicker());
    }

    // Info panel
    const conversationInfo = document.getElementById('conversationInfo');
    const closeInfo = document.getElementById('closeInfo');
    if (conversationInfo) {
      conversationInfo.addEventListener('click', () => this.toggleInfoPanel());
    }
    if (closeInfo) {
      closeInfo.addEventListener('click', () => this.hideInfoPanel());
    }

    // Mobile back button
    const mobileBack = document.getElementById('mobileBack');
    if (mobileBack) {
      mobileBack.addEventListener('click', () => this.closeMobileChat());
    }

    // Scroll to bottom
    const scrollToBottom = document.getElementById('scrollToBottom');
    if (scrollToBottom) {
      scrollToBottom.addEventListener('click', () => this.scrollToBottom());
    }

    // Messages container scroll
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
      messagesContainer.addEventListener('scroll', () => this.handleScroll());
    }

    // Context menu (right-click on messages)
    document.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
    document.addEventListener('click', () => this.hideContextMenu());

    // Click outside modals
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-overlay')) {
        this.hideNewConversationModal();
      }
    });
  }

  /**
   * Initialize theme
   */
  initTheme() {
    const savedTheme = localStorage.getItem(SparkConfig.storage.theme) || SparkConfig.theme.default;
    this.setTheme(savedTheme);
  }

  /**
   * Toggle theme
   */
  toggleTheme() {
    const newTheme = this.theme === 'light' ? 'dark' : 'light';
    this.setTheme(newTheme);
  }

  /**
   * Set theme
   */
  setTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(SparkConfig.storage.theme, theme);

    const themeIcon = document.querySelector('#themeToggle i');
    if (themeIcon) {
      themeIcon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
  }

  /**
   * Show new conversation modal
   */
  showNewConversationModal() {
    const modal = document.getElementById('newConversationModal');
    if (modal) {
      modal.classList.remove('hidden');
      // Load users for selection
      this.loadUsersForConversation();
    }
  }

  /**
   * Hide new conversation modal
   */
  hideNewConversationModal() {
    const modal = document.getElementById('newConversationModal');
    if (modal) {
      modal.classList.add('hidden');
      // Reset form
      document.getElementById('searchUsers').value = '';
      document.getElementById('usersList').innerHTML = '';
      document.getElementById('selectedUsers').innerHTML = '';
      document.getElementById('groupSettings').classList.add('hidden');
    }
  }

  /**
   * Load users for conversation creation
   */
  async loadUsersForConversation() {
    // This will be implemented by the main app
    this.emit('load-users-for-conversation');
  }

  /**
   * Update conversation type (direct/group)
   */
  updateConversationType(type) {
    const groupSettings = document.getElementById('groupSettings');
    if (groupSettings) {
      if (type === 'group') {
        groupSettings.classList.remove('hidden');
      } else {
        groupSettings.classList.add('hidden');
      }
    }
  }

  /**
   * Create conversation
   */
  createConversation() {
    // This will be implemented by the main app
    this.emit('create-conversation');
  }

  /**
   * Handle search input
   */
  handleSearchInput(e) {
    const query = e.target.value.trim();
    this.searchQuery = query;

    const clearButton = document.getElementById('clearSearch');
    if (clearButton) {
      if (query) {
        clearButton.classList.remove('hidden');
      } else {
        clearButton.classList.add('hidden');
      }
    }

    // Debounce search
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
      this.performSearch(query);
    }, SparkConfig.search.debounceDelay);
  }

  /**
   * Perform search
   */
  performSearch(query) {
    if (query.length < SparkConfig.search.minQueryLength) {
      this.filterConversations(this.currentFilter);
      return;
    }

    this.emit('search-conversations', { query });
  }

  /**
   * Clear search
   */
  clearSearch() {
    const searchInput = document.getElementById('searchConversations');
    if (searchInput) {
      searchInput.value = '';
    }
    this.searchQuery = '';
    const clearButton = document.getElementById('clearSearch');
    if (clearButton) {
      clearButton.classList.add('hidden');
    }
    this.filterConversations(this.currentFilter);
  }

  /**
   * Filter conversations
   */
  filterConversations(filter) {
    this.currentFilter = filter;
    this.emit('filter-conversations', { filter });
  }

  /**
   * Render conversations list
   */
  renderConversations(conversations) {
    const listElement = document.getElementById('conversationsList');
    if (!listElement) return;

    // Remove loading state
    listElement.innerHTML = '';

    if (conversations.length === 0) {
      listElement.innerHTML = `
        <div class="conversations-empty">
          <i class="fas fa-inbox"></i>
          <p>No conversations found</p>
        </div>
      `;
      return;
    }

    conversations.forEach(conv => {
      const convElement = this.createConversationElement(conv);
      listElement.appendChild(convElement);
    });
  }

  /**
   * Create conversation element
   */
  createConversationElement(conversation) {
    const div = document.createElement('div');
    div.className = 'conversation-item';
    if (this.activeConversation && this.activeConversation.id === conversation.id) {
      div.classList.add('active');
    }
    if (conversation.unreadCount > 0) {
      div.classList.add('unread');
    }

    div.dataset.conversationId = conversation.id;

    const avatarClass = conversation.type === 'group' ? 'fas fa-users' : 'fas fa-user';
    const timestamp = this.formatTimestamp(conversation.lastMessageAt || conversation.createdAt);

    div.innerHTML = `
      <div class="avatar">
        <i class="${avatarClass}"></i>
      </div>
      <div class="conversation-content">
        <div class="conversation-header">
          <h4 class="conversation-name">${this.escapeHtml(conversation.name)}</h4>
          <span class="conversation-time">${timestamp}</span>
        </div>
        <div class="conversation-preview">
          <p class="last-message">${this.escapeHtml(conversation.lastMessage || 'No messages yet')}</p>
          ${conversation.unreadCount > 0 ? `<span class="unread-count">${conversation.unreadCount}</span>` : ''}
        </div>
      </div>
    `;

    div.addEventListener('click', () => this.selectConversation(conversation.id));

    this.conversations.set(conversation.id, conversation);

    return div;
  }

  /**
   * Select conversation
   */
  selectConversation(conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) return;

    this.activeConversation = conversation;

    // Update active state
    document.querySelectorAll('.conversation-item').forEach(item => {
      item.classList.remove('active');
    });
    const activeItem = document.querySelector(`[data-conversation-id="${conversationId}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }

    // Hide welcome screen, show chat
    const welcomeScreen = document.getElementById('welcomeScreen');
    const chatContainer = document.getElementById('chatContainer');
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (chatContainer) chatContainer.classList.remove('hidden');

    // Update chat header
    this.updateChatHeader(conversation);

    // Load messages
    this.emit('load-messages', { conversationId });

    // Mark as read
    this.markConversationAsRead(conversationId);

    // Join conversation room
    if (window.sparkSocket && window.sparkSocket.isConnected()) {
      window.sparkSocket.joinConversation(conversationId);
    }

    // Mobile: show chat area
    if (window.innerWidth <= SparkConfig.ui.mobileBreakpoint) {
      document.querySelector('.sidebar').style.transform = 'translateX(-100%)';
    }
  }

  /**
   * Update chat header
   */
  updateChatHeader(conversation) {
    const chatTitle = document.getElementById('chatTitle');
    const chatAvatar = document.getElementById('chatAvatar');
    const chatStatus = document.getElementById('chatStatus');

    if (chatTitle) {
      chatTitle.textContent = conversation.name;
    }

    if (chatAvatar) {
      const iconClass = conversation.type === 'group' ? 'fas fa-users' : 'fas fa-user';
      chatAvatar.innerHTML = `<i class="${iconClass}"></i>`;
    }

    if (chatStatus) {
      const status = conversation.type === 'group'
        ? `${conversation.memberCount || 0} members`
        : 'Online'; // This should be dynamic
      chatStatus.textContent = status;
    }
  }

  /**
   * Render messages
   */
  renderMessages(messages) {
    const listElement = document.getElementById('messagesList');
    if (!listElement) return;

    listElement.innerHTML = '';

    if (messages.length === 0) {
      listElement.innerHTML = `
        <div class="messages-empty">
          <i class="fas fa-comments"></i>
          <p>No messages yet. Start the conversation!</p>
        </div>
      `;
      return;
    }

    messages.forEach((message, index) => {
      const messageElement = this.createMessageElement(message, index, messages);
      listElement.appendChild(messageElement);
    });

    this.scrollToBottom(true);
  }

  /**
   * Create message element
   */
  createMessageElement(message, index, allMessages) {
    const div = document.createElement('div');
    div.className = 'message';
    div.dataset.messageId = message.id;

    // Determine if message is from current user
    const isOwn = message.senderId === this.getCurrentUserId();
    if (isOwn) {
      div.classList.add('own');
    }

    // Check if we should show avatar (first message in group or different sender)
    const showAvatar = index === 0 || allMessages[index - 1].senderId !== message.senderId;

    div.innerHTML = `
      ${showAvatar && !isOwn ? `
        <div class="message-avatar">
          <div class="avatar small">
            <i class="fas fa-user"></i>
          </div>
        </div>
      ` : ''}
      <div class="message-content">
        ${showAvatar && !isOwn ? `<div class="message-sender">${this.escapeHtml(message.senderName)}</div>` : ''}
        <div class="message-bubble">
          <div class="message-text">${this.formatMessageText(message.content)}</div>
          ${message.attachments && message.attachments.length > 0 ? this.renderAttachments(message.attachments) : ''}
          <div class="message-meta">
            <span class="message-time">${this.formatTimestamp(message.createdAt)}</span>
            ${isOwn ? this.renderMessageStatus(message.status) : ''}
          </div>
        </div>
        ${message.reactions && message.reactions.length > 0 ? this.renderReactions(message.reactions) : ''}
      </div>
    `;

    // Add context menu support
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showContextMenu(e, message);
    });

    this.messages.set(message.id, message);

    return div;
  }

  /**
   * Render message status
   */
  renderMessageStatus(status) {
    switch (status) {
      case 'sent':
        return '<i class="fas fa-check message-status"></i>';
      case 'delivered':
        return '<i class="fas fa-check-double message-status"></i>';
      case 'read':
        return '<i class="fas fa-check-double message-status read"></i>';
      default:
        return '<i class="fas fa-clock message-status"></i>';
    }
  }

  /**
   * Render attachments
   */
  renderAttachments(attachments) {
    return `
      <div class="message-attachments">
        ${attachments.map(att => `
          <div class="attachment">
            <i class="fas fa-file"></i>
            <span>${this.escapeHtml(att.filename)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render reactions
   */
  renderReactions(reactions) {
    const grouped = reactions.reduce((acc, r) => {
      if (!acc[r.emoji]) acc[r.emoji] = [];
      acc[r.emoji].push(r.userId);
      return acc;
    }, {});

    return `
      <div class="message-reactions">
        ${Object.entries(grouped).map(([emoji, users]) => `
          <button class="reaction" title="${users.length} reaction${users.length > 1 ? 's' : ''}">
            <span class="emoji">${emoji}</span>
            <span class="count">${users.length}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  /**
   * Handle message input
   */
  handleMessageInput() {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;

    const content = messageInput.textContent.trim();

    // Update send button state
    const sendButton = document.getElementById('sendMessage');
    if (sendButton) {
      sendButton.disabled = !content;
    }

    // Send typing indicator
    if (content && this.activeConversation) {
      this.sendTypingIndicator();
    }
  }

  /**
   * Handle message keydown
   */
  handleMessageKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  /**
   * Handle paste
   */
  handlePaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }

  /**
   * Send message
   */
  sendMessage() {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;

    const content = messageInput.textContent.trim();
    if (!content || !this.activeConversation) return;

    const message = {
      conversationId: this.activeConversation.id,
      content: content,
      replyToId: this.replyingTo?.id
    };

    this.emit('send-message', message);

    // Clear input
    messageInput.textContent = '';
    this.cancelReply();
    this.handleMessageInput();

    // Stop typing indicator
    this.stopTypingIndicator();
  }

  /**
   * Cancel reply
   */
  cancelReply() {
    this.replyingTo = null;
    const replyPreview = document.getElementById('replyPreview');
    if (replyPreview) {
      replyPreview.classList.add('hidden');
    }
  }

  /**
   * Attach file
   */
  attachFile() {
    // Create file input
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = SparkConfig.message.allowedAttachmentTypes.join(',');

    input.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        this.emit('attach-files', { files });
      }
    });

    input.click();
  }

  /**
   * Initialize emoji picker
   */
  initEmojiPicker() {
    const emojiBody = document.getElementById('emojiPickerBody');
    if (!emojiBody) return;

    // Load default category
    this.loadEmojiCategory('smileys');

    // Category buttons
    const categoryButtons = document.querySelectorAll('.emoji-category');
    categoryButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        categoryButtons.forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.loadEmojiCategory(e.currentTarget.dataset.category);
      });
    });
  }

  /**
   * Load emoji category
   */
  loadEmojiCategory(category) {
    const emojiBody = document.getElementById('emojiPickerBody');
    if (!emojiBody) return;

    const emojis = SparkConfig.emoji.categories[category] || [];
    emojiBody.innerHTML = emojis.map(emoji => `
      <button class="emoji-item" data-emoji="${emoji}">${emoji}</button>
    `).join('');

    // Add click handlers
    emojiBody.querySelectorAll('.emoji-item').forEach(btn => {
      btn.addEventListener('click', () => this.insertEmoji(btn.dataset.emoji));
    });
  }

  /**
   * Toggle emoji picker
   */
  toggleEmojiPicker() {
    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiPicker) {
      emojiPicker.classList.toggle('hidden');
    }
  }

  /**
   * Insert emoji
   */
  insertEmoji(emoji) {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
      messageInput.textContent += emoji;
      messageInput.focus();
      this.handleMessageInput();
    }
    this.toggleEmojiPicker();
  }

  /**
   * Send typing indicator
   */
  sendTypingIndicator() {
    if (!this.activeConversation) return;

    clearTimeout(this.typingTimeout);

    if (window.sparkSocket && window.sparkSocket.isConnected()) {
      window.sparkSocket.sendTyping(this.activeConversation.id);
    }

    this.typingTimeout = setTimeout(() => {
      this.stopTypingIndicator();
    }, SparkConfig.message.typingTimeout);
  }

  /**
   * Stop typing indicator
   */
  stopTypingIndicator() {
    if (!this.activeConversation) return;

    if (window.sparkSocket && window.sparkSocket.isConnected()) {
      window.sparkSocket.stopTyping(this.activeConversation.id);
    }
  }

  /**
   * Show user typing
   */
  showUserTyping(userId, conversationId) {
    if (!this.activeConversation || this.activeConversation.id !== conversationId) return;

    this.typingUsers.set(userId, Date.now());

    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
      typingIndicator.classList.remove('hidden');
    }

    // Auto-hide after timeout
    setTimeout(() => {
      this.hideUserTyping(userId);
    }, SparkConfig.message.typingTimeout);
  }

  /**
   * Hide user typing
   */
  hideUserTyping(userId) {
    this.typingUsers.delete(userId);

    if (this.typingUsers.size === 0) {
      const typingIndicator = document.getElementById('typingIndicator');
      if (typingIndicator) {
        typingIndicator.classList.add('hidden');
      }
    }
  }

  /**
   * Toggle info panel
   */
  toggleInfoPanel() {
    const infoPanel = document.getElementById('infoPanel');
    if (infoPanel) {
      infoPanel.classList.toggle('hidden');
    }
  }

  /**
   * Hide info panel
   */
  hideInfoPanel() {
    const infoPanel = document.getElementById('infoPanel');
    if (infoPanel) {
      infoPanel.classList.add('hidden');
    }
  }

  /**
   * Close mobile chat
   */
  closeMobileChat() {
    if (window.innerWidth <= SparkConfig.ui.mobileBreakpoint) {
      document.querySelector('.sidebar').style.transform = 'translateX(0)';
    }
  }

  /**
   * Scroll to bottom
   */
  scrollToBottom(instant = false) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    if (instant) {
      container.scrollTop = container.scrollHeight;
    } else {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: SparkConfig.ui.scrollSmoothness
      });
    }
  }

  /**
   * Handle scroll
   */
  handleScroll() {
    const container = document.getElementById('messagesContainer');
    const scrollButton = document.getElementById('scrollToBottom');

    if (!container || !scrollButton) return;

    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < SparkConfig.ui.showScrollButtonThreshold;

    if (isNearBottom) {
      scrollButton.classList.add('hidden');
    } else {
      scrollButton.classList.remove('hidden');
    }

    // Load more messages when scrolled to top
    if (container.scrollTop === 0) {
      this.loadMoreMessages();
    }
  }

  /**
   * Load more messages
   */
  loadMoreMessages() {
    if (!this.activeConversation) return;
    this.emit('load-more-messages', { conversationId: this.activeConversation.id });
  }

  /**
   * Show context menu
   */
  showContextMenu(event, message) {
    event.preventDefault();

    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;

    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.classList.remove('hidden');

    // Store current message
    contextMenu.dataset.messageId = message.id;

    // Update menu items based on message owner
    const isOwn = message.senderId === this.getCurrentUserId();
    const editBtn = contextMenu.querySelector('[data-action="edit"]');
    const deleteBtn = contextMenu.querySelector('[data-action="delete"]');

    if (editBtn) editBtn.style.display = isOwn ? 'flex' : 'none';
    if (deleteBtn) deleteBtn.style.display = isOwn ? 'flex' : 'none';
  }

  /**
   * Hide context menu
   */
  hideContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
      contextMenu.classList.add('hidden');
    }
  }

  /**
   * Handle context menu action
   */
  handleContextMenuAction(action, messageId) {
    this.emit('context-menu-action', { action, messageId });
    this.hideContextMenu();
  }

  /**
   * Mark conversation as read
   */
  markConversationAsRead(conversationId) {
    this.emit('mark-conversation-read', { conversationId });

    // Update UI
    const convElement = document.querySelector(`[data-conversation-id="${conversationId}"]`);
    if (convElement) {
      convElement.classList.remove('unread');
      const unreadCount = convElement.querySelector('.unread-count');
      if (unreadCount) {
        unreadCount.remove();
      }
    }

    // Update badge
    this.updateUnreadBadge();
  }

  /**
   * Update unread badge
   */
  updateUnreadBadge() {
    let totalUnread = 0;
    this.conversations.forEach(conv => {
      totalUnread += conv.unreadCount || 0;
    });

    const badge = document.getElementById('unreadBadge');
    if (badge) {
      badge.textContent = totalUnread;
      badge.style.display = totalUnread > 0 ? 'inline' : 'none';
    }
  }

  /**
   * Show toast notification
   */
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'check-circle' :
                 type === 'error' ? 'exclamation-circle' :
                 type === 'warning' ? 'exclamation-triangle' : 'info-circle';

    toast.innerHTML = `
      <i class="fas fa-${icon}"></i>
      <span>${this.escapeHtml(message)}</span>
      <button class="toast-close"><i class="fas fa-times"></i></button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      toast.remove();
    });

    container.appendChild(toast);

    // Auto-remove after duration
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, SparkConfig.ui.toastDuration);
  }

  /**
   * Format timestamp
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Less than 1 minute
    if (diff < 60000) {
      return 'Just now';
    }

    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    }

    // Today
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    // This week
    if (diff < 604800000) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }

    // Older
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  /**
   * Format message text (preserve newlines, linkify, etc.)
   */
  formatMessageText(text) {
    // Escape HTML
    let formatted = this.escapeHtml(text);

    // Preserve newlines
    formatted = formatted.replace(/\n/g, '<br>');

    // Linkify URLs
    formatted = formatted.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    return formatted;
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
   * Get current user ID
   */
  getCurrentUserId() {
    // This will be set by the main app
    return this.currentUserId || null;
  }

  /**
   * Load saved state
   */
  loadState() {
    const savedConversationId = localStorage.getItem(SparkConfig.storage.activeConversation);
    if (savedConversationId) {
      // Will be loaded after conversations are fetched
      this.savedConversationId = savedConversationId;
    }
  }

  /**
   * Save state
   */
  saveState() {
    if (this.activeConversation) {
      localStorage.setItem(SparkConfig.storage.activeConversation, this.activeConversation.id);
    }
  }

  /**
   * Event emitter
   */
  on(event, handler) {
    if (!this.eventHandlers) {
      this.eventHandlers = new Map();
    }
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * Emit event
   */
  emit(event, data) {
    if (!this.eventHandlers || !this.eventHandlers.has(event)) return;

    this.eventHandlers.get(event).forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error('[Spark UI] Error in event handler:', error);
      }
    });
  }
}

// Create global instance
window.sparkUI = new SparkUI();
