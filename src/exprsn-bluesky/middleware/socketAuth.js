const jwt = require('jsonwebtoken');
const { logger } = require('@exprsn/shared');
const { Account } = require('../models');

async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
      // Allow anonymous connections but with limited access
      socket.user = null;
      return next();
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // Load account
    const account = await Account.findOne({
      where: { exprsnUserId: decoded.userId },
      attributes: ['id', 'did', 'handle', 'displayName', 'status']
    });

    if (!account || account.status !== 'active') {
      return next(new Error('Invalid or inactive account'));
    }

    socket.user = {
      id: account.id,
      did: account.did,
      handle: account.handle,
      displayName: account.displayName,
      exprsnUserId: decoded.userId
    };

    next();
  } catch (error) {
    logger.error('Socket authentication failed', {
      error: error.message
    });
    next(new Error('Authentication failed'));
  }
}

module.exports = { authenticateSocket };
