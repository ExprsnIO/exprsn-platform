/**
 * Admin Controller
 * Handles administrative dashboard and management operations
 */

const database = require('../config/database');
const redis = require('../config/redis');
const logger = require('../utils/logger');
const { sanitizeUser } = require('../middleware/validation');

/**
 * Render admin dashboard
 */
async function renderDashboard(req, res) {
  try {
    // Get statistics
    const stats = await getDashboardStats();

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      user: req.auth.user,
      stats,
      activeTab: 'dashboard',
    });
  } catch (error) {
    logger.error('Dashboard render failed', {
      error: error.message,
      requestId: req.requestId,
    });
    res.status(500).render('error', {
      error: 'Failed to load dashboard',
      message: error.message,
    });
  }
}

/**
 * Get dashboard statistics
 */
async function getDashboardStats() {
  // Users stats
  const usersTotal = await database.query('SELECT COUNT(*) FROM users');
  const usersActive = await database.query("SELECT COUNT(*) FROM users WHERE status = 'active'");
  const usersSuspended = await database.query("SELECT COUNT(*) FROM users WHERE status = 'suspended'");
  const usersRecent = await database.query("SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '24 hours'");

  // Certificates stats
  const certsTotal = await database.query('SELECT COUNT(*) FROM certificates');
  const certsActive = await database.query("SELECT COUNT(*) FROM certificates WHERE status = 'active'");
  const certsRevoked = await database.query("SELECT COUNT(*) FROM certificates WHERE status = 'revoked'");
  const certsExpiring = await database.query("SELECT COUNT(*) FROM certificates WHERE expires_at < NOW() + INTERVAL '30 days' AND status = 'active'");

  // Tokens stats
  const tokensTotal = await database.query('SELECT COUNT(*) FROM tokens');
  const tokensActive = await database.query("SELECT COUNT(*) FROM tokens WHERE status = 'active' AND (expires_at IS NULL OR expires_at > NOW())");
  const tokensExpired = await database.query("SELECT COUNT(*) FROM tokens WHERE status = 'expired' OR (status = 'active' AND expires_at < NOW())");
  const tokensRecent = await database.query("SELECT COUNT(*) FROM tokens WHERE created_at > NOW() - INTERVAL '24 hours'");

  // Webhooks stats
  const webhooksTotal = await database.query('SELECT COUNT(*) FROM webhooks');
  const webhooksActive = await database.query("SELECT COUNT(*) FROM webhooks WHERE status = 'active'");
  const webhookDeliveriesTotal = await database.query('SELECT COUNT(*) FROM webhook_deliveries');
  const webhookDeliveriesFailed = await database.query("SELECT COUNT(*) FROM webhook_deliveries WHERE status = 'failed'");

  return {
    users: {
      total: parseInt(usersTotal.rows[0].count),
      active: parseInt(usersActive.rows[0].count),
      suspended: parseInt(usersSuspended.rows[0].count),
      recent: parseInt(usersRecent.rows[0].count),
    },
    certificates: {
      total: parseInt(certsTotal.rows[0].count),
      active: parseInt(certsActive.rows[0].count),
      revoked: parseInt(certsRevoked.rows[0].count),
      expiring: parseInt(certsExpiring.rows[0].count),
    },
    tokens: {
      total: parseInt(tokensTotal.rows[0].count),
      active: parseInt(tokensActive.rows[0].count),
      expired: parseInt(tokensExpired.rows[0].count),
      recent: parseInt(tokensRecent.rows[0].count),
    },
    webhooks: {
      total: parseInt(webhooksTotal.rows[0].count),
      active: parseInt(webhooksActive.rows[0].count),
      deliveries: parseInt(webhookDeliveriesTotal.rows[0].count),
      failed: parseInt(webhookDeliveriesFailed.rows[0].count),
    },
  };
}

/**
 * Render users list page
 */
async function renderUsersList(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;

    res.render('admin/users-list', {
      title: 'User Management',
      user: req.auth.user,
      activeTab: 'users',
      page,
      limit,
      status,
    });
  } catch (error) {
    logger.error('Users list render failed', {
      error: error.message,
      requestId: req.requestId,
    });
    res.status(500).render('error', {
      error: 'Failed to load users list',
      message: error.message,
    });
  }
}

/**
 * Render user details page
 */
async function renderUserDetails(req, res) {
  try {
    const { id } = req.params;

    const result = await database.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    if (!result || result.rowCount === 0) {
      return res.status(404).render('error', {
        error: 'User not found',
        message: `No user found with ID: ${id}`,
      });
    }

    const user = result.rows[0];

    // Get user's certificates
    const certs = await database.query(
      'SELECT * FROM certificates WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      [id]
    );

    // Get user's tokens
    const tokens = await database.query(
      'SELECT * FROM tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
      [id]
    );

    res.render('admin/user-details', {
      title: `User: ${user.email}`,
      user: req.auth.user,
      targetUser: sanitizeUser(user),
      certificates: certs.rows,
      tokens: tokens.rows,
      activeTab: 'users',
    });
  } catch (error) {
    logger.error('User details render failed', {
      error: error.message,
      userId: req.params.id,
      requestId: req.requestId,
    });
    res.status(500).render('error', {
      error: 'Failed to load user details',
      message: error.message,
    });
  }
}

/**
 * Render certificates list page
 */
async function renderCertificatesList(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;

    res.render('admin/certificates-list', {
      title: 'Certificate Management',
      user: req.auth.user,
      activeTab: 'certificates',
      page,
      limit,
      status,
    });
  } catch (error) {
    logger.error('Certificates list render failed', {
      error: error.message,
      requestId: req.requestId,
    });
    res.status(500).render('error', {
      error: 'Failed to load certificates list',
      message: error.message,
    });
  }
}

/**
 * Render certificate details page
 */
async function renderCertificateDetails(req, res) {
  try {
    const { id } = req.params;

    const result = await database.query(
      `SELECT c.*, u.email as user_email, u.display_name as user_name
       FROM certificates c
       LEFT JOIN users u ON c.user_id = u.id
       WHERE c.id = $1`,
      [id]
    );

    if (!result || result.rowCount === 0) {
      return res.status(404).render('error', {
        error: 'Certificate not found',
        message: `No certificate found with ID: ${id}`,
      });
    }

    const certificate = result.rows[0];

    res.render('admin/certificate-details', {
      title: `Certificate: ${certificate.serial_number}`,
      user: req.auth.user,
      certificate,
      activeTab: 'certificates',
    });
  } catch (error) {
    logger.error('Certificate details render failed', {
      error: error.message,
      certificateId: req.params.id,
      requestId: req.requestId,
    });
    res.status(500).render('error', {
      error: 'Failed to load certificate details',
      message: error.message,
    });
  }
}

/**
 * Render tokens list page
 */
async function renderTokensList(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;

    res.render('admin/tokens-list', {
      title: 'Token Management',
      user: req.auth.user,
      activeTab: 'tokens',
      page,
      limit,
      status,
    });
  } catch (error) {
    logger.error('Tokens list render failed', {
      error: error.message,
      requestId: req.requestId,
    });
    res.status(500).render('error', {
      error: 'Failed to load tokens list',
      message: error.message,
    });
  }
}

/**
 * Render token details page
 */
async function renderTokenDetails(req, res) {
  try {
    const { id } = req.params;

    const result = await database.query(
      `SELECT t.*, u.email as user_email, u.display_name as user_name
       FROM tokens t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.id = $1`,
      [id]
    );

    if (!result || result.rowCount === 0) {
      return res.status(404).render('error', {
        error: 'Token not found',
        message: `No token found with ID: ${id}`,
      });
    }

    const token = result.rows[0];

    res.render('admin/token-details', {
      title: `Token: ${token.handle}`,
      user: req.auth.user,
      token,
      activeTab: 'tokens',
    });
  } catch (error) {
    logger.error('Token details render failed', {
      error: error.message,
      tokenId: req.params.id,
      requestId: req.requestId,
    });
    res.status(500).render('error', {
      error: 'Failed to load token details',
      message: error.message,
    });
  }
}

/**
 * Render webhooks list page
 */
async function renderWebhooksList(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;

    res.render('admin/webhooks-list', {
      title: 'Webhook Management',
      user: req.auth.user,
      activeTab: 'webhooks',
      page,
      limit,
      status,
    });
  } catch (error) {
    logger.error('Webhooks list render failed', {
      error: error.message,
      requestId: req.requestId,
    });
    res.status(500).render('error', {
      error: 'Failed to load webhooks list',
      message: error.message,
    });
  }
}

/**
 * API: Get dashboard statistics
 */
async function getStats(req, res) {
  try {
    const stats = await getDashboardStats();
    res.json({
      stats,
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get stats failed', {
      error: error.message,
      requestId: req.requestId,
    });
    res.status(500).json({
      error: {
        code: 'GET_STATS_FAILED',
        message: 'Failed to retrieve statistics',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * API: Get users list
 */
async function getUsers(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = 'SELECT * FROM users';
    const params = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    // Get total count
    const countQuery = status
      ? 'SELECT COUNT(*) FROM users WHERE status = $1'
      : 'SELECT COUNT(*) FROM users';
    const countParams = status ? [status] : [];
    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      users: result.rows.map(sanitizeUser),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get users failed', {
      error: error.message,
      requestId: req.requestId,
    });
    res.status(500).json({
      error: {
        code: 'GET_USERS_FAILED',
        message: 'Failed to retrieve users',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * API: Get certificates list
 */
async function getCertificates(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = `
      SELECT c.*, u.email as user_email, u.display_name as user_name
      FROM certificates c
      LEFT JOIN users u ON c.user_id = u.id
    `;
    const params = [];

    if (status) {
      query += ' WHERE c.status = $1';
      params.push(status);
    }

    query += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    // Get total count
    const countQuery = status
      ? 'SELECT COUNT(*) FROM certificates WHERE status = $1'
      : 'SELECT COUNT(*) FROM certificates';
    const countParams = status ? [status] : [];
    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      certificates: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get certificates failed', {
      error: error.message,
      requestId: req.requestId,
    });
    res.status(500).json({
      error: {
        code: 'GET_CERTIFICATES_FAILED',
        message: 'Failed to retrieve certificates',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * API: Get tokens list
 */
async function getTokens(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = `
      SELECT t.*, u.email as user_email, u.display_name as user_name
      FROM tokens t
      LEFT JOIN users u ON t.user_id = u.id
    `;
    const params = [];

    if (status) {
      query += ' WHERE t.status = $1';
      params.push(status);
    }

    query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    // Get total count
    const countQuery = status
      ? 'SELECT COUNT(*) FROM tokens WHERE status = $1'
      : 'SELECT COUNT(*) FROM tokens';
    const countParams = status ? [status] : [];
    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      tokens: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get tokens failed', {
      error: error.message,
      requestId: req.requestId,
    });
    res.status(500).json({
      error: {
        code: 'GET_TOKENS_FAILED',
        message: 'Failed to retrieve tokens',
        requestId: req.requestId,
      },
    });
  }
}

/**
 * API: Get webhooks list
 */
async function getWebhooks(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = 'SELECT * FROM webhooks';
    const params = [];

    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await database.query(query, params);

    // Get total count
    const countQuery = status
      ? 'SELECT COUNT(*) FROM webhooks WHERE status = $1'
      : 'SELECT COUNT(*) FROM webhooks';
    const countParams = status ? [status] : [];
    const countResult = await database.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      webhooks: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      requestId: req.requestId,
    });
  } catch (error) {
    logger.error('Get webhooks failed', {
      error: error.message,
      requestId: req.requestId,
    });
    res.status(500).json({
      error: {
        code: 'GET_WEBHOOKS_FAILED',
        message: 'Failed to retrieve webhooks',
        requestId: req.requestId,
      },
    });
  }
}

module.exports = {
  // View renderers
  renderDashboard,
  renderUsersList,
  renderUserDetails,
  renderCertificatesList,
  renderCertificateDetails,
  renderTokensList,
  renderTokenDetails,
  renderWebhooksList,

  // API endpoints
  getStats,
  getUsers,
  getCertificates,
  getTokens,
  getWebhooks,
};
