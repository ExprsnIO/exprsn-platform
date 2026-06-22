/**
 * Exprsn Live - Configuration
 */

require('dotenv').config();

module.exports = {
  // Service Configuration
  service: {
    name: 'exprsn-live',
    port: parseInt(process.env.LIVE_SERVICE_PORT || '3009', 10),
    host: process.env.LIVE_SERVICE_HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development'
  },

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'exprsn_live',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      acquire: 30000,
      idle: 10000
    }
  },

  // Redis
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || null
  },

  // Certificate Authority
  ca: {
    baseUrl: process.env.CA_BASE_URL || 'http://localhost:3000',
    serviceToken: process.env.SERVICE_TOKEN || ''
  },

  // Streaming Provider Configuration
  streaming: {
    provider: process.env.STREAMING_PROVIDER || 'cloudflare',
    cloudflare: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
      apiToken: process.env.CLOUDFLARE_API_TOKEN || ''
    }
  },

  // Platform Integrations
  platforms: {
    youtube: {
      clientId: process.env.YOUTUBE_CLIENT_ID || '',
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
      redirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3009/api/platforms/youtube/callback'
    },
    twitch: {
      clientId: process.env.TWITCH_CLIENT_ID || '',
      clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
      redirectUri: process.env.TWITCH_REDIRECT_URI || 'http://localhost:3009/api/platforms/twitch/callback'
    },
    facebook: {
      appId: process.env.FACEBOOK_APP_ID || '',
      appSecret: process.env.FACEBOOK_APP_SECRET || '',
      redirectUri: process.env.FACEBOOK_REDIRECT_URI || 'http://localhost:3009/api/platforms/facebook/callback'
    },
    srs: {
      apiUrl: process.env.SRS_API_URL || 'http://localhost:1985',
      rtmpPort: parseInt(process.env.SRS_RTMP_PORT || '1935', 10),
      httpPort: parseInt(process.env.SRS_HTTP_PORT || '8080', 10),
      httpsPort: parseInt(process.env.SRS_HTTPS_PORT || '8443', 10),
      publicHost: process.env.SRS_PUBLIC_HOST || 'localhost',
      sslEnabled: process.env.SRS_SSL_ENABLED === 'true',
      apiSecret: process.env.SRS_API_SECRET || ''
    }
  },

  // FFmpeg Configuration
  ffmpeg: {
    enabled: process.env.FFMPEG_ENABLED === 'true',
    autoInstall: process.env.FFMPEG_AUTO_INSTALL === 'true',
    binaryPath: process.env.FFMPEG_BINARY_PATH || null
  },

  // WebRTC Configuration
  webrtc: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  },

  // Service URLs
  services: {
    spark: process.env.SPARK_BASE_URL || 'http://localhost:3002',
    timeline: process.env.TIMELINE_BASE_URL || 'http://localhost:3004'
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs'
  }
};
