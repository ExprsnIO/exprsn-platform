/**
 * Form Service
 *
 * Business logic for form management in the low-code platform.
 * Handles CRUD operations, control management, data source binding,
 * validation, and form runtime operations.
 */

const { Op } = require('sequelize');
const { AppForm, Application, FormSubmission, FormDraft } = require('../models');

class FormService {
  /**
   * List forms with pagination and filtering
   */
  async listForms(options = {}) {
    const {
      applicationId,
      status,
      type,
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

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { displayName: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await AppForm.findAndCountAll({
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
      forms: rows,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Get form by ID
   */
  async getFormById(formId, options = {}) {
    const { includeSubmissions = false } = options;

    const include = [
      {
        model: Application,
        as: 'application',
        attributes: ['id', 'name', 'displayName', 'status']
      }
    ];

    if (includeSubmissions) {
      include.push({
        model: FormSubmission,
        as: 'submissions',
        limit: 10,
        order: [['created_at', 'DESC']]
      });
    }

    const form = await AppForm.findByPk(formId, { include });

    if (!form) {
      throw new Error('Form not found');
    }

    return form;
  }

  /**
   * Create new form
   */
  async createForm(data, userId) {
    const { applicationId, name, displayName } = data;

    // Verify application exists and user has access
    const application = await Application.findByPk(applicationId);
    if (!application) {
      throw new Error('Application not found');
    }

    if (application.ownerId !== userId) {
      throw new Error('Unauthorized: You do not own this application');
    }

    // Check for duplicate form name within application
    const existing = await AppForm.findOne({
      where: {
        applicationId,
        name
      }
    });

    if (existing) {
      throw new Error(`Form with name "${name}" already exists in this application`);
    }

    // Create form with defaults
    const form = await AppForm.create({
      applicationId,
      name,
      displayName: displayName || name,
      description: data.description || '',
      type: data.type || 'form',
      status: 'draft',
      controls: data.controls || [],
      dataSources: data.dataSources || [],
      collections: data.collections || [],
      variables: data.variables || [],
      events: data.events || {},
      validationRules: data.validationRules || [],
      backgroundServices: data.backgroundServices || [],
      settings: data.settings || {
        submitButtonText: 'Submit',
        showProgressBar: false,
        allowDrafts: true,
        enableAutosave: true,
        autosaveInterval: 30000
      }
    });

    return form;
  }

  /**
   * Update form
   */
  async updateForm(formId, data, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Prevent updating published forms directly
    if (form.status === 'published' && !data.createVersion) {
      throw new Error('Cannot modify published form. Create a new version or unpublish first.');
    }

    // Update allowed fields
    const allowedFields = [
      'name',
      'displayName',
      'description',
      'type',
      'status',
      'controls',
      'dataSources',
      'collections',
      'variables',
      'events',
      'validationRules',
      'backgroundServices',
      'settings'
    ];

    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        form[field] = data[field];
      }
    });

    await form.save();
    return form;
  }

  /**
   * Delete form (soft delete)
   */
  async deleteForm(formId, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Soft delete
    await form.destroy();

    return { success: true, message: 'Form deleted successfully' };
  }

  /**
   * Duplicate form
   */
  async duplicateForm(formId, userId, newName = null) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    const duplicate = await AppForm.create({
      applicationId: form.applicationId,
      name: newName || `${form.name}_copy`,
      displayName: `${form.displayName} (Copy)`,
      description: form.description,
      type: form.type,
      status: 'draft',
      controls: JSON.parse(JSON.stringify(form.controls)),
      dataSources: JSON.parse(JSON.stringify(form.dataSources)),
      collections: JSON.parse(JSON.stringify(form.collections)),
      variables: JSON.parse(JSON.stringify(form.variables)),
      events: JSON.parse(JSON.stringify(form.events)),
      validationRules: JSON.parse(JSON.stringify(form.validationRules)),
      backgroundServices: JSON.parse(JSON.stringify(form.backgroundServices)),
      settings: JSON.parse(JSON.stringify(form.settings))
    });

    return duplicate;
  }

  /**
   * Add control to form
   */
  async addControl(formId, controlData, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Add control
    form.addControl(controlData);
    await form.save();

    return form;
  }

  /**
   * Update control in form
   */
  async updateControl(formId, controlId, controlData, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Update control
    form.updateControl(controlId, controlData);
    await form.save();

    return form;
  }

  /**
   * Remove control from form
   */
  async removeControl(formId, controlId, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Remove control
    form.removeControl(controlId);
    await form.save();

    return form;
  }

  /**
   * Reorder controls in form
   */
  async reorderControls(formId, controlIds, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Validate all control IDs exist
    const currentControlIds = form.controls.map(c => c.id);
    const invalidIds = controlIds.filter(id => !currentControlIds.includes(id));

    if (invalidIds.length > 0) {
      throw new Error(`Invalid control IDs: ${invalidIds.join(', ')}`);
    }

    // Reorder controls
    const reordered = controlIds.map(id =>
      form.controls.find(c => c.id === id)
    );

    form.controls = reordered;
    form.changed('controls', true);
    await form.save();

    return form;
  }

  /**
   * Add data source to form
   */
  async addDataSource(formId, dataSourceData, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Add data source
    form.addDataSource(dataSourceData);
    await form.save();

    return form;
  }

  /**
   * Update data source in form
   */
  async updateDataSource(formId, dataSourceName, dataSourceData, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Find and update data source
    const dataSourceIndex = form.dataSources.findIndex(ds => ds.name === dataSourceName);
    if (dataSourceIndex === -1) {
      throw new Error(`Data source "${dataSourceName}" not found`);
    }

    form.dataSources[dataSourceIndex] = {
      ...form.dataSources[dataSourceIndex],
      ...dataSourceData
    };

    form.changed('dataSources', true);
    await form.save();

    return form;
  }

  /**
   * Remove data source from form
   */
  async removeDataSource(formId, dataSourceName, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Remove data source
    form.dataSources = form.dataSources.filter(ds => ds.name !== dataSourceName);
    form.changed('dataSources', true);
    await form.save();

    return form;
  }

  /**
   * Add variable to form
   */
  async addVariable(formId, variableData, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Check for duplicate variable name
    const exists = form.variables.find(v => v.name === variableData.name);
    if (exists) {
      throw new Error(`Variable "${variableData.name}" already exists`);
    }

    // Add variable
    form.addVariable(variableData);
    await form.save();

    return form;
  }

  /**
   * Update variable in form
   */
  async updateVariable(formId, variableName, variableData, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Find and update variable
    const variableIndex = form.variables.findIndex(v => v.name === variableName);
    if (variableIndex === -1) {
      throw new Error(`Variable "${variableName}" not found`);
    }

    form.variables[variableIndex] = {
      ...form.variables[variableIndex],
      ...variableData
    };

    form.changed('variables', true);
    await form.save();

    return form;
  }

  /**
   * Remove variable from form
   */
  async removeVariable(formId, variableName, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Remove variable
    form.variables = form.variables.filter(v => v.name !== variableName);
    form.changed('variables', true);
    await form.save();

    return form;
  }

  /**
   * Validate form structure
   */
  async validateForm(formId, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    const errors = [];
    const warnings = [];

    // Validate form has at least one control
    if (form.controls.length === 0) {
      errors.push('Form must have at least one control');
    }

    // Validate control IDs are unique
    const controlIds = form.controls.map(c => c.id);
    const duplicateIds = controlIds.filter((id, idx) => controlIds.indexOf(id) !== idx);
    if (duplicateIds.length > 0) {
      errors.push(`Duplicate control IDs: ${duplicateIds.join(', ')}`);
    }

    // Validate control names are unique
    const controlNames = form.controls.map(c => c.name);
    const duplicateNames = controlNames.filter((name, idx) => controlNames.indexOf(name) !== idx);
    if (duplicateNames.length > 0) {
      errors.push(`Duplicate control names: ${duplicateNames.join(', ')}`);
    }

    // Validate data source names are unique
    const dataSourceNames = form.dataSources.map(ds => ds.name);
    const duplicateDataSources = dataSourceNames.filter((name, idx) => dataSourceNames.indexOf(name) !== idx);
    if (duplicateDataSources.length > 0) {
      errors.push(`Duplicate data source names: ${duplicateDataSources.join(', ')}`);
    }

    // Validate variable names are unique
    const variableNames = form.variables.map(v => v.name);
    const duplicateVariables = variableNames.filter((name, idx) => variableNames.indexOf(name) !== idx);
    if (duplicateVariables.length > 0) {
      errors.push(`Duplicate variable names: ${duplicateVariables.join(', ')}`);
    }

    // Warn if form has no submit button
    const hasSubmitButton = form.controls.some(c => c.type === 'button' && c.props?.submitButton);
    if (!hasSubmitButton) {
      warnings.push('Form has no submit button');
    }

    // Warn if form has required fields but no validation
    const hasRequiredFields = form.controls.some(c => c.props?.required);
    if (hasRequiredFields && form.validationRules.length === 0) {
      warnings.push('Form has required fields but no validation rules defined');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Publish form
   */
  async publishForm(formId, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Validate form before publishing
    const validation = await this.validateForm(formId, userId);
    if (!validation.valid) {
      throw new Error(`Cannot publish form with validation errors: ${validation.errors.join(', ')}`);
    }

    // Update status
    form.status = 'published';
    form.publishedAt = new Date();
    await form.save();

    return form;
  }

  /**
   * Unpublish form
   */
  async unpublishForm(formId, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Update status
    form.status = 'draft';
    await form.save();

    return form;
  }

  /**
   * Get form submissions
   */
  async getFormSubmissions(formId, options = {}) {
    const {
      limit = 25,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      status
    } = options;

    const where = { formId };

    if (status) {
      where.status = status;
    }

    const { count, rows } = await FormSubmission.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]]
    });

    return {
      total: count,
      submissions: rows,
      limit,
      offset,
      hasMore: offset + limit < count
    };
  }

  /**
   * Get form statistics
   */
  async getFormStats(formId, userId) {
    const form = await AppForm.findByPk(formId, {
      include: [{ model: Application, as: 'application' }]
    });

    if (!form) {
      throw new Error('Form not found');
    }

    if (form.application.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // Count submissions by status
    const totalSubmissions = await FormSubmission.count({ where: { formId } });
    const completedSubmissions = await FormSubmission.count({
      where: { formId, status: 'completed' }
    });
    const pendingSubmissions = await FormSubmission.count({
      where: { formId, status: 'pending' }
    });
    const draftSubmissions = await FormDraft.count({ where: { formId } });

    // Get submission rate over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentSubmissions = await FormSubmission.count({
      where: {
        formId,
        createdAt: { [Op.gte]: thirtyDaysAgo }
      }
    });

    return {
      totalSubmissions,
      completedSubmissions,
      pendingSubmissions,
      draftSubmissions,
      recentSubmissions,
      completionRate: totalSubmissions > 0 ? (completedSubmissions / totalSubmissions * 100).toFixed(2) : 0,
      controlCount: form.controls.length,
      dataSourceCount: form.dataSources.length,
      variableCount: form.variables.length,
      status: form.status,
      publishedAt: form.publishedAt,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt
    };
  }
}

module.exports = new FormService();
