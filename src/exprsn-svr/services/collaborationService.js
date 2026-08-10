/**
 * ═══════════════════════════════════════════════════════════
 * Collaboration Service
 * Manages real-time collaboration sessions for multi-user editing
 * ═══════════════════════════════════════════════════════════
 */

const EventEmitter = require('events');
const logger = require('../utils/logger');

class CollaborationService extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map(); // sessionId -> { users, data, locks }
    this.userSessions = new Map(); // userId -> Set<sessionId>
  }

  /**
   * Create a collaboration session
   */
  createSession(sessionId, resourceType, resourceId, metadata = {}) {
    if (this.sessions.has(sessionId)) {
      throw new Error('Session already exists');
    }

    const session = {
      id: sessionId,
      resourceType,
      resourceId,
      users: new Set(),
      cursors: new Map(),
      locks: new Map(),
      changes: [],
      metadata,
      createdAt: new Date()
    };

    this.sessions.set(sessionId, session);
    logger.info('Collaboration session created', { sessionId, resourceType, resourceId });

    return session;
  }

  /**
   * Join a collaboration session
   */
  joinSession(sessionId, userId, userInfo = {}) {
    let session = this.sessions.get(sessionId);

    // Auto-create session if it doesn't exist
    if (!session) {
      logger.warn('Session not found, auto-creating', { sessionId });
      session = this.createSession(sessionId, 'unknown', 'unknown');
    }

    session.users.add(userId);

    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId).add(sessionId);

    this.emit('user:joined', {
      sessionId,
      userId,
      userInfo,
      userCount: session.users.size
    });

    logger.info('User joined collaboration session', { sessionId, userId });

    return {
      session: this.getSessionInfo(sessionId),
      users: Array.from(session.users)
    };
  }

  /**
   * Leave a collaboration session
   */
  leaveSession(sessionId, userId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.users.delete(userId);
    session.cursors.delete(userId);

    // Release all locks held by this user
    for (const [lockKey, lock] of session.locks.entries()) {
      if (lock.userId === userId) {
        session.locks.delete(lockKey);
        this.emit('lock:released', {
          sessionId,
          userId,
          lockKey
        });
      }
    }

    if (this.userSessions.has(userId)) {
      this.userSessions.get(userId).delete(sessionId);
    }

    this.emit('user:left', {
      sessionId,
      userId,
      userCount: session.users.size
    });

    // Clean up empty sessions
    if (session.users.size === 0) {
      this.sessions.delete(sessionId);
      logger.info('Collaboration session closed (no users)', { sessionId });
    }

    logger.info('User left collaboration session', { sessionId, userId });
  }

  /**
   * Update cursor position
   */
  updateCursor(sessionId, userId, position) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.cursors.set(userId, {
      position,
      timestamp: Date.now()
    });

    this.emit('cursor:update', {
      sessionId,
      userId,
      position
    });
  }

  /**
   * Apply a change/operation
   */
  applyChange(sessionId, userId, operation) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Add to change history
    const change = {
      id: `${Date.now()}-${userId}`,
      userId,
      operation,
      timestamp: Date.now()
    };

    session.changes.push(change);

    // Limit history to last 100 changes
    if (session.changes.length > 100) {
      session.changes.shift();
    }

    this.emit('change:applied', {
      sessionId,
      userId,
      change
    });

    return change;
  }

  /**
   * Lock a resource/field
   */
  acquireLock(sessionId, userId, lockKey, timeout = 30000) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Check if already locked by another user
    if (session.locks.has(lockKey)) {
      const existingLock = session.locks.get(lockKey);
      if (existingLock.userId !== userId) {
        // Check if lock has expired
        if (Date.now() - existingLock.acquiredAt < timeout) {
          throw new Error('Resource is locked by another user');
        }
        // Lock expired, release it
        session.locks.delete(lockKey);
      }
    }

    const lock = {
      userId,
      acquiredAt: Date.now(),
      timeout
    };

    session.locks.set(lockKey, lock);

    // Auto-release lock after timeout
    setTimeout(() => {
      const currentLock = session.locks.get(lockKey);
      if (currentLock && currentLock.userId === userId && currentLock.acquiredAt === lock.acquiredAt) {
        this.releaseLock(sessionId, userId, lockKey);
      }
    }, timeout);

    this.emit('lock:acquired', {
      sessionId,
      userId,
      lockKey
    });

    return lock;
  }

  /**
   * Release a lock
   */
  releaseLock(sessionId, userId, lockKey) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const lock = session.locks.get(lockKey);
    if (lock && lock.userId === userId) {
      session.locks.delete(lockKey);

      this.emit('lock:released', {
        sessionId,
        userId,
        lockKey
      });
    }
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      id: session.id,
      resourceType: session.resourceType,
      resourceId: session.resourceId,
      userCount: session.users.size,
      users: Array.from(session.users),
      locks: Array.from(session.locks.entries()).map(([key, lock]) => ({
        key,
        userId: lock.userId,
        acquiredAt: lock.acquiredAt
      })),
      metadata: session.metadata,
      createdAt: session.createdAt
    };
  }

  /**
   * Get all active sessions for a user
   */
  getUserSessions(userId) {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return [];

    return Array.from(sessionIds)
      .map(id => this.getSessionInfo(id))
      .filter(Boolean);
  }

  /**
   * Get all active sessions
   */
  getAllSessions() {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      resourceType: session.resourceType,
      resourceId: session.resourceId,
      userCount: session.users.size,
      changeCount: session.changes.length,
      lockCount: session.locks.size,
      createdAt: session.createdAt
    }));
  }

  /**
   * Clean up stale sessions
   */
  cleanupStaleSessions(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.createdAt.getTime() > maxAge && session.users.size === 0) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up stale collaboration sessions', { count: cleaned });
    }

    return cleaned;
  }
}

module.exports = new CollaborationService();
