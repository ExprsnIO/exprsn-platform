const { Op } = require('sequelize');
const { TimeEntry, Task } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const moment = require('moment');

/**
 * Time Tracking Service
 *
 * Handles time entry creation, timer management, and reporting
 */

// ===== Timer Operations =====

/**
 * Start a timer for a task
 */
async function startTimer({
  userId,
  taskId,
  projectId,
  activityType,
  description,
  isBillable = true,
  hourlyRate
}) {
  try {
    // Check if user already has a running timer
    const runningTimer = await TimeEntry.findOne({
      where: {
        userId,
        isRunning: true
      }
    });

    if (runningTimer) {
      throw new Error('You already have a running timer. Please stop it before starting a new one.');
    }

    // Verify task exists if provided
    if (taskId) {
      const task = await Task.findByPk(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
    }

    const timeEntry = await TimeEntry.create({
      userId,
      taskId,
      projectId,
      activityType,
      description,
      startTime: new Date(),
      isRunning: true,
      isManual: false,
      isBillable,
      hourlyRate,
      status: 'draft'
    });

    logger.info('Timer started', {
      timeEntryId: timeEntry.id,
      userId,
      taskId
    });

    return timeEntry;
  } catch (error) {
    logger.error('Failed to start timer', {
      userId,
      taskId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Stop a running timer
 */
async function stopTimer(userId, timeEntryId = null) {
  try {
    let timeEntry;

    if (timeEntryId) {
      timeEntry = await TimeEntry.findByPk(timeEntryId);
      if (!timeEntry) {
        throw new Error(`Time entry not found: ${timeEntryId}`);
      }
      if (timeEntry.userId !== userId) {
        throw new Error('Unauthorized: This timer belongs to another user');
      }
    } else {
      // Stop the currently running timer for this user
      timeEntry = await TimeEntry.findOne({
        where: {
          userId,
          isRunning: true
        }
      });

      if (!timeEntry) {
        throw new Error('No running timer found');
      }
    }

    if (!timeEntry.isRunning) {
      throw new Error('Timer is not running');
    }

    const endTime = new Date();
    const duration = Math.floor((endTime - timeEntry.startTime) / 1000); // seconds

    // Calculate billed amount if applicable
    let billedAmount = null;
    if (timeEntry.isBillable && timeEntry.hourlyRate) {
      const hours = (duration - timeEntry.breakDuration) / 3600;
      billedAmount = hours * timeEntry.hourlyRate;
    }

    await timeEntry.update({
      endTime,
      duration,
      billedAmount,
      isRunning: false
    });

    logger.info('Timer stopped', {
      timeEntryId: timeEntry.id,
      userId,
      duration
    });

    return timeEntry;
  } catch (error) {
    logger.error('Failed to stop timer', {
      userId,
      timeEntryId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get currently running timer for user
 */
async function getRunningTimer(userId) {
  const timeEntry = await TimeEntry.findOne({
    where: {
      userId,
      isRunning: true
    },
    include: [
      {
        model: Task,
        as: 'task',
        attributes: ['id', 'title', 'status']
      }
    ]
  });

  if (timeEntry) {
    // Calculate current elapsed time
    const elapsed = Math.floor((new Date() - timeEntry.startTime) / 1000);
    timeEntry.dataValues.elapsed = elapsed;
  }

  return timeEntry;
}

/**
 * Add break time to a running timer
 */
async function addBreak(timeEntryId, breakDurationSeconds) {
  try {
    const timeEntry = await TimeEntry.findByPk(timeEntryId);

    if (!timeEntry) {
      throw new Error(`Time entry not found: ${timeEntryId}`);
    }

    await timeEntry.update({
      breakDuration: timeEntry.breakDuration + breakDurationSeconds
    });

    logger.info('Break time added', {
      timeEntryId,
      breakDuration: breakDurationSeconds
    });

    return timeEntry;
  } catch (error) {
    logger.error('Failed to add break', {
      timeEntryId,
      error: error.message
    });
    throw error;
  }
}

// ===== Manual Time Entry =====

/**
 * Create a manual time entry
 */
async function createManualEntry({
  userId,
  taskId,
  projectId,
  activityType,
  description,
  startTime,
  endTime,
  duration,
  isBillable = true,
  hourlyRate,
  tags,
  location
}) {
  try {
    // Verify task exists if provided
    if (taskId) {
      const task = await Task.findByPk(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
    }

    // Validate times
    const start = moment(startTime);
    const end = moment(endTime);

    if (!start.isValid() || !end.isValid()) {
      throw new Error('Invalid start or end time');
    }

    if (end.isBefore(start)) {
      throw new Error('End time must be after start time');
    }

    // Calculate duration if not provided
    if (!duration) {
      duration = Math.floor(end.diff(start) / 1000); // seconds
    }

    // Calculate billed amount
    let billedAmount = null;
    if (isBillable && hourlyRate) {
      const hours = duration / 3600;
      billedAmount = hours * hourlyRate;
    }

    const timeEntry = await TimeEntry.create({
      userId,
      taskId,
      projectId,
      activityType,
      description,
      startTime: start.toDate(),
      endTime: end.toDate(),
      duration,
      isManual: true,
      isRunning: false,
      isBillable,
      hourlyRate,
      billedAmount,
      tags: tags || [],
      location,
      status: 'draft'
    });

    logger.info('Manual time entry created', {
      timeEntryId: timeEntry.id,
      userId,
      duration
    });

    return timeEntry;
  } catch (error) {
    logger.error('Failed to create manual entry', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update time entry
 */
async function updateTimeEntry(id, userId, updates) {
  try {
    const timeEntry = await TimeEntry.findByPk(id);

    if (!timeEntry) {
      throw new Error(`Time entry not found: ${id}`);
    }

    if (timeEntry.userId !== userId) {
      throw new Error('Unauthorized: This time entry belongs to another user');
    }

    // Can't update if already invoiced
    if (timeEntry.status === 'invoiced') {
      throw new Error('Cannot update invoiced time entry');
    }

    // If times are updated, recalculate duration
    if (updates.startTime || updates.endTime) {
      const start = moment(updates.startTime || timeEntry.startTime);
      const end = moment(updates.endTime || timeEntry.endTime);
      updates.duration = Math.floor(end.diff(start) / 1000);
    }

    // Recalculate billed amount if needed
    if (updates.duration || updates.hourlyRate !== undefined || updates.isBillable !== undefined) {
      const isBillable = updates.isBillable !== undefined ? updates.isBillable : timeEntry.isBillable;
      const hourlyRate = updates.hourlyRate !== undefined ? updates.hourlyRate : timeEntry.hourlyRate;
      const duration = updates.duration || timeEntry.duration;

      if (isBillable && hourlyRate) {
        const hours = (duration - timeEntry.breakDuration) / 3600;
        updates.billedAmount = hours * hourlyRate;
      } else {
        updates.billedAmount = null;
      }
    }

    await timeEntry.update(updates);

    logger.info('Time entry updated', {
      timeEntryId: id,
      userId
    });

    return timeEntry;
  } catch (error) {
    logger.error('Failed to update time entry', {
      timeEntryId: id,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete time entry
 */
async function deleteTimeEntry(id, userId) {
  try {
    const timeEntry = await TimeEntry.findByPk(id);

    if (!timeEntry) {
      throw new Error(`Time entry not found: ${id}`);
    }

    if (timeEntry.userId !== userId) {
      throw new Error('Unauthorized: This time entry belongs to another user');
    }

    if (timeEntry.status === 'invoiced') {
      throw new Error('Cannot delete invoiced time entry');
    }

    await timeEntry.destroy();

    logger.info('Time entry deleted', {
      timeEntryId: id,
      userId
    });

    return { success: true, message: 'Time entry deleted successfully' };
  } catch (error) {
    logger.error('Failed to delete time entry', {
      timeEntryId: id,
      error: error.message
    });
    throw error;
  }
}

// ===== Time Entry Queries =====

/**
 * List time entries with filtering
 */
async function listTimeEntries({
  userId,
  taskId,
  projectId,
  startDate,
  endDate,
  status,
  isBillable,
  isInvoiced,
  activityType,
  limit = 50,
  offset = 0
}) {
  const where = {};

  if (userId) {
    where.userId = userId;
  }

  if (taskId) {
    where.taskId = taskId;
  }

  if (projectId) {
    where.projectId = projectId;
  }

  if (startDate || endDate) {
    where.startTime = {};
    if (startDate) {
      where.startTime[Op.gte] = moment(startDate).startOf('day').toDate();
    }
    if (endDate) {
      where.startTime[Op.lte] = moment(endDate).endOf('day').toDate();
    }
  }

  if (status) {
    where.status = status;
  }

  if (isBillable !== undefined) {
    where.isBillable = isBillable;
  }

  if (isInvoiced !== undefined) {
    where.invoiceId = isInvoiced ? { [Op.ne]: null } : null;
  }

  if (activityType) {
    where.activityType = activityType;
  }

  const { count, rows } = await TimeEntry.findAndCountAll({
    where,
    limit,
    offset,
    order: [['startTime', 'DESC']],
    include: [
      {
        model: Task,
        as: 'task',
        attributes: ['id', 'title', 'status'],
        required: false
      }
    ]
  });

  return {
    timeEntries: rows,
    total: count,
    limit,
    offset
  };
}

// ===== Reporting =====

/**
 * Get time summary for a user/project/task
 */
async function getTimeSummary({
  userId,
  taskId,
  projectId,
  startDate,
  endDate,
  groupBy = 'day' // 'day', 'week', 'month', 'task', 'project', 'activityType'
}) {
  const where = {
    isRunning: false
  };

  if (userId) {
    where.userId = userId;
  }

  if (taskId) {
    where.taskId = taskId;
  }

  if (projectId) {
    where.projectId = projectId;
  }

  if (startDate || endDate) {
    where.startTime = {};
    if (startDate) {
      where.startTime[Op.gte] = moment(startDate).startOf('day').toDate();
    }
    if (endDate) {
      where.startTime[Op.lte] = moment(endDate).endOf('day').toDate();
    }
  }

  const timeEntries = await TimeEntry.findAll({
    where,
    include: [
      {
        model: Task,
        as: 'task',
        attributes: ['id', 'title'],
        required: false
      }
    ]
  });

  const summary = {
    totalDuration: 0,
    totalBillable: 0,
    totalNonBillable: 0,
    totalAmount: 0,
    entryCount: timeEntries.length,
    breakdown: {}
  };

  for (const entry of timeEntries) {
    const duration = entry.duration - entry.breakDuration;

    summary.totalDuration += duration;

    if (entry.isBillable) {
      summary.totalBillable += duration;
      if (entry.billedAmount) {
        summary.totalAmount += parseFloat(entry.billedAmount);
      }
    } else {
      summary.totalNonBillable += duration;
    }

    // Group by key
    let key;
    switch (groupBy) {
      case 'day':
        key = moment(entry.startTime).format('YYYY-MM-DD');
        break;
      case 'week':
        key = moment(entry.startTime).format('YYYY-[W]WW');
        break;
      case 'month':
        key = moment(entry.startTime).format('YYYY-MM');
        break;
      case 'task':
        key = entry.task ? entry.task.title : 'No Task';
        break;
      case 'project':
        key = entry.projectId || 'No Project';
        break;
      case 'activityType':
        key = entry.activityType || 'Unspecified';
        break;
      default:
        key = 'all';
    }

    if (!summary.breakdown[key]) {
      summary.breakdown[key] = {
        duration: 0,
        billableDuration: 0,
        amount: 0,
        entries: 0
      };
    }

    summary.breakdown[key].duration += duration;
    summary.breakdown[key].entries++;

    if (entry.isBillable) {
      summary.breakdown[key].billableDuration += duration;
      if (entry.billedAmount) {
        summary.breakdown[key].amount += parseFloat(entry.billedAmount);
      }
    }
  }

  // Convert durations to human-readable format
  summary.totalDurationFormatted = formatDuration(summary.totalDuration);
  summary.totalBillableFormatted = formatDuration(summary.totalBillable);
  summary.totalNonBillableFormatted = formatDuration(summary.totalNonBillable);

  return summary;
}

/**
 * Submit time entries for approval
 */
async function submitTimeEntries(userId, timeEntryIds) {
  try {
    const timeEntries = await TimeEntry.findAll({
      where: {
        id: { [Op.in]: timeEntryIds },
        userId,
        status: 'draft'
      }
    });

    if (timeEntries.length === 0) {
      throw new Error('No valid time entries found to submit');
    }

    for (const entry of timeEntries) {
      await entry.update({
        status: 'submitted',
        submittedAt: new Date()
      });
    }

    logger.info('Time entries submitted', {
      userId,
      count: timeEntries.length
    });

    return {
      success: true,
      count: timeEntries.length,
      message: `${timeEntries.length} time entries submitted for approval`
    };
  } catch (error) {
    logger.error('Failed to submit time entries', {
      userId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Approve time entries
 */
async function approveTimeEntries(approverUserId, timeEntryIds) {
  try {
    const timeEntries = await TimeEntry.findAll({
      where: {
        id: { [Op.in]: timeEntryIds },
        status: 'submitted'
      }
    });

    if (timeEntries.length === 0) {
      throw new Error('No valid time entries found to approve');
    }

    for (const entry of timeEntries) {
      await entry.update({
        status: 'approved',
        approvedAt: new Date(),
        approvedById: approverUserId
      });
    }

    logger.info('Time entries approved', {
      approverUserId,
      count: timeEntries.length
    });

    return {
      success: true,
      count: timeEntries.length,
      message: `${timeEntries.length} time entries approved`
    };
  } catch (error) {
    logger.error('Failed to approve time entries', {
      approverUserId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Reject time entries
 */
async function rejectTimeEntries(rejecterUserId, timeEntryIds, reason) {
  try {
    const timeEntries = await TimeEntry.findAll({
      where: {
        id: { [Op.in]: timeEntryIds },
        status: 'submitted'
      }
    });

    if (timeEntries.length === 0) {
      throw new Error('No valid time entries found to reject');
    }

    for (const entry of timeEntries) {
      await entry.update({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectedById: rejecterUserId,
        rejectionReason: reason
      });
    }

    logger.info('Time entries rejected', {
      rejecterUserId,
      count: timeEntries.length
    });

    return {
      success: true,
      count: timeEntries.length,
      message: `${timeEntries.length} time entries rejected`
    };
  } catch (error) {
    logger.error('Failed to reject time entries', {
      rejecterUserId,
      error: error.message
    });
    throw error;
  }
}

// ===== Helper Functions =====

/**
 * Format duration in seconds to human-readable string
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

module.exports = {
  // Timer operations
  startTimer,
  stopTimer,
  getRunningTimer,
  addBreak,

  // Manual time entries
  createManualEntry,
  updateTimeEntry,
  deleteTimeEntry,

  // Queries
  listTimeEntries,
  getTimeSummary,

  // Approval workflow
  submitTimeEntries,
  approveTimeEntries,
  rejectTimeEntries,

  // Utilities
  formatDuration
};
