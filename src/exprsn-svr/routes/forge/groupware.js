const express = require('express');
const router = express.Router();
const calendarService = require('../../services/forge/groupware/calendarService');
const taskService = require('../../services/forge/groupware/taskService');
const documentService = require('../../services/forge/groupware/documentService');
const logger = require('../../utils/logger');
const {  optionalAuth } = require('../../middleware/auth');

/**
 * Groupware API Routes
 *
 * Provides endpoints for Calendar, Tasks, and Documents
 */

// =============== CALENDAR ROUTES ===============

/**
 * @route   GET /api/groupware/calendars
 * @desc    List calendars
 * @access  Authenticated
 */
router.get('/calendars',  async (req, res) => {
  try {
    const { ownerId, isPublic, limit, offset } = req.query;

    const result = await calendarService.listCalendars({
      ownerId: ownerId || req.user.id,
      isPublic: isPublic === 'true' ? true : isPublic === 'false' ? false : undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('GET /api/groupware/calendars failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/groupware/calendars
 * @desc    Create a calendar
 * @access  Authenticated
 */
router.post('/calendars',  async (req, res) => {
  try {
    const { name, description, color, timezone, isPublic, metadata } = req.body;

    const calendar = await calendarService.createCalendar({
      name,
      description,
      color,
      timezone,
      isPublic,
      ownerId: req.user.id,
      metadata
    });

    res.status(201).json({
      success: true,
      calendar
    });
  } catch (error) {
    logger.error('POST /api/groupware/calendars failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/calendars/:id
 * @desc    Get calendar by ID
 * @access  Authenticated
 */
router.get('/calendars/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const { includeEvents } = req.query;

    const calendar = await calendarService.getCalendarById(id, includeEvents === 'true');

    res.json({
      success: true,
      calendar
    });
  } catch (error) {
    logger.error('GET /api/groupware/calendars/:id failed', { error: error.message });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/groupware/calendars/:id
 * @desc    Update a calendar
 * @access  Authenticated
 */
router.put('/calendars/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const calendar = await calendarService.updateCalendar(id, updates);

    res.json({
      success: true,
      calendar
    });
  } catch (error) {
    logger.error('PUT /api/groupware/calendars/:id failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/groupware/calendars/:id
 * @desc    Delete a calendar
 * @access  Authenticated
 */
router.delete('/calendars/:id',  async (req, res) => {
  try {
    const { id } = req.params;

    const result = await calendarService.deleteCalendar(id);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('DELETE /api/groupware/calendars/:id failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/calendars/:id/export
 * @desc    Export calendar to iCal format
 * @access  Authenticated
 */
router.get('/calendars/:id/export',  async (req, res) => {
  try {
    const { id } = req.params;

    const ical = await calendarService.exportToICal(id);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="calendar-${id}.ics"`);
    res.send(ical);
  } catch (error) {
    logger.error('GET /api/groupware/calendars/:id/export failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// =============== EVENT ROUTES ===============

/**
 * @route   GET /api/groupware/events
 * @desc    List events
 * @access  Authenticated
 */
router.get('/events',  async (req, res) => {
  try {
    const { calendarId, startDate, endDate, status, limit, offset } = req.query;

    const result = await calendarService.listEvents({
      calendarId,
      startDate,
      endDate,
      status,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('GET /api/groupware/events failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/groupware/events
 * @desc    Create an event
 * @access  Authenticated
 */
router.post('/events',  async (req, res) => {
  try {
    const {
      calendarId,
      title,
      description,
      location,
      startTime,
      endTime,
      isAllDay,
      recurrence,
      reminders,
      attendees,
      status,
      metadata
    } = req.body;

    const event = await calendarService.createEvent({
      calendarId,
      title,
      description,
      location,
      startTime,
      endTime,
      isAllDay,
      recurrence,
      reminders,
      attendees,
      status,
      createdBy: req.user.id,
      metadata
    });

    res.status(201).json({
      success: true,
      event
    });
  } catch (error) {
    logger.error('POST /api/groupware/events failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/events/:id
 * @desc    Get event by ID
 * @access  Authenticated
 */
router.get('/events/:id',  async (req, res) => {
  try {
    const { id } = req.params;

    const event = await calendarService.getEventById(id);

    res.json({
      success: true,
      event
    });
  } catch (error) {
    logger.error('GET /api/groupware/events/:id failed', { error: error.message });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/groupware/events/:id
 * @desc    Update an event
 * @access  Authenticated
 */
router.put('/events/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const event = await calendarService.updateEvent(id, updates);

    res.json({
      success: true,
      event
    });
  } catch (error) {
    logger.error('PUT /api/groupware/events/:id failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/groupware/events/:id
 * @desc    Delete an event
 * @access  Authenticated
 */
router.delete('/events/:id',  async (req, res) => {
  try {
    const { id } = req.params;

    const result = await calendarService.deleteEvent(id);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('DELETE /api/groupware/events/:id failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/events/search
 * @desc    Search events
 * @access  Authenticated
 */
router.get('/events/search',  async (req, res) => {
  try {
    const { query, calendarId, limit } = req.query;

    const events = await calendarService.searchEvents({
      query,
      calendarId,
      limit: limit ? parseInt(limit) : undefined
    });

    res.json({
      success: true,
      events
    });
  } catch (error) {
    logger.error('GET /api/groupware/events/search failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============== TASK ROUTES ===============

/**
 * @route   GET /api/groupware/tasks
 * @desc    List tasks
 * @access  Authenticated
 */
router.get('/tasks',  async (req, res) => {
  try {
    const {
      status,
      priority,
      assignedTo,
      createdBy,
      parentTaskId,
      projectId,
      search,
      limit,
      offset,
      orderBy,
      orderDirection
    } = req.query;

    const result = await taskService.listTasks({
      status: status ? status.split(',') : undefined,
      priority: priority ? priority.split(',') : undefined,
      assignedTo,
      createdBy,
      parentTaskId,
      projectId,
      search,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      orderBy,
      orderDirection
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('GET /api/groupware/tasks failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/groupware/tasks
 * @desc    Create a task
 * @access  Authenticated
 */
router.post('/tasks',  async (req, res) => {
  try {
    const {
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
      metadata
    } = req.body;

    const task = await taskService.createTask({
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
      createdBy: req.user.id,
      metadata
    });

    res.status(201).json({
      success: true,
      task
    });
  } catch (error) {
    logger.error('POST /api/groupware/tasks failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/tasks/:id
 * @desc    Get task by ID
 * @access  Authenticated
 */
router.get('/tasks/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const { includeRelations } = req.query;

    const task = await taskService.getTaskById(id, includeRelations === 'true');

    res.json({
      success: true,
      task
    });
  } catch (error) {
    logger.error('GET /api/groupware/tasks/:id failed', { error: error.message });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/groupware/tasks/:id
 * @desc    Update a task
 * @access  Authenticated
 */
router.put('/tasks/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const task = await taskService.updateTask(id, updates);

    res.json({
      success: true,
      task
    });
  } catch (error) {
    logger.error('PUT /api/groupware/tasks/:id failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/groupware/tasks/:id
 * @desc    Delete a task
 * @access  Authenticated
 */
router.delete('/tasks/:id',  async (req, res) => {
  try {
    const { id } = req.params;

    const result = await taskService.deleteTask(id);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('DELETE /api/groupware/tasks/:id failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/groupware/tasks/:id/assign
 * @desc    Assign task to user
 * @access  Authenticated
 */
router.post('/tasks/:id/assign',  async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, role } = req.body;

    const assignment = await taskService.assignTask(id, userId, role);

    res.json({
      success: true,
      assignment
    });
  } catch (error) {
    logger.error('POST /api/groupware/tasks/:id/assign failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/groupware/tasks/:id/assign/:userId
 * @desc    Unassign task from user
 * @access  Authenticated
 */
router.delete('/tasks/:id/assign/:userId',  async (req, res) => {
  try {
    const { id, userId } = req.params;

    const result = await taskService.unassignTask(id, userId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('DELETE /api/groupware/tasks/:id/assign/:userId failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/groupware/tasks/:id/dependencies
 * @desc    Add task dependency
 * @access  Authenticated
 */
router.post('/tasks/:id/dependencies',  async (req, res) => {
  try {
    const { id } = req.params;
    const { dependsOnTaskId, dependencyType } = req.body;

    const dependency = await taskService.addDependency(id, dependsOnTaskId, dependencyType);

    res.status(201).json({
      success: true,
      dependency
    });
  } catch (error) {
    logger.error('POST /api/groupware/tasks/:id/dependencies failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/groupware/tasks/:id/dependencies/:dependsOnTaskId
 * @desc    Remove task dependency
 * @access  Authenticated
 */
router.delete('/tasks/:id/dependencies/:dependsOnTaskId',  async (req, res) => {
  try {
    const { id, dependsOnTaskId } = req.params;

    const result = await taskService.removeDependency(id, dependsOnTaskId);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('DELETE /api/groupware/tasks/:id/dependencies/:dependsOnTaskId failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/tasks/statistics
 * @desc    Get task statistics
 * @access  Authenticated
 */
router.get('/tasks/statistics',  async (req, res) => {
  try {
    const { createdBy, assignedTo, projectId } = req.query;

    const stats = await taskService.getTaskStatistics({
      createdBy,
      assignedTo,
      projectId
    });

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('GET /api/groupware/tasks/statistics failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/tasks/overdue
 * @desc    Get overdue tasks
 * @access  Authenticated
 */
router.get('/tasks/overdue',  async (req, res) => {
  try {
    const { assignedTo, createdBy, projectId } = req.query;

    const tasks = await taskService.getOverdueTasks({
      assignedTo,
      createdBy,
      projectId
    });

    res.json({
      success: true,
      tasks
    });
  } catch (error) {
    logger.error('GET /api/groupware/tasks/overdue failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============== DOCUMENT ROUTES ===============

/**
 * @route   GET /api/groupware/folders
 * @desc    List folders
 * @access  Authenticated
 */
router.get('/folders',  async (req, res) => {
  try {
    const { parentFolderId, ownerId, search, limit, offset } = req.query;

    const result = await documentService.listFolders({
      parentFolderId: parentFolderId === 'null' ? null : parentFolderId,
      ownerId,
      search,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('GET /api/groupware/folders failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/groupware/folders
 * @desc    Create a folder
 * @access  Authenticated
 */
router.post('/folders',  async (req, res) => {
  try {
    const { name, description, parentFolderId, permissions, metadata } = req.body;

    const folder = await documentService.createFolder({
      name,
      description,
      parentFolderId,
      ownerId: req.user.id,
      permissions,
      metadata
    });

    res.status(201).json({
      success: true,
      folder
    });
  } catch (error) {
    logger.error('POST /api/groupware/folders failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/folders/:id
 * @desc    Get folder by ID
 * @access  Authenticated
 */
router.get('/folders/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const { includeContents } = req.query;

    const folder = await documentService.getFolderById(id, includeContents === 'true');

    res.json({
      success: true,
      folder
    });
  } catch (error) {
    logger.error('GET /api/groupware/folders/:id failed', { error: error.message });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/groupware/folders/:id
 * @desc    Update a folder
 * @access  Authenticated
 */
router.put('/folders/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const folder = await documentService.updateFolder(id, updates);

    res.json({
      success: true,
      folder
    });
  } catch (error) {
    logger.error('PUT /api/groupware/folders/:id failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/groupware/folders/:id
 * @desc    Delete a folder
 * @access  Authenticated
 */
router.delete('/folders/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const { recursive } = req.query;

    const result = await documentService.deleteFolder(id, recursive === 'true');

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('DELETE /api/groupware/folders/:id failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/folders/:id/path
 * @desc    Get folder breadcrumb path
 * @access  Authenticated
 */
router.get('/folders/:id/path',  async (req, res) => {
  try {
    const { id } = req.params;

    const path = await documentService.getFolderPath(id);

    res.json({
      success: true,
      path
    });
  } catch (error) {
    logger.error('GET /api/groupware/folders/:id/path failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/documents
 * @desc    List documents
 * @access  Authenticated
 */
router.get('/documents',  async (req, res) => {
  try {
    const {
      folderId,
      uploadedBy,
      mimeType,
      search,
      tags,
      limit,
      offset,
      orderBy,
      orderDirection
    } = req.query;

    const result = await documentService.listDocuments({
      folderId: folderId === 'null' ? null : folderId,
      uploadedBy,
      mimeType,
      search,
      tags: tags ? tags.split(',') : undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      orderBy,
      orderDirection
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('GET /api/groupware/documents failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/groupware/documents
 * @desc    Create a document
 * @access  Authenticated
 */
router.post('/documents',  async (req, res) => {
  try {
    const {
      filename,
      title,
      description,
      content,
      mimeType,
      size,
      folderId,
      tags,
      version,
      metadata
    } = req.body;

    const document = await documentService.createDocument({
      filename,
      title,
      description,
      content,
      mimeType,
      size,
      folderId,
      uploadedBy: req.user.id,
      tags,
      version,
      metadata
    });

    res.status(201).json({
      success: true,
      document
    });
  } catch (error) {
    logger.error('POST /api/groupware/documents failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/documents/:id
 * @desc    Get document by ID
 * @access  Authenticated
 */
router.get('/documents/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const { includeFolder } = req.query;

    const document = await documentService.getDocumentById(id, includeFolder === 'true');

    res.json({
      success: true,
      document
    });
  } catch (error) {
    logger.error('GET /api/groupware/documents/:id failed', { error: error.message });
    res.status(404).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/groupware/documents/:id
 * @desc    Update a document
 * @access  Authenticated
 */
router.put('/documents/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const document = await documentService.updateDocument(id, updates);

    res.json({
      success: true,
      document
    });
  } catch (error) {
    logger.error('PUT /api/groupware/documents/:id failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/groupware/documents/:id
 * @desc    Delete a document
 * @access  Authenticated
 */
router.delete('/documents/:id',  async (req, res) => {
  try {
    const { id } = req.params;

    const result = await documentService.deleteDocument(id);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('DELETE /api/groupware/documents/:id failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/groupware/documents/:id/move
 * @desc    Move document to folder
 * @access  Authenticated
 */
router.post('/documents/:id/move',  async (req, res) => {
  try {
    const { id } = req.params;
    const { targetFolderId } = req.body;

    const document = await documentService.moveDocument(id, targetFolderId);

    res.json({
      success: true,
      document
    });
  } catch (error) {
    logger.error('POST /api/groupware/documents/:id/move failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/groupware/documents/:id/copy
 * @desc    Copy document
 * @access  Authenticated
 */
router.post('/documents/:id/copy',  async (req, res) => {
  try {
    const { id } = req.params;
    const { targetFolderId, newTitle } = req.body;

    const document = await documentService.copyDocument(id, targetFolderId, newTitle);

    res.status(201).json({
      success: true,
      document
    });
  } catch (error) {
    logger.error('POST /api/groupware/documents/:id/copy failed', { error: error.message });
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/documents/search
 * @desc    Search documents
 * @access  Authenticated
 */
router.get('/documents/search',  async (req, res) => {
  try {
    const { query, mimeType, tags, limit } = req.query;

    const documents = await documentService.searchDocuments({
      query,
      mimeType,
      tags: tags ? tags.split(',') : undefined,
      limit: limit ? parseInt(limit) : undefined
    });

    res.json({
      success: true,
      documents
    });
  } catch (error) {
    logger.error('GET /api/groupware/documents/search failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/groupware/documents/statistics
 * @desc    Get document statistics
 * @access  Authenticated
 */
router.get('/documents/statistics',  async (req, res) => {
  try {
    const { uploadedBy, folderId } = req.query;

    const stats = await documentService.getDocumentStatistics({
      uploadedBy,
      folderId
    });

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    logger.error('GET /api/groupware/documents/statistics failed', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
