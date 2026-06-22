/**
 * ═══════════════════════════════════════════════════════════
 * OAuth2 Service
 * OAuth2 provider implementation
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { OAuth2Client, OAuth2Token, OAuth2AuthorizationCode, User } = require('../models');
const { AppError } = require('@exprsn/shared');
const config = require('../config');

const BCRYPT_ROUNDS = 10;

/**
 * Timing-safe comparison of two strings
 */
function timingSafeStringEqual(a, b) {
  const hashA = crypto.createHash('sha256').update(String(a)).digest();
  const hashB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Verify a client secret against the stored value.
 *
 * Stored values are bcrypt hashes. Legacy plaintext rows (value not starting
 * with '$2') are verified with a timing-safe string compare and transparently
 * re-hashed on success (migration path for pre-existing rows).
 *
 * @param {object} clientInstance - Sequelize OAuth2Client instance
 * @param {string} candidateSecret - secret presented by the caller
 * @returns {Promise<boolean>}
 */
async function verifyClientSecret(clientInstance, candidateSecret) {
  if (!clientInstance || !clientInstance.clientSecret || !candidateSecret) {
    return false;
  }

  const stored = clientInstance.clientSecret;

  if (stored.startsWith('$2')) {
    return bcrypt.compare(candidateSecret, stored);
  }

  // Legacy plaintext row: timing-safe compare, re-hash on success
  if (timingSafeStringEqual(stored, candidateSecret)) {
    try {
      clientInstance.clientSecret = await bcrypt.hash(candidateSecret, BCRYPT_ROUNDS);
      await clientInstance.save();
    } catch (e) {
      // Re-hash failure must not block a valid authentication
    }
    return true;
  }

  return false;
}

/**
 * Get OAuth2 client by client ID (oauth2-server model hook).
 *
 * - When a clientSecret is presented it is ALWAYS verified against the
 *   stored bcrypt hash (never compared via a WHERE clause).
 * - When no secret is presented the client is returned for lookup purposes
 *   (the authorize handler legitimately calls this without a secret).
 *   Confidential-client authentication at the token/revocation endpoints is
 *   enforced by authenticateClientRequest() in the routes.
 */
async function getClient(clientId, clientSecret = null) {
  const client = await OAuth2Client.findOne({
    where: { clientId, status: 'active' }
  });

  if (!client) {
    return null;
  }

  if (clientSecret !== null && clientSecret !== undefined) {
    const valid = await verifyClientSecret(client, clientSecret);
    if (!valid) {
      return null;
    }
  }

  return {
    id: client.id,
    clientId: client.clientId,
    type: client.type,
    redirectUris: client.redirectUris,
    grants: client.grants,
    scopes: client.scopes
  };
}

/**
 * Save authorization code
 */
async function saveAuthorizationCode(code, client, user) {
  const authCode = await OAuth2AuthorizationCode.create({
    code: code.authorizationCode,
    expiresAt: code.expiresAt,
    redirectUri: code.redirectUri,
    scope: code.scope || [],
    clientId: client.id,
    userId: user.id,
    codeChallenge: code.codeChallenge,
    codeChallengeMethod: code.codeChallengeMethod
  });

  return {
    authorizationCode: authCode.code,
    expiresAt: authCode.expiresAt,
    redirectUri: authCode.redirectUri,
    scope: authCode.scope,
    client: { id: client.id },
    user: { id: user.id }
  };
}

/**
 * Get authorization code
 */
async function getAuthorizationCode(authorizationCode) {
  const code = await OAuth2AuthorizationCode.findOne({
    where: { code: authorizationCode, used: false },
    include: [
      { model: OAuth2Client, as: 'client' },
      { model: User, as: 'user' }
    ]
  });

  if (!code) {
    return null;
  }

  // Check if expired
  if (code.expiresAt < new Date()) {
    return null;
  }

  return {
    authorizationCode: code.code,
    expiresAt: code.expiresAt,
    redirectUri: code.redirectUri,
    scope: code.scope,
    codeChallenge: code.codeChallenge,
    codeChallengeMethod: code.codeChallengeMethod,
    client: {
      id: code.client.id,
      clientId: code.client.clientId,
      redirectUris: code.client.redirectUris,
      grants: code.client.grants
    },
    user: {
      id: code.user.id,
      email: code.user.email
    }
  };
}

/**
 * Revoke authorization code
 */
async function revokeAuthorizationCode(code) {
  const authCode = await OAuth2AuthorizationCode.findOne({
    where: { code: code.authorizationCode }
  });

  if (authCode) {
    authCode.used = true;
    authCode.usedAt = new Date();
    await authCode.save();
  }

  return true;
}

/**
 * Save token
 */
async function saveToken(token, client, user) {
  const savedToken = await OAuth2Token.create({
    accessToken: token.accessToken,
    accessTokenExpiresAt: token.accessTokenExpiresAt,
    refreshToken: token.refreshToken,
    refreshTokenExpiresAt: token.refreshTokenExpiresAt,
    scope: token.scope || [],
    clientId: client.id,
    userId: user.id
  });

  return {
    accessToken: savedToken.accessToken,
    accessTokenExpiresAt: savedToken.accessTokenExpiresAt,
    refreshToken: savedToken.refreshToken,
    refreshTokenExpiresAt: savedToken.refreshTokenExpiresAt,
    scope: savedToken.scope,
    client: { id: client.id },
    user: { id: user.id }
  };
}

/**
 * Get access token
 */
async function getAccessToken(accessToken) {
  const token = await OAuth2Token.findOne({
    where: { accessToken, revoked: false },
    include: [
      { model: OAuth2Client, as: 'client' },
      { model: User, as: 'user' }
    ]
  });

  if (!token) {
    return null;
  }

  // Check if expired
  if (token.accessTokenExpiresAt < new Date()) {
    return null;
  }

  return {
    accessToken: token.accessToken,
    accessTokenExpiresAt: token.accessTokenExpiresAt,
    scope: token.scope,
    client: {
      id: token.client.id,
      clientId: token.client.clientId
    },
    user: {
      id: token.user.id,
      email: token.user.email
    }
  };
}

/**
 * Get refresh token
 */
async function getRefreshToken(refreshToken) {
  const token = await OAuth2Token.findOne({
    where: { refreshToken, revoked: false },
    include: [
      { model: OAuth2Client, as: 'client' },
      { model: User, as: 'user' }
    ]
  });

  if (!token) {
    return null;
  }

  // Check if expired
  if (token.refreshTokenExpiresAt < new Date()) {
    return null;
  }

  return {
    refreshToken: token.refreshToken,
    refreshTokenExpiresAt: token.refreshTokenExpiresAt,
    scope: token.scope,
    client: {
      id: token.client.id,
      clientId: token.client.clientId,
      grants: token.client.grants
    },
    user: {
      id: token.user.id,
      email: token.user.email
    }
  };
}

/**
 * Revoke token (oauth2-server model hook - refresh token rotation)
 */
async function revokeToken(token) {
  const dbToken = await OAuth2Token.findOne({
    where: { refreshToken: token.refreshToken }
  });

  if (dbToken) {
    dbToken.revoked = true;
    dbToken.revokedAt = new Date();
    await dbToken.save();
  }

  return true;
}

/**
 * Revoke a token by its raw value (RFC 7009).
 * Looks up BOTH the accessToken and refreshToken columns and revokes the
 * matching row. Optionally scoped to a client (public clients may only
 * revoke their own tokens).
 *
 * @param {string} tokenValue - raw token string
 * @param {string|null} clientDbId - OAuth2Client primary key to scope to
 * @returns {Promise<boolean>} true if a token was revoked
 */
async function revokeTokenByValue(tokenValue, clientDbId = null) {
  const where = {
    revoked: false,
    [Op.or]: [{ accessToken: tokenValue }, { refreshToken: tokenValue }]
  };

  if (clientDbId) {
    where.clientId = clientDbId;
  }

  const dbToken = await OAuth2Token.findOne({ where });

  if (!dbToken) {
    return false;
  }

  dbToken.revoked = true;
  dbToken.revokedAt = new Date();
  await dbToken.save();
  return true;
}

/**
 * Authenticate a client from an HTTP request per RFC 6749 section 2.3:
 * HTTP Basic (client_secret_basic) or body credentials (client_secret_post).
 *
 * Policy:
 * - confidential clients MUST present a valid client_secret
 * - public clients may authenticate with client_id alone (PKCE is enforced
 *   for them at the authorize/token endpoints), but any presented secret
 *   is still verified
 *
 * @returns {Promise<object|null>} sanitized client or null
 */
async function authenticateClientRequest(req) {
  let clientId = null;
  let clientSecret = null;

  const header = req.headers.authorization || '';

  if (header.startsWith('Basic ')) {
    let decoded;
    try {
      decoded = Buffer.from(header.slice(6), 'base64').toString('utf-8');
    } catch (e) {
      return null;
    }
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex < 0) {
      return null;
    }
    try {
      clientId = decodeURIComponent(decoded.slice(0, separatorIndex));
      clientSecret = decodeURIComponent(decoded.slice(separatorIndex + 1));
    } catch (e) {
      return null;
    }
  } else if (req.body) {
    clientId = req.body.client_id || null;
    clientSecret = req.body.client_secret || null;
  }

  if (!clientId) {
    return null;
  }

  const client = await OAuth2Client.findOne({
    where: { clientId, status: 'active' }
  });

  if (!client) {
    return null;
  }

  if (clientSecret) {
    const valid = await verifyClientSecret(client, clientSecret);
    if (!valid) {
      return null;
    }
  } else if (client.type !== 'public') {
    // Confidential client without credentials: reject
    return null;
  }

  return {
    id: client.id,
    clientId: client.clientId,
    type: client.type,
    redirectUris: client.redirectUris,
    grants: client.grants,
    scopes: client.scopes
  };
}

/**
 * PKCE (RFC 7636): verify a code_verifier against a stored S256 challenge.
 * Only S256 is supported - `plain` is rejected.
 */
function verifyCodeChallenge(codeVerifier, codeChallenge, method = 'S256') {
  if (!codeVerifier || !codeChallenge) {
    return false;
  }

  if (method !== 'S256') {
    return false;
  }

  const computed = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return timingSafeStringEqual(computed, codeChallenge);
}

/**
 * Persist PKCE parameters on an already-saved authorization code.
 * (oauth2-server v3 does not thread code_challenge through its authorize
 * handler, so the route stores it right after the code is issued.)
 */
async function setAuthorizationCodePkce(authorizationCode, codeChallenge, codeChallengeMethod) {
  await OAuth2AuthorizationCode.update(
    { codeChallenge, codeChallengeMethod },
    { where: { code: authorizationCode } }
  );
}

/**
 * Verify scope
 */
function verifyScope(token, scope) {
  if (!token.scope) {
    return false;
  }

  const requestedScopes = scope.split(' ');
  const tokenScopes = token.scope;

  return requestedScopes.every(s => tokenScopes.includes(s));
}

/**
 * Validate redirect URI
 */
function validateRedirectUri(redirectUri, client) {
  if (!client.redirectUris || client.redirectUris.length === 0) {
    return false;
  }

  return client.redirectUris.includes(redirectUri);
}

/**
 * Generate authorization code
 */
function generateAuthorizationCode() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate access token
 */
function generateAccessToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Generate refresh token
 */
function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

module.exports = {
  getClient,
  verifyClientSecret,
  authenticateClientRequest,
  saveAuthorizationCode,
  getAuthorizationCode,
  revokeAuthorizationCode,
  saveToken,
  getAccessToken,
  getRefreshToken,
  revokeToken,
  revokeTokenByValue,
  verifyScope,
  validateRedirectUri,
  verifyCodeChallenge,
  setAuthorizationCodePkce,
  generateAuthorizationCode,
  generateAccessToken,
  generateRefreshToken
};
