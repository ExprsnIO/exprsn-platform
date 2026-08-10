const { Op } = require('sequelize');
const { Task, TaskDependency, TaskAssignment } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const moment = require('moment');

/**
 * Gantt Chart Service
 *
 * Generates timeline data, calculates critical paths, and provides project scheduling insights
 */

/**
 * Generate Gantt chart data for a project/set of tasks
 */
async function generateGanttData({
  projectId,
  parentTaskId,
  taskIds,
  includeCompleted = false,
  calculateCriticalPath = true
}) {
  try {
    const where = {};

    if (projectId) {
      where.projectId = projectId;
    }

    if (parentTaskId) {
      where.parentTaskId = parentTaskId;
    }

    if (taskIds && taskIds.length > 0) {
      where.id = { [Op.in]: taskIds };
    }

    if (!includeCompleted) {
      where.status = { [Op.ne]: 'completed' };
    }

    // Fetch all tasks with dependencies and assignments
    const tasks = await Task.findAll({
      where,
      include: [
        {
          model: TaskDependency,
          as: 'dependencies',
          include: [
            {
              model: Task,
              as: 'dependsOnTask',
              attributes: ['id', 'title', 'startDate', 'dueDate', 'status']
            }
          ]
        },
        {
          model: TaskAssignment,
          as: 'assignments',
          attributes: ['assignedToId', 'role', 'isPrimary']
        },
        {
          model: Task,
          as: 'subtasks',
          attributes: ['id', 'title', 'status', 'dueDate']
        }
      ],
      order: [['dueDate', 'ASC']]
    });

    if (tasks.length === 0) {
      return {
        tasks: [],
        timeline: {},
        criticalPath: [],
        statistics: {}
      };
    }

    // Calculate timeline for each task
    const timeline = {};
    for (const task of tasks) {
      timeline[task.id] = calculateTaskTimeline(task);
    }

    // Calculate critical path if requested
    let criticalPath = [];
    if (calculateCriticalPath) {
      criticalPath = await identifyCriticalPath(tasks, timeline);
    }

    // Generate statistics
    const statistics = calculateProjectStatistics(tasks, timeline);

    // Format output
    const ganttTasks = tasks.map(task => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      startDate: timeline[task.id].startDate,
      endDate: timeline[task.id].endDate,
      duration: timeline[task.id].duration,
      progress: calculateTaskProgress(task),
      dependencies: task.dependencies.map(dep => ({
        taskId: dep.dependsOnTaskId,
        type: dep.dependencyType,
        lagDays: dep.lagDays,
        isCritical: criticalPath.includes(dep.id)
      })),
      assignees: task.assignments.map(a => ({
        userId: a.assignedToId,
        role: a.role,
        isPrimary: a.isPrimary
      })),
      isCritical: criticalPath.some(cpTask => cpTask.taskId === task.id),
      slack: timeline[task.id].slack,
      subtaskCount: task.subtasks ? task.subtasks.length : 0,
      completedSubtasks: task.subtasks ? task.subtasks.filter(s => s.status === 'completed').length : 0
    }));

    return {
      tasks: ganttTasks,
      timeline,
      criticalPath,
      statistics,
      generatedAt: new Date()
    };
  } catch (error) {
    logger.error('Failed to generate Gantt data', {
      projectId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Calculate timeline for a single task
 */
function calculateTaskTimeline(task) {
  const now = moment();
  let startDate = task.startDate ? moment(task.startDate) : now;
  let endDate = task.dueDate ? moment(task.dueDate) : now.clone().add(7, 'days');

  // If no start date but has due date, estimate backwards
  if (!task.startDate && task.dueDate) {
    // Assume 7 days if no other info
    startDate = moment(task.dueDate).subtract(7, 'days');
  }

  // Calculate duration in days
  const duration = endDate.diff(startDate, 'days') + 1;

  // Calculate slack (float) - for now, simple calculation
  // This will be refined in critical path calculation
  let slack = 0;
  if (task.status !== 'completed') {
    const daysUntilDue = endDate.diff(now, 'days');
    slack = Math.max(0, daysUntilDue);
  }

  return {
    startDate: startDate.toDate(),
    endDate: endDate.toDate(),
    duration,
    slack,
    isOverdue: task.status !== 'completed' && endDate.isBefore(now),
    daysRemaining: task.status !== 'completed' ? endDate.diff(now, 'days') : 0
  };
}

/**
 * Identify critical path through task network
 */
async function identifyCriticalPath(tasks, timeline) {
  try {
    // Build task network
    const taskMap = new Map();
    const criticalTasks = [];

    for (const task of tasks) {
      taskMap.set(task.id, {
        task,
        earliestStart: moment(timeline[task.id].startDate),
        earliestFinish: moment(timeline[task.id].endDate),
        latestStart: null,
        latestFinish: null,
        slack: Infinity,
        dependencies: task.dependencies || []
      });
    }

    // Forward pass - calculate earliest start/finish
    for (const task of tasks) {
      const node = taskMap.get(task.id);

      if (node.dependencies.length === 0) {
        // No dependencies - can start immediately
        continue;
      }

      for (const dep of node.dependencies) {
        const predNode = taskMap.get(dep.dependsOnTaskId);

        if (!predNode) continue;

        let requiredStart;

        switch (dep.dependencyType) {
          case 'finish_to_start':
            // This task can't start until predecessor finishes
            requiredStart = predNode.earliestFinish.clone().add(dep.lagDays, 'days');
            break;
          case 'start_to_start':
            // Both start together
            requiredStart = predNode.earliestStart.clone().add(dep.lagDays, 'days');
            break;
          case 'finish_to_finish':
            // Both finish together
            const duration = node.earliestFinish.diff(node.earliestStart, 'days');
            requiredStart = predNode.earliestFinish.clone().subtract(duration, 'days').add(dep.lagDays, 'days');
            break;
          case 'start_to_finish':
            // This task must finish before predecessor starts (rare)
            const taskDuration = node.earliestFinish.diff(node.earliestStart, 'days');
            requiredStart = predNode.earliestStart.clone().subtract(taskDuration, 'days').add(dep.lagDays, 'days');
            break;
        }

        if (requiredStart.isAfter(node.earliestStart)) {
          node.earliestStart = requiredStart;
          const duration = moment(timeline[task.id].endDate).diff(moment(timeline[task.id].startDate), 'days');
          node.earliestFinish = requiredStart.clone().add(duration, 'days');
        }
      }
    }

    // Find project end date (latest finish of all tasks)
    let projectEnd = moment(0);
    for (const [taskId, node] of taskMap.entries()) {
      if (node.earliestFinish.isAfter(projectEnd)) {
        projectEnd = node.earliestFinish.clone();
      }
    }

    // Backward pass - calculate latest start/finish
    for (const task of tasks.slice().reverse()) {
      const node = taskMap.get(task.id);

      // Find successors (tasks that depend on this one)
      const successors = [];
      for (const [otherId, otherNode] of taskMap.entries()) {
        for (const dep of otherNode.dependencies) {
          if (dep.dependsOnTaskId === task.id) {
            successors.push({ node: otherNode, dependency: dep });
          }
        }
      }

      if (successors.length === 0) {
        // No successors - can finish at project end
        node.latestFinish = projectEnd.clone();
      } else {
        // Latest finish is earliest of successor latest starts
        node.latestFinish = moment(Infinity);
        for (const { node: succNode, dependency: dep } of successors) {
          let requiredFinish;

          switch (dep.dependencyType) {
            case 'finish_to_start':
              requiredFinish = succNode.latestStart.clone().subtract(dep.lagDays, 'days');
              break;
            case 'start_to_start':
              const duration = node.earliestFinish.diff(node.earliestStart, 'days');
              requiredFinish = succNode.latestStart.clone().add(duration, 'days').subtract(dep.lagDays, 'days');
              break;
            case 'finish_to_finish':
              requiredFinish = succNode.latestFinish.clone().subtract(dep.lagDays, 'days');
              break;
            case 'start_to_finish':
              requiredFinish = succNode.latestStart.clone().subtract(dep.lagDays, 'days');
              break;
          }

          if (requiredFinish.isBefore(node.latestFinish)) {
            node.latestFinish = requiredFinish;
          }
        }
      }

      const duration = node.earliestFinish.diff(node.earliestStart, 'days');
      node.latestStart = node.latestFinish.clone().subtract(duration, 'days');

      // Calculate slack (float)
      node.slack = node.latestStart.diff(node.earliestStart, 'days');
    }

    // Tasks with zero slack are on the critical path
    for (const [taskId, node] of taskMap.entries()) {
      if (node.slack === 0) {
        criticalTasks.push({
          taskId,
          taskTitle: node.task.title,
          earliestStart: node.earliestStart.toDate(),
          latestFinish: node.latestFinish.toDate(),
          duration: node.earliestFinish.diff(node.earliestStart, 'days')
        });

        // Mark dependencies as critical
        for (const dep of node.dependencies) {
          await TaskDependency.update(
            { isCriticalPath: true },
            { where: { id: dep.id } }
          );
        }
      } else {
        // Mark as non-critical
        for (const dep of node.dependencies) {
          await TaskDependency.update(
            { isCriticalPath: false },
            { where: { id: dep.id } }
          );
        }
      }
    }

    logger.info('Critical path calculated', {
      taskCount: tasks.length,
      criticalTaskCount: criticalTasks.length,
      projectDuration: projectEnd.diff(moment(), 'days')
    });

    return criticalTasks;
  } catch (error) {
    logger.error('Failed to calculate critical path', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Calculate task progress percentage
 */
function calculateTaskProgress(task) {
  if (task.status === 'completed') {
    return 100;
  }

  if (task.status === 'cancelled') {
    return 0;
  }

  // If has subtasks, calculate based on subtask completion
  if (task.subtasks && task.subtasks.length > 0) {
    const completed = task.subtasks.filter(s => s.status === 'completed').length;
    return Math.round((completed / task.subtasks.length) * 100);
  }

  // Estimate based on time elapsed
  if (task.startDate && task.dueDate) {
    const total = moment(task.dueDate).diff(moment(task.startDate), 'days');
    const elapsed = moment().diff(moment(task.startDate), 'days');

    if (elapsed <= 0) return 0;
    if (elapsed >= total) return 90; // Cap at 90% if not explicitly completed

    return Math.min(90, Math.round((elapsed / total) * 100));
  }

  // Default progress based on status
  switch (task.status) {
    case 'in_progress':
      return 50;
    case 'pending':
      return 0;
    default:
      return 0;
  }
}

/**
 * Calculate project statistics
 */
function calculateProjectStatistics(tasks, timeline) {
  const stats = {
    totalTasks: tasks.length,
    completedTasks: 0,
    inProgressTasks: 0,
    pendingTasks: 0,
    overdueTasks: 0,
    totalDuration: 0,
    earliestStart: null,
    latestEnd: null,
    averageProgress: 0,
    tasksWithDependencies: 0,
    blockedTasks: 0
  };

  let totalProgress = 0;

  for (const task of tasks) {
    // Count by status
    switch (task.status) {
      case 'completed':
        stats.completedTasks++;
        break;
      case 'in_progress':
        stats.inProgressTasks++;
        break;
      case 'pending':
        stats.pendingTasks++;
        break;
    }

    // Track overdue
    if (timeline[task.id].isOverdue) {
      stats.overdueTasks++;
    }

    // Track dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      stats.tasksWithDependencies++;

      // Check if blocked by unmet dependencies
      const hasUnmetDependencies = task.dependencies.some(dep => {
        return dep.status === 'active' && dep.dependsOnTask && dep.dependsOnTask.status !== 'completed';
      });

      if (hasUnmetDependencies) {
        stats.blockedTasks++;
      }
    }

    // Calculate duration
    stats.totalDuration += timeline[task.id].duration;

    // Track project timeline
    const taskStart = moment(timeline[task.id].startDate);
    const taskEnd = moment(timeline[task.id].endDate);

    if (!stats.earliestStart || taskStart.isBefore(stats.earliestStart)) {
      stats.earliestStart = taskStart.toDate();
    }

    if (!stats.latestEnd || taskEnd.isAfter(stats.latestEnd)) {
      stats.latestEnd = taskEnd.toDate();
    }

    // Accumulate progress
    totalProgress += calculateTaskProgress(task);
  }

  stats.averageProgress = tasks.length > 0 ? Math.round(totalProgress / tasks.length) : 0;
  stats.completionPercentage = tasks.length > 0 ? Math.round((stats.completedTasks / tasks.length) * 100) : 0;

  if (stats.earliestStart && stats.latestEnd) {
    stats.projectDuration = moment(stats.latestEnd).diff(moment(stats.earliestStart), 'days') + 1;
  }

  return stats;
}

/**
 * Get resource allocation timeline
 */
async function getResourceAllocation({
  projectId,
  startDate,
  endDate,
  userIds
}) {
  try {
    const where = {};

    if (projectId) {
      where.projectId = projectId;
    }

    const tasks = await Task.findAll({
      where,
      include: [
        {
          model: TaskAssignment,
          as: 'assignments',
          where: userIds ? { assignedToId: { [Op.in]: userIds } } : {},
          required: true
        }
      ]
    });

    // Group by user and date
    const allocation = {};

    for (const task of tasks) {
      const taskStart = task.startDate ? moment(task.startDate) : moment();
      const taskEnd = task.dueDate ? moment(task.dueDate) : moment().add(7, 'days');

      for (const assignment of task.assignments) {
        const userId = assignment.assignedToId;

        if (!allocation[userId]) {
          allocation[userId] = {};
        }

        // Iterate through each day of the task
        let currentDate = taskStart.clone();
        while (currentDate.isSameOrBefore(taskEnd)) {
          const dateKey = currentDate.format('YYYY-MM-DD');

          if (!allocation[userId][dateKey]) {
            allocation[userId][dateKey] = {
              tasks: [],
              allocationPercentage: 0
            };
          }

          allocation[userId][dateKey].tasks.push({
            taskId: task.id,
            taskTitle: task.title,
            priority: task.priority,
            allocation: assignment.allocationPercentage || 100
          });

          allocation[userId][dateKey].allocationPercentage += (assignment.allocationPercentage || 100);

          currentDate.add(1, 'day');
        }
      }
    }

    return allocation;
  } catch (error) {
    logger.error('Failed to get resource allocation', {
      projectId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Suggest optimal task schedule
 */
async function suggestSchedule(projectId) {
  try {
    // Get all tasks for the project
    const tasks = await Task.findAll({
      where: { projectId },
      include: [
        {
          model: TaskDependency,
          as: 'dependencies'
        }
      ]
    });

    // Generate suggestions based on dependencies and priorities
    const suggestions = [];

    for (const task of tasks) {
      if (task.status === 'completed') continue;

      const suggestion = {
        taskId: task.id,
        taskTitle: task.title,
        currentDueDate: task.dueDate,
        suggestedDueDate: null,
        reason: null
      };

      // Check dependencies
      if (task.dependencies && task.dependencies.length > 0) {
        let latestDependencyEnd = moment(0);

        for (const dep of task.dependencies) {
          const depTask = await Task.findByPk(dep.dependsOnTaskId);

          if (depTask && depTask.dueDate) {
            const depEnd = moment(depTask.dueDate).add(dep.lagDays, 'days');

            if (depEnd.isAfter(latestDependencyEnd)) {
              latestDependencyEnd = depEnd;
            }
          }
        }

        // Suggest start date after dependencies complete
        const suggestedStart = latestDependencyEnd.clone().add(1, 'day');
        const duration = task.dueDate ? moment(task.dueDate).diff(moment(task.startDate), 'days') : 7;
        const suggestedEnd = suggestedStart.clone().add(duration, 'days');

        if (!task.dueDate || suggestedEnd.isAfter(task.dueDate)) {
          suggestion.suggestedDueDate = suggestedEnd.toDate();
          suggestion.reason = 'Adjust for dependency completion';
          suggestions.push(suggestion);
        }
      }
    }

    return suggestions;
  } catch (error) {
    logger.error('Failed to suggest schedule', {
      projectId,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  generateGanttData,
  identifyCriticalPath,
  calculateProjectStatistics,
  getResourceAllocation,
  suggestSchedule,
  calculateTaskProgress
};
