/**
 * Exprsn Herald - Configuration
 */

require('dotenv').config();

module.exports = {
  port: parseInt(process.env.HERALD_PORT || '3014', 10),
  env: process.env.NODE_ENV || 'development',

  // Database (PostgreSQL)
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'exprsn_herald',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true'
  },

  // Redis for Bull queues
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10)
  },

  // Email configuration
  email: {
    provider: process.env.EMAIL_PROVIDER || 'smtp', // smtp, sendgrid, ses
    from: process.env.EMAIL_FROM || 'noreply@exprsn.io',

    // SMTP configuration
    smtp: {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASSWORD || ''
      }
    },

    // SendGrid configuration
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY || ''
    },

    // AWS SES configuration
    ses: {
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    }
  },

  // Push notification configuration
  push: {
    // Firebase Cloud Messaging (FCM) for Android/Web
    fcm: {
      serverKey: process.env.FCM_SERVER_KEY || '',
      serviceAccount: process.env.FCM_SERVICE_ACCOUNT
        ? JSON.parse(process.env.FCM_SERVICE_ACCOUNT)
        : null
    },

    // Apple Push Notification Service (APNS) for iOS
    apns: {
      keyId: process.env.APNS_KEY_ID || '',
      teamId: process.env.APNS_TEAM_ID || '',
      key: process.env.APNS_KEY_PATH || '',
      bundleId: process.env.APNS_BUNDLE_ID || 'com.exprsn.app'
    }
  },

  // SMS configuration
  sms: {
    provider: process.env.SMS_PROVIDER || 'twilio', // twilio

    // Twilio configuration
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_FROM_NUMBER || ''
    }
  },

  // Certificate Authority (CA) configuration
  ca: {
    url: process.env.CA_URL || 'http://localhost:3000',
    certificateId: process.env.CA_CERTIFICATE_ID || '',
    timeout: parseInt(process.env.CA_TIMEOUT || '5000', 10)
  },

  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    directory: process.env.LOG_DIRECTORY || 'logs'
  },

  // Feature flags
  features: {
    emailEnabled: process.env.FEATURE_EMAIL !== 'false',
    pushEnabled: process.env.FEATURE_PUSH !== 'false',
    smsEnabled: process.env.FEATURE_SMS !== 'false',
    digestEnabled: process.env.FEATURE_DIGEST !== 'false'
  }
};
