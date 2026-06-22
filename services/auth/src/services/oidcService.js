/**
 * ═══════════════════════════════════════════════════════════
 * OpenID Connect (OIDC) Service
 * Implements OpenID Connect provider on top of OAuth 2.0
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User, Application, OAuth2Token } = require('../models');
const oauth2Service = require('./oauth2Service');
const config = require('../config');

/**
 * Generate ID Token (JWT)
 * OpenID Connect identity token with user claims
 */
async function generateIdToken(user, client, nonce = null, options = {}) {
  const { accessToken, scope = [] } = options;

  // Base claims (required by OIDC spec)
  const claims = {
    iss: config.oidc.issuer,
    sub: user.id,
    aud: client.clientId,
    exp: Math.floor(Date.now() / 1000) + (client.idTokenLifetime || 3600),
    iat: Math.floor(Date.now() / 1000),
    auth_time: Math.floor((user.lastLoginAt || Date.now()) / 1000)
  };

  // Add nonce if provided (CSRF protection)
  if (nonce) {
    claims.nonce = nonce;
  }

  // Add access token hash if provided
  if (accessToken) {
    claims.at_hash = generateTokenHash(accessToken);
  }

  // Add standard claims based on scopes
  if (scope.includes('profile')) {
    claims.name = user.displayName || `${user.firstName} ${user.lastName}`.trim();
    claims.given_name = user.firstName;
    claims.family_name = user.lastName;
    claims.picture = user.avatarUrl;
  }

  if (scope.includes('email')) {
    claims.email = user.email;
    claims.email_verified = user.emailVerified;
  }

  // Sign the ID token (RS256 with the configured private key)
  const idToken = jwt.sign(claims, config.jwt.privateKey, {
    algorithm: config.jwt.algorithm,
    keyid: config.jwt.keyId
  });

  return idToken;
}

/**
 * Get user info (OIDC UserInfo endpoint)
 */
async function getUserInfo(accessToken) {
  // Validate access token
  const tokenData = await oauth2Service.getAccessToken(accessToken);

  if (!tokenData) {
    throw new Error('INVALID_TOKEN');
  }

  const user = await User.findByPk(tokenData.user.id);

  if (!user) {
    throw new Error('USER_NOT_FOUND');
  }

  // Build user info based on scopes
  const scope = tokenData.scope || [];
  const userInfo = {
    sub: user.id
  };

  if (scope.includes('profile')) {
    userInfo.name = user.displayName || `${user.firstName} ${user.lastName}`.trim();
    userInfo.given_name = user.firstName;
    userInfo.family_name = user.lastName;
    userInfo.picture = user.avatarUrl;
    userInfo.updated_at = Math.floor(new Date(user.updatedAt).getTime() / 1000);
  }

  if (scope.includes('email')) {
    userInfo.email = user.email;
    userInfo.email_verified = user.emailVerified;
  }

  return userInfo;
}

/**
 * Get OIDC Discovery document (/.well-known/openid-configuration)
 */
function getDiscoveryDocument() {
  const issuer = config.oidc.issuer;

  return {
    issuer,
    authorization_endpoint: `${issuer}/api/oauth2/authorize`,
    token_endpoint: `${issuer}/api/oauth2/token`,
    userinfo_endpoint: `${issuer}/api/oauth2/userinfo`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    end_session_endpoint: `${issuer}/api/oauth2/logout`,
    registration_endpoint: `${issuer}/api/oauth2/register`,

    // Supported scopes
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],

    // Supported response types
    response_types_supported: [
      'code',
      'id_token',
      'token id_token',
      'code id_token',
      'code token',
      'code token id_token'
    ],

    // Supported response modes
    response_modes_supported: ['query', 'fragment', 'form_post'],

    // Supported grant types
    grant_types_supported: [
      'authorization_code',
      'implicit',
      'refresh_token',
      'client_credentials'
    ],

    // Subject types
    subject_types_supported: ['public'],

    // ID Token signing algorithms (we sign with RS256 only)
    id_token_signing_alg_values_supported: ['RS256'],

    // Token endpoint auth methods
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
      'private_key_jwt'
    ],

    // Claims supported
    claims_supported: [
      'sub',
      'iss',
      'aud',
      'exp',
      'iat',
      'auth_time',
      'nonce',
      'at_hash',
      'name',
      'given_name',
      'family_name',
      'email',
      'email_verified',
      'picture'
    ],

    // Code challenge methods (PKCE) - `plain` is intentionally not supported
    code_challenge_methods_supported: ['S256'],

    // UI locales
    ui_locales_supported: ['en-US'],

    // Claims parameter supported
    claims_parameter_supported: false,

    // Request parameter supported
    request_parameter_supported: false,

    // Request URI parameter supported
    request_uri_parameter_supported: false
  };
}

/**
 * Get JSON Web Key Set (JWKS)
 */
function getJwks() {
  // Export the real public key as a JWK (Node >= 16 supports JWK export)
  const jwk = crypto
    .createPublicKey(config.jwt.publicKey)
    .export({ format: 'jwk' });

  return {
    keys: [
      {
        kty: jwk.kty, // 'RSA'
        n: jwk.n,
        e: jwk.e,
        kid: config.jwt.keyId,
        use: 'sig',
        alg: 'RS256'
      }
    ]
  };
}

/**
 * Validate ID Token
 */
async function validateIdToken(idToken, options = {}) {
  const { clientId, nonce } = options;

  try {
    const decoded = jwt.verify(idToken, config.jwt.publicKey, {
      algorithms: ['RS256'], // pinned - never accept other algorithms
      issuer: config.oidc.issuer,
      ...(clientId && { audience: clientId })
    });

    // Validate nonce if provided
    if (nonce && decoded.nonce !== nonce) {
      throw new Error('NONCE_MISMATCH');
    }

    // Validate expiration
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('TOKEN_EXPIRED');
    }

    return {
      valid: true,
      claims: decoded
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

/**
 * Handle OIDC authorization request
 * Extends OAuth2 with ID token generation
 */
async function handleAuthorizationResponse(user, client, authCode, options = {}) {
  const { nonce, scope = [], redirectUri } = options;

  // Generate tokens using OAuth2 service
  const accessToken = oauth2Service.generateAccessToken();
  const refreshToken = oauth2Service.generateRefreshToken();

  const accessTokenExpiresAt = new Date(Date.now() + (client.accessTokenLifetime || 3600) * 1000);
  const refreshTokenExpiresAt = new Date(Date.now() + (client.refreshTokenLifetime || 2592000) * 1000);

  // Save tokens
  const tokenData = await oauth2Service.saveToken(
    {
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      refreshTokenExpiresAt,
      scope
    },
    { id: client.id },
    { id: user.id }
  );

  // Generate ID token if 'openid' scope is present
  let idToken = null;
  if (scope.includes('openid')) {
    idToken = await generateIdToken(user, client, nonce, { accessToken, scope });
  }

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: client.accessTokenLifetime || 3600,
    refresh_token: refreshToken,
    ...(idToken && { id_token: idToken }),
    scope: scope.join(' ')
  };
}

/**
 * Helper: Generate token hash for ID token
 * Used for at_hash (access token hash) claim
 */
function generateTokenHash(token) {
  // OAuth 2.0 spec: left-most half of the hash of the octets of the ASCII representation
  const hash = crypto.createHash('sha256').update(token).digest();
  const halfHash = hash.slice(0, hash.length / 2);
  return halfHash.toString('base64url');
}

module.exports = {
  generateIdToken,
  getUserInfo,
  getDiscoveryDocument,
  getJwks,
  validateIdToken,
  handleAuthorizationResponse
};
