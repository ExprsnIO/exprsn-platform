/**
 * ChartService - Chart Management Service
 * CRUD operations for chart visualizations
 */

const { Chart, Application } = require('../models');

class ChartService {
  /**
   * Get all charts for an application
   */
  static async getCharts(applicationId, options = {}) {
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

      const charts = await Chart.findAll({
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

      const total = await Chart.count({ where });

      return {
        success: true,
        data: charts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      };
    } catch (error) {
      console.error('Failed to get charts:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Get chart by ID
   */
  static async getChartById(chartId) {
    try {
      const chart = await Chart.findByPk(chartId, {
        include: [{
          model: Application,
          as: 'application',
          attributes: ['id', 'displayName']
        }]
      });

      if (!chart) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Chart not found'
        };
      }

      return {
        success: true,
        data: chart
      };
    } catch (error) {
      console.error('Failed to get chart:', error);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Create new chart
   */
  static async createChart(data, userId = null) {
    try {
      const chart = await Chart.create({
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
        data: chart,
        message: 'Chart created successfully'
      };
    } catch (error) {
      console.error('Failed to create chart:', error);
      return {
        success: false,
        error: 'CREATE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Update chart
   */
  static async updateChart(chartId, data, userId = null) {
    try {
      const chart = await Chart.findByPk(chartId);

      if (!chart) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Chart not found'
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
      if (data.status === 'published' && chart.status !== 'published') {
        updates.version = chart.version + 1;
      }

      await chart.update(updates);

      return {
        success: true,
        data: chart,
        message: 'Chart updated successfully'
      };
    } catch (error) {
      console.error('Failed to update chart:', error);
      return {
        success: false,
        error: 'UPDATE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Delete chart
   */
  static async deleteChart(chartId) {
    try {
      const chart = await Chart.findByPk(chartId);

      if (!chart) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Chart not found'
        };
      }

      await chart.destroy();

      return {
        success: true,
        message: 'Chart deleted successfully'
      };
    } catch (error) {
      console.error('Failed to delete chart:', error);
      return {
        success: false,
        error: 'DELETE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * Duplicate chart
   */
  static async duplicateChart(chartId, userId = null) {
    try {
      const original = await Chart.findByPk(chartId);

      if (!original) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: 'Chart not found'
        };
      }

      const duplicate = await Chart.create({
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
        message: 'Chart duplicated successfully'
      };
    } catch (error) {
      console.error('Failed to duplicate chart:', error);
      return {
        success: false,
        error: 'DUPLICATE_FAILED',
        message: error.message
      };
    }
  }
}

module.exports = ChartService;
