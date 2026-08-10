/**
 * Schedule Presets Service
 * Provides common cron schedule templates and helpers
 */

const SCHEDULE_PRESETS = {
  // Minutely
  'every-minute': {
    name: 'Every Minute',
    description: 'Runs every minute',
    schedule: '* * * * *',
    category: 'Frequent'
  },
  'every-5-minutes': {
    name: 'Every 5 Minutes',
    description: 'Runs every 5 minutes',
    schedule: '*/5 * * * *',
    category: 'Frequent'
  },
  'every-15-minutes': {
    name: 'Every 15 Minutes',
    description: 'Runs every 15 minutes',
    schedule: '*/15 * * * *',
    category: 'Frequent'
  },
  'every-30-minutes': {
    name: 'Every 30 Minutes',
    description: 'Runs every 30 minutes',
    schedule: '*/30 * * * *',
    category: 'Frequent'
  },

  // Hourly
  'every-hour': {
    name: 'Every Hour',
    description: 'Runs at the start of every hour',
    schedule: '0 * * * *',
    category: 'Hourly'
  },
  'every-2-hours': {
    name: 'Every 2 Hours',
    description: 'Runs every 2 hours',
    schedule: '0 */2 * * *',
    category: 'Hourly'
  },
  'every-6-hours': {
    name: 'Every 6 Hours',
    description: 'Runs every 6 hours (midnight, 6am, noon, 6pm)',
    schedule: '0 */6 * * *',
    category: 'Hourly'
  },
  'every-12-hours': {
    name: 'Every 12 Hours',
    description: 'Runs twice daily (midnight and noon)',
    schedule: '0 */12 * * *',
    category: 'Hourly'
  },

  // Daily
  'daily-midnight': {
    name: 'Daily at Midnight',
    description: 'Runs once per day at midnight',
    schedule: '0 0 * * *',
    category: 'Daily'
  },
  'daily-6am': {
    name: 'Daily at 6 AM',
    description: 'Runs once per day at 6:00 AM',
    schedule: '0 6 * * *',
    category: 'Daily'
  },
  'daily-9am': {
    name: 'Daily at 9 AM',
    description: 'Runs once per day at 9:00 AM',
    schedule: '0 9 * * *',
    category: 'Daily'
  },
  'daily-noon': {
    name: 'Daily at Noon',
    description: 'Runs once per day at 12:00 PM',
    schedule: '0 12 * * *',
    category: 'Daily'
  },
  'daily-6pm': {
    name: 'Daily at 6 PM',
    description: 'Runs once per day at 6:00 PM',
    schedule: '0 18 * * *',
    category: 'Daily'
  },

  // Weekdays
  'weekdays-9am': {
    name: 'Weekdays at 9 AM',
    description: 'Runs Monday-Friday at 9:00 AM',
    schedule: '0 9 * * 1-5',
    category: 'Weekdays'
  },
  'weekdays-6pm': {
    name: 'Weekdays at 6 PM',
    description: 'Runs Monday-Friday at 6:00 PM',
    schedule: '0 18 * * 1-5',
    category: 'Weekdays'
  },
  'weekdays-midnight': {
    name: 'Weekdays at Midnight',
    description: 'Runs Monday-Friday at midnight',
    schedule: '0 0 * * 1-5',
    category: 'Weekdays'
  },

  // Weekly
  'weekly-sunday': {
    name: 'Weekly on Sunday',
    description: 'Runs every Sunday at midnight',
    schedule: '0 0 * * 0',
    category: 'Weekly'
  },
  'weekly-monday': {
    name: 'Weekly on Monday',
    description: 'Runs every Monday at midnight',
    schedule: '0 0 * * 1',
    category: 'Weekly'
  },
  'weekly-friday': {
    name: 'Weekly on Friday',
    description: 'Runs every Friday at midnight',
    schedule: '0 0 * * 5',
    category: 'Weekly'
  },

  // Monthly
  'monthly-1st': {
    name: 'Monthly on 1st',
    description: 'Runs on the 1st day of each month at midnight',
    schedule: '0 0 1 * *',
    category: 'Monthly'
  },
  'monthly-15th': {
    name: 'Monthly on 15th',
    description: 'Runs on the 15th day of each month at midnight',
    schedule: '0 0 15 * *',
    category: 'Monthly'
  },
  'monthly-last-day': {
    name: 'Monthly on Last Day',
    description: 'Runs on the last day of each month at midnight',
    schedule: '0 0 L * *',
    category: 'Monthly'
  },

  // Quarterly
  'quarterly': {
    name: 'Quarterly',
    description: 'Runs on the 1st of Jan, Apr, Jul, Oct at midnight',
    schedule: '0 0 1 */3 *',
    category: 'Quarterly'
  },

  // Yearly
  'yearly': {
    name: 'Yearly',
    description: 'Runs once per year on January 1st at midnight',
    schedule: '0 0 1 1 *',
    category: 'Yearly'
  }
};

class SchedulePresetsService {
  /**
   * Get all schedule presets
   */
  getAllPresets() {
    return SCHEDULE_PRESETS;
  }

  /**
   * Get presets by category
   */
  getPresetsByCategory(category) {
    return Object.entries(SCHEDULE_PRESETS)
      .filter(([_, preset]) => preset.category === category)
      .reduce((acc, [key, preset]) => {
        acc[key] = preset;
        return acc;
      }, {});
  }

  /**
   * Get preset by key
   */
  getPreset(key) {
    return SCHEDULE_PRESETS[key] || null;
  }

  /**
   * Get all categories
   */
  getCategories() {
    const categories = new Set();
    Object.values(SCHEDULE_PRESETS).forEach(preset => {
      categories.add(preset.category);
    });
    return Array.from(categories);
  }

  /**
   * Get schedule from preset key
   */
  getSchedule(presetKey) {
    const preset = this.getPreset(presetKey);
    return preset ? preset.schedule : null;
  }

  /**
   * Build custom schedule
   */
  buildCustomSchedule(params) {
    const {
      type,
      minute = 0,
      hour = 0,
      dayOfMonth = '*',
      month = '*',
      dayOfWeek = '*',
      interval
    } = params;

    switch (type) {
      case 'every-n-minutes':
        if (!interval || interval < 1 || interval > 59) {
          throw new Error('Interval must be between 1 and 59 minutes');
        }
        return `*/${interval} * * * *`;

      case 'every-n-hours':
        if (!interval || interval < 1 || interval > 23) {
          throw new Error('Interval must be between 1 and 23 hours');
        }
        return `0 */${interval} * * *`;

      case 'daily-at-time':
        return `${minute} ${hour} * * *`;

      case 'weekly-on-day':
        if (dayOfWeek === '*') {
          throw new Error('Day of week must be specified');
        }
        return `${minute} ${hour} * * ${dayOfWeek}`;

      case 'monthly-on-day':
        if (dayOfMonth === '*') {
          throw new Error('Day of month must be specified');
        }
        return `${minute} ${hour} ${dayOfMonth} * *`;

      case 'custom':
        return `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;

      default:
        throw new Error('Invalid schedule type');
    }
  }
}

module.exports = new SchedulePresetsService();
module.exports.SCHEDULE_PRESETS = SCHEDULE_PRESETS;
