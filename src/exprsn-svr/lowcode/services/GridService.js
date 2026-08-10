/**
 * Grid Service
 *
 * Business logic for grid management in the low-code platform.
 * Handles data grids and subgrids with columns, filtering, sorting, and inline editing.
 */

const { Op } = require('sequelize');
const { Grid, Application } = require('../models');

class GridService {
  /**
   * List grids with pagination and filtering
   */
  async listGrids(options = {}) {
    const {
      applicationId,
      type,
      entityId,
      limit = 25,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      search
    } = options;

    const where = {};

    if (applicationId) {
      where.applicationId = applicationId;
    }

    if (type) {
      where.type = type;
    }

    if (entityId) {
      where.entityId = entityId;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { displayName: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Grid.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName']
        }
      ]
    });

    return {
      total: count,
      grids: rows,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Get grid by ID
   */
  async getGridById(gridId) {
    const grid = await Grid.findByPk(gridId, {
      include: [
        {
          model: Application,
          as: 'application',
          attributes: ['id', 'name', 'displayName', 'status']
        }
      ]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    return grid;
  }

  /**
   * Create new grid
   */
  async createGrid(data, userId) {
    const { applicationId, name, displayName } = data;

    // Verify application exists and user has access
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error('Application not found');
    }

    if (application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    // Check for duplicate grid name within application
    const existing = await Grid.findOne({
      where: {
        applicationId,
        name
      }
    });

    if (existing) {
      throw new Error(`Grid with name "${name}" already exists in this application`);
    }

    // Create grid with defaults
    const grid = await Grid.create({
      applicationId,
      name,
      displayName: displayName || name,
      description: data.description || '',
      type: data.type || 'main',
      entityId: data.entityId || null,
      columns: data.columns || [],
      settings: {
        pageSize: data.settings?.pageSize || 25,
        allowPaging: data.settings?.allowPaging !== false,
        allowSorting: data.settings?.allowSorting !== false,
        allowFiltering: data.settings?.allowFiltering !== false,
        allowExport: data.settings?.allowExport !== false,
        allowInlineEdit: data.settings?.allowInlineEdit || false,
        allowRowSelection: data.settings?.allowRowSelection !== false,
        showToolbar: data.settings?.showToolbar !== false,
        showSearchBox: data.settings?.showSearchBox !== false,
        showColumnChooser: data.settings?.showColumnChooser || false,
        alternateRowColor: data.settings?.alternateRowColor || false,
        ...data.settings
      },
      filters: data.filters || [],
      sortOrders: data.sortOrders || [],
      events: data.events || {}
    });

    return grid;
  }

  /**
   * Update grid
   */
  async updateGrid(gridId, data, userId) {
    const grid = await Grid.findByPk(gridId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    if (grid.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Update allowed fields
    const allowedFields = [
      'name',
      'displayName',
      'description',
      'type',
      'entityId',
      'columns',
      'settings',
      'filters',
      'sortOrders',
      'events'
    ];

    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        grid[field] = data[field];
      }
    });

    await grid.save();
    return grid;
  }

  /**
   * Delete grid (soft delete)
   */
  async deleteGrid(gridId, userId) {
    const grid = await Grid.findByPk(gridId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    if (grid.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Soft delete
    await grid.destroy();

    return { success: true, message: 'Grid deleted successfully' };
  }

  /**
   * Duplicate grid
   */
  async duplicateGrid(gridId, userId, newName = null) {
    const grid = await Grid.findByPk(gridId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    if (grid.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    const duplicate = await Grid.create({
      applicationId: grid.applicationId,
      name: newName || `${grid.name}_copy`,
      displayName: `${grid.displayName} (Copy)`,
      description: grid.description,
      type: grid.type,
      entityId: grid.entityId,
      columns: JSON.parse(JSON.stringify(grid.columns)),
      settings: JSON.parse(JSON.stringify(grid.settings)),
      filters: JSON.parse(JSON.stringify(grid.filters)),
      sortOrders: JSON.parse(JSON.stringify(grid.sortOrders)),
      events: JSON.parse(JSON.stringify(grid.events))
    });

    return duplicate;
  }

  /**
   * Add column to grid
   */
  async addColumn(gridId, columnData, userId) {
    const grid = await Grid.findByPk(gridId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    if (grid.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Check for duplicate column name
    const exists = grid.columns.find(c => c.name === columnData.name);
    if (exists) {
      throw new Error(`Column "${columnData.name}" already exists`);
    }

    // Add column
    grid.addColumn(columnData);
    await grid.save();

    return grid;
  }

  /**
   * Update column in grid
   */
  async updateColumn(gridId, columnName, columnData, userId) {
    const grid = await Grid.findByPk(gridId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    if (grid.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Update column
    grid.updateColumn(columnName, columnData);
    await grid.save();

    return grid;
  }

  /**
   * Remove column from grid
   */
  async removeColumn(gridId, columnName, userId) {
    const grid = await Grid.findByPk(gridId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    if (grid.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Remove column
    grid.removeColumn(columnName);
    await grid.save();

    return grid;
  }

  /**
   * Reorder columns in grid
   */
  async reorderColumns(gridId, columnNames, userId) {
    const grid = await Grid.findByPk(gridId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    if (grid.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Validate all column names exist
    const currentColumnNames = grid.columns.map(c => c.name);
    const invalidNames = columnNames.filter(name => !currentColumnNames.includes(name));

    if (invalidNames.length > 0) {
      throw new Error(`Invalid column names: ${invalidNames.join(', ')}`);
    }

    // Reorder columns
    const reordered = columnNames.map(name =>
      grid.columns.find(c => c.name === name)
    );

    grid.columns = reordered;
    grid.changed('columns', true);
    await grid.save();

    return grid;
  }

  /**
   * Add filter to grid
   */
  async addFilter(gridId, filterData, userId) {
    const grid = await Grid.findByPk(gridId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    if (grid.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Add filter
    grid.addFilter(filterData);
    await grid.save();

    return grid;
  }

  /**
   * Remove filter from grid
   */
  async removeFilter(gridId, filterId, userId) {
    const grid = await Grid.findByPk(gridId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    if (grid.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Remove filter
    grid.filters = grid.filters.filter(f => f.id !== filterId);
    grid.changed('filters', true);
    await grid.save();

    return grid;
  }

  /**
   * Update grid settings
   */
  async updateSettings(gridId, settings, userId) {
    const grid = await Grid.findByPk(gridId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    if (grid.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Merge settings
    grid.settings = {
      ...grid.settings,
      ...settings
    };

    grid.changed('settings', true);
    await grid.save();

    return grid;
  }

  /**
   * Get grid data (with filtering, sorting, pagination)
   */
  async getGridData(gridId, options = {}) {
    const grid = await this.getGridById(gridId);

    if (!grid.entityId) {
      throw new Error('Grid is not bound to an entity');
    }

    const {
      page = 1,
      pageSize = grid.settings.pageSize || 25,
      sortBy = null,
      sortOrder = 'ASC',
      filters = {}
    } = options;

    // Calculate offset
    const offset = (page - 1) * pageSize;

    // Build query
    const where = {};

    // Apply filters
    Object.keys(filters).forEach(field => {
      const value = filters[field];

      if (Array.isArray(value)) {
        // IN operator
        where[field] = { [Op.in]: value };
      } else if (typeof value === 'object' && value !== null) {
        // Complex filter (e.g., { $gte: 100 })
        where[field] = value;
      } else {
        // Exact match
        where[field] = value;
      }
    });

    // Apply grid's default filters
    if (grid.filters && grid.filters.length > 0) {
      grid.filters.forEach(filter => {
        if (filter.field && filter.operator && filter.value !== undefined) {
          const operator = this.getSequelizeOperator(filter.operator);
          where[filter.field] = { [operator]: filter.value };
        }
      });
    }

    // This would query the actual entity data
    // For now, return mock structure
    return {
      data: [],
      total: 0,
      page,
      pageSize,
      totalPages: 0,
      hasMore: false,
      grid: {
        id: grid.id,
        name: grid.name,
        columns: grid.columns,
        settings: grid.settings
      }
    };
  }

  /**
   * Get Sequelize operator from string
   */
  getSequelizeOperator(operator) {
    const operatorMap = {
      'eq': Op.eq,
      'ne': Op.ne,
      'gt': Op.gt,
      'gte': Op.gte,
      'lt': Op.lt,
      'lte': Op.lte,
      'like': Op.like,
      'iLike': Op.iLike,
      'in': Op.in,
      'notIn': Op.notIn,
      'between': Op.between,
      'contains': Op.contains,
      'startsWith': Op.startsWith,
      'endsWith': Op.endsWith
    };

    return operatorMap[operator] || Op.eq;
  }

  /**
   * Export grid data
   */
  async exportGridData(gridId, format = 'csv', options = {}) {
    const gridData = await this.getGridData(gridId, {
      ...options,
      page: 1,
      pageSize: 10000 // Export all data
    });

    // This would format data based on format (CSV, Excel, JSON)
    // For now, return structure
    return {
      success: true,
      format,
      columns: gridData.grid.columns,
      data: gridData.data,
      total: gridData.total
    };
  }

  /**
   * Get grid statistics
   */
  async getGridStats(gridId, userId) {
    const grid = await Grid.findByPk(gridId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!grid) {
      throw new Error('Grid not found');
    }

    if (grid.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    return {
      id: grid.id,
      name: grid.name,
      type: grid.type,
      columnCount: grid.columns.length,
      filterCount: grid.filters.length,
      hasEntity: !!grid.entityId,
      settings: grid.settings,
      createdAt: grid.createdAt,
      updatedAt: grid.updatedAt
    };
  }
}

module.exports = new GridService();
