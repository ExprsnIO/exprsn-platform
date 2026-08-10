/**
 * DashboardService - Dashboard Management Service
 * CRUD operations for dashboards
 */

const { Dashboard, Application } = require('../models');

class DashboardService {
  /**
   * Get all dashboards for an application
   */
  static async getDashboards(applicationId, options = {}) {
    try {
      const {
        status,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = options;

      const where = { applicationId };
      if (status) {
        where.status = status;
      }

      const dashboards = await Dashboard.findAll({
        where,
        order: [[sortBy, sortOrder]],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        include: [{
          model: Application,
          as: 'application',
          attributes: ['id', 'displayName']
        }]
      });

      const total = await Dashboard.count({ where });

      return {
        success: true,
        data: dashboards,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      };
    } catch (error) {
      console.error('Failed to get dashboards:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Get dashboard by ID
   */
  static async getDashboardById(dashboardId) {
    try {
      const dashboard = await Dashboard.findByPk(dashboardId, {
        include: [{
          model: Application,
          as: 'application',
          attributes: ['id', 'displayName']
        }]
      });

      if (!dashboard) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Dashboard not found'
        };
      }

      return {
        success: true,
        data: dashboard
      };
    } catch (error) {
      console.error('Failed to get dashboard:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Create new dashboard
   */
  static async createDashboard(data, userId = null) {
    try {
      const dashboard = await Dashboard.create({
        displayName: data.displayName,
        description: data.description,
        applicationId: data.applicationId,
        status: data.status || 'draft',
        config: data.config || {},
        createdBy: userId,
        modifiedBy: userId
      });

      return {
        success: true,
        data: dashboard,
        message: 'Dashboard created successfully'
      };
    } catch (error) {
      console.error('Failed to create dashboard:', error);
      return {
        success: false,
        error: 'CREATE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Update dashboard
   */
  static async updateDashboard(dashboardId, data, userId = null) {
    try {
      const dashboard = await Dashboard.findByPk(dashboardId);

      if (!dashboard) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Dashboard not found'
        };
      }

      const updates = {
        modifiedBy: userId
      };

      if (data.displayName !== undefined) updates.displayName = data.displayName;
      if (data.description !== undefined) updates.description = data.description;
      if (data.status !== undefined) updates.status = data.status;
      if (data.config !== undefined) updates.config = data.config;

      // Increment version on publish
      if (data.status === 'published' && dashboard.status !== 'published') {
        updates.version = dashboard.version + 1;
      }

      await dashboard.update(updates);

      return {
        success: true,
        data: dashboard,
        message: 'Dashboard updated successfully'
      };
    } catch (error) {
      console.error('Failed to update dashboard:', error);
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Delete dashboard
   */
  static async deleteDashboard(dashboardId) {
    try {
      const dashboard = await Dashboard.findByPk(dashboardId);

      if (!dashboard) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Dashboard not found'
        };
      }

      await dashboard.destroy();

      return {
        success: true,
        message: 'Dashboard deleted successfully'
      };
    } catch (error) {
      console.error('Failed to delete dashboard:', error);
      return {
        success: false,
        error: 'DELETE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Duplicate dashboard
   */
  static async duplicateDashboard(dashboardId, userId = null) {
    try {
      const original = await Dashboard.findByPk(dashboardId);

      if (!original) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Dashboard not found'
        };
      }

      const duplicate = await Dashboard.create({
        displayName: `${original.displayName} (Copy)`,
        description: original.description,
        applicationId: original.applicationId,
        status: 'draft',
        config: original.config,
        createdBy: userId,
        modifiedBy: userId
      });

      return {
        success: true,
        data: duplicate,
        message: 'Dashboard duplicated successfully'
      };
    } catch (error) {
      console.error('Failed to duplicate dashboard:', error);
      return {
        success: false,
        error: 'DUPLICATE_FAILED',
        message: error.message
      };
    }
  }
}

module.exports = DashboardService;
