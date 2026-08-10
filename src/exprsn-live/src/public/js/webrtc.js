/**
 * Exprsn Live - WebRTC Client Library
 * Handles peer-to-peer video/audio connections
 */

class WebRTCClient {
  constructor() {
    this.localStream = null;
    this.screenStream = null;
    this.peers = new Map();
    this.roomId = null;
    this.userId = null;
    this.config = LiveConfig.webrtc;
    this.handlers = new Map();
    this.mediaDevices = {
      audio: null,
      video: null,
      audioOutput: null
    };
  }

  /**
   * Check WebRTC support
   */
  static isSupported() {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.RTCPeerConnection
    );
  }

  /**
   * Get available media devices
   */
  async getDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();

      this.mediaDevices.audio = devices.filter(d => d.kind === 'audioinput');
      this.mediaDevices.video = devices.filter(d => d.kind === 'videoinput');
      this.mediaDevices.audioOutput = devices.filter(d => d.kind === 'audiooutput');

      return this.mediaDevices;
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      throw error;
    }
  }

  /**
   * Get user media (camera and microphone)
   */
  async getUserMedia(constraints = null) {
    if (!WebRTCClient.isSupported()) {
      throw new Error(LiveConfig.errors.webrtcNotSupported);
    }

    try {
      const mediaConstraints = constraints || this.config.mediaConstraints;
      this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

      console.log('Got user media:', this.localStream);
      this.emit('local-stream', this.localStream);

      return this.localStream;
    } catch (error) {
      console.error('Failed to get user media:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        throw new Error(LiveConfig.errors.mediaPermissionDenied);
      }
      throw error;
    }
  }

  /**
   * Get screen sharing stream
   */
  async getScreenShare() {
    if (!navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Screen sharing not supported');
    }

    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia(
        this.config.screenConstraints
      );

      console.log('Got screen share:', this.screenStream);
      this.emit('screen-share', this.screenStream);

      // Handle screen share stop
      this.screenStream.getVideoTracks()[0].onended = () => {
        this.stopScreenShare();
      };

      return this.screenStream;
    } catch (error) {
      console.error('Failed to get screen share:', error);
      throw error;
    }
  }

  /**
   * Stop screen sharing
   */
  stopScreenShare() {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(track => track.stop());
      this.screenStream = null;
      this.emit('screen-share-stopped');
      console.log('Screen share stopped');
    }
  }

  /**
   * Toggle audio track
   */
  toggleAudio(enabled = null) {
    if (!this.localStream) {
      return false;
    }

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) {
      return false;
    }

    if (enabled === null) {
      audioTrack.enabled = !audioTrack.enabled;
    } else {
      audioTrack.enabled = enabled;
    }

    this.emit('audio-toggled', audioTrack.enabled);
    return audioTrack.enabled;
  }

  /**
   * Toggle video track
   */
  toggleVideo(enabled = null) {
    if (!this.localStream) {
      return false;
    }

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) {
      return false;
    }

    if (enabled === null) {
      videoTrack.enabled = !videoTrack.enabled;
    } else {
      videoTrack.enabled = enabled;
    }

    this.emit('video-toggled', videoTrack.enabled);
    return videoTrack.enabled;
  }

  /**
   * Stop local stream
   */
  stopLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
      this.emit('local-stream-stopped');
      console.log('Local stream stopped');
    }
  }

  /**
   * Create peer connection
   */
  createPeerConnection(peerId) {
    const pc = new RTCPeerConnection({
      iceServers: this.config.iceServers
    });

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('ICE candidate:', event.candidate);
        liveSocket.sendIceCandidate(peerId, event.candidate);
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      this.emit('peer-connection-state', {
        peerId,
        state: pc.connectionState
      });

      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.handlePeerDisconnection(peerId);
      }
    };

    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      this.emit('ice-connection-state', {
        peerId,
        state: pc.iceConnectionState
      });
    };

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('Got remote track:', event.track);
      this.emit('remote-stream', {
        peerId,
        stream: event.streams[0],
        track: event.track
      });
    };

    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    this.peers.set(peerId, { pc, peerId });
    return pc;
  }

  /**
   * Create and send offer
   */
  async createOffer(peerId) {
    try {
      const pc = this.peers.get(peerId)?.pc || this.createPeerConnection(peerId);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      console.log('Created offer for peer:', peerId);
      liveSocket.sendOffer(peerId, offer);

      return offer;
    } catch (error) {
      console.error('Failed to create offer:', error);
      throw error;
    }
  }

  /**
   * Handle incoming offer
   */
  async handleOffer(peerId, offer) {
    try {
      const pc = this.peers.get(peerId)?.pc || this.createPeerConnection(peerId);

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      console.log('Created answer for peer:', peerId);
      liveSocket.sendAnswer(peerId, answer);

      return answer;
    } catch (error) {
      console.error('Failed to handle offer:', error);
      throw error;
    }
  }

  /**
   * Handle incoming answer
   */
  async handleAnswer(peerId, answer) {
    try {
      const peer = this.peers.get(peerId);
      if (!peer) {
        console.warn('No peer connection found for:', peerId);
        return;
      }

      await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log('Set remote description (answer) for peer:', peerId);
    } catch (error) {
      console.error('Failed to handle answer:', error);
      throw error;
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  async handleIceCandidate(peerId, candidate) {
    try {
      const peer = this.peers.get(peerId);
      if (!peer) {
        console.warn('No peer connection found for ICE candidate:', peerId);
        return;
      }

      await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('Added ICE candidate for peer:', peerId);
    } catch (error) {
      console.error('Failed to handle ICE candidate:', error);
      throw error;
    }
  }

  /**
   * Handle peer disconnection
   */
  handlePeerDisconnection(peerId) {
    console.log('Peer disconnected:', peerId);
    this.closePeerConnection(peerId);
    this.emit('peer-disconnected', { peerId });
  }

  /**
   * Close peer connection
   */
  closePeerConnection(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.pc.close();
      this.peers.delete(peerId);
      console.log('Closed peer connection:', peerId);
    }
  }

  /**
   * Close all peer connections
   */
  closeAllPeerConnections() {
    this.peers.forEach((peer, peerId) => {
      this.closePeerConnection(peerId);
    });
    this.peers.clear();
  }

  /**
   * Get peer connection
   */
  getPeerConnection(peerId) {
    return this.peers.get(peerId)?.pc;
  }

  /**
   * Get all peer connections
   */
  getAllPeerConnections() {
    return Array.from(this.peers.values());
  }

  /**
   * Join room and setup WebRTC
   */
  async joinRoom(roomId, userId) {
    this.roomId = roomId;
    this.userId = userId;

    // Setup signaling handlers
    this.setupSignalingHandlers();

    console.log('Joined room for WebRTC:', roomId);
  }

  /**
   * Leave room and cleanup
   */
  leaveRoom() {
    this.stopLocalStream();
    this.stopScreenShare();
    this.closeAllPeerConnections();

    this.roomId = null;
    this.userId = null;

    console.log('Left room, cleaned up WebRTC');
  }

  /**
   * Setup signaling handlers
   */
  setupSignalingHandlers() {
    // Handle incoming offers
    liveSocket.on('webrtc-offer', async ({ from, offer }) => {
      console.log('Received offer from:', from);
      await this.handleOffer(from, offer);
    });

    // Handle incoming answers
    liveSocket.on('webrtc-answer', async ({ from, answer }) => {
      console.log('Received answer from:', from);
      await this.handleAnswer(from, answer);
    });

    // Handle incoming ICE candidates
    liveSocket.on('webrtc-ice-candidate', async ({ from, candidate }) => {
      console.log('Received ICE candidate from:', from);
      await this.handleIceCandidate(from, candidate);
    });

    // Handle new participant joined
    liveSocket.on('participant-joined', async ({ participant }) => {
      if (participant.userId === this.userId) {
        return; // Don't connect to self
      }

      console.log('New participant, creating offer:', participant.userId);
      await this.createOffer(participant.userId);
    });

    // Handle participant left
    liveSocket.on('participant-left', ({ userId }) => {
      console.log('Participant left:', userId);
      this.closePeerConnection(userId);
    });
  }

  /**
   * Get connection stats
   */
  async getStats(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return null;
    }

    try {
      const stats = await peer.pc.getStats();
      return stats;
    } catch (error) {
      console.error('Failed to get stats:', error);
      return null;
    }
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
   * Check if audio is enabled
   */
  isAudioEnabled() {
    if (!this.localStream) {
      return false;
    }
    const audioTrack = this.localStream.getAudioTracks()[0];
    return audioTrack ? audioTrack.enabled : false;
  }

  /**
   * Check if video is enabled
   */
  isVideoEnabled() {
    if (!this.localStream) {
      return false;
    }
    const videoTrack = this.localStream.getVideoTracks()[0];
    return videoTrack ? videoTrack.enabled : false;
  }

  /**
   * Get peer count
   */
  getPeerCount() {
    return this.peers.size;
  }
}

// Create global WebRTC client instance
const webrtcClient = new WebRTCClient();

// Make available globally
window.webrtcClient = webrtcClient;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebRTCClient;
}
