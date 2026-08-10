/**
 * Room Service
 * Business logic for managing video chat rooms
 */

const { Room, Participant, Recording } = require('../models');
const logger = require('../utils/logger');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

class RoomService {
  /**
   * Generate short room code
   * @returns {string} 6-character room code
   */
  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Create a new video chat room
   * @param {Object} roomData - Room creation data
   * @param {string} userId - User ID creating the room
   * @returns {Promise<Object>} Created room
   */
  async createRoom(roomData, userId) {
    try {
      const {
        name,
        description,
        maxParticipants = 10,
        isPrivate = false,
        password = null,
        settings = {}
      } = roomData;

      // Generate unique room code
      let roomCode = this.generateRoomCode();
      let attempts = 0;
      while (await Room.findOne({ where: { room_code: roomCode } })) {
        roomCode = this.generateRoomCode();
        attempts++;
        if (attempts > 10) {
          throw new Error('Failed to generate unique room code');
        }
      }

      // Hash password if private
      let passwordHash = null;
      if (isPrivate && password) {
        passwordHash = await bcrypt.hash(password, 10);
      }

      // Create room in database
      const room = await Room.create({
        host_id: userId,
        name,
        description,
        room_code: roomCode,
        max_participants: maxParticipants,
        is_private: isPrivate,
        password_hash: passwordHash,
        status: 'waiting',
        settings: {
          enableChat: true,
          enableScreenShare: true,
          enableRecording: false,
          muteOnJoin: false,
          videoOnJoin: true,
          ...settings
        }
      });

      logger.info('Room created', { roomId: room.id, userId, roomCode });

      return this.formatRoom(room);
    } catch (error) {
      logger.error('Failed to create room:', error);
      throw error;
    }
  }

  /**
   * Get room by ID
   * @param {string} roomId - Room ID
   * @returns {Promise<Object|null>} Room data
   */
  async getRoom(roomId) {
    try {
      const room = await Room.findByPk(roomId, {
        include: [
          {
            model: Participant,
            as: 'participants',
            where: { status: 'connected' },
            required: false
          }
        ]
      });

      if (!room) {
        return null;
      }

      return this.formatRoom(room);
    } catch (error) {
      logger.error('Failed to get room:', error);
      throw error;
    }
  }

  /**
   * Get room by room code
   * @param {string} roomCode - Room code
   * @returns {Promise<Object|null>} Room data
   */
  async getRoomByCode(roomCode) {
    try {
      const room = await Room.findOne({
        where: { room_code: roomCode.toUpperCase() },
        include: [
          {
            model: Participant,
            as: 'participants',
            where: { status: 'connected' },
            required: false
          }
        ]
      });

      if (!room) {
        return null;
      }

      return this.formatRoom(room);
    } catch (error) {
      logger.error('Failed to get room by code:', error);
      throw error;
    }
  }

  /**
   * List rooms
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Paginated rooms
   */
  async listRooms(filters = {}) {
    try {
      const {
        status = null,
        hostId = null,
        isPrivate = null,
        limit = 20,
        offset = 0
      } = filters;

      const where = {};
      if (status) where.status = status;
      if (hostId) where.host_id = hostId;
      if (isPrivate !== null) where.is_private = isPrivate;

      const { count, rows } = await Room.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']],
        include: [
          {
            model: Participant,
            as: 'participants',
            where: { status: 'connected' },
            required: false
          }
        ]
      });

      return {
        rooms: rows.map(room => this.formatRoom(room)),
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      };
    } catch (error) {
      logger.error('Failed to list rooms:', error);
      throw error;
    }
  }

  /**
   * Update room details
   * @param {string} roomId - Room ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated room
   */
  async updateRoom(roomId, updates) {
    try {
      const room = await Room.findByPk(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      const { name, description, maxParticipants, settings } = updates;
      const updateData = {};

      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (maxParticipants !== undefined) updateData.max_participants = maxParticipants;
      if (settings !== undefined) {
        updateData.settings = {
          ...room.settings,
          ...settings
        };
      }

      await room.update(updateData);

      logger.info('Room updated', { roomId });

      return this.formatRoom(room);
    } catch (error) {
      logger.error('Failed to update room:', error);
      throw error;
    }
  }

  /**
   * Start room (first participant joins)
   * @param {string} roomId - Room ID
   * @returns {Promise<Object>} Updated room
   */
  async startRoom(roomId) {
    try {
      const room = await Room.findByPk(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      if (room.status === 'waiting') {
        await room.update({
          status: 'active',
          started_at: new Date()
        });

        logger.info('Room started', { roomId });
      }

      return this.formatRoom(room);
    } catch (error) {
      logger.error('Failed to start room:', error);
      throw error;
    }
  }

  /**
   * End room
   * @param {string} roomId - Room ID
   * @returns {Promise<Object>} Updated room
   */
  async endRoom(roomId) {
    try {
      const room = await Room.findByPk(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      const ended_at = new Date();
      const duration_seconds = room.started_at
        ? Math.floor((ended_at - room.started_at) / 1000)
        : 0;

      await room.update({
        status: 'ended',
        ended_at,
        duration_seconds
      });

      // Disconnect all participants
      await Participant.update(
        { status: 'disconnected', left_at: ended_at },
        { where: { room_id: roomId, status: 'connected' } }
      );

      logger.info('Room ended', { roomId, duration_seconds });

      return this.formatRoom(room);
    } catch (error) {
      logger.error('Failed to end room:', error);
      throw error;
    }
  }

  /**
   * Delete a room
   * @param {string} roomId - Room ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteRoom(roomId) {
    try {
      const room = await Room.findByPk(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // Delete from database (cascades to participants and recordings)
      await room.destroy();

      logger.info('Room deleted', { roomId });

      return true;
    } catch (error) {
      logger.error('Failed to delete room:', error);
      throw error;
    }
  }

  /**
   * Verify room password
   * @param {string} roomId - Room ID
   * @param {string} password - Password to verify
   * @returns {Promise<boolean>} Password valid
   */
  async verifyPassword(roomId, password) {
    try {
      const room = await Room.findByPk(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      if (!room.is_private || !room.password_hash) {
        return true; // No password required
      }

      return await bcrypt.compare(password, room.password_hash);
    } catch (error) {
      logger.error('Failed to verify password:', error);
      return false;
    }
  }

  /**
   * Add participant to room
   * @param {string} roomId - Room ID
   * @param {string} userId - User ID
   * @param {string} socketId - Socket connection ID
   * @param {Object} options - Participant options
   * @returns {Promise<Object>} Participant data
   */
  async addParticipant(roomId, userId, socketId, options = {}) {
    try {
      const room = await Room.findByPk(roomId);
      if (!room) {
        throw new Error('Room not found');
      }

      // Check room capacity
      const currentCount = await Participant.count({
        where: { room_id: roomId, status: 'connected' }
      });

      if (currentCount >= room.max_participants) {
        throw new Error('Room is full');
      }

      // Check if room is active, start if waiting
      if (room.status === 'waiting') {
        await this.startRoom(roomId);
      } else if (room.status === 'ended') {
        throw new Error('Room has ended');
      }

      const {
        displayName = null,
        role = 'participant',
        peerId = null
      } = options;

      // Create participant
      const participant = await Participant.create({
        user_id: userId,
        room_id: roomId,
        socket_id: socketId,
        peer_id: peerId,
        display_name: displayName,
        role: userId === room.host_id ? 'host' : role,
        status: 'connected',
        is_audio_enabled: !room.settings.muteOnJoin,
        is_video_enabled: room.settings.videoOnJoin,
        joined_at: new Date()
      });

      // Update participant count
      const participantCount = currentCount + 1;
      await room.update({
        current_participant_count: participantCount,
        peak_participant_count: Math.max(room.peak_participant_count, participantCount)
      });

      logger.info('Participant added to room', {
        roomId,
        userId,
        participantCount
      });

      return participant;
    } catch (error) {
      logger.error('Failed to add participant:', error);
      throw error;
    }
  }

  /**
   * Remove participant from room
   * @param {string} roomId - Room ID
   * @param {string} socketId - Socket connection ID
   * @returns {Promise<boolean>} Success status
   */
  async removeParticipant(roomId, socketId) {
    try {
      const participant = await Participant.findOne({
        where: { room_id: roomId, socket_id: socketId }
      });

      if (!participant) {
        return false;
      }

      const left_at = new Date();
      const duration_seconds = Math.floor((left_at - participant.joined_at) / 1000);

      await participant.update({
        status: 'disconnected',
        left_at,
        duration_seconds
      });

      // Update participant count
      const participantCount = await Participant.count({
        where: { room_id: roomId, status: 'connected' }
      });

      await Room.update(
        { current_participant_count: participantCount },
        { where: { id: roomId } }
      );

      // End room if no participants left
      if (participantCount === 0) {
        const room = await Room.findByPk(roomId);
        if (room && room.status === 'active') {
          await this.endRoom(roomId);
        }
      }

      logger.info('Participant removed from room', {
        roomId,
        participantId: participant.id,
        duration_seconds
      });

      return true;
    } catch (error) {
      logger.error('Failed to remove participant:', error);
      return false;
    }
  }

  /**
   * Update participant state
   * @param {string} participantId - Participant ID
   * @param {Object} state - State updates
   * @returns {Promise<Object>} Updated participant
   */
  async updateParticipantState(participantId, state) {
    try {
      const participant = await Participant.findByPk(participantId);
      if (!participant) {
        throw new Error('Participant not found');
      }

      const updates = {};
      if (state.isAudioEnabled !== undefined) updates.is_audio_enabled = state.isAudioEnabled;
      if (state.isVideoEnabled !== undefined) updates.is_video_enabled = state.isVideoEnabled;
      if (state.isScreenSharing !== undefined) updates.is_screen_sharing = state.isScreenSharing;
      if (state.peerId !== undefined) updates.peer_id = state.peerId;
      if (state.connectionQuality !== undefined) updates.connection_quality = state.connectionQuality;

      await participant.update(updates);

      logger.info('Participant state updated', { participantId });

      return participant;
    } catch (error) {
      logger.error('Failed to update participant state:', error);
      throw error;
    }
  }

  /**
   * Get room participants
   * @param {string} roomId - Room ID
   * @returns {Promise<Array>} List of participants
   */
  async getRoomParticipants(roomId) {
    try {
      const participants = await Participant.findAll({
        where: { room_id: roomId, status: 'connected' },
        order: [['joined_at', 'ASC']]
      });

      return participants;
    } catch (error) {
      logger.error('Failed to get room participants:', error);
      throw error;
    }
  }

  /**
   * Get room recordings
   * @param {string} roomId - Room ID
   * @returns {Promise<Array>} List of recordings
   */
  async getRoomRecordings(roomId) {
    try {
      const recordings = await Recording.findAll({
        where: { room_id: roomId },
        order: [['created_at', 'DESC']]
      });

      return recordings;
    } catch (error) {
      logger.error('Failed to get room recordings:', error);
      throw error;
    }
  }

  /**
   * Format room for API response
   * @param {Object} room - Room model instance
   * @returns {Object} Formatted room
   */
  formatRoom(room) {
    const data = room.toJSON();

    // Don't expose sensitive data
    delete data.password_hash;

    // Add computed fields
    data.isActive = data.status === 'active';
    data.currentParticipants = data.participants?.length || 0;
    data.hasPassword = room.is_private && !!room.password_hash;

    return data;
  }
}

module.exports = new RoomService();
