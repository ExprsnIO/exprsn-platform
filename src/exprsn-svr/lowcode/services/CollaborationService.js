/**
 * Collaboration Service
 * Handles real-time collaboration features for the Low-Code Platform
 */

const logger = require('../utils/logger');

class CollaborationService {
  constructor() {
    this.activeSessions = new Map(); // userId -> { formId, timestamp, cursor }
    this.formEditors = new Map(); // formId -> Set<userId>
    this.locks = new Map(); // formId -> { userId, expiresAt }
    this.changes = new Map(); // formId -> Array<change>
  }

  /**
   * User joins a form editing session
   */
  joinFormSession(userId, formId, userName) {
    // Add user to active sessions
    this.activeSessions.set(userId, {
      formId,
      userName,
      joinedAt: Date.now(),
      cursor: null,
      selection: null
    });

    // Add user to form's editor list
    if (!this.formEditors.has(formId)) {
      this.formEditors.set(formId, new Set());
    }
    this.formEditors.get(formId).add(userId);

    logger.info('[Collaboration] User joined form session:', {
      userId,
      formId,
      activeUsers: this.formEditors.get(formId).size
    });

    return {
      success: true,
      activeUsers: Array.from(this.formEditors.get(formId)).map(uid => {
        const session = this.activeSessions.get(uid);
        return {
          userId: uid,
          userName: session?.userName || 'Unknown',
          joinedAt: session?.joinedAt
        };
      })
    };
  }

  /**
   * User leaves a form editing session
   */
  leaveFormSession(userId) {
    const session = this.activeSessions.get(userId);
    if (!session) return { success: false, error: 'No active session' };

    const { formId } = session;

    // Remove from active sessions
    this.activeSessions.delete(userId);

    // Remove from form editors
    if (this.formEditors.has(formId)) {
      this.formEditors.get(formId).delete(userId);
      if (this.formEditors.get(formId).size === 0) {
        this.formEditors.delete(formId);
      }
    }

    // Release any locks held by this user
    this.releaseLock(formId, userId);

    logger.info('[Collaboration] User left form session:', {
      userId,
      formId,
      remainingUsers: this.formEditors.get(formId)?.size || 0
    });

    return {
      success: true,
      formId,
      activeUsers: this.formEditors.get(formId)?.size || 0
    };
  }

  /**
   * Update user's cursor position
   */
  updateCursor(userId, cursor) {
    const session = this.activeSessions.get(userId);
    if (!session) return { success: false, error: 'No active session' };

    session.cursor = cursor;
    session.lastActivity = Date.now();

    return {
      success: true,
      cursor,
      formId: session.formId
    };
  }

  /**
   * Update user's selection
   */
  updateSelection(userId, selection) {
    const session = this.activeSessions.get(userId);
    if (!session) return { success: false, error: 'No active session' };

    session.selection = selection;
    session.lastActivity = Date.now();

    return {
      success: true,
      selection,
      formId: session.formId
    };
  }

  /**
   * Acquire editing lock for a form
   */
  acquireLock(formId, userId, duration = 30000) {
    const existingLock = this.locks.get(formId);

    // Check if lock exists and hasn't expired
    if (existingLock && existingLock.expiresAt > Date.now()) {
      if (existingLock.userId === userId) {
        // Renew own lock
        existingLock.expiresAt = Date.now() + duration;
        return { success: true, lock: existingLock };
      } else {
        return {
          success: false,
          error: 'LOCKED_BY_OTHER_USER',
          lockedBy: existingLock.userId,
          expiresAt: existingLock.expiresAt
        };
      }
    }

    // Acquire new lock
    const lock = {
      userId,
      formId,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + duration
    };

    this.locks.set(formId, lock);

    logger.info('[Collaboration] Lock acquired:', { formId, userId, duration });

    return { success: true, lock };
  }

  /**
   * Release editing lock
   */
  releaseLock(formId, userId) {
    const lock = this.locks.get(formId);

    if (!lock) {
      return { success: false, error: 'No lock exists' };
    }

    if (lock.userId !== userId) {
      return { success: false, error: 'Lock owned by another user' };
    }

    this.locks.delete(formId);

    logger.info('[Collaboration] Lock released:', { formId, userId });

    return { success: true };
  }

  /**
   * Record a change for operational transformation
   */
  recordChange(formId, change) {
    if (!this.changes.has(formId)) {
      this.changes.set(formId, []);
    }

    const changeHistory = this.changes.get(formId);
    changeHistory.push({
      ...change,
      timestamp: Date.now(),
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });

    // Keep only last 100 changes
    if (changeHistory.length > 100) {
      changeHistory.shift();
    }

    return { success: true, changeId: changeHistory[changeHistory.length - 1].id };
  }

  /**
   * Get changes since a specific timestamp
   */
  getChangesSince(formId, since) {
    const changeHistory = this.changes.get(formId) || [];
    return changeHistory.filter(change => change.timestamp > since);
  }

  /**
   * Get active users for a form
   */
  getActiveUsers(formId) {
    const editors = this.formEditors.get(formId);
    if (!editors) return [];

    return Array.from(editors).map(userId => {
      const session = this.activeSessions.get(userId);
      return {
        userId,
        userName: session?.userName || 'Unknown',
        joinedAt: session?.joinedAt,
        cursor: session?.cursor,
        selection: session?.selection,
        lastActivity: session?.lastActivity
      };
    });
  }

  /**
   * Get lock status for a form
   */
  getLockStatus(formId) {
    const lock = this.locks.get(formId);

    if (!lock) {
      return { locked: false };
    }

    if (lock.expiresAt < Date.now()) {
      // Lock expired, remove it
      this.locks.delete(formId);
      return { locked: false };
    }

    return {
      locked: true,
      userId: lock.userId,
      acquiredAt: lock.acquiredAt,
      expiresAt: lock.expiresAt
    };
  }

  /**
   * Clean up expired locks and inactive sessions
   */
  cleanup() {
    const now = Date.now();
    const inactivityTimeout = 5 * 60 * 1000; // 5 minutes

    // Clean expired locks
    for (const [formId, lock] of this.locks.entries()) {
      if (lock.expiresAt < now) {
        this.locks.delete(formId);
        logger.debug('[Collaboration] Expired lock removed:', { formId });
      }
    }

    // Clean inactive sessions
    for (const [userId, session] of this.activeSessions.entries()) {
      const lastActivity = session.lastActivity || session.joinedAt;
      if (now - lastActivity > inactivityTimeout) {
        this.leaveFormSession(userId);
        logger.debug('[Collaboration] Inactive session removed:', { userId });
      }
    }

    // Clean old changes
    for (const [formId, changeHistory] of this.changes.entries()) {
      const recentChanges = changeHistory.filter(
        change => now - change.timestamp < 60 * 60 * 1000 // Keep 1 hour
      );
      if (recentChanges.length === 0) {
        this.changes.delete(formId);
      } else {
        this.changes.set(formId, recentChanges);
      }
    }
  }

  /**
   * Get collaboration stats
   */
  getStats() {
    return {
      activeSessions: this.activeSessions.size,
      formsBeingEdited: this.formEditors.size,
      activeLocks: this.locks.size,
      formsWithChanges: this.changes.size
    };
  }
}

// Start cleanup interval
const collaborationService = new CollaborationService();
setInterval(() => {
  collaborationService.cleanup();
}, 60000); // Clean up every minute

module.exports = collaborationService;
