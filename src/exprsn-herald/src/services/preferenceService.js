/**
 * Exprsn Herald - Preference Service
 * Manages user notification preferences
 */

const { NotificationPreference } = require('../models');
const logger = require('../utils/logger');

class PreferenceService {
  /**
   * Get user preferences
   */
  async getPreferences(userId) {
    try {
      const preferences = await NotificationPreference.findAll({
        where: { userId },
        order: [['channel', 'ASC'], ['notificationType', 'ASC']]
      });

      // If no preferences exist, return defaults
      if (preferences.length === 0) {
        return this.getDefaultPreferences();
      }

      // Group by channel
      const grouped = this.groupPreferencesByChannel(preferences);
      return grouped;
    } catch (error) {
      logger.error('Error getting preferences', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Update user preferences
   */
  async updatePreferences(userId, preferences) {
    try {
      const updates = [];

      // Process each channel's preferences
      for (const [channel, settings] of Object.entries(preferences)) {
        if (!['push', 'email', 'sms', 'in-app'].includes(channel)) {
          continue;
        }

        // Update or create preference for each notification type
        for (const [key, value] of Object.entries(settings)) {
          if (typeof value === 'boolean') {
            // This is a notification type preference
            const notificationType = key;

            const [pref] = await NotificationPreference.findOrCreate({
              where: {
                userId,
                channel,
                notificationType
              },
              defaults: {
                enabled: value,
                frequency: 'realtime'
              }
            });

            if (!pref.isNewRecord) {
              await pref.update({ enabled: value });
            }

            updates.push(pref);
          } else if (key === 'frequency') {
            // Update frequency for all preferences in this channel
            await NotificationPreference.update(
              { frequency: value },
              {
                where: {
                  userId,
                  channel
                }
              }
            );
          } else if (key === 'quietHours') {
            // Update quiet hours
            await NotificationPreference.update(
              {
                quietHoursStart: value.start,
                quietHoursEnd: value.end
              },
              {
                where: {
                  userId,
                  channel
                }
              }
            );
          }
        }
      }

      logger.info('Preferences updated', {
        userId,
        count: updates.length
      });

      // Return updated preferences
      return await this.getPreferences(userId);
    } catch (error) {
      logger.error('Error updating preferences', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Check if user should be notified
   */
  async checkShouldNotify(userId, notificationType, channel) {
    try {
      // Get preference for this specific notification type and channel
      const preference = await NotificationPreference.findOne({
        where: {
          userId,
          channel,
          notificationType
        }
      });

      // If no specific preference, check channel-level preference
      if (!preference) {
        const channelPref = await NotificationPreference.findOne({
          where: {
            userId,
            channel,
            notificationType: null
          }
        });

        // Default to enabled if no preference exists
        if (!channelPref) {
          return { shouldNotify: true, frequency: 'realtime' };
        }

        return {
          shouldNotify: channelPref.enabled,
          frequency: channelPref.frequency
        };
      }

      // Check if we're in quiet hours
      if (preference.quietHoursStart !== null && preference.quietHoursEnd !== null) {
        const inQuietHours = this.isInQuietHours(
          preference.quietHoursStart,
          preference.quietHoursEnd
        );

        if (inQuietHours) {
          return {
            shouldNotify: false,
            frequency: preference.frequency,
            reason: 'quiet_hours'
          };
        }
      }

      return {
        shouldNotify: preference.enabled,
        frequency: preference.frequency
      };
    } catch (error) {
      logger.error('Error checking should notify', {
        error: error.message,
        userId,
        notificationType,
        channel
      });
      // Default to allow notification on error
      return { shouldNotify: true, frequency: 'realtime' };
    }
  }

  /**
   * Check if current time is within quiet hours
   */
  isInQuietHours(startHour, endHour) {
    const now = new Date();
    const currentHour = now.getHours();

    if (startHour <= endHour) {
      // Normal range (e.g., 22 to 7)
      return currentHour >= startHour && currentHour < endHour;
    } else {
      // Wraps midnight (e.g., 22 to 7 next day)
      return currentHour >= startHour || currentHour < endHour;
    }
  }

  /**
   * Get default preferences structure
   */
  getDefaultPreferences() {
    return {
      email: {
        enabled: true,
        frequency: 'digest',
        quietHours: null
      },
      push: {
        enabled: true,
        frequency: 'realtime',
        quietHours: null
      },
      sms: {
        enabled: false,
        frequency: 'realtime',
        quietHours: null
      },
      'in-app': {
        enabled: true,
        frequency: 'realtime',
        quietHours: null
      }
    };
  }

  /**
   * Group preferences by channel
   */
  groupPreferencesByChannel(preferences) {
    const grouped = {};

    for (const pref of preferences) {
      if (!grouped[pref.channel]) {
        grouped[pref.channel] = {
          enabled: pref.enabled,
          frequency: pref.frequency,
          quietHours:
            pref.quietHoursStart !== null
              ? {
                  start: pref.quietHoursStart,
                  end: pref.quietHoursEnd
                }
              : null
        };
      }

      if (pref.notificationType) {
        grouped[pref.channel][pref.notificationType] = pref.enabled;
      }
    }

    return grouped;
  }

  /**
   * Set quiet hours for a channel
   */
  async setQuietHours(userId, channel, startHour, endHour) {
    try {
      // Validate hours
      if (
        startHour < 0 ||
        startHour > 23 ||
        endHour < 0 ||
        endHour > 23
      ) {
        throw new Error('Hours must be between 0 and 23');
      }

      // Update all preferences for this channel
      await NotificationPreference.update(
        {
          quietHoursStart: startHour,
          quietHoursEnd: endHour
        },
        {
          where: {
            userId,
            channel
          }
        }
      );

      logger.info('Quiet hours set', {
        userId,
        channel,
        startHour,
        endHour
      });

      return { success: true };
    } catch (error) {
      logger.error('Error setting quiet hours', {
        error: error.message,
        userId,
        channel
      });
      throw error;
    }
  }

  /**
   * Reset preferences to defaults
   */
  async resetPreferences(userId) {
    try {
      // Delete all user preferences
      await NotificationPreference.destroy({
        where: { userId }
      });

      logger.info('Preferences reset to defaults', { userId });
      return this.getDefaultPreferences();
    } catch (error) {
      logger.error('Error resetting preferences', {
        error: error.message,
        userId
      });
      throw error;
    }
  }
}

module.exports = new PreferenceService();
