/**
 * Exprsn Live - Configuration
 * Global configuration constants
 */

const LiveConfig = {
  // API Configuration
  api: {
    baseUrl: window.location.origin,
    endpoints: {
      // Streams
      streams: '/api/streams',
      streamById: (id) => `/api/streams/${id}`,
      startStream: (id) => `/api/streams/${id}/start`,
      stopStream: (id) => `/api/streams/${id}/stop`,
      streamRecordings: (id) => `/api/streams/${id}/recordings`,

      // Rooms
      rooms: '/api/rooms',
      roomById: (id) => `/api/rooms/${id}`,
      roomByCode: (code) => `/api/rooms/code/${code}`,
      joinRoom: (id) => `/api/rooms/${id}/join`,
      leaveRoom: (id) => `/api/rooms/${id}/leave`,
      roomParticipants: (id) => `/api/rooms/${id}/participants`,
      roomRecordings: (id) => `/api/rooms/${id}/recordings`,

      // Health
      health: '/health'
    },

    // Request timeout in milliseconds
    timeout: 30000,

    // Retry configuration
    retry: {
      maxAttempts: 3,
      delay: 1000
    }
  },

  // Socket.IO Configuration
  socket: {
    url: window.location.origin,
    options: {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 10000
    },

    // Event names
    events: {
      // Stream events
      streamStarted: 'stream-started',
      streamEnded: 'stream-ended',
      streamDeleted: 'stream-deleted',
      viewerJoined: 'viewer-joined',
      viewerLeft: 'viewer-left',
      viewerCountUpdated: 'viewer-count-updated',

      // Room events
      participantJoined: 'participant-joined',
      participantLeft: 'participant-left',
      participantStateChanged: 'participant-state-changed',
      roomClosed: 'room-closed',

      // WebRTC signaling
      signal: 'signal',
      offer: 'offer',
      answer: 'answer',
      iceCandidate: 'ice-candidate'
    }
  },

  // WebRTC Configuration
  webrtc: {
    // ICE servers (STUN/TURN)
    iceServers: [
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302'
        ]
      }
      // Add TURN servers if available:
      // {
      //   urls: 'turn:your-turn-server.com:3478',
      //   username: 'username',
      //   credential: 'password'
      // }
    ],

    // Media constraints
    mediaConstraints: {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }
    },

    // Screen sharing constraints
    screenConstraints: {
      video: {
        cursor: 'always',
        displaySurface: 'monitor'
      },
      audio: false
    },

    // Connection timeout
    connectionTimeout: 10000,

    // Max reconnection attempts
    maxReconnectAttempts: 3
  },

  // UI Configuration
  ui: {
    // Polling intervals (milliseconds)
    polling: {
      stats: 5000,
      streams: 10000,
      rooms: 10000
    },

    // Toast notification duration
    toastDuration: 5000,

    // Debounce delay for search/filter
    debounceDelay: 300,

    // Pagination
    itemsPerPage: 12,

    // Room code length
    roomCodeLength: 6
  },

  // Feature flags
  features: {
    recording: true,
    screenSharing: true,
    chat: true,
    reactions: true,
    virtualBackground: false,
    aiModeration: false
  },

  // Stream settings
  stream: {
    // Visibility options
    visibilityOptions: [
      { value: 'public', label: 'Public - Anyone can watch', icon: 'globe' },
      { value: 'unlisted', label: 'Unlisted - Only with link', icon: 'link' },
      { value: 'private', label: 'Private - Invite only', icon: 'lock' }
    ],

    // Default settings
    defaults: {
      visibility: 'public',
      recording: true,
      chat: true
    },

    // Limits
    maxTitleLength: 255,
    maxDescriptionLength: 2000
  },

  // Room settings
  room: {
    // Default max participants
    defaultMaxParticipants: 10,

    // Participant limits
    minParticipants: 2,
    maxParticipants: 50,

    // Password requirements
    minPasswordLength: 4,
    maxPasswordLength: 100,

    // Room code format
    codeFormat: /^[A-Z0-9]{6}$/,

    // Default settings
    defaults: {
      maxParticipants: 10,
      isPrivate: false,
      muteOnJoin: false,
      videoOnJoin: true,
      allowScreenShare: true
    }
  },

  // Storage keys (localStorage)
  storage: {
    token: 'exprsn_live_token',
    userId: 'exprsn_live_user_id',
    preferences: 'exprsn_live_preferences',
    recentRooms: 'exprsn_live_recent_rooms',
    recentStreams: 'exprsn_live_recent_streams'
  },

  // Error messages
  errors: {
    network: 'Network error. Please check your connection.',
    unauthorized: 'You must be logged in to perform this action.',
    forbidden: 'You do not have permission to perform this action.',
    notFound: 'The requested resource was not found.',
    serverError: 'Server error. Please try again later.',
    timeout: 'Request timed out. Please try again.',
    invalidInput: 'Invalid input. Please check your data.',
    roomFull: 'This room is at maximum capacity.',
    invalidPassword: 'Incorrect room password.',
    invalidCode: 'Invalid room code.',
    mediaPermissionDenied: 'Camera/microphone permission denied.',
    webrtcNotSupported: 'Your browser does not support video chat.',
    connectionFailed: 'Failed to establish connection.'
  },

  // Success messages
  messages: {
    streamCreated: 'Stream created successfully!',
    streamStarted: 'Stream started. You are now live!',
    streamEnded: 'Stream ended successfully.',
    streamDeleted: 'Stream deleted successfully.',
    roomCreated: 'Room created successfully!',
    roomJoined: 'Joined room successfully.',
    roomLeft: 'Left room successfully.',
    roomClosed: 'Room closed successfully.',
    copied: 'Copied to clipboard!'
  },

  // API response status codes
  status: {
    ok: 200,
    created: 201,
    badRequest: 400,
    unauthorized: 401,
    forbidden: 403,
    notFound: 404,
    conflict: 409,
    serverError: 500,
    serviceUnavailable: 503
  },

  // Development mode
  dev: {
    enabled: window.location.hostname === 'localhost',
    mockAuth: true,
    verbose: true
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LiveConfig;
}
