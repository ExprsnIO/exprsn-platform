/**
 * Application Service
 *
 * Business logic for application management.
 * Handles CRUD operations and application lifecycle management.
 */

const { Application, Entity, AppForm, Grid, DataSource } = require('../models');
const { Op } = require('sequelize');

class ApplicationService {
  /**
   * List applications with pagination and filtering
   */
  async listApplications(options = {}) {
    const {
      ownerId,
      status,
      limit = 25,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      search,
    } = options;

    const where = {};

    if (ownerId) {
      where.ownerId = ownerId;
    }

    if (status) {
      where.status = status;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { displayName: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Application.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      attributes: [
        'id',
        'name',
        'displayName',
        'description',
        'version',
        'status',
        'ownerId',
        'icon',
        'color',
        'publishedVersion',
        'publishedAt',
        'createdAt',
        'updatedAt',
      ],
    });

    return {
      total: count,
      applications: rows,
      limit,
      offset,
      hasMore: offset + limit < count,
    };
  }

  /**
   * Get application by ID with optional related data
   */
  async getApplicationById(id, options = {}) {
    const { includeEntities, includeForms, includeDataSources, includeGrids } = options;

    const include = [];

    if (includeEntities) {
      include.push({
        model: Entity,
        as: 'entities',
        attributes: ['id', 'name', 'displayName', 'sourceType', 'createdAt'],
      });
    }

    if (includeForms) {
      include.push({
        model: AppForm,
        as: 'forms',
        attributes: ['id', 'name', 'displayName', 'formType', 'status', 'createdAt'],
      });
    }

    if (includeGrids) {
      include.push({
        model: Grid,
        as: 'grids',
        attributes: ['id', 'name', 'displayName', 'status', 'createdAt'],
      });
    }

    if (includeDataSources) {
      include.push({
        model: DataSource,
        as: 'dataSources',
        attributes: ['id', 'name', 'displayName', 'sourceType', 'status', 'createdAt'],
      });
    }

    const application = await Application.findByPk(id, {
      include: include.length > 0 ? include : undefined,
    });

    if (!application) {
      throw new Error('Application not found');
    }

    return application;
  }

  /**
   * Create new application
   */
  async createApplication(data, userId) {
    const {
      name,
      displayName,
      description,
      version,
      status,
      icon,
      color,
      settings,
      metadata,
      gitRepository,
      gitBranch,
    } = data;

    // Validate name is unique for this user
    const existing = await Application.findOne({
      where: {
        name,
        ownerId: userId,
      },
    });

    if (existing) {
      throw new Error(`Application with name "${name}" already exists`);
    }

    const application = await Application.create({
      name,
      displayName: displayName || name,
      description,
      ownerId: userId,
      icon,
      color,
      settings: settings || {},
      metadata: metadata || {},
      gitRepository,
      gitBranch: gitBranch || 'main',
      status: status || 'draft',
      version: version || '1.0.0',
    });

    return application;
  }

  /**
   * Clone existing application with selective copying
   */
  async cloneApplication(sourceId, options, userId) {
    const { name, displayName, description, version, cloneOptions, overrides } = options;

    // Get source application with all related data
    const sourceApp = await Application.findByPk(sourceId, {
      include: [
        { model: Entity, as: 'entities' },
        { model: AppForm, as: 'forms' },
        { model: Grid, as: 'grids' },
        { model: DataSource, as: 'dataSources' },
      ],
    });

    if (!sourceApp) {
      throw new Error('Source application not found');
    }

    // Check authorization - user must own source app or it must be public
    if (sourceApp.ownerId !== userId && sourceApp.settings?.security?.visibility !== 'public') {
      throw new Error('Unauthorized: Cannot clone this application');
    }

    // Validate new name is unique
    const existing = await Application.findOne({
      where: {
        name,
        ownerId: userId,
      },
    });

    if (existing) {
      throw new Error(`Application with name "${name}" already exists`);
    }

    // Start transaction for atomic cloning
    const sequelize = Application.sequelize;
    const transaction = await sequelize.transaction();

    try {
      // Create new application with merged settings
      const newApp = await Application.create({
        name,
        displayName: displayName || `${sourceApp.displayName} (Clone)`,
        description: description || sourceApp.description,
        version: version || '1.0.0',
        ownerId: userId,
        icon: overrides?.icon || sourceApp.icon,
        color: overrides?.color || sourceApp.color,
        status: overrides?.status || 'draft',
        settings: {
          ...sourceApp.settings,
          ...(overrides?.settings || {}),
          clonedFrom: {
            applicationId: sourceApp.id,
            applicationName: sourceApp.name,
            clonedAt: new Date().toISOString(),
          },
        },
        metadata: {
          ...sourceApp.metadata,
          ...(overrides?.metadata || {}),
          cloneOptions,
        },
        gitRepository: overrides?.gitRepository || null,
        gitBranch: overrides?.gitBranch || 'main',
      }, { transaction });

      // Clone entities if requested
      if (cloneOptions?.entities && sourceApp.entities) {
        for (const entity of sourceApp.entities) {
          await Entity.create({
            applicationId: newApp.id,
            name: entity.name,
            displayName: entity.displayName,
            description: entity.description,
            sourceType: entity.sourceType,
            schema: entity.schema,
            settings: entity.settings,
            metadata: {
              ...entity.metadata,
              clonedFrom: entity.id,
            },
          }, { transaction });
        }
      }

      // Clone forms if requested
      if (cloneOptions?.forms && sourceApp.forms) {
        for (const form of sourceApp.forms) {
          await AppForm.create({
            applicationId: newApp.id,
            name: `${form.name}_clone`,
            displayName: form.displayName,
            description: form.description,
            formType: form.formType,
            entityId: form.entityId,
            layout: form.layout,
            components: form.components,
            validationRules: form.validationRules,
            theme: form.theme,
            settings: form.settings,
            status: 'draft',
            version: '1.0.0',
            metadata: {
              ...form.metadata,
              clonedFrom: form.id,
            },
          }, { transaction });
        }
      }

      // Clone grids if requested
      if (cloneOptions?.grids && sourceApp.grids) {
        for (const grid of sourceApp.grids) {
          await Grid.create({
            applicationId: newApp.id,
            name: `${grid.name}_clone`,
            displayName: grid.displayName,
            description: grid.description,
            entityId: grid.entityId,
            columns: grid.columns,
            settings: grid.settings,
            status: 'draft',
            metadata: {
              ...grid.metadata,
              clonedFrom: grid.id,
            },
          }, { transaction });
        }
      }

      // Clone data sources (references) if requested
      if (cloneOptions?.dataSources && sourceApp.dataSources) {
        // For data sources, we typically just create references, not full copies
        // This is handled by the wizard's selectedDataSources in metadata
      }

      // Note: Data cloning (actual records) would require entity-specific logic
      // and is typically handled separately or via export/import

      await transaction.commit();

      // Load the complete new application
      const completeApp = await this.getApplicationById(newApp.id, {
        includeEntities: true,
        includeForms: true,
        includeGrids: true,
        includeDataSources: true,
      });

      return completeApp;
    } catch (error) {
      await transaction.rollback();
      throw new Error(`Failed to clone application: ${error.message}`);
    }
  }

  /**
   * Update application
   */
  async updateApplication(id, data, userId) {
    const application = await Application.findByPk(id);

    if (!application) {
      throw new Error('Application not found');
    }

    // Check ownership
    if (application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    // Check if name is being changed and ensure uniqueness
    if (data.name && data.name !== application.name) {
      const existing = await Application.findOne({
        where: {
          name: data.name,
          ownerId: userId,
          id: { [Op.ne]: id },
        },
      });

      if (existing) {
        throw new Error(`Application with name "${data.name}" already exists`);
      }
    }

    const updatedApplication = await application.update({
      name: data.name,
      displayName: data.displayName,
      description: data.description,
      icon: data.icon,
      color: data.color,
      settings: data.settings,
      metadata: data.metadata,
      gitRepository: data.gitRepository,
      gitBranch: data.gitBranch,
    });

    return updatedApplication;
  }

  /**
   * Delete application (soft delete)
   */
  async deleteApplication(id, userId) {
    const application = await Application.findByPk(id);

    if (!application) {
      throw new Error('Application not found');
    }

    // Check ownership
    if (application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    await application.destroy(); // Soft delete due to paranoid: true

    return { success: true, message: 'Application deleted successfully' };
  }

  /**
   * Publish application
   */
  async publishApplication(id, userId) {
    const application = await Application.findByPk(id);

    if (!application) {
      throw new Error('Application not found');
    }

    if (application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    await application.publish();

    return application;
  }

  /**
   * Archive application
   */
  async archiveApplication(id, userId) {
    const application = await Application.findByPk(id);

    if (!application) {
      throw new Error('Application not found');
    }

    if (application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    await application.archive();

    return application;
  }

  /**
   * Increment application version
   */
  async incrementVersion(id, type, userId) {
    const application = await Application.findByPk(id);

    if (!application) {
      throw new Error('Application not found');
    }

    if (application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    application.incrementVersion(type);
    await application.save();

    return application;
  }

  /**
   * Get application statistics
   */
  async getApplicationStats(id) {
    const application = await Application.findByPk(id);

    if (!application) {
      throw new Error('Application not found');
    }

    const [entityCount, formCount, dataSourceCount, gridCount] = await Promise.all([
      Entity.count({ where: { applicationId: id } }),
      AppForm.count({ where: { applicationId: id } }),
      DataSource.count({ where: { applicationId: id } }),
      Grid.count({ where: { applicationId: id } }),
    ]);

    return {
      applicationId: id,
      entities: entityCount,
      forms: formCount,
      dataSources: dataSourceCount,
      grids: gridCount,
      version: application.version,
      publishedVersion: application.publishedVersion,
      status: application.status,
    };
  }
}

module.exports = new ApplicationService();
