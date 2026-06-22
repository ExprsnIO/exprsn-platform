/**
 * ═══════════════════════════════════════════════════════════
 * Conversation Routes
 * Conversation management endpoints
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const { asyncHandler, AppError, validateCAToken, validateRequired } = require('@exprsn/shared');
const { Conversation, Participant, Message } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

// All conversation routes require authentication
router.use(validateCAToken({ requiredPermissions: ['read'] }));

/**
 * POST /api/conversations
 * Create new conversation
 */
router.post('/', validateCAToken({ requiredPermissions: ['write'] }), asyncHandler(async (req, res) => {
  const { type, name, participantIds } = req.body;

  validateRequired({ type, participantIds }, ['type', 'participantIds']);

  // Create conversation
  const conversation = await Conversation.create({
    type,
    name,
    createdBy: req.userId
  });

  // Add participants (including creator)
  const allParticipantIds = [...new Set([req.userId, ...participantIds])];

  await Promise.all(
    allParticipantIds.map((userId, index) =>
      Participant.create({
        conversationId: conversation.id,
        userId,
        role: userId === req.userId ? 'owner' : 'member'
      })
    )
  );

  res.status(201).json({
    message: 'Conversation created',
    conversation
  });
}));

/**
 * GET /api/conversations
 * Get user's conversations
 */
router.get('/', asyncHandler(async (req, res) => {
  const { limit = 20, offset = 0 } = req.query;

  const participants = await Participant.findAll({
    where: {
      userId: req.userId,
      active: true
    },
    include: [
      {
        model: Conversation,
        as: 'conversation',
        include: [
          {
            model: Message,
            as: 'messages',
            limit: 1,
            order: [['createdAt', 'DESC']],
            separate: true
          }
        ]
      }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [[{ model: Conversation, as: 'conversation' }, 'lastMessageAt', 'DESC']]
  });

  const conversations = participants.map(p => ({
    ...p.conversation.toJSON(),
    userRole: p.role,
    lastReadMessageId: p.lastReadMessageId,
    lastReadAt: p.lastReadAt
  }));

  res.json({ conversations });
}));

/**
 * GET /api/conversations/:id
 * Get conversation details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Check if user is participant
  const participant = await Participant.findOne({
    where: {
      conversationId: id,
      userId: req.userId,
      active: true
    }
  });

  if (!participant) {
    throw new AppError('Not a participant in this conversation', 403, 'FORBIDDEN');
  }

  const conversation = await Conversation.findByPk(id, {
    include: [
      {
        model: Participant,
        as: 'participants',
        where: { active: true }
      }
    ]
  });

  if (!conversation) {
    throw new AppError('Conversation not found', 404, 'NOT_FOUND');
  }

  res.json({ conversation });
}));

/**
 * PUT /api/conversations/:id
 * Update conversation
 */
router.put('/:id', validateCAToken({ requiredPermissions: ['update'] }), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, settings } = req.body;

  // Check if user is admin or owner
  const participant = await Participant.findOne({
    where: {
      conversationId: id,
      userId: req.userId,
      role: { [Op.in]: ['admin', 'owner'] },
      active: true
    }
  });

  if (!participant) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  const conversation = await Conversation.findByPk(id);

  if (!conversation) {
    throw new AppError('Conversation not found', 404, 'NOT_FOUND');
  }

  if (name !== undefined) conversation.name = name;
  if (description !== undefined) conversation.description = description;
  if (settings !== undefined) conversation.settings = { ...conversation.settings, ...settings };

  await conversation.save();

  res.json({
    message: 'Conversation updated',
    conversation
  });
}));

/**
 * DELETE /api/conversations/:id
 * Leave conversation
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const participant = await Participant.findOne({
    where: {
      conversationId: id,
      userId: req.userId,
      active: true
    }
  });

  if (!participant) {
    throw new AppError('Not a participant in this conversation', 404, 'NOT_FOUND');
  }

  participant.active = false;
  participant.leftAt = new Date();
  await participant.save();

  res.json({ message: 'Left conversation successfully' });
}));

/**
 * POST /api/conversations/:id/participants
 * Add participant to conversation
 */
router.post('/:id/participants', validateCAToken({ requiredPermissions: ['write'] }), asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  validateRequired({ userId }, ['userId']);

  // Check if user is admin or owner
  const requester = await Participant.findOne({
    where: {
      conversationId: id,
      userId: req.userId,
      role: { [Op.in]: ['admin', 'owner'] },
      active: true
    }
  });

  if (!requester) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }

  // Check if already participant
  const existing = await Participant.findOne({
    where: {
      conversationId: id,
      userId,
      active: true
    }
  });

  if (existing) {
    throw new AppError('Already a participant', 409, 'ALREADY_PARTICIPANT');
  }

  await Participant.create({
    conversationId: id,
    userId
  });

  // Notify via Socket.IO if available
  if (req.io) {
    req.io.to(`conversation:${id}`).emit('participant:added', {
      conversationId: id,
      userId
    });
  }

  res.status(201).json({ message: 'Participant added successfully' });
}));

module.exports = router;
