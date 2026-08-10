const { Op } = require('sequelize');
const { Task, TaskAssignment, TaskDependency } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const moment = require('moment');

/**
 * Task Service
 *
 * Handles task and project management
 */

/**
 * Create a task
 */
async function createTask({
  title,
  description,
  priority,
  status,
  dueDate,
  estimatedHours,
  actualHours,
  tags,
  parentTaskId,
  projectId,
  creatorId,
  metadata
}) {
  try {
    const task = await Task.create({
      title,
      description,
      priority: priority || 'medium',
      status: status || 'pending',
      dueDate: dueDate ? moment(dueDate).toDate() : null,
      estimatedHours: estimatedHours || null,
      actualHours: actualHours || 0,
      tags: tags || [],
      parentTaskId: parentTaskId || null,
      projectId: projectId || null,
      creatorId,
      metadata: metadata || {}
    });

    logger.info('Task created', {
      taskId: task.id,
      title,
      creatorId
    });

    return task;
  } catch (error) {
    logger.error('Failed to create task', {
      title,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get task by ID
 */
async function getTaskById(id, includeRelations = false) {
  const include = [];

  if (includeRelations) {
    include.push(
      {
        model: Task,
        as: 'subtasks',
        limit: 50
      },
      {
        model: TaskAssignment,
        as: 'assignments'
      },
      {
        model: TaskDependency,
        as: 'dependencies',
        include: [{ model: Task, as: 'dependsOnTask' }]
      }
    );
  }

  const task = await Task.findByPk(id, { include });

  if (!task) {
    throw new Error(`Task not found: ${id}`);
  }

  return task;
}

/**
 * List tasks with filtering
 */
async function listTasks({
  status,
  priority,
  assignedTo,
  creatorId,
  parentTaskId,
  projectId,
  search,
  limit = 50,
  offset = 0,
  orderBy = 'createdAt',
  orderDirection = 'DESC'
}) {
  const where = {};

  if (status) {
    if (Array.isArray(status)) {
      where.status = { [Op.in]: status };
    } else {
      where.status = status;
    }
  }

  if (priority) {
    if (Array.isArray(priority)) {
      where.priority = { [Op.in]: priority };
    } else {
      where.priority = priority;
    }
  }

  if (creatorId) {
    where.creatorId = creatorId;
  }

  if (parentTaskId) {
    where.parentTaskId = parentTaskId;
  } else if (parentTaskId === null) {
    // Only root tasks
    where.parentTaskId = null;
  }

  if (projectId) {
    where.projectId = projectId;
  }

  if (search) {
    where[Op.or] = [
      { title: { [Op.iLike]: `%${search}%` } },
      { description: { [Op.iLike]: `%${search}%` } }
    ];
  }

  const include = [];

  if (assignedTo) {
    include.push({
      model: TaskAssignment,
      as: 'assignments',
      where: { userId: assignedTo },
      required: true
    });
  } else {
    include.push({
      model: TaskAssignment,
      as: 'assignments',
      required: false
    });
  }

  const { count, rows } = await Task.findAndCountAll({
    where,
    include,
    limit,
    offset,
    order: [[orderBy, orderDirection]],
    distinct: true
  });

  return {
    tasks: rows,
    total: count,
    limit,
    offset
  };
}

/**
 * Update a task
 */
async function updateTask(id, updates) {
  try {
    const task = await getTaskById(id);

    // Validate due date if being updated
    if (updates.dueDate) {
      const dueDate = moment(updates.dueDate);
      if (!dueDate.isValid()) {
        throw new Error('Invalid due date');
      }
      updates.dueDate = dueDate.toDate();
    }

    // Track status changes
    if (updates.status && updates.status !== task.status) {
      if (updates.status === 'completed' && !task.completedAt) {
        updates.completedAt = new Date();
      } else if (updates.status !== 'completed' && task.completedAt) {
        updates.completedAt = null;
      }
    }

    Object.assign(task, updates);
    await task.save();

    logger.info('Task updated', {
      taskId: id,
      updates: Object.keys(updates)
    });

    return task;
  } catch (error) {
    logger.error('Failed to update task', {
      taskId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete a task
 */
async function deleteTask(id) {
  try {
    const task = await getTaskById(id);

    // Check for subtasks
    const subtaskCount = await Task.count({
      where: { parentTaskId: id }
    });

    if (subtaskCount > 0) {
      throw new Error('Cannot delete task with subtasks. Delete subtasks first.');
    }

    // Delete assignments
    await TaskAssignment.destroy({
      where: { taskId: id }
    });

    // Delete dependencies
    await TaskDependency.destroy({
      where: {
        [Op.or]: [
          { taskId: id },
          { dependsOnTaskId: id }
        ]
      }
    });

    await task.destroy();

    logger.info('Task deleted', {
      taskId: id
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete task', {
      taskId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Assign task to user
 */
async function assignTask(taskId, userId, role = 'assignee') {
  try {
    // Validate task exists
    await getTaskById(taskId);

    // Check if already assigned
    const existing = await TaskAssignment.findOne({
      where: { taskId, userId }
    });

    if (existing) {
      // Update role if different
      if (existing.role !== role) {
        existing.role = role;
        await existing.save();
      }
      return existing;
    }

    const assignment = await TaskAssignment.create({
      taskId,
      userId,
      role,
      assignedAt: new Date()
    });

    logger.info('Task assigned', {
      taskId,
      userId,
      role
    });

    return assignment;
  } catch (error) {
    logger.error('Failed to assign task', {
      taskId,
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Unassign task from user
 */
async function unassignTask(taskId, userId) {
  try {
    const deleted = await TaskAssignment.destroy({
      where: { taskId, userId }
    });

    if (deleted === 0) {
      throw new Error('Assignment not found');
    }

    logger.info('Task unassigned', {
      taskId,
      userId
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to unassign task', {
      taskId,
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get task assignments
 */
async function getTaskAssignments(taskId) {
  const assignments = await TaskAssignment.findAll({
    where: { taskId },
    order: [['assignedAt', 'ASC']]
  });

  return assignments;
}

/**
 * Add task dependency
 */
async function addDependency(taskId, dependsOnTaskId, dependencyType = 'finish_to_start') {
  try {
    // Validate both tasks exist
    await getTaskById(taskId);
    await getTaskById(dependsOnTaskId);

    // Check for circular dependency
    const hasCircular = await checkCircularDependency(taskId, dependsOnTaskId);
    if (hasCircular) {
      throw new Error('Circular dependency detected');
    }

    // Check if dependency already exists
    const existing = await TaskDependency.findOne({
      where: { taskId, dependsOnTaskId }
    });

    if (existing) {
      return existing;
    }

    const dependency = await TaskDependency.create({
      taskId,
      dependsOnTaskId,
      dependencyType
    });

    logger.info('Task dependency added', {
      taskId,
      dependsOnTaskId,
      dependencyType
    });

    return dependency;
  } catch (error) {
    logger.error('Failed to add task dependency', {
      taskId,
      dependsOnTaskId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Remove task dependency
 */
async function removeDependency(taskId, dependsOnTaskId) {
  try {
    const deleted = await TaskDependency.destroy({
      where: { taskId, dependsOnTaskId }
    });

    if (deleted === 0) {
      throw new Error('Dependency not found');
    }

    logger.info('Task dependency removed', {
      taskId,
      dependsOnTaskId
    });

    return { success: true };
  } catch (error) {
    logger.error('Failed to remove task dependency', {
      taskId,
      dependsOnTaskId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get task dependencies
 */
async function getTaskDependencies(taskId) {
  const dependencies = await TaskDependency.findAll({
    where: { taskId },
    include: [{ model: Task, as: 'dependsOnTask' }]
  });

  return dependencies;
}

/**
 * Check for circular dependency
 */
async function checkCircularDependency(taskId, dependsOnTaskId, visited = new Set()) {
  if (visited.has(dependsOnTaskId)) {
    return true; // Circular dependency found
  }

  if (taskId === dependsOnTaskId) {
    return true; // Task cannot depend on itself
  }

  visited.add(dependsOnTaskId);

  // Get all dependencies of the dependsOnTask
  const dependencies = await TaskDependency.findAll({
    where: { taskId: dependsOnTaskId }
  });

  for (const dep of dependencies) {
    if (await checkCircularDependency(taskId, dep.dependsOnTaskId, visited)) {
      return true;
    }
  }

  return false;
}

/**
 * Get task statistics
 */
async function getTaskStatistics({ creatorId, assignedTo, projectId } = {}) {
  try {
    const where = {};

    if (creatorId) {
      where.creatorId = creatorId;
    }

    if (projectId) {
      where.projectId = projectId;
    }

    const include = [];

    if (assignedTo) {
      include.push({
        model: TaskAssignment,
        as: 'assignments',
        where: { userId: assignedTo },
        required: true
      });
    }

    const tasks = await Task.findAll({
      where,
      include,
      attributes: ['id', 'status', 'priority', 'estimatedHours', 'actualHours']
    });

    const stats = {
      total: tasks.length,
      byStatus: {},
      byPriority: {},
      totalEstimatedHours: 0,
      totalActualHours: 0
    };

    tasks.forEach(task => {
      // Count by status
      stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;

      // Count by priority
      stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;

      // Sum hours
      stats.totalEstimatedHours += task.estimatedHours || 0;
      stats.totalActualHours += task.actualHours || 0;
    });

    return stats;
  } catch (error) {
    logger.error('Failed to get task statistics', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Get overdue tasks
 */
async function getOverdueTasks({ assignedTo, creatorId, projectId } = {}) {
  const where = {
    status: { [Op.notIn]: ['completed', 'cancelled'] },
    dueDate: { [Op.lt]: new Date() }
  };

  if (creatorId) {
    where.creatorId = creatorId;
  }

  if (projectId) {
    where.projectId = projectId;
  }

  const include = [];

  if (assignedTo) {
    include.push({
      model: TaskAssignment,
      as: 'assignments',
      where: { userId: assignedTo },
      required: true
    });
  }

  const tasks = await Task.findAll({
    where,
    include,
    order: [['dueDate', 'ASC']]
  });

  return tasks;
}

module.exports = {
  createTask,
  getTaskById,
  listTasks,
  updateTask,
  deleteTask,
  assignTask,
  unassignTask,
  getTaskAssignments,
  addDependency,
  removeDependency,
  getTaskDependencies,
  getTaskStatistics,
  getOverdueTasks
};
