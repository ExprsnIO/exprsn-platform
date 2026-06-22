/**
 * ═══════════════════════════════════════════════════════════
 * Configuration
 * Central configuration for Auth service
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const crypto = require('crypto');

const environment = process.env.NODE_ENV || 'development';
const isProduction = environment === 'production';

/**
 * ─────────────────────────────────────────────────────────
 * OIDC / JWT signing keys (RS256)
 *
 * Sources (in order of precedence):
 *   1. OIDC_PRIVATE_KEY            - inline PEM in env
 *   2. OIDC_PRIVATE_KEY_PATH       - path to PEM file
 *   (public key: OIDC_PUBLIC_KEY_PATH, or derived from private key)
 *
 * In production a private key is REQUIRED - startup throws otherwise.
 * In development an ephemeral RSA-2048 keypair is generated at boot
 * (with a loud warning); previously-issued tokens will not verify
 * across restarts.
 * ─────────────────────────────────────────────────────────
 */
function loadJwtKeys() {
  let privateKeyPem = null;
  let publicKeyPem = null;

  if (process.env.OIDC_PRIVATE_KEY) {
    privateKeyPem = process.env.OIDC_PRIVATE_KEY;
  } else if (process.env.OIDC_PRIVATE_KEY_PATH) {
    if (!fs.existsSync(process.env.OIDC_PRIVATE_KEY_PATH)) {
      throw new Error(
        `OIDC_PRIVATE_KEY_PATH is set but file does not exist: ${process.env.OIDC_PRIVATE_KEY_PATH}`
      );
    }
    privateKeyPem = fs.readFileSync(process.env.OIDC_PRIVATE_KEY_PATH, 'utf-8');
  }

  if (process.env.OIDC_PUBLIC_KEY_PATH) {
    if (!fs.existsSync(process.env.OIDC_PUBLIC_KEY_PATH)) {
      throw new Error(
        `OIDC_PUBLIC_KEY_PATH is set but file does not exist: ${process.env.OIDC_PUBLIC_KEY_PATH}`
      );
    }
    publicKeyPem = fs.readFileSync(process.env.OIDC_PUBLIC_KEY_PATH, 'utf-8');
  }

  if (!privateKeyPem) {
    if (isProduction) {
      throw new Error(
        'OIDC signing key is required in production. ' +
        'Set OIDC_PRIVATE_KEY (inline PEM) or OIDC_PRIVATE_KEY_PATH (path to PEM file).'
      );
    }

    // Development only: ephemeral keypair generated at boot
    // eslint-disable-next-line no-console
    console.warn(
      '[auth:config] WARNING: No OIDC signing key configured. ' +
      'Generating an EPHEMERAL RSA-2048 keypair for development. ' +
      'Tokens will not survive restarts. Set OIDC_PRIVATE_KEY_PATH for stable keys.'
    );

    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048
    });

    privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  }

  // Derive public key from private key when not explicitly provided
  if (!publicKeyPem) {
    publicKeyPem = crypto
      .createPublicKey(privateKeyPem)
      .export({ type: 'spki', format: 'pem' });
  }

  // Stable key id: base64url(sha256(SPKI DER)), truncated
  const spkiDer = crypto
    .createPublicKey(publicKeyPem)
    .export({ type: 'spki', format: 'der' });
  const keyId = crypto
    .createHash('sha256')
    .update(spkiDer)
    .digest('base64url')
    .slice(0, 16);

  return { privateKey: privateKeyPem, publicKey: publicKeyPem, keyId };
}

const jwtKeys = loadJwtKeys();

/**
 * ─────────────────────────────────────────────────────────
 * Production fail-fast checks (no insecure defaults)
 * ─────────────────────────────────────────────────────────
 */
const SESSION_SECRET_PLACEHOLDER = 'exprsn-auth-secret-change-in-production';

if (isProduction) {
  if (!process.env.AUTH_DB_USER || !process.env.AUTH_DB_PASSWORD) {
    throw new Error(
      'Database credentials are required in production. Set AUTH_DB_USER and AUTH_DB_PASSWORD.'
    );
  }

  if (
    !process.env.SESSION_SECRET ||
    process.env.SESSION_SECRET === SESSION_SECRET_PLACEHOLDER
  ) {
    throw new Error(
      'SESSION_SECRET must be set to a strong unique value in production.'
    );
  }
}

// Development-only fallbacks (never used in production - see fail-fast above)
const sessionSecret =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET !== SESSION_SECRET_PLACEHOLDER
    ? process.env.SESSION_SECRET
    : (() => {
        if (isProduction) {
          // Unreachable (fail-fast above), defensive double-check
          throw new Error('SESSION_SECRET must be set in production');
        }
        // eslint-disable-next-line no-console
        console.warn(
          '[auth:config] WARNING: SESSION_SECRET not set; using a random per-boot secret. ' +
          'Sessions will not survive restarts. Set SESSION_SECRET in .env.'
        );
        return crypto.randomBytes(32).toString('hex');
      })();

const serviceHost = process.env.AUTH_SERVICE_HOST || 'localhost';
const servicePort = process.env.AUTH_SERVICE_PORT || 3001;
const defaultIssuer =
  process.env.OIDC_ISSUER ||
  `${process.env.TLS_ENABLED === 'true' ? 'https' : 'http'}://${serviceHost}:${servicePort}`;

module.exports = {
  // Service configuration
  service: {
    port: servicePort,
    host: serviceHost,
    environment
  },

  // Database configuration
  // NOTE: no username/password defaults - production throws above if unset.
  database: {
    host: process.env.AUTH_DB_HOST || 'localhost',
    port: parseInt(process.env.AUTH_DB_PORT) || 5432,
    database: process.env.AUTH_DB_NAME || 'exprsn_auth',
    username: process.env.AUTH_DB_USER,
    password: process.env.AUTH_DB_PASSWORD,
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    }
  },

  // Redis configuration
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || null
  },

  // CA configuration
  ca: {
    url: process.env.CA_URL || 'http://localhost:3000',
    domain: process.env.AUTH_CA_DOMAIN || 'auth.exprsn.io',
    certificateSerial: process.env.AUTH_CERT_SERIAL,
    privateKeyPath: process.env.AUTH_PRIVATE_KEY_PATH,
    certificatePath: process.env.AUTH_CERTIFICATE_PATH,
    rootCertPath: process.env.CA_ROOT_CERT_PATH,
    ocspUrl: process.env.OCSP_RESPONDER_URL || 'http://localhost:2560'
  },

  // Session configuration
  // NOTE: no hardcoded secret default - production throws above if unset.
  session: {
    secret: sessionSecret,
    lifetime: parseInt(process.env.SESSION_LIFETIME) || 3600000, // 1 hour
    idleTimeout: parseInt(process.env.SESSION_IDLE_TIMEOUT) || 900000 // 15 minutes
  },

  // JWT / OIDC signing configuration (RS256)
  jwt: {
    privateKey: jwtKeys.privateKey,
    publicKey: jwtKeys.publicKey,
    algorithm: 'RS256',
    keyId: jwtKeys.keyId
  },

  // OIDC provider configuration
  oidc: {
    issuer: defaultIssuer
  },

  // OAuth2 configuration
  oauth2: {
    authorizationCodeLifetime: 300, // 5 minutes
    accessTokenLifetime: 3600, // 1 hour
    refreshTokenLifetime: 86400 * 7, // 7 days
    // NOTE: authorization_code is left `false` at the oauth2-server layer so
    // PUBLIC clients (PKCE-mandatory) can reach the token endpoint without a
    // secret. Confidential-client authentication is enforced in
    // oauth2Service.getClient(): a confidential client with a missing or
    // invalid client_secret is rejected.
    requireClientAuthentication: {
      authorization_code: false,
      refresh_token: true
    }
  },

  // External OAuth providers
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback'
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3001/api/auth/github/callback'
    }
  },

  // Security
  security: {
    bcryptRounds: 12,
    maxLoginAttempts: 5,
    lockoutDuration: 900000, // 15 minutes
    passwordMinLength: 12,
    requireMFA: process.env.REQUIRE_MFA === 'true'
  },

  // Token defaults
  tokenDefaults: {
    expiryType: 'time',
    expirySeconds: 3600, // 1 hour
    resourceType: 'url'
  }
};
