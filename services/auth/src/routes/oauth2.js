/**
 * ═══════════════════════════════════════════════════════════
 * OAuth2 Routes
 * OAuth2 provider endpoints (authorization code flow)
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const OAuth2Server = require('oauth2-server');
const { asyncHandler, AppError, logger } = require('@exprsn/shared');
const oauth2Service = require('../services/oauth2Service');
const config = require('../config');

const router = express.Router();

// Initialize OAuth2 Server
const oauth2Server = new OAuth2Server({
  model: {
    getClient: oauth2Service.getClient,
    saveAuthorizationCode: oauth2Service.saveAuthorizationCode,
    getAuthorizationCode: oauth2Service.getAuthorizationCode,
    revokeAuthorizationCode: oauth2Service.revokeAuthorizationCode,
    saveToken: oauth2Service.saveToken,
    getAccessToken: oauth2Service.getAccessToken,
    getRefreshToken: oauth2Service.getRefreshToken,
    revokeToken: oauth2Service.revokeToken,
    verifyScope: oauth2Service.verifyScope,
    generateAuthorizationCode: oauth2Service.generateAuthorizationCode,
    generateAccessToken: oauth2Service.generateAccessToken,
    generateRefreshToken: oauth2Service.generateRefreshToken
  },
  ...config.oauth2
});

/**
 * Validate PKCE parameters on an authorization request (RFC 7636).
 * - public clients MUST send code_challenge
 * - only S256 is accepted (plain is rejected)
 *
 * @returns {Promise<object>} { error, errorDescription } or { codeChallenge }
 */
async function checkPkceAuthorizeParams(params) {
  const clientId = params.client_id;

  if (!clientId) {
    return { error: 'invalid_request', errorDescription: 'client_id is required' };
  }

  const client = await oauth2Service.getClient(clientId);

  if (!client) {
    return { error: 'invalid_client', errorDescription: 'Unknown or inactive client' };
  }

  const codeChallenge = params.code_challenge;
  const codeChallengeMethod = params.code_challenge_method;

  if (client.type === 'public' && !codeChallenge) {
    return {
      error: 'invalid_request',
      errorDescription: 'PKCE is required for public clients: code_challenge is missing'
    };
  }

  if (codeChallenge && codeChallengeMethod !== 'S256') {
    return {
      error: 'invalid_request',
      errorDescription: 'code_challenge_method must be S256 (plain is not supported)'
    };
  }

  return { codeChallenge: codeChallenge || null };
}

/**
 * GET /api/oauth2/authorize
 * OAuth2 authorization endpoint
 */
router.get('/authorize', asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user) {
    // Redirect to login with return URL
    const returnUrl = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?returnUrl=${returnUrl}`);
  }

  // PKCE enforcement (RFC 7636)
  const pkce = await checkPkceAuthorizeParams(req.query);
  if (pkce.error) {
    return res.status(400).json({
      error: pkce.error,
      error_description: pkce.errorDescription
    });
  }

  const request = new OAuth2Server.Request(req);
  const response = new OAuth2Server.Response(res);

  try {
    const code = await oauth2Server.authorize(request, response, {
      authenticateHandler: {
        handle: () => req.user
      }
    });

    // Persist the PKCE challenge on the issued code (oauth2-server v3 does
    // not thread code_challenge through its authorize handler)
    if (pkce.codeChallenge) {
      await oauth2Service.setAuthorizationCodePkce(
        code.authorizationCode,
        pkce.codeChallenge,
        'S256'
      );
    }

    logger.info('Authorization code granted', {
      userId: req.user.id,
      clientId: req.query.client_id
    });

    // Redirect to client using the VALIDATED redirect URI from the issued
    // code, built with URL/URLSearchParams (no raw query-string concat)
    const redirectUrl = new URL(code.redirectUri);
    redirectUrl.searchParams.set('code', code.authorizationCode);
    if (req.query.state) {
      redirectUrl.searchParams.set('state', String(req.query.state));
    }

    res.redirect(redirectUrl.toString());
  } catch (error) {
    logger.error('Authorization error', {
      error: error.message,
      userId: req.user?.id
    });

    res.status(error.code || 500).json({
      error: error.name || 'server_error',
      error_description: error.message
    });
  }
}));

/**
 * POST /api/oauth2/authorize
 * OAuth2 authorization endpoint (for consent form)
 */
router.post('/authorize', asyncHandler(async (req, res) => {
  // Check if user is authenticated
  if (!req.user) {
    throw new AppError('User not authenticated', 401, 'NOT_AUTHENTICATED');
  }

  // PKCE enforcement (RFC 7636) - params may arrive via body or query
  const params = { ...req.query, ...req.body };
  const pkce = await checkPkceAuthorizeParams(params);
  if (pkce.error) {
    return res.status(400).json({
      error: pkce.error,
      error_description: pkce.errorDescription
    });
  }

  const request = new OAuth2Server.Request(req);
  const response = new OAuth2Server.Response(res);

  try {
    const code = await oauth2Server.authorize(request, response, {
      authenticateHandler: {
        handle: () => req.user
      }
    });

    if (pkce.codeChallenge) {
      await oauth2Service.setAuthorizationCodePkce(
        code.authorizationCode,
        pkce.codeChallenge,
        'S256'
      );
    }

    logger.info('Authorization code granted', {
      userId: req.user.id,
      clientId: req.body.client_id
    });

    res.json({
      authorizationCode: code.authorizationCode,
      redirectUri: code.redirectUri
    });
  } catch (error) {
    logger.error('Authorization error', {
      error: error.message,
      userId: req.user?.id
    });

    throw new AppError(error.message, error.code || 500, error.name || 'AUTHORIZATION_ERROR');
  }
}));

/**
 * POST /api/oauth2/token
 * OAuth2 token endpoint
 *
 * Client authentication: confidential clients must authenticate (Basic or
 * body credentials, verified against the hashed secret); public clients are
 * exempt but PKCE is mandatory for them.
 */
router.post('/token', asyncHandler(async (req, res) => {
  // Authenticate the client (confidential clients MUST present a valid secret)
  const client = await oauth2Service.authenticateClientRequest(req);

  if (!client) {
    res.set('WWW-Authenticate', 'Basic realm="oauth2/token"');
    return res.status(401).json({
      error: 'invalid_client',
      error_description: 'Client authentication failed'
    });
  }

  // PKCE verification (RFC 7636) for the authorization_code grant
  if (req.body.grant_type === 'authorization_code' && req.body.code) {
    const codeData = await oauth2Service.getAuthorizationCode(req.body.code);

    if (codeData) {
      // The code must have been issued to the authenticated client
      if (codeData.client.clientId !== client.clientId) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Authorization code was not issued to this client'
        });
      }

      if (codeData.codeChallenge) {
        if (!req.body.code_verifier) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'code_verifier is required'
          });
        }

        const pkceValid = oauth2Service.verifyCodeChallenge(
          req.body.code_verifier,
          codeData.codeChallenge,
          codeData.codeChallengeMethod || 'S256'
        );

        if (!pkceValid) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'PKCE verification failed'
          });
        }
      } else if (client.type === 'public') {
        // Defense in depth: a public-client code must carry a challenge
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'PKCE is required for public clients'
        });
      }
    }
    // Unknown/expired codes fall through to oauth2Server.token for the
    // standard invalid_grant error
  }

  const request = new OAuth2Server.Request(req);
  const response = new OAuth2Server.Response(res);

  try {
    const token = await oauth2Server.token(request, response);

    logger.info('OAuth2 token issued', {
      clientId: req.body.client_id || client.clientId,
      grantType: req.body.grant_type
    });

    res.json({
      access_token: token.accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor((token.accessTokenExpiresAt - new Date()) / 1000),
      refresh_token: token.refreshToken,
      scope: token.scope?.join(' ')
    });
  } catch (error) {
    logger.error('Token error', {
      error: error.message,
      grantType: req.body.grant_type
    });

    res.status(error.code || 500).json({
      error: error.name || 'invalid_request',
      error_description: error.message
    });
  }
}));

/**
 * POST /api/oauth2/revoke
 * OAuth2 token revocation endpoint (RFC 7009)
 *
 * Requires client authentication. Revokes the matching token whether the
 * presented value is an access token or a refresh token, scoped to tokens
 * belonging to the authenticated client. Returns 200 even for unknown
 * tokens, per RFC 7009 section 2.2.
 */
router.post('/revoke', asyncHandler(async (req, res) => {
  const client = await oauth2Service.authenticateClientRequest(req);

  if (!client) {
    res.set('WWW-Authenticate', 'Basic realm="oauth2/revoke"');
    return res.status(401).json({
      error: 'invalid_client',
      error_description: 'Client authentication failed'
    });
  }

  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Token parameter is required'
    });
  }

  // Clients may only revoke their own tokens (always scoped by client)
  const revoked = await oauth2Service.revokeTokenByValue(token, client.id);

  if (revoked) {
    logger.info('OAuth2 token revoked', { clientId: client.clientId });
  }

  // Always 200 per RFC 7009 (do not leak token existence)
  res.status(200).json({});
}));

/**
 * GET /api/oauth2/userinfo
 * OAuth2 UserInfo endpoint (for OpenID Connect compatibility)
 */
router.get('/userinfo', asyncHandler(async (req, res) => {
  const request = new OAuth2Server.Request(req);
  const response = new OAuth2Server.Response(res);

  try {
    const token = await oauth2Server.authenticate(request, response);

    const user = token.user;

    res.json({
      sub: user.id,
      email: user.email,
      email_verified: user.emailVerified || false,
      name: user.displayName,
      given_name: user.firstName,
      family_name: user.lastName,
      picture: user.avatarUrl
    });
  } catch (error) {
    logger.error('UserInfo error', { error: error.message });

    res.status(error.code || 401).json({
      error: error.name || 'invalid_token',
      error_description: error.message
    });
  }
}));

/**
 * POST /api/oauth2/introspect
 * OAuth2 token introspection endpoint
 */
router.post('/introspect', asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.json({ active: false });
  }

  try {
    const tokenData = await oauth2Service.getAccessToken(token);

    if (!tokenData) {
      return res.json({ active: false });
    }

    res.json({
      active: true,
      scope: tokenData.scope?.join(' '),
      client_id: tokenData.client.clientId,
      sub: tokenData.user.id,
      exp: Math.floor(tokenData.accessTokenExpiresAt.getTime() / 1000)
    });
  } catch (error) {
    logger.error('Introspection error', { error: error.message });
    res.json({ active: false });
  }
}));

module.exports = router;
