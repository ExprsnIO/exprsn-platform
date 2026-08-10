/**
 * Exprsn Live - API Client
 * Handles all REST API communication with the backend
 */

class LiveAPI {
  constructor() {
    this.baseUrl = LiveConfig.api.baseUrl;
    this.timeout = LiveConfig.api.timeout;
    this.token = this.getToken();
  }

  /**
   * Get authentication token from storage
   */
  getToken() {
    return localStorage.getItem(LiveConfig.storage.token) || null;
  }

  /**
   * Set authentication token
   */
  setToken(token) {
    if (token) {
      localStorage.setItem(LiveConfig.storage.token, token);
      this.token = token;
    } else {
      localStorage.removeItem(LiveConfig.storage.token);
      this.token = null;
    }
  }

  /**
   * Make HTTP request
   */
  async request(method, endpoint, data = null, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Add authentication token if available
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      method,
      headers,
      ...options
    };

    // Add body for POST/PUT/PATCH requests
    if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      config.body = JSON.stringify(data);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        ...config,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Parse response
      const contentType = response.headers.get('content-type');
      let responseData;

      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      // Handle error responses
      if (!response.ok) {
        throw {
          status: response.status,
          statusText: response.statusText,
          data: responseData,
          message: responseData.message || this.getErrorMessage(response.status)
        };
      }

      return responseData;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw { message: LiveConfig.errors.timeout, status: 408 };
      }

      if (LiveConfig.dev.verbose) {
        console.error('API Error:', error);
      }

      throw error;
    }
  }

  /**
   * Get error message based on status code
   */
  getErrorMessage(status) {
    switch (status) {
      case 400:
        return LiveConfig.errors.invalidInput;
      case 401:
        return LiveConfig.errors.unauthorized;
      case 403:
        return LiveConfig.errors.forbidden;
      case 404:
        return LiveConfig.errors.notFound;
      case 500:
      case 502:
      case 503:
        return LiveConfig.errors.serverError;
      default:
        return LiveConfig.errors.network;
    }
  }

  /**
   * GET request
   */
  async get(endpoint, options = {}) {
    return this.request('GET', endpoint, null, options);
  }

  /**
   * POST request
   */
  async post(endpoint, data, options = {}) {
    return this.request('POST', endpoint, data, options);
  }

  /**
   * PUT request
   */
  async put(endpoint, data, options = {}) {
    return this.request('PUT', endpoint, data, options);
  }

  /**
   * DELETE request
   */
  async delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, null, options);
  }

  // ========== Stream API Methods ==========

  /**
   * Create a new stream
   */
  async createStream(streamData) {
    return this.post(LiveConfig.api.endpoints.streams, streamData);
  }

  /**
   * Get all streams
   */
  async getStreams(filters = {}) {
    const queryString = new URLSearchParams(filters).toString();
    const endpoint = queryString
      ? `${LiveConfig.api.endpoints.streams}?${queryString}`
      : LiveConfig.api.endpoints.streams;
    return this.get(endpoint);
  }

  /**
   * Get stream by ID
   */
  async getStream(streamId) {
    return this.get(LiveConfig.api.endpoints.streamById(streamId));
  }

  /**
   * Update stream
   */
  async updateStream(streamId, updateData) {
    return this.put(LiveConfig.api.endpoints.streamById(streamId), updateData);
  }

  /**
   * Delete stream
   */
  async deleteStream(streamId) {
    return this.delete(LiveConfig.api.endpoints.streamById(streamId));
  }

  /**
   * Start streaming
   */
  async startStream(streamId) {
    return this.post(LiveConfig.api.endpoints.startStream(streamId), {});
  }

  /**
   * Stop streaming
   */
  async stopStream(streamId) {
    return this.post(LiveConfig.api.endpoints.stopStream(streamId), {});
  }

  /**
   * Get stream recordings
   */
  async getStreamRecordings(streamId) {
    return this.get(LiveConfig.api.endpoints.streamRecordings(streamId));
  }

  // ========== Room API Methods ==========

  /**
   * Create a new room
   */
  async createRoom(roomData) {
    return this.post(LiveConfig.api.endpoints.rooms, roomData);
  }

  /**
   * Get all rooms
   */
  async getRooms(filters = {}) {
    const queryString = new URLSearchParams(filters).toString();
    const endpoint = queryString
      ? `${LiveConfig.api.endpoints.rooms}?${queryString}`
      : LiveConfig.api.endpoints.rooms;
    return this.get(endpoint);
  }

  /**
   * Get room by ID
   */
  async getRoom(roomId) {
    return this.get(LiveConfig.api.endpoints.roomById(roomId));
  }

  /**
   * Get room by code
   */
  async getRoomByCode(code) {
    return this.get(LiveConfig.api.endpoints.roomByCode(code));
  }

  /**
   * Update room
   */
  async updateRoom(roomId, updateData) {
    return this.put(LiveConfig.api.endpoints.roomById(roomId), updateData);
  }

  /**
   * Delete/close room
   */
  async deleteRoom(roomId) {
    return this.delete(LiveConfig.api.endpoints.roomById(roomId));
  }

  /**
   * Join room
   */
  async joinRoom(roomId, joinData) {
    const socketId = window.liveSocket ? window.liveSocket.id : null;
    return this.post(
      LiveConfig.api.endpoints.joinRoom(roomId),
      joinData,
      { headers: { 'X-Socket-Id': socketId } }
    );
  }

  /**
   * Leave room
   */
  async leaveRoom(roomId) {
    const socketId = window.liveSocket ? window.liveSocket.id : null;
    return this.post(
      LiveConfig.api.endpoints.leaveRoom(roomId),
      {},
      { headers: { 'X-Socket-Id': socketId } }
    );
  }

  /**
   * Get room participants
   */
  async getRoomParticipants(roomId) {
    return this.get(LiveConfig.api.endpoints.roomParticipants(roomId));
  }

  /**
   * Get room recordings
   */
  async getRoomRecordings(roomId) {
    return this.get(LiveConfig.api.endpoints.roomRecordings(roomId));
  }

  // ========== Health Check ==========

  /**
   * Check service health
   */
  async healthCheck() {
    return this.get(LiveConfig.api.endpoints.health);
  }
}

// Create global API instance
const api = new LiveAPI();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LiveAPI;
}
