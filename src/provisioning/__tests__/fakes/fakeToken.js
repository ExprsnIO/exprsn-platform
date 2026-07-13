/**
 * Fake for services/ca/services/token — the CA token façade the member hook (S6)
 * mints through and the engine's S5 compensator revokes.
 *
 * validateToken honors the deactivation-as-revocation lever: a token scoped to a
 * directory group (organizationId = caGroupId) validates only while that group is
 * active; deactivating the group (caState) makes validateToken return SCOPE_INACTIVE,
 * mirroring the real resolveScopeGroup check (§6e).
 */

'use strict';

const { state, nextId } = require('./caState');

module.exports = {
  async generateToken(params, userId /* , opts */) {
    const token = {
      id: nextId('token'),
      status: 'active',
      userId: userId || (params && params.data && params.data.userId) || null,
      organizationId: (params && params.organizationId) || null
    };
    state.tokens.set(token.id, token);
    return { id: token.id, status: 'active' };
  },

  async revokeToken(tokenId /* , reason, userId, opts */) {
    const token = state.tokens.get(tokenId);
    if (!token) {
      const err = new Error('Token not found');
      err.code = 'TOKEN_NOT_FOUND';
      err.status = 404;
      throw err;
    }
    token.status = 'revoked';
    return { id: tokenId, status: 'revoked' };
  },

  async validateToken(tokenId) {
    const token = state.tokens.get(tokenId);
    if (!token || token.status !== 'active') {
      return { valid: false, error: 'TOKEN_REVOKED', message: 'Token has been revoked' };
    }
    // Scope check: the token's directory group must still be active.
    if (token.organizationId) {
      const group = state.groupById.get(token.organizationId);
      if (group && group.status !== 'active') {
        return { valid: false, error: 'SCOPE_INACTIVE', message: 'Token scope group is inactive' };
      }
    }
    return {
      valid: true,
      userId: token.userId,
      tokenData: { userId: token.userId, organizationId: token.organizationId }
    };
  }
};
