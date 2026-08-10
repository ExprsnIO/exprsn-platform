const express = require('express');
const router = express.Router();
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const taskService = require('../../../services/forge/groupware/taskService');
const logger = require('../../../utils/logger');

// Validation schemas
const taskCreateSchema = Joi.object({
  title: Joi.string().max(500).required(),
  description: Joi.string().optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  status: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled').optional(),
  dueDate: Joi.date().iso().optional(),
  assigneeId: Joi.string().uuid().optional(),
  projectId: Joi.string().uuid().optional(),
  parentTaskId: Joi.string().uuid().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  metadata: Joi.object().optional()
});

const taskUpdateSchema = taskCreateSchema.fork(
  ['title'],
  (schema) => schema.optional()
);

const assignmentSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  role: Joi.string().valid('assignee', 'reviewer', 'watcher').optional().default('assignee')
});

const dependencySchema = Joi.object({
  dependsOnTaskId: Joi.string().uuid().required(),
  dependencyType: Joi.string().valid('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish').optional().default('finish_to_start')
});

// List tasks
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    status: Joi.alternatives().try(
      Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled'),
      Joi.array().items(Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled'))
    ).optional(),
    priority: Joi.alternatives().try(
      Joi.string().valid('low', 'medium', 'high', 'urgent'),
      Joi.array().items(Joi.string().valid('low', 'medium', 'high', 'urgent'))
    ).optional(),
    assignedTo: Joi.string().uuid().optional(),
    projectId: Joi.string().uuid().optional(),
    parentTaskId: Joi.string().uuid().optional().allow(null),
    search: Joi.string().optional(),
    orderBy: Joi.string().valid('createdAt', 'dueDate', 'priority', 'status').optional(),
    orderDirection: Joi.string().valid('ASC', 'DESC').optional()
  })),
  async (req, res) => {
    try {
      const {
        page,
        limit,
        status,
        priority,
        assignedTo,
        projectId,
        parentTaskId,
        search,
        orderBy,
        orderDirection
      } = req.query;
      const offset = (page - 1) * limit;

      const result = await taskService.listTasks({
        status,
        priority,
        assignedTo,
        creatorId: req.user.id,
        projectId,
        parentTaskId,
        search,
        limit,
        offset,
        orderBy: orderBy || 'createdAt',
        orderDirection: orderDirection || 'DESC'
      });

      res.json({
        success: true,
        tasks: result.tasks,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list tasks', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list tasks'
      });
    }
  }
);

// Get task statistics
router.get('/stats',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    assignedTo: Joi.string().uuid().optional(),
    projectId: Joi.string().uuid().optional()
  })),
  async (req, res) => {
    try {
      const stats = await taskService.getTaskStatistics({
        creatorId: req.user.id,
        assignedTo: req.query.assignedTo,
        projectId: req.query.projectId
      });

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Failed to get task stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get task statistics'
      });
    }
  }
);

// Get overdue tasks
router.get('/overdue',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    assignedTo: Joi.string().uuid().optional(),
    projectId: Joi.string().uuid().optional()
  })),
  async (req, res) => {
    try {
      const tasks = await taskService.getOverdueTasks({
        creatorId: req.user.id,
        assignedTo: req.query.assignedTo,
        projectId: req.query.projectId
      });

      res.json({
        success: true,
        tasks
      });
    } catch (error) {
      logger.error('Failed to get overdue tasks', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get overdue tasks'
      });
    }
  }
);

// Get task by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(Joi.object({
    includeRelations: Joi.boolean().optional()
  })),
  async (req, res) => {
    try {
      const task = await taskService.getTaskById(
        req.params.id,
        req.query.includeRelations === 'true'
      );

      res.json({
        success: true,
        task
      });
    } catch (error) {
      logger.error('Failed to get task', { error: error.message, taskId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get task assignments
router.get('/:id/assignments',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const assignments = await taskService.getTaskAssignments(req.params.id);

      res.json({
        success: true,
        assignments
      });
    } catch (error) {
      logger.error('Failed to get task assignments', { error: error.message, taskId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get task assignments'
      });
    }
  }
);

// Get task dependencies
router.get('/:id/dependencies',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const dependencies = await taskService.getTaskDependencies(req.params.id);

      res.json({
        success: true,
        dependencies
      });
    } catch (error) {
      logger.error('Failed to get task dependencies', { error: error.message, taskId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get task dependencies'
      });
    }
  }
);

// Create task
router.post('/',
  
  requirePermission('write'),
  validateBody(taskCreateSchema),
  async (req, res) => {
    try {
      const task = await taskService.createTask({
        ...req.body,
        creatorId: req.user.id
      });

      // Auto-assign if assigneeId provided
      if (req.body.assigneeId) {
        await taskService.assignTask(task.id, req.body.assigneeId);
      }

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('task:created', { task });
      if (req.body.assigneeId && req.body.assigneeId !== req.user.id) {
        io.to(`user:${req.body.assigneeId}`).emit('task:assigned', { task });
      }

      logger.info('Task created', {
        taskId: task.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        task
      });
    } catch (error) {
      logger.error('Failed to create task', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create task'
      });
    }
  }
);

// Assign task to user
router.post('/:id/assign',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(assignmentSchema),
  async (req, res) => {
    try {
      const assignment = await taskService.assignTask(
        req.params.id,
        req.body.userId,
        req.body.role
      );

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.body.userId}`).emit('task:assigned', {
        taskId: req.params.id,
        assignment
      });

      logger.info('Task assigned', {
        taskId: req.params.id,
        userId: req.body.userId,
        role: req.body.role
      });

      res.json({
        success: true,
        assignment
      });
    } catch (error) {
      logger.error('Failed to assign task', { error: error.message, taskId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Unassign task from user
router.delete('/:id/assign/:userId',
  
  requirePermission('write'),
  validateParams(Joi.object({
    id: Joi.string().uuid().required(),
    userId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      await taskService.unassignTask(req.params.id, req.params.userId);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.params.userId}`).emit('task:unassigned', {
        taskId: req.params.id
      });

      logger.info('Task unassigned', {
        taskId: req.params.id,
        userId: req.params.userId
      });

      res.json({
        success: true,
        message: 'Task unassigned successfully'
      });
    } catch (error) {
      logger.error('Failed to unassign task', { error: error.message, taskId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Add task dependency
router.post('/:id/dependencies',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(dependencySchema),
  async (req, res) => {
    try {
      const dependency = await taskService.addDependency(
        req.params.id,
        req.body.dependsOnTaskId,
        req.body.dependencyType
      );

      logger.info('Task dependency added', {
        taskId: req.params.id,
        dependsOnTaskId: req.body.dependsOnTaskId
      });

      res.status(201).json({
        success: true,
        dependency
      });
    } catch (error) {
      logger.error('Failed to add dependency', { error: error.message, taskId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Remove task dependency
router.delete('/:id/dependencies/:dependsOnTaskId',
  
  requirePermission('write'),
  validateParams(Joi.object({
    id: Joi.string().uuid().required(),
    dependsOnTaskId: Joi.string().uuid().required()
  })),
  async (req, res) => {
    try {
      await taskService.removeDependency(req.params.id, req.params.dependsOnTaskId);

      logger.info('Task dependency removed', {
        taskId: req.params.id,
        dependsOnTaskId: req.params.dependsOnTaskId
      });

      res.json({
        success: true,
        message: 'Dependency removed successfully'
      });
    } catch (error) {
      logger.error('Failed to remove dependency', { error: error.message, taskId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update task
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(taskUpdateSchema),
  async (req, res) => {
    try {
      const task = await taskService.updateTask(req.params.id, req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('task:updated', { task });

      logger.info('Task updated', {
        taskId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        task
      });
    } catch (error) {
      logger.error('Failed to update task', { error: error.message, taskId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete task
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      await taskService.deleteTask(req.params.id);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('task:deleted', { taskId: req.params.id });

      logger.info('Task deleted', {
        taskId: req.params.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Task deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete task', { error: error.message, taskId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
