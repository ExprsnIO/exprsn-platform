const { Op } = require('sequelize');
const { Project, Employee, Customer, TimeEntry } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const { sequelize } = require('../../../config/database');

/**
 * Project Management Service
 *
 * Handles project creation, tracking, budgeting, time tracking, and reporting
 */

/**
 * Generate unique project number
 */
async function generateProjectNumber() {
  const prefix = 'PRJ';
  const year = new Date().getFullYear().toString().slice(-2);

  const lastProject = await Project.findOne({
    where: {
      projectNumber: {
        [Op.like]: `${prefix}-${year}%`
      }
    },
    order: [['projectNumber', 'DESC']]
  });

  let sequence = 1;
  if (lastProject) {
    const lastNumber = parseInt(lastProject.projectNumber.split('-')[2]);
    sequence = lastNumber + 1;
  }

  return `${prefix}-${year}-${sequence.toString().padStart(4, '0')}`;
}

/**
 * Create a project
 */
async function createProject({
  name,
  description,
  projectType = 'internal',
  status = 'planning',
  priority = 'medium',
  startDate,
  endDate,
  budget,
  estimatedCost,
  estimatedHours,
  currency = 'USD',
  billingType = 'non_billable',
  customerId,
  companyId,
  opportunityId,
  projectManagerId,
  teamMembers = [],
  departmentId,
  tags = [],
  category,
  notes,
  milestones = [],
  customFields = {}
}) {
  try {
    const projectNumber = await generateProjectNumber();

    const project = await Project.create({
      projectNumber,
      name,
      description,
      projectType,
      status,
      priority,
      startDate,
      endDate,
      budget,
      estimatedCost,
      estimatedHours,
      currency,
      billingType,
      customerId,
      companyId,
      opportunityId,
      projectManagerId,
      teamMembers,
      departmentId,
      tags,
      category,
      notes,
      milestones,
      customFields
    });

    logger.info('Project created', {
      projectId: project.id,
      projectNumber,
      name,
      projectManagerId
    });

    return project;
  } catch (error) {
    logger.error('Failed to create project', {
      name,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get project by ID
 */
async function getProjectById(projectId, includeRelations = false) {
  try {
    const include = [];

    if (includeRelations) {
      include.push(
        {
          model: Employee,
          as: 'projectManager',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'email']
        }
      );
    }

    const project = await Project.findByPk(projectId, { include });

    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return project;
  } catch (error) {
    logger.error('Failed to get project', {
      projectId,
      error: error.message
    });
    throw error;
  }
}

/**
 * List projects with filters
 */
async function listProjects({
  status,
  priority,
  projectType,
  health,
  projectManagerId,
  customerId,
  departmentId,
  tags,
  search,
  startDate,
  endDate,
  limit = 50,
  offset = 0,
  sortBy = 'createdAt',
  sortOrder = 'DESC'
}) {
  try {
    const where = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (projectType) where.projectType = projectType;
    if (health) where.health = health;
    if (projectManagerId) where.projectManagerId = projectManagerId;
    if (customerId) where.customerId = customerId;
    if (departmentId) where.departmentId = departmentId;

    if (tags && tags.length > 0) {
      where.tags = {
        [Op.contains]: tags
      };
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
        { projectNumber: { [Op.iLike]: `%${search}%` } }
      ];
    }

    if (startDate && endDate) {
      where[Op.and] = [
        { startDate: { [Op.gte]: startDate } },
        { endDate: { [Op.lte]: endDate } }
      ];
    }

    const { count, rows } = await Project.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: [
        {
          model: Employee,
          as: 'projectManager',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    return {
      projects: rows,
      total: count,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to list projects', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Update project
 */
async function updateProject(projectId, updates) {
  try {
    const project = await getProjectById(projectId);

    // Update fields
    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        project[key] = updates[key];
      }
    });

    await project.save();

    logger.info('Project updated', {
      projectId,
      updates: Object.keys(updates)
    });

    return project;
  } catch (error) {
    logger.error('Failed to update project', {
      projectId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete project
 */
async function deleteProject(projectId) {
  try {
    const project = await getProjectById(projectId);
    await project.destroy();

    logger.info('Project deleted', { projectId });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete project', {
      projectId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update project status
 */
async function updateProjectStatus(projectId, status, notes = null) {
  try {
    const project = await getProjectById(projectId);

    const oldStatus = project.status;
    project.status = status;

    // Update actual dates
    if (status === 'active' && !project.actualStartDate) {
      project.actualStartDate = new Date();
    }

    if ((status === 'completed' || status === 'cancelled') && !project.actualEndDate) {
      project.actualEndDate = new Date();
    }

    // Add to metadata
    project.metadata = {
      ...project.metadata,
      statusHistory: [
        ...(project.metadata?.statusHistory || []),
        {
          from: oldStatus,
          to: status,
          changedAt: new Date(),
          notes
        }
      ]
    };

    await project.save();

    logger.info('Project status updated', {
      projectId,
      oldStatus,
      newStatus: status
    });

    return project;
  } catch (error) {
    logger.error('Failed to update project status', {
      projectId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Add milestone to project
 */
async function addMilestone(projectId, { name, date, description, status = 'pending' }) {
  try {
    const project = await getProjectById(projectId);

    const milestones = project.milestones || [];
    const milestone = {
      id: `MS-${Date.now()}`,
      name,
      date,
      description,
      status,
      createdAt: new Date()
    };

    milestones.push(milestone);
    project.milestones = milestones;

    await project.save();

    logger.info('Milestone added to project', {
      projectId,
      milestoneName: name
    });

    return milestone;
  } catch (error) {
    logger.error('Failed to add milestone', {
      projectId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update milestone
 */
async function updateMilestone(projectId, milestoneId, updates) {
  try {
    const project = await getProjectById(projectId);

    const milestones = project.milestones || [];
    const milestoneIndex = milestones.findIndex(m => m.id === milestoneId);

    if (milestoneIndex === -1) {
      throw new Error(`Milestone not found: ${milestoneId}`);
    }

    // Update milestone
    milestones[milestoneIndex] = {
      ...milestones[milestoneIndex],
      ...updates,
      updatedAt: new Date()
    };

    // Mark as completed if status changed to completed
    if (updates.status === 'completed' && !milestones[milestoneIndex].completedDate) {
      milestones[milestoneIndex].completedDate = new Date();
    }

    project.milestones = milestones;
    await project.save();

    logger.info('Milestone updated', {
      projectId,
      milestoneId
    });

    return milestones[milestoneIndex];
  } catch (error) {
    logger.error('Failed to update milestone', {
      projectId,
      milestoneId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update project budget and costs
 */
async function updateBudget(projectId, { budget, estimatedCost, actualCost }) {
  try {
    const project = await getProjectById(projectId);

    if (budget !== undefined) project.budget = budget;
    if (estimatedCost !== undefined) project.estimatedCost = estimatedCost;
    if (actualCost !== undefined) project.actualCost = actualCost;

    await project.save();

    // Calculate variance
    const budgetVariance = project.budget ? project.budget - project.actualCost : null;
    const budgetVariancePercent = project.budget ? ((budgetVariance / project.budget) * 100).toFixed(2) : null;

    logger.info('Project budget updated', {
      projectId,
      budget: project.budget,
      actualCost: project.actualCost,
      variance: budgetVariance
    });

    return {
      project,
      budgetVariance,
      budgetVariancePercent
    };
  } catch (error) {
    logger.error('Failed to update project budget', {
      projectId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Track time on project
 */
async function trackTime(projectId, { employeeId, hours, date, description, billable = true }) {
  const transaction = await sequelize.transaction();

  try {
    const project = await getProjectById(projectId);

    // Create time entry
    const timeEntry = await TimeEntry.create({
      projectId,
      employeeId,
      hours,
      date,
      description,
      billable
    }, { transaction });

    // Update project actual hours
    project.actualHours = (parseFloat(project.actualHours) + parseFloat(hours)).toFixed(2);
    await project.save({ transaction });

    await transaction.commit();

    logger.info('Time tracked on project', {
      projectId,
      employeeId,
      hours
    });

    return {
      timeEntry,
      projectActualHours: project.actualHours
    };
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to track time', {
      projectId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Calculate project completion percentage
 */
async function calculateCompletion(projectId) {
  try {
    const project = await getProjectById(projectId);

    let completionPercent = 0;

    // Calculate based on completed tasks
    if (project.totalTasks > 0) {
      completionPercent = Math.round((project.completedTasks / project.totalTasks) * 100);
    }

    // Update project
    project.completionPercentage = completionPercent;
    await project.save();

    logger.info('Project completion calculated', {
      projectId,
      completionPercent,
      totalTasks: project.totalTasks,
      completedTasks: project.completedTasks
    });

    return {
      completionPercentage: completionPercent,
      totalTasks: project.totalTasks,
      completedTasks: project.completedTasks
    };
  } catch (error) {
    logger.error('Failed to calculate completion', {
      projectId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get project statistics
 */
async function getProjectStatistics(projectId) {
  try {
    const project = await getProjectById(projectId, true);

    // Budget analysis
    const budgetVariance = project.budget ? project.budget - project.actualCost : null;
    const budgetUtilization = project.budget ? ((project.actualCost / project.budget) * 100).toFixed(2) : null;

    // Time analysis
    const timeVariance = project.estimatedHours ? project.estimatedHours - project.actualHours : null;
    const timeUtilization = project.estimatedHours ? ((project.actualHours / project.estimatedHours) * 100).toFixed(2) : null;

    // Schedule analysis
    const now = new Date();
    const totalDuration = project.endDate - project.startDate;
    const elapsed = now - project.startDate;
    const scheduleProgress = totalDuration > 0 ? ((elapsed / totalDuration) * 100).toFixed(2) : 0;
    const isOverdue = project.status !== 'completed' && now > project.endDate;

    // Milestone analysis
    const milestones = project.milestones || [];
    const completedMilestones = milestones.filter(m => m.status === 'completed').length;
    const milestonesProgress = milestones.length > 0 ? ((completedMilestones / milestones.length) * 100).toFixed(2) : 0;

    return {
      projectId: project.id,
      projectNumber: project.projectNumber,
      name: project.name,
      status: project.status,
      health: project.health,
      completion: {
        percentage: project.completionPercentage,
        totalTasks: project.totalTasks,
        completedTasks: project.completedTasks
      },
      budget: {
        budgeted: project.budget,
        estimated: project.estimatedCost,
        actual: project.actualCost,
        variance: budgetVariance,
        utilization: budgetUtilization,
        remaining: project.budget ? project.budget - project.actualCost : null
      },
      time: {
        estimated: project.estimatedHours,
        actual: project.actualHours,
        variance: timeVariance,
        utilization: timeUtilization,
        remaining: project.estimatedHours ? project.estimatedHours - project.actualHours : null
      },
      schedule: {
        startDate: project.startDate,
        endDate: project.endDate,
        actualStartDate: project.actualStartDate,
        actualEndDate: project.actualEndDate,
        progress: scheduleProgress,
        isOverdue,
        daysRemaining: Math.ceil((project.endDate - now) / (1000 * 60 * 60 * 24))
      },
      milestones: {
        total: milestones.length,
        completed: completedMilestones,
        progress: milestonesProgress
      },
      team: {
        projectManager: project.projectManager,
        teamSize: project.teamMembers ? project.teamMembers.length : 0
      }
    };
  } catch (error) {
    logger.error('Failed to get project statistics', {
      projectId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get dashboard statistics for all projects
 */
async function getDashboardStatistics(filters = {}) {
  try {
    const where = {};
    if (filters.projectManagerId) where.projectManagerId = filters.projectManagerId;
    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.status) where.status = filters.status;

    const projects = await Project.findAll({ where });

    const stats = {
      total: projects.length,
      byStatus: {},
      byHealth: {},
      byPriority: {},
      budget: {
        total: 0,
        actual: 0,
        variance: 0
      },
      overdue: 0,
      completedThisMonth: 0,
      activeProjects: 0
    };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    projects.forEach(project => {
      // By status
      stats.byStatus[project.status] = (stats.byStatus[project.status] || 0) + 1;

      // By health
      if (project.health) {
        stats.byHealth[project.health] = (stats.byHealth[project.health] || 0) + 1;
      }

      // By priority
      stats.byPriority[project.priority] = (stats.byPriority[project.priority] || 0) + 1;

      // Budget
      if (project.budget) {
        stats.budget.total += parseFloat(project.budget);
        stats.budget.actual += parseFloat(project.actualCost);
      }

      // Overdue
      if (project.status !== 'completed' && now > project.endDate) {
        stats.overdue++;
      }

      // Completed this month
      if (project.status === 'completed' && project.actualEndDate >= monthStart) {
        stats.completedThisMonth++;
      }

      // Active
      if (project.status === 'active') {
        stats.activeProjects++;
      }
    });

    stats.budget.variance = stats.budget.total - stats.budget.actual;

    return stats;
  } catch (error) {
    logger.error('Failed to get dashboard statistics', {
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createProject,
  getProjectById,
  listProjects,
  updateProject,
  deleteProject,
  updateProjectStatus,
  addMilestone,
  updateMilestone,
  updateBudget,
  trackTime,
  calculateCompletion,
  getProjectStatistics,
  getDashboardStatistics
};
