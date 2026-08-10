const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { logger } = require('@exprsn/shared');
const { Account } = require('../models');
const { getRedisClient } = require('../config/redis');

class SessionService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'change-this-secret';
    this.accessTokenExpiry = '1h';
    this.refreshTokenExpiry = '30d';
  }

  /**
   * Create session for account
   */
  async createSession(did, exprsnUserId) {
    try {
      const account = await Account.findOne({ where: { did } });

      if (!account || account.status !== 'active') {
        throw new Error('Account not found or inactive');
      }

      // Generate session ID
      const sessionId = crypto.randomBytes(32).toString('hex');

      // Generate access token
      const accessToken = this.generateAccessToken({
        did,
        sessionId,
        exprsnUserId,
        handle: account.handle
      });

      // Generate refresh token
      const refreshToken = this.generateRefreshToken({
        did,
        sessionId,
        exprsnUserId
      });

      // Store session in Redis
      await this.storeSession(sessionId, {
        did,
        exprsnUserId,
        handle: account.handle,
        refreshToken,
        createdAt: new Date().toISOString()
      });

      logger.info('Session created', {
        did,
        sessionId,
        exprsnUserId
      });

      return {
        accessJwt: accessToken,
        refreshJwt: refreshToken,
        handle: account.handle,
        did,
        email: account.email,
        displayName: account.displayName
      };
    } catch (error) {
      logger.error('Failed to create session', {
        error: error.message,
        did
      });
      throw error;
    }
  }

  /**
   * Refresh session with refresh token
   */
  async refreshSession(refreshToken) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtSecret);

      // Check if session exists in Redis
      const session = await this.getSession(decoded.sessionId);

      if (!session) {
        throw new Error('Session not found or expired');
      }

      if (session.refreshToken !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      // Generate new access token
      const accessToken = this.generateAccessToken({
        did: decoded.did,
        sessionId: decoded.sessionId,
        exprsnUserId: decoded.exprsnUserId,
        handle: session.handle
      });

      logger.info('Session refreshed', {
        did: decoded.did,
        sessionId: decoded.sessionId
      });

      return {
        accessJwt: accessToken,
        refreshJwt: refreshToken,
        handle: session.handle,
        did: decoded.did
      };
    } catch (error) {
      logger.error('Failed to refresh session', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get session info
   */
  async getSessionInfo(accessToken) {
    try {
      // Verify access token
      const decoded = jwt.verify(accessToken, this.jwtSecret);

      // Check if session exists
      const session = await this.getSession(decoded.sessionId);

      if (!session) {
        throw new Error('Session not found or expired');
      }

      return {
        handle: decoded.handle,
        did: decoded.did,
        email: session.email
      };
    } catch (error) {
      logger.error('Failed to get session info', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Delete session (logout)
   */
  async deleteSession(accessToken) {
    try {
      // Verify access token
      const decoded = jwt.verify(accessToken, this.jwtSecret);

      // Delete session from Redis
      await this.removeSession(decoded.sessionId);

      logger.info('Session deleted', {
        did: decoded.did,
        sessionId: decoded.sessionId
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete session', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Validate access token
   */
  async validateToken(accessToken) {
    try {
      const decoded = jwt.verify(accessToken, this.jwtSecret);

      // Check if session exists
      const session = await this.getSession(decoded.sessionId);

      if (!session) {
        return null;
      }

      return {
        did: decoded.did,
        handle: decoded.handle,
        exprsnUserId: decoded.exprsnUserId,
        sessionId: decoded.sessionId
      };
    } catch (error) {
      return null;
    }
  }

  // Private methods

  generateAccessToken(payload) {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiry
    });
  }

  generateRefreshToken(payload) {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.refreshTokenExpiry
    });
  }

  async storeSession(sessionId, data) {
    const redis = getRedisClient();
    if (!redis) {
      throw new Error('Redis not available');
    }

    const key = `bluesky:session:${sessionId}`;
    const ttl = 30 * 24 * 60 * 60; // 30 days

    await redis.setEx(key, ttl, JSON.stringify(data));
  }

  async getSession(sessionId) {
    const redis = getRedisClient();
    if (!redis) {
      return null;
    }

    const key = `bluesky:session:${sessionId}`;
    const data = await redis.get(key);

    return data ? JSON.parse(data) : null;
  }

  async removeSession(sessionId) {
    const redis = getRedisClient();
    if (!redis) {
      return;
    }

    const key = `bluesky:session:${sessionId}`;
    await redis.del(key);
  }
}

module.exports = new SessionService();
