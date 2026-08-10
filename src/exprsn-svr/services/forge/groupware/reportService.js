/**
 * Groupware Report Builder Service
 * Generates reports for Groupware module (Tasks, Time Tracking, Projects, etc.)
 */

const { Task, TimeEntry, Board, BoardCard, Project } = require('../../../models/forge');
const { Op } = require('sequelize');
const reportVariableService = require('../shared/reportVariableService');
const logger = require('../../../utils/logger');

class GroupwareReportService {
  constructor() {
    this.availableReports = {
      tasks_summary: {
        name: 'Tasks Summary',
        description: 'Task completion and status tracking',
        category: 'groupware',
        variables: this.getTasksSummaryVariables()
      },
      time_tracking: {
        name: 'Time Tracking Report',
        description: 'Time entries and billable hours',
        category: 'groupware',
        variables: this.getTimeTrackingVariables()
      },
      project_status: {
        name: 'Project Status Report',
        description: 'Project progress and completion',
        category: 'groupware',
        variables: this.getProjectStatusVariables()
      },
      team_productivity: {
        name: 'Team Productivity',
        description: 'Team performance metrics',
        category: 'groupware',
        variables: this.getTeamProductivityVariables()
      },
      kanban_metrics: {
        name: 'Kanban Metrics',
        description: 'Board and card flow analytics',
        category: 'groupware',
        variables: this.getKanbanMetricsVariables()
      },
      resource_allocation: {
        name: 'Resource Allocation',
        description: 'Task and project resource distribution',
        category: 'groupware',
        variables: this.getResourceAllocationVariables()
      }
    };
  }

  getAvailableReports() {
    return this.availableReports;
  }

  async generateReport(reportType, parameters, context = {}) {
    const reportConfig = this.availableReports[reportType];
    if (!reportConfig) {
      throw new Error(`Unknown Groupware report type: ${reportType}`);
    }

    const variables = reportVariableService.resolveVariables(reportConfig.variables, parameters, context);
    const validation = reportVariableService.validateVariables(reportConfig.variables, variables);

    if (!validation.valid) {
      throw new Error(`Variable validation failed: ${JSON.stringify(validation.errors)}`);
    }

    switch (reportType) {
      case 'tasks_summary':
        return await this.generateTasksSummary(variables);
      case 'time_tracking':
        return await this.generateTimeTracking(variables);
      case 'project_status':
        return await this.generateProjectStatus(variables);
      case 'team_productivity':
        return await this.generateTeamProductivity(variables);
      case 'kanban_metrics':
        return await this.generateKanbanMetrics(variables);
      case 'resource_allocation':
        return await this.generateResourceAllocation(variables);
      default:
        throw new Error(`Report type not implemented: ${reportType}`);
    }
  }

  // ===== Variable Definitions =====

  getTasksSummaryVariables() {
    return {
      ...reportVariableService.createCommonVariables('groupware'),
      project_id: reportVariableService.defineVariable({
        name: 'project_id',
        label: 'Project',
        type: reportVariableService.variableTypes.SELECT,
        required: false
      }),
      include_subtasks: reportVariableService.defineVariable({
        name: 'include_subtasks',
        label: 'Include Subtasks',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: true,
        required: false
      })
    };
  }

  getTimeTrackingVariables() {
    return {
      ...reportVariableService.createDateRangeVariable('date_range', 'Period'),
      ...reportVariableService.createUserVariable('user_id', 'User', { required: false }),
      billable_only: reportVariableService.defineVariable({
        name: 'billable_only',
        label: 'Billable Hours Only',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: false,
        required: false
      }),
      group_by: reportVariableService.createSelectVariable('group_by', 'Group By', [
        { label: 'User', value: 'user' },
        { label: 'Project', value: 'project' },
        { label: 'Task', value: 'task' },
        { label: 'Date', value: 'date' }
      ], { defaultValue: 'user' })
    };
  }

  getProjectStatusVariables() {
    return {
      project_id: reportVariableService.defineVariable({
        name: 'project_id',
        label: 'Project',
        type: reportVariableService.variableTypes.SELECT,
        required: false
      }),
      status: reportVariableService.createSelectVariable('status', 'Status', [
        { label: 'All', value: 'all' },
        { label: 'Active', value: 'active' },
        { label: 'On Hold', value: 'on_hold' },
        { label: 'Completed', value: 'completed' }
      ], { defaultValue: 'active' })
    };
  }

  getTeamProductivityVariables() {
    return {
      ...reportVariableService.createDateRangeVariable('date_range', 'Period'),
      metrics: reportVariableService.defineVariable({
        name: 'metrics',
        label: 'Metrics to Include',
        type: reportVariableService.variableTypes.MULTI_SELECT,
        options: [
          { label: 'Tasks Completed', value: 'tasks_completed' },
          { label: 'Hours Logged', value: 'hours_logged' },
          { label: 'Projects Delivered', value: 'projects_delivered' },
          { label: 'Response Time', value: 'response_time' }
        ],
        defaultValue: ['tasks_completed', 'hours_logged'],
        required: false
      })
    };
  }

  getKanbanMetricsVariables() {
    return {
      board_id: reportVariableService.defineVariable({
        name: 'board_id',
        label: 'Board',
        type: reportVariableService.variableTypes.SELECT,
        required: false
      }),
      ...reportVariableService.createDateRangeVariable('date_range', 'Period'),
      show_cycle_time: reportVariableService.defineVariable({
        name: 'show_cycle_time',
        label: 'Show Cycle Time',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: true,
        required: false
      })
    };
  }

  getResourceAllocationVariables() {
    return {
      view_by: reportVariableService.createSelectVariable('view_by', 'View By', [
        { label: 'User', value: 'user' },
        { label: 'Project', value: 'project' },
        { label: 'Department', value: 'department' }
      ], { defaultValue: 'user' })
    };
  }

  // ===== Report Generators =====

  async generateTasksSummary(variables) {
    const where = {};

    if (variables.date_range) {
      where.createdAt = {
        [Op.gte]: variables.date_range.startDate,
        [Op.lte]: variables.date_range.endDate
      };
    }

    if (variables.project_id) {
      where.projectId = variables.project_id;
    }

    if (variables.task_status && variables.task_status !== 'all') {
      where.status = variables.task_status;
    }

    if (variables.assigned_to) {
      where.assignedTo = variables.assigned_to;
    }

    if (!variables.include_subtasks) {
      where.parentTaskId = null;
    }

    const tasks = await Task.findAll({ where, order: [['createdAt', 'DESC']] });

    const byStatus = this.groupBy(tasks, 'status');
    const byPriority = this.groupBy(tasks, 'priority');
    const completed = tasks.filter(t => t.status === 'completed').length;
    const completionRate = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;

    return {
      reportType: 'tasks_summary',
      title: 'Tasks Summary Report',
      generatedAt: new Date(),
      parameters: variables,
      data: tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assignedTo: t.assignedTo,
        dueDate: t.dueDate,
        completedAt: t.completedAt,
        createdAt: t.createdAt
      })),
      rowCount: tasks.length,
      summary: {
        totalTasks: tasks.length,
        completed,
        completionRate: completionRate.toFixed(2) + '%',
        byStatus,
        byPriority
      }
    };
  }

  async generateTimeTracking(variables) {
    const where = {};

    if (variables.date_range) {
      where.startTime = {
        [Op.gte]: variables.date_range.startDate,
        [Op.lte]: variables.date_range.endDate
      };
    }

    if (variables.user_id) {
      where.userId = variables.user_id;
    }

    if (variables.billable_only) {
      where.isBillable = true;
    }

    const timeEntries = await TimeEntry.findAll({
      where,
      include: [{ model: Task, as: 'task', required: false }],
      order: [['startTime', 'DESC']]
    });

    const totalDuration = timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
    const billableDuration = timeEntries
      .filter(e => e.isBillable)
      .reduce((sum, entry) => sum + (entry.duration || 0), 0);
    const totalAmount = timeEntries.reduce((sum, entry) => sum + (entry.billedAmount || 0), 0);

    const grouped = this.groupTimeEntries(timeEntries, variables.group_by);

    return {
      reportType: 'time_tracking',
      title: 'Time Tracking Report',
      generatedAt: new Date(),
      parameters: variables,
      data: timeEntries.map(e => ({
        id: e.id,
        userId: e.userId,
        taskId: e.taskId,
        taskTitle: e.task?.title || null,
        startTime: e.startTime,
        endTime: e.endTime,
        duration: e.duration,
        isBillable: e.isBillable,
        hourlyRate: e.hourlyRate,
        billedAmount: e.billedAmount
      })),
      rowCount: timeEntries.length,
      grouped,
      summary: {
        totalEntries: timeEntries.length,
        totalHours: (totalDuration / 3600).toFixed(2),
        billableHours: (billableDuration / 3600).toFixed(2),
        totalAmount: totalAmount.toFixed(2)
      }
    };
  }

  async generateProjectStatus(variables) {
    const where = {};

    if (variables.project_id) {
      where.id = variables.project_id;
    }

    if (variables.status && variables.status !== 'all') {
      where.status = variables.status;
    }

    const projects = await Project.findAll({ where, order: [['createdAt', 'DESC']] });

    return {
      reportType: 'project_status',
      title: 'Project Status Report',
      generatedAt: new Date(),
      parameters: variables,
      data: projects.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        startDate: p.startDate,
        endDate: p.endDate,
        progress: p.progress || 0
      })),
      rowCount: projects.length,
      summary: {
        totalProjects: projects.length,
        byStatus: this.groupBy(projects, 'status')
      }
    };
  }

  async generateTeamProductivity(variables) {
    // Placeholder for team productivity metrics
    return {
      reportType: 'team_productivity',
      title: 'Team Productivity Report',
      generatedAt: new Date(),
      parameters: variables,
      message: 'Team productivity report - implementation in progress'
    };
  }

  async generateKanbanMetrics(variables) {
    const where = {};

    if (variables.board_id) {
      where.id = variables.board_id;
    }

    const boards = await Board.findAll({
      where,
      include: [{ model: BoardCard, as: 'cards', required: false }]
    });

    return {
      reportType: 'kanban_metrics',
      title: 'Kanban Metrics Report',
      generatedAt: new Date(),
      parameters: variables,
      data: boards.map(b => ({
        id: b.id,
        name: b.name,
        cardCount: b.cards?.length || 0
      })),
      rowCount: boards.length
    };
  }

  async generateResourceAllocation(variables) {
    // Placeholder for resource allocation
    return {
      reportType: 'resource_allocation',
      title: 'Resource Allocation Report',
      generatedAt: new Date(),
      parameters: variables,
      message: 'Resource allocation report - implementation in progress'
    };
  }

  // ===== Helper Methods =====

  groupBy(items, field) {
    const groups = {};
    items.forEach(item => {
      const key = item[field] || 'Unknown';
      groups[key] = (groups[key] || 0) + 1;
    });
    return groups;
  }

  groupTimeEntries(entries, groupBy) {
    const grouped = {};

    entries.forEach(entry => {
      let key;
      switch (groupBy) {
        case 'user':
          key = entry.userId || 'Unknown';
          break;
        case 'project':
          key = entry.task?.projectId || 'Unknown';
          break;
        case 'task':
          key = entry.taskId || 'Unknown';
          break;
        case 'date':
          key = new Date(entry.startTime).toLocaleDateString();
          break;
        default:
          key = 'All';
      }

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(entry);
    });

    return grouped;
  }
}

module.exports = new GroupwareReportService();
