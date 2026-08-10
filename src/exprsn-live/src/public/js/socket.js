/**
 * Exprsn Live - Socket.IO Integration
 * Handles real-time communication with the server
 */

class LiveSocket {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.reconnecting = false;
    this.handlers = new Map();
    this.currentStream = null;
    this.currentRoom = null;
  }

  /**
   * Initialize Socket.IO connection
   */
  connect() {
    if (this.socket) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      try {
        this.socket = io(LiveConfig.socket.url, LiveConfig.socket.options);

        // Connection established
        this.socket.on('connect', () => {
          console.log('Socket.IO connected:', this.socket.id);
          this.connected = true;
          this.reconnecting = false;
          this.emit('connection-status', { connected: true });
          resolve();
        });

        // Connection error
        this.socket.on('connect_error', (error) => {
          console.error('Socket.IO connection error:', error);
          this.connected = false;
          this.emit('connection-status', { connected: false, error });
          reject(error);
        });

        // Disconnected
        this.socket.on('disconnect', (reason) => {
          console.log('Socket.IO disconnected:', reason);
          this.connected = false;
          this.emit('connection-status', { connected: false, reason });
        });

        // Reconnecting
        this.socket.on('reconnect_attempt', () => {
          console.log('Socket.IO reconnecting...');
          this.reconnecting = true;
          this.emit('connection-status', { reconnecting: true });
        });

        // Reconnected
        this.socket.on('reconnect', () => {
          console.log('Socket.IO reconnected');
          this.reconnecting = false;
          this.connected = true;
          this.emit('connection-status', { connected: true, reconnected: true });

          // Rejoin rooms if needed
          if (this.currentStream) {
            this.joinStream(this.currentStream);
          }
          if (this.currentRoom) {
            this.joinRoom(this.currentRoom);
          }
        });

        this.setupEventListeners();
      } catch (error) {
        console.error('Failed to initialize Socket.IO:', error);
        reject(error);
      }
    });
  }

  /**
   * Setup event listeners for all socket events
   */
  setupEventListeners() {
    // Stream events
    this.socket.on(LiveConfig.socket.events.streamStarted, (data) => {
      console.log('Stream started:', data);
      this.emit('stream-started', data);
    });

    this.socket.on(LiveConfig.socket.events.streamEnded, (data) => {
      console.log('Stream ended:', data);
      this.emit('stream-ended', data);
    });

    this.socket.on(LiveConfig.socket.events.streamDeleted, (data) => {
      console.log('Stream deleted:', data);
      this.emit('stream-deleted', data);
    });

    this.socket.on(LiveConfig.socket.events.viewerJoined, (data) => {
      console.log('Viewer joined:', data);
      this.emit('viewer-joined', data);
    });

    this.socket.on(LiveConfig.socket.events.viewerLeft, (data) => {
      console.log('Viewer left:', data);
      this.emit('viewer-left', data);
    });

    this.socket.on(LiveConfig.socket.events.viewerCountUpdated, (data) => {
      console.log('Viewer count updated:', data);
      this.emit('viewer-count-updated', data);
    });

    // Room events
    this.socket.on(LiveConfig.socket.events.participantJoined, (data) => {
      console.log('Participant joined:', data);
      this.emit('participant-joined', data);
    });

    this.socket.on(LiveConfig.socket.events.participantLeft, (data) => {
      console.log('Participant left:', data);
      this.emit('participant-left', data);
    });

    this.socket.on(LiveConfig.socket.events.participantStateChanged, (data) => {
      console.log('Participant state changed:', data);
      this.emit('participant-state-changed', data);
    });

    this.socket.on(LiveConfig.socket.events.roomClosed, (data) => {
      console.log('Room closed:', data);
      this.emit('room-closed', data);
    });

    // WebRTC signaling events
    this.socket.on(LiveConfig.socket.events.signal, (data) => {
      this.emit('webrtc-signal', data);
    });

    this.socket.on(LiveConfig.socket.events.offer, (data) => {
      this.emit('webrtc-offer', data);
    });

    this.socket.on(LiveConfig.socket.events.answer, (data) => {
      this.emit('webrtc-answer', data);
    });

    this.socket.on(LiveConfig.socket.events.iceCandidate, (data) => {
      this.emit('webrtc-ice-candidate', data);
    });
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.currentStream = null;
      this.currentRoom = null;
    }
  }

  /**
   * Join a stream room
   */
  joinStream(streamId) {
    if (!this.socket || !this.connected) {
      console.warn('Cannot join stream: Socket not connected');
      return;
    }

    this.currentStream = streamId;
    this.socket.emit('join-stream', { streamId });
    console.log('Joined stream:', streamId);
  }

  /**
   * Leave a stream room
   */
  leaveStream(streamId) {
    if (!this.socket || !this.connected) {
      return;
    }

    this.socket.emit('leave-stream', { streamId });
    if (this.currentStream === streamId) {
      this.currentStream = null;
    }
    console.log('Left stream:', streamId);
  }

  /**
   * Join a video chat room
   */
  joinRoom(roomId) {
    if (!this.socket || !this.connected) {
      console.warn('Cannot join room: Socket not connected');
      return;
    }

    this.currentRoom = roomId;
    this.socket.emit('join-room', { roomId });
    console.log('Joined room:', roomId);
  }

  /**
   * Leave a video chat room
   */
  leaveRoom(roomId) {
    if (!this.socket || !this.connected) {
      return;
    }

    this.socket.emit('leave-room', { roomId });
    if (this.currentRoom === roomId) {
      this.currentRoom = null;
    }
    console.log('Left room:', roomId);
  }

  /**
   * Send WebRTC signal
   */
  sendSignal(to, signal) {
    if (!this.socket || !this.connected) {
      console.warn('Cannot send signal: Socket not connected');
      return;
    }

    this.socket.emit(LiveConfig.socket.events.signal, {
      to,
      signal
    });
  }

  /**
   * Send WebRTC offer
   */
  sendOffer(to, offer) {
    if (!this.socket || !this.connected) {
      console.warn('Cannot send offer: Socket not connected');
      return;
    }

    this.socket.emit(LiveConfig.socket.events.offer, {
      to,
      offer
    });
  }

  /**
   * Send WebRTC answer
   */
  sendAnswer(to, answer) {
    if (!this.socket || !this.connected) {
      console.warn('Cannot send answer: Socket not connected');
      return;
    }

    this.socket.emit(LiveConfig.socket.events.answer, {
      to,
      answer
    });
  }

  /**
   * Send ICE candidate
   */
  sendIceCandidate(to, candidate) {
    if (!this.socket || !this.connected) {
      console.warn('Cannot send ICE candidate: Socket not connected');
      return;
    }

    this.socket.emit(LiveConfig.socket.events.iceCandidate, {
      to,
      candidate
    });
  }

  /**
   * Update participant state (muted, video on/off, etc.)
   */
  updateParticipantState(roomId, state) {
    if (!this.socket || !this.connected) {
      return;
    }

    this.socket.emit('update-participant-state', {
      roomId,
      state
    });
  }

  /**
   * Register event handler
   */
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
  }

  /**
   * Unregister event handler
   */
  off(event, handler) {
    if (!this.handlers.has(event)) {
      return;
    }

    const handlers = this.handlers.get(event);
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Emit event to handlers
   */
  emit(event, data) {
    if (!this.handlers.has(event)) {
      return;
    }

    const handlers = this.handlers.get(event);
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Get socket ID
   */
  get id() {
    return this.socket ? this.socket.id : null;
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Check if reconnecting
   */
  isReconnecting() {
    return this.reconnecting;
  }
}

// Create global socket instance
const liveSocket = new LiveSocket();

// Auto-connect on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    liveSocket.connect().catch(err => {
      console.error('Failed to connect to Socket.IO:', err);
    });
  });
} else {
  liveSocket.connect().catch(err => {
    console.error('Failed to connect to Socket.IO:', err);
  });
}

// Make available globally
window.liveSocket = liveSocket;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LiveSocket;
}
