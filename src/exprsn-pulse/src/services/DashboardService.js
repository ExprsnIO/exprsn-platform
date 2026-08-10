/**
 * Dashboard Service
 * Manages dashboard creation, layout, and rendering
 */

const { Dashboard, DashboardItem, Visualization, Dataset } = require('../models');
const VisualizationService = require('./VisualizationService');
const logger = require('../utils/logger');

class DashboardService {
  /**
   * Create a new dashboard
   */
  static async create(data, userId) {
    try {
      const dashboard = await Dashboard.create({
        ...data,
        createdBy: userId
      });

      logger.info('Dashboard created', {
        dashboardId: dashboard.id,
        name: dashboard.name
      });

      return dashboard;
    } catch (error) {
      logger.error('Failed to create dashboard', { error: error.message });
      throw error;
    }
  }

  /**
   * Add item to dashboard
   */
  static async addItem(dashboardId, itemData, userId) {
    // Validate dashboard exists
    const dashboard = await Dashboard.findByPk(dashboardId);
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }

    // Validate visualization exists
    const visualization = await Visualization.findByPk(itemData.visualizationId);
    if (!visualization) {
      throw new Error('Visualization not found');
    }

    // Create dashboard item
    const item = await DashboardItem.create({
      dashboardId,
      visualizationId: itemData.visualizationId,
      position: itemData.position || { x: 0, y: 0, w: 4, h: 4 },
      title: itemData.title,
      showTitle: itemData.showTitle !== false,
      showBorder: itemData.showBorder !== false,
      backgroundColor: itemData.backgroundColor,
      order: itemData.order || 0,
      isLocked: itemData.isLocked || false,
      metadata: itemData.metadata || {}
    });

    // Update dashboard
    await dashboard.update({ updatedBy: userId });

    logger.info('Item added to dashboard', {
      dashboardId,
      itemId: item.id,
      visualizationId: itemData.visualizationId
    });

    return item;
  }

  /**
   * Update dashboard item position/config
   */
  static async updateItem(itemId, data, userId) {
    const item = await DashboardItem.findByPk(itemId, {
      include: [{ model: Dashboard, as: 'dashboard' }]
    });

    if (!item) {
      throw new Error('Dashboard item not found');
    }

    await item.update(data);

    // Update parent dashboard timestamp
    await item.dashboard.update({ updatedBy: userId });

    return item;
  }

  /**
   * Remove item from dashboard
   */
  static async removeItem(itemId, userId) {
    const item = await DashboardItem.findByPk(itemId, {
      include: [{ model: Dashboard, as: 'dashboard' }]
    });

    if (!item) {
      throw new Error('Dashboard item not found');
    }

    const dashboardId = item.dashboardId;
    await item.destroy();

    // Update parent dashboard
    const dashboard = await Dashboard.findByPk(dashboardId);
    if (dashboard) {
      await dashboard.update({ updatedBy: userId });
    }

    logger.info('Item removed from dashboard', { itemId, dashboardId });
  }

  /**
   * Get dashboard with all items and visualizations
   */
  static async getById(id, options = {}) {
    const dashboard = await Dashboard.findByPk(id, {
      include: [
        {
          model: DashboardItem,
          as: 'items',
          include: [
            {
              model: Visualization,
              as: 'visualization',
              include: options.includeData ? [{ model: Dataset, as: 'dataset' }] : []
            }
          ],
          order: [['order', 'ASC']]
        }
      ]
    });

    if (!dashboard) {
      throw new Error('Dashboard not found');
    }

    // Increment view count
    if (!options.skipViewTracking) {
      await dashboard.increment('viewCount');
      await dashboard.update({ lastViewedAt: new Date() });
    }

    return dashboard;
  }

  /**
   * Render entire dashboard with data
   */
  static async render(dashboardId, options = {}) {
    const dashboard = await this.getById(dashboardId, { includeData: true, skipViewTracking: options.skipViewTracking });

    // Render each visualization
    const renderedItems = await Promise.all(
      dashboard.items.map(async (item) => {
        try {
          const rendered = await VisualizationService.render(item.visualizationId, {
            autoRefresh: options.autoRefresh
          });

          return {
            id: item.id,
            position: item.position,
            title: item.title || item.visualization.name,
            showTitle: item.showTitle,
            showBorder: item.showBorder,
            backgroundColor: item.backgroundColor,
            visualization: rendered
          };
        } catch (error) {
          logger.error('Failed to render dashboard item', {
            itemId: item.id,
            visualizationId: item.visualizationId,
            error: error.message
          });

          return {
            id: item.id,
            position: item.position,
            title: item.title || 'Error',
            error: error.message
          };
        }
      })
    );

    return {
      dashboard: {
        id: dashboard.id,
        name: dashboard.name,
        description: dashboard.description,
        layout: dashboard.layout,
        theme: dashboard.theme,
        refreshInterval: dashboard.refreshInterval,
        isRealtime: dashboard.isRealtime
      },
      items: renderedItems,
      metadata: {
        renderedAt: new Date().toISOString(),
        itemCount: renderedItems.length
      }
    };
  }

  /**
   * List dashboards
   */
  static async list(filters = {}, pagination = {}) {
    const where = {};

    if (filters.category) where.category = filters.category;
    if (filters.isPublic !== undefined) where.isPublic = filters.isPublic;
    if (filters.isTemplate !== undefined) where.isTemplate = filters.isTemplate;
    if (filters.createdBy) where.createdBy = filters.createdBy;
    if (filters.tags && filters.tags.length > 0) {
      const { Op } = require('sequelize');
      where.tags = { [Op.overlap]: filters.tags };
    }

    const options = {
      where,
      order: [[filters.orderBy || 'createdAt', filters.orderDirection || 'DESC']],
      attributes: { exclude: filters.excludeMetadata ? ['metadata'] : [] }
    };

    if (pagination.limit) {
      options.limit = pagination.limit;
      options.offset = pagination.offset || 0;
    }

    const { rows, count } = await Dashboard.findAndCountAll(options);

    return {
      dashboards: rows,
      total: count,
      page: pagination.offset ? Math.floor(pagination.offset / pagination.limit) + 1 : 1,
      pages: pagination.limit ? Math.ceil(count / pagination.limit) : 1
    };
  }

  /**
   * Update dashboard
   */
  static async update(id, data, userId) {
    const dashboard = await Dashboard.findByPk(id);
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }

    await dashboard.update({
      ...data,
      updatedBy: userId
    });

    return dashboard;
  }

  /**
   * Delete dashboard
   */
  static async delete(id) {
    const dashboard = await Dashboard.findByPk(id);
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }

    await dashboard.destroy();
    logger.info('Dashboard deleted', { dashboardId: id });
  }

  /**
   * Clone dashboard
   */
  static async clone(id, userId, newName) {
    const original = await Dashboard.findByPk(id, {
      include: [
        {
          model: DashboardItem,
          as: 'items',
          include: [{ model: Visualization, as: 'visualization' }]
        }
      ]
    });

    if (!original) {
      throw new Error('Dashboard not found');
    }

    // Create new dashboard
    const cloned = await Dashboard.create({
      name: newName || `${original.name} (Copy)`,
      description: original.description,
      layout: original.layout,
      theme: original.theme,
      refreshInterval: original.refreshInterval,
      isRealtime: original.isRealtime,
      isPublic: false,
      isTemplate: false,
      category: original.category,
      tags: original.tags,
      createdBy: userId
    });

    // Clone all items
    for (const item of original.items) {
      await DashboardItem.create({
        dashboardId: cloned.id,
        visualizationId: item.visualizationId,
        position: item.position,
        title: item.title,
        showTitle: item.showTitle,
        showBorder: item.showBorder,
        backgroundColor: item.backgroundColor,
        order: item.order,
        isLocked: item.isLocked
      });
    }

    logger.info('Dashboard cloned', {
      originalId: id,
      clonedId: cloned.id,
      itemsCloned: original.items.length
    });

    return await this.getById(cloned.id);
  }

  /**
   * Create dashboard from template
   */
  static async createFromTemplate(templateId, userId, customization = {}) {
    const template = await Dashboard.findByPk(templateId, {
      include: [
        {
          model: DashboardItem,
          as: 'items',
          include: [{ model: Visualization, as: 'visualization' }]
        }
      ]
    });

    if (!template) {
      throw new Error('Template not found');
    }

    if (!template.isTemplate) {
      throw new Error('Dashboard is not a template');
    }

    const dashboard = await Dashboard.create({
      name: customization.name || template.name,
      description: customization.description || template.description,
      layout: customization.layout || template.layout,
      theme: customization.theme || template.theme,
      refreshInterval: customization.refreshInterval || template.refreshInterval,
      isRealtime: customization.isRealtime !== undefined ? customization.isRealtime : template.isRealtime,
      isPublic: false,
      isTemplate: false,
      category: customization.category || template.category,
      tags: customization.tags || template.tags,
      createdBy: userId,
      metadata: {
        templateId: templateId,
        ...customization.metadata
      }
    });

    // Clone items from template
    for (const item of template.items) {
      await DashboardItem.create({
        dashboardId: dashboard.id,
        visualizationId: item.visualizationId,
        position: item.position,
        title: item.title,
        showTitle: item.showTitle,
        showBorder: item.showBorder,
        backgroundColor: item.backgroundColor,
        order: item.order,
        isLocked: item.isLocked
      });
    }

    logger.info('Dashboard created from template', {
      templateId,
      dashboardId: dashboard.id
    });

    return await this.getById(dashboard.id);
  }

  /**
   * Get dashboard statistics
   */
  static async getStatistics(dashboardId) {
    const dashboard = await this.getById(dashboardId, { skipViewTracking: true });

    const stats = {
      itemCount: dashboard.items.length,
      visualizationTypes: {},
      lastUpdated: dashboard.updatedAt,
      viewCount: dashboard.viewCount,
      lastViewed: dashboard.lastViewedAt
    };

    // Count visualization types
    dashboard.items.forEach(item => {
      const type = item.visualization.type;
      stats.visualizationTypes[type] = (stats.visualizationTypes[type] || 0) + 1;
    });

    return stats;
  }

  /**
   * Reorder dashboard items
   */
  static async reorderItems(dashboardId, itemOrders, userId) {
    const dashboard = await Dashboard.findByPk(dashboardId);
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }

    // Update each item's order
    for (const { itemId, order } of itemOrders) {
      await DashboardItem.update(
        { order },
        { where: { id: itemId, dashboardId } }
      );
    }

    await dashboard.update({ updatedBy: userId });

    logger.info('Dashboard items reordered', { dashboardId, itemCount: itemOrders.length });
  }

  /**
   * Update dashboard layout
   */
  static async updateLayout(dashboardId, itemPositions, userId) {
    const dashboard = await Dashboard.findByPk(dashboardId);
    if (!dashboard) {
      throw new Error('Dashboard not found');
    }

    // Update each item's position
    for (const { itemId, position } of itemPositions) {
      await DashboardItem.update(
        { position },
        { where: { id: itemId, dashboardId } }
      );
    }

    await dashboard.update({ updatedBy: userId });

    logger.info('Dashboard layout updated', { dashboardId, itemCount: itemPositions.length });
  }
}

module.exports = DashboardService;
