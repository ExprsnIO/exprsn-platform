/**
 * ═══════════════════════════════════════════════════════════════════════
 * Auth Service Seeder - Sessions, SSO Providers, Login Attempts, MFA Tokens
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.AUTH_DB_NAME || 'exprsn_auth',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
  }
);

async function seed() {
  const startTime = Date.now();
  let recordsCreated = 0;

  try {
    await sequelize.authenticate();
    console.log('  Connected to exprsn_auth database');

    const modelsPath = path.join(__dirname, '../src/exprsn-auth/models');
    const db = require(modelsPath);

    const { Session, SSOProvider, LoginAttempt, MFAToken } = db;

    // Get sample user IDs (would come from CA service in real scenario)
    const sampleUserIds = Array.from({ length: 10 }, () => uuidv4());

    // ═══════════════════════════════════════════════════════════════════
    // 1. Create SSO Providers
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating SSO providers...');

    const ssoProviders = [
      {
        name: 'Google OAuth',
        type: 'oauth2',
        enabled: true,
        config: {
          clientId: 'sample-google-client-id',
          clientSecret: 'sample-google-secret',
          authorizationURL: 'https://accounts.google.com/o/oauth2/v2/auth',
          tokenURL: 'https://oauth2.googleapis.com/token',
          scope: ['openid', 'profile', 'email']
        },
        metadata: { provider: 'google', iconUrl: 'https://google.com/favicon.ico' }
      },
      {
        name: 'GitHub OAuth',
        type: 'oauth2',
        enabled: true,
        config: {
          clientId: 'sample-github-client-id',
          clientSecret: 'sample-github-secret',
          authorizationURL: 'https://github.com/login/oauth/authorize',
          tokenURL: 'https://github.com/login/oauth/access_token',
          scope: ['user:email', 'read:user']
        },
        metadata: { provider: 'github', iconUrl: 'https://github.com/favicon.ico' }
      },
      {
        name: 'Corporate SAML',
        type: 'saml',
        enabled: true,
        config: {
          entryPoint: 'https://corp.example.com/saml/sso',
          issuer: 'exprsn-platform',
          cert: '-----BEGIN CERTIFICATE-----\n[SAMPLE CERT]\n-----END CERTIFICATE-----'
        },
        metadata: { provider: 'corporate', iconUrl: '/assets/corporate-icon.png' }
      },
      {
        name: 'Microsoft Azure AD',
        type: 'oidc',
        enabled: false,
        config: {
          clientId: 'sample-azure-client-id',
          clientSecret: 'sample-azure-secret',
          issuer: 'https://login.microsoftonline.com/common/v2.0',
          authorizationURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
          tokenURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/token'
        },
        metadata: { provider: 'microsoft', iconUrl: 'https://microsoft.com/favicon.ico' }
      }
    ];

    for (const providerData of ssoProviders) {
      await SSOProvider.create(providerData);
      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. Create Sessions
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating user sessions...');

    for (let i = 0; i < sampleUserIds.length * 2; i++) {
      const userId = sampleUserIds[Math.floor(Math.random() * sampleUserIds.length)];
      const sessionToken = crypto.randomBytes(32).toString('hex');

      await Session.create({
        userId,
        token: sessionToken,
        caTokenId: uuidv4(),
        ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        userAgent: [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
          'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15'
        ][Math.floor(Math.random() * 4)],
        deviceInfo: {
          browser: ['Chrome', 'Firefox', 'Safari', 'Edge'][Math.floor(Math.random() * 4)],
          os: ['Windows', 'macOS', 'Linux', 'iOS', 'Android'][Math.floor(Math.random() * 5)],
          device: ['Desktop', 'Mobile', 'Tablet'][Math.floor(Math.random() * 3)]
        },
        expiresAt: new Date(Date.now() + (Math.random() > 0.3 ? 7 : -1) * 24 * 60 * 60 * 1000),
        lastActivityAt: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
        revokedAt: Math.random() > 0.9 ? new Date() : null,
        revokedReason: Math.random() > 0.9 ? 'user_logout' : null
      });
      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. Create Login Attempts
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating login attempt history...');

    const sampleEmails = [
      'admin@exprsn.io',
      'john.doe@example.com',
      'jane.doe@example.com',
      'attacker@malicious.com',
      'bob.smith@example.com'
    ];

    for (let i = 0; i < 200; i++) {
      const success = Math.random() > 0.2; // 80% success rate
      const email = sampleEmails[Math.floor(Math.random() * sampleEmails.length)];

      await LoginAttempt.create({
        email,
        userId: success ? sampleUserIds[Math.floor(Math.random() * sampleUserIds.length)] : null,
        success,
        failureReason: success ? null : ['invalid_password', 'account_locked', 'invalid_email', 'mfa_failed'][Math.floor(Math.random() * 4)],
        ipAddress: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Sample User Agent)',
        attemptedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
      });
      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. Create MFA Tokens
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating MFA tokens...');

    for (let i = 0; i < Math.min(sampleUserIds.length, 6); i++) {
      const userId = sampleUserIds[i];

      // TOTP token
      await MFAToken.create({
        userId,
        method: 'totp',
        secret: crypto.randomBytes(20).toString('base32'),
        enabled: true,
        verifiedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        backupCodes: Array.from({ length: 10 }, () => crypto.randomBytes(4).toString('hex'))
      });
      recordsCreated++;

      // Some users have SMS backup
      if (Math.random() > 0.5) {
        await MFAToken.create({
          userId,
          method: 'sms',
          phoneNumber: `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
          enabled: true,
          verifiedAt: new Date(Date.now() - Math.random() * 20 * 24 * 60 * 60 * 1000)
        });
        recordsCreated++;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      recordsCreated,
      duration,
      summary: {
        ssoProviders: ssoProviders.length,
        sessions: sampleUserIds.length * 2,
        loginAttempts: 200,
        mfaTokens: Math.min(sampleUserIds.length, 6)
      }
    };

  } catch (error) {
    console.error('  Error seeding Auth:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  seed()
    .then(result => {
      console.log(`\nAuth seeded: ${result.recordsCreated} records in ${result.duration}s`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to seed Auth:', error);
      process.exit(1);
    });
}

module.exports = { seed };
