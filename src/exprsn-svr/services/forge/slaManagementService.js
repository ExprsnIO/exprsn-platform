const logger = require('../../utils/logger');
const workflowIntegration = require('./workflowIntegration');

/**
 * SLA Management Service
 *
 * Manages Service Level Agreements with:
 * - SLA compliance tracking
 * - Breach detection and warnings
 * - Escalation management
 * - Performance metrics
 * - Automated notifications
 */
class SLAManagementService {
  /**
   * Calculate SLA due dates for a ticket/task
   */
  async calculateSLADueDates(entity, sla) {
    if (!sla) {
      return {
        firstResponseDue: null,
        resolutionDue: null
      };
    }

    const now = new Date();
    const createdAt = entity.createdAt || now;

    // Calculate first response due
    let firstResponseDue = null;
    if (sla.responseTimeMinutes) {
      firstResponseDue = this.addBusinessMinutes(
        createdAt,
        sla.responseTimeMinutes,
        sla
      );
    }

    // Calculate resolution due
    let resolutionDue = null;
    if (sla.resolutionTimeMinutes) {
      resolutionDue = this.addBusinessMinutes(
        createdAt,
        sla.resolutionTimeMinutes,
        sla
      );
    }

    return {
      firstResponseDue,
      resolutionDue
    };
  }

  /**
   * Add business minutes to a date, accounting for business hours
   */
  addBusinessMinutes(startDate, minutes, sla) {
    if (!sla.businessHoursOnly) {
      // Simple addition if 24/7
      return new Date(startDate.getTime() + minutes * 60000);
    }

    let current = new Date(startDate);
    let remainingMinutes = minutes;

    while (remainingMinutes > 0) {
      // Skip weekends if configured
      if (sla.excludeWeekends && this.isWeekend(current)) {
        current = this.nextBusinessDay(current);
        continue;
      }

      // Check if in business hours
      const businessHours = this.getBusinessHours(current, sla);
      if (!businessHours) {
        current = this.nextBusinessDay(current);
        continue;
      }

      const { start, end } = businessHours;
      const currentMinutes = current.getHours() * 60 + current.getMinutes();

      // If before business hours, jump to start
      if (currentMinutes < start) {
        current.setHours(Math.floor(start / 60), start % 60, 0, 0);
        continue;
      }

      // If after business hours, jump to next day
      if (currentMinutes >= end) {
        current = this.nextBusinessDay(current);
        continue;
      }

      // Calculate available minutes in current business day
      const availableMinutes = end - currentMinutes;
      const minutesToAdd = Math.min(remainingMinutes, availableMinutes);

      current = new Date(current.getTime() + minutesToAdd * 60000);
      remainingMinutes -= minutesToAdd;

      if (remainingMinutes > 0) {
        current = this.nextBusinessDay(current);
      }
    }

    return current;
  }

  /**
   * Check if date is weekend
   */
  isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday or Saturday
  }

  /**
   * Get next business day
   */
  nextBusinessDay(date) {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);

    while (this.isWeekend(next)) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  /**
   * Get business hours for a date
   */
  getBusinessHours(date, sla) {
    if (!sla.operatingHours) {
      return { start: 0, end: 24 * 60 }; // 24/7
    }

    if (sla.operatingHours === '24/7') {
      return { start: 0, end: 24 * 60 };
    }

    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[date.getDay()];

    const hours = sla.operatingHours[dayName];
    if (!hours) {
      return null; // No business hours for this day
    }

    // Convert HH:MM to minutes
    const parseTime = (timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };

    return {
      start: parseTime(hours.start),
      end: parseTime(hours.end)
    };
  }

  /**
   * Check SLA status for an entity
   */
  async checkSLAStatus(entity, sla) {
    if (!sla) {
      return {
        status: 'no_sla',
        breached: false,
        atRisk: false
      };
    }

    const now = new Date();

    // Check first response SLA
    let firstResponseStatus = 'met';
    if (sla.responseTimeMinutes && entity.firstResponseDue) {
      if (!entity.firstRespondedAt) {
        if (now > entity.firstResponseDue) {
          firstResponseStatus = 'breached';
        } else {
          const timeRemaining = entity.firstResponseDue - now;
          const totalTime = entity.firstResponseDue - entity.createdAt;
          const percentRemaining = (timeRemaining / totalTime) * 100;

          if (percentRemaining <= (sla.warningThresholdPercent || 20)) {
            firstResponseStatus = 'at_risk';
          }
        }
      }
    }

    // Check resolution SLA
    let resolutionStatus = 'met';
    if (sla.resolutionTimeMinutes && entity.resolutionDue) {
      if (!entity.resolvedAt) {
        if (now > entity.resolutionDue) {
          resolutionStatus = 'breached';
        } else {
          const timeRemaining = entity.resolutionDue - now;
          const totalTime = entity.resolutionDue - entity.createdAt;
          const percentRemaining = (timeRemaining / totalTime) * 100;

          if (percentRemaining <= (sla.warningThresholdPercent || 20)) {
            resolutionStatus = 'at_risk';
          }
        }
      }
    }

    const breached = firstResponseStatus === 'breached' || resolutionStatus === 'breached';
    const atRisk = firstResponseStatus === 'at_risk' || resolutionStatus === 'at_risk';

    return {
      status: breached ? 'breached' : (atRisk ? 'at_risk' : 'on_track'),
      breached,
      atRisk,
      firstResponseStatus,
      resolutionStatus
    };
  }

  /**
   * Handle SLA breach
   */
  async handleSLABreach(entity, sla, breachType) {
    logger.warn('SLA breach detected', {
      entityId: entity.id,
      slaId: sla.id,
      breachType
    });

    // Update SLA statistics
    await this.updateSLAStats(sla, 'breach');

    // Send notifications if configured
    if (sla.notifyOnBreach) {
      await this.sendSLANotification(entity, sla, 'breach', breachType);
    }

    // Trigger escalation if configured
    if (sla.escalationEnabled) {
      await this.escalate(entity, sla);
    }

    // Execute workflow if configured
    if (sla.onBreachWorkflowId) {
      await workflowIntegration.executeWorkflow(sla.onBreachWorkflowId, {
        entityId: entity.id,
        slaId: sla.id,
        breachType
      });
    }

    return {
      success: true,
      breached: true,
      actionsTaken: {
        notified: sla.notifyOnBreach,
        escalated: sla.escalationEnabled,
        workflowTriggered: !!sla.onBreachWorkflowId
      }
    };
  }

  /**
   * Handle SLA warning
   */
  async handleSLAWarning(entity, sla, warningType) {
    logger.info('SLA warning triggered', {
      entityId: entity.id,
      slaId: sla.id,
      warningType
    });

    // Send notifications if configured
    if (sla.notifyOnWarning) {
      await this.sendSLANotification(entity, sla, 'warning', warningType);
    }

    // Execute workflow if configured
    if (sla.onWarningWorkflowId) {
      await workflowIntegration.executeWorkflow(sla.onWarningWorkflowId, {
        entityId: entity.id,
        slaId: sla.id,
        warningType
      });
    }

    return {
      success: true,
      warning: true
    };
  }

  /**
   * Escalate entity based on SLA rules
   */
  async escalate(entity, sla) {
    if (!sla.escalationRules || sla.escalationRules.length === 0) {
      return;
    }

    const now = new Date();
    const elapsedMinutes = (now - entity.createdAt) / 60000;

    // Find appropriate escalation level
    for (const rule of sla.escalationRules) {
      if (elapsedMinutes >= rule.afterMinutes) {
        logger.info('Escalating entity', {
          entityId: entity.id,
          level: rule.level,
          elapsedMinutes
        });

        // TODO: Create escalation record and notify users
        // rule.notifyUserIds, rule.action

        break;
      }
    }
  }

  /**
   * Send SLA notification
   */
  async sendSLANotification(entity, sla, type, subtype) {
    // TODO: Integrate with Herald service for notifications
    logger.info('SLA notification sent', {
      entityId: entity.id,
      slaId: sla.id,
      type,
      subtype
    });
  }

  /**
   * Update SLA statistics
   */
  async updateSLAStats(sla, event) {
    // TODO: Update SLA statistics in database
    if (event === 'breach') {
      sla.totalViolations = (sla.totalViolations || 0) + 1;
      sla.lastViolationAt = new Date();
    }

    // Recalculate compliance percentage
    // TODO: Query all related entities and calculate compliance
  }

  /**
   * Get SLA performance metrics
   */
  async getSLAMetrics(slaId, startDate, endDate) {
    // TODO: Query database for SLA performance metrics
    return {
      slaId,
      period: { startDate, endDate },
      totalCases: 0,
      breachedCases: 0,
      compliance: 100,
      averageResponseTime: 0,
      averageResolutionTime: 0
    };
  }

  /**
   * Pause SLA timer
   */
  async pauseSLA(entityId, reason) {
    // TODO: Update entity SLA status
    logger.info('SLA timer paused', { entityId, reason });

    return {
      success: true,
      paused: true
    };
  }

  /**
   * Resume SLA timer
   */
  async resumeSLA(entityId) {
    // TODO: Update entity SLA status
    logger.info('SLA timer resumed', { entityId });

    return {
      success: true,
      resumed: true
    };
  }
}

module.exports = new SLAManagementService();
