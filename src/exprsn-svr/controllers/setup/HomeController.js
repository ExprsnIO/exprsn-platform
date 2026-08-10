/**
 * ═══════════════════════════════════════════════════════════════════════
 * Home Dashboard Controller
 * ═══════════════════════════════════════════════════════════════════════
 * Handles the main administrative dashboard with customizable cards
 * PowerApps-inspired design with drag-and-drop card management
 * ═══════════════════════════════════════════════════════════════════════
 */

const logger = require('../../utils/logger');
const { DashboardCard } = require('../../models');
const ServiceHealthService = require('../../services/setup/ServiceHealthService');
const ActivityService = require('../../services/setup/ActivityService');
const AlertService = require('../../services/setup/AlertService');

/**
 * Default card configuration for new users
 */
const DEFAULT_CARDS = [
  {
    type: 'system_health',
    title: 'System Health',
    position: 0,
    size: '2x1',
    visible: true,
    config: { refreshInterval: 5000 }
  },
  {
    type: 'recent_activity',
    title: 'Recent Activity',
    position: 1,
    size: '2x2',
    visible: true,
    config: { limit: 10 }
  },
  {
    type: 'quick_actions',
    title: 'Quick Actions',
    position: 2,
    size: '1x1',
    visible: true,
    config: {}
  },
  {
    type: 'usage_analytics',
    title: 'Usage Analytics',
    position: 3,
    size: '2x1',
    visible: true,
    config: { period: '7d' }
  },
  {
    type: 'alerts',
    title: 'Active Alerts',
    position: 4,
    size: '1x2',
    visible: true,
    config: { showResolved: false }
  },
  {
    type: 'resource_utilization',
    title: 'Resource Utilization',
    position: 5,
    size: '1x1',
    visible: true,
    config: {}
  }
];

class HomeController {
  /**
   * GET /setup
   * Main home dashboard
   */
  async index(req, res) {
    try {
      const userId = req.user?.id || null;

      // Get or create user's card layout
      const cards = await this.getUserCards(userId);

      // Get dashboard data
      const [systemHealth, recentActivity, alerts, analytics] = await Promise.all([
        ServiceHealthService.getSystemHealth(),
        ActivityService.getRecentActivity({ limit: 10 }),
        AlertService.getActiveAlerts(),
        this.getUsageAnalytics()
      ]);

      res.render('setup/home', {
        title: 'Admin Dashboard',
        currentPath: req.path,
        user: req.user || null,
        cards,
        dashboardData: {
          systemHealth,
          recentActivity,
          alerts,
          analytics
        },
        config: {
          serviceName: process.env.SERVICE_NAME || 'exprsn-svr',
          socketIOEnabled: process.env.SOCKET_IO_ENABLED === 'true'
        }
      });
    } catch (error) {
      logger.error('Error loading home dashboard:', error);
      res.status(500).render('error', {
        message: 'Failed to load dashboard',
        error: process.env.NODE_ENV === 'development' ? error : {}
      });
    }
  }

  /**
   * GET /setup/api/home/cards
   * Get user's card layout
   */
  async getCards(req, res) {
    try {
      const userId = req.user?.id || null;
      const cards = await this.getUserCards(userId);

      res.json({
        success: true,
        cards
      });
    } catch (error) {
      logger.error('Error getting cards:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /setup/api/home/cards/layout
   * Save user's card layout
   */
  async saveCardLayout(req, res) {
    try {
      const userId = req.user?.id;
      const { cards } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      if (!Array.isArray(cards)) {
        return res.status(400).json({
          success: false,
          error: 'Cards must be an array'
        });
      }

      // Delete existing cards
      await DashboardCard.destroy({
        where: { userId }
      });

      // Create new cards
      const cardRecords = cards.map((card, index) => ({
        userId,
        cardType: card.type,
        title: card.title,
        position: card.position ?? index,
        size: card.size || '1x1',
        visible: card.visible !== false,
        config: card.config || {}
      }));

      await DashboardCard.bulkCreate(cardRecords);

      logger.info('Card layout saved', { userId, cardCount: cards.length });

      res.json({
        success: true,
        message: 'Card layout saved successfully'
      });
    } catch (error) {
      logger.error('Error saving card layout:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /setup/api/home/cards/reset
   * Reset to default card layout
   */
  async resetCardLayout(req, res) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      // Delete existing cards
      await DashboardCard.destroy({
        where: { userId }
      });

      // Create default cards
      const cardRecords = DEFAULT_CARDS.map(card => ({
        userId,
        cardType: card.type,
        title: card.title,
        position: card.position,
        size: card.size,
        visible: card.visible,
        config: card.config
      }));

      await DashboardCard.bulkCreate(cardRecords);

      logger.info('Card layout reset to defaults', { userId });

      res.json({
        success: true,
        message: 'Card layout reset to defaults',
        cards: DEFAULT_CARDS
      });
    } catch (error) {
      logger.error('Error resetting card layout:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /setup/api/home/dashboard-data
   * Get real-time dashboard data
   */
  async getDashboardData(req, res) {
    try {
      const { cards } = req.query;
      const requestedCards = cards ? cards.split(',') : [];

      const data = {};

      // Load data for requested cards
      if (requestedCards.length === 0 || requestedCards.includes('system_health')) {
        data.systemHealth = await ServiceHealthService.getSystemHealth();
      }

      if (requestedCards.length === 0 || requestedCards.includes('recent_activity')) {
        data.recentActivity = await ActivityService.getRecentActivity({ limit: 10 });
      }

      if (requestedCards.length === 0 || requestedCards.includes('alerts')) {
        data.alerts = await AlertService.getActiveAlerts();
      }

      if (requestedCards.length === 0 || requestedCards.includes('usage_analytics')) {
        data.analytics = await this.getUsageAnalytics();
      }

      if (requestedCards.length === 0 || requestedCards.includes('resource_utilization')) {
        data.resources = await this.getResourceUtilization();
      }

      res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error getting dashboard data:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * Helper: Get user's cards or create defaults
   */
  async getUserCards(userId) {
    if (!userId) {
      return DEFAULT_CARDS;
    }

    let cards = await DashboardCard.findAll({
      where: { userId },
      order: [['position', 'ASC']]
    });

    // If no cards exist, create defaults
    if (cards.length === 0) {
      const cardRecords = DEFAULT_CARDS.map(card => ({
        userId,
        cardType: card.type,
        title: card.title,
        position: card.position,
        size: card.size,
        visible: card.visible,
        config: card.config
      }));

      cards = await DashboardCard.bulkCreate(cardRecords);
    }

    return cards.map(card => ({
      id: card.id,
      type: card.cardType,
      title: card.title,
      position: card.position,
      size: card.size,
      visible: card.visible,
      config: card.config
    }));
  }

  /**
   * Helper: Get usage analytics
   */
  async getUsageAnalytics() {
    // TODO: Implement actual analytics
    // For now, return mock data
    return {
      totalApps: 12,
      activeUsers: 48,
      apiCalls: 15234,
      storageUsed: '2.4 GB',
      period: '7d'
    };
  }

  /**
   * Helper: Get resource utilization
   */
  async getResourceUtilization() {
    const used = process.memoryUsage();
    const total = require('os').totalmem();
    const free = require('os').freemem();

    return {
      memory: {
        used: Math.round(used.heapUsed / 1024 / 1024),
        total: Math.round(used.heapTotal / 1024 / 1024),
        percentage: Math.round((used.heapUsed / used.heapTotal) * 100)
      },
      system: {
        used: Math.round((total - free) / 1024 / 1024),
        total: Math.round(total / 1024 / 1024),
        percentage: Math.round(((total - free) / total) * 100)
      },
      uptime: Math.round(process.uptime())
    };
  }
}

module.exports = new HomeController();
