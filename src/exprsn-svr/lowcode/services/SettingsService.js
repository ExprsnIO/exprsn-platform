/**
 * Settings Service
 * Handles business logic for application settings and variables
 */

const crypto = require('crypto');

class SettingsService {
  constructor(models) {
    this.AppSetting = models.AppSetting;
    this.Application = models.Application;

    // Encryption configuration
    this.algorithm = 'aes-256-gcm';
    this.encryptionKey = process.env.SETTINGS_ENCRYPTION_KEY || this.generateDefaultKey();
  }

  generateDefaultKey() {
    // In production, this should be stored securely
    return crypto.scryptSync('exprsn-lowcode-settings', 'salt', 32);
  }

  /**
   * Get all settings for an application
   */
  async getSettings(applicationId, options = {}) {
    const {
      category = null,
      environment = null,
      includeSystem = true,
      onlyCustomizable = false
    } = options;

    const where = { applicationId, isActive: true };

    if (category) {
      where.category = category;
    }

    if (environment) {
      where.environment = [environment, 'all'];
    }

    if (!includeSystem) {
      where.isSystemSetting = false;
    }

    if (onlyCustomizable) {
      where.isUserCustomizable = true;
    }

    const settings = await this.AppSetting.findAll({
      where,
      order: [
        ['category', 'ASC'],
        ['sortOrder', 'ASC'],
        ['displayName', 'ASC']
      ]
    });

    // Parse and decrypt values
    return settings.map(setting => this.formatSetting(setting));
  }

  /**
   * Get a single setting by key
   */
  async getSettingByKey(applicationId, key, environment = 'all') {
    const setting = await this.AppSetting.findOne({
      where: {
        applicationId,
        key,
        environment: [environment, 'all'],
        isActive: true
      },
      order: [
        // Prefer environment-specific over 'all'
        [this.AppSetting.sequelize.literal(`CASE WHEN environment = '${environment}' THEN 0 ELSE 1 END`), 'ASC']
      ]
    });

    if (!setting) {
      return null;
    }

    return this.formatSetting(setting);
  }

  /**
   * Get settings as key-value object
   */
  async getSettingsAsObject(applicationId, environment = 'all') {
    const settings = await this.getSettings(applicationId, { environment });

    const result = {};
    settings.forEach(setting => {
      result[setting.key] = setting.parsedValue;
    });

    return result;
  }

  /**
   * Get settings grouped by category
   */
  async getSettingsByCategory(applicationId, environment = 'all') {
    const settings = await this.getSettings(applicationId, { environment });

    const grouped = {};
    settings.forEach(setting => {
      if (!grouped[setting.category]) {
        grouped[setting.category] = [];
      }
      grouped[setting.category].push(setting);
    });

    return grouped;
  }

  /**
   * Create a new setting
   */
  async createSetting(data, userId = null) {
    const {
      applicationId,
      key,
      displayName,
      description,
      category = 'general',
      dataType = 'string',
      value,
      defaultValue,
      isUserCustomizable = true,
      isSystemSetting = false,
      isRequired = false,
      isEncrypted = false,
      environment = 'all',
      validationRules,
      metadata,
      sortOrder = 0
    } = data;

    // Check if setting already exists
    const existing = await this.AppSetting.findOne({
      where: { applicationId, key, environment }
    });

    if (existing) {
      throw new Error(`Setting with key '${key}' already exists for this environment`);
    }

    // Create setting
    const setting = await this.AppSetting.create({
      applicationId,
      key,
      displayName,
      description,
      category,
      dataType,
      defaultValue,
      isUserCustomizable,
      isSystemSetting,
      isRequired,
      isEncrypted,
      environment,
      validationRules,
      metadata,
      sortOrder,
      createdBy: userId,
      updatedBy: userId
    });

    // Set value (with encryption if needed)
    if (value !== undefined && value !== null) {
      await this.updateSettingValue(setting.id, value, userId);
    }

    return this.formatSetting(await setting.reload());
  }

  /**
   * Update a setting
   */
  async updateSetting(settingId, data, userId = null) {
    const setting = await this.AppSetting.findByPk(settingId);

    if (!setting) {
      throw new Error('Setting not found');
    }

    // Check if it's a system setting and user is trying to change non-value fields
    if (setting.isSystemSetting && !setting.isUserCustomizable) {
      // Only allow value updates for system settings
      const allowedFields = ['value'];
      const updateFields = Object.keys(data);
      const hasDisallowedFields = updateFields.some(f => !allowedFields.includes(f));

      if (hasDisallowedFields) {
        throw new Error('Cannot modify system settings');
      }
    }

    const {
      displayName,
      description,
      category,
      dataType,
      value,
      defaultValue,
      isUserCustomizable,
      isRequired,
      isEncrypted,
      validationRules,
      metadata,
      sortOrder,
      isActive
    } = data;

    // Update fields
    if (displayName !== undefined) setting.displayName = displayName;
    if (description !== undefined) setting.description = description;
    if (category !== undefined) setting.category = category;
    if (dataType !== undefined) setting.dataType = dataType;
    if (defaultValue !== undefined) setting.defaultValue = defaultValue;
    if (isUserCustomizable !== undefined) setting.isUserCustomizable = isUserCustomizable;
    if (isRequired !== undefined) setting.isRequired = isRequired;
    if (isEncrypted !== undefined) setting.isEncrypted = isEncrypted;
    if (validationRules !== undefined) setting.validationRules = validationRules;
    if (metadata !== undefined) setting.metadata = metadata;
    if (sortOrder !== undefined) setting.sortOrder = sortOrder;
    if (isActive !== undefined) setting.isActive = isActive;

    setting.updatedBy = userId;

    await setting.save();

    // Update value separately (with encryption if needed)
    if (value !== undefined) {
      await this.updateSettingValue(setting.id, value, userId);
    }

    return this.formatSetting(await setting.reload());
  }

  /**
   * Update setting value
   */
  async updateSettingValue(settingId, value, userId = null) {
    const setting = await this.AppSetting.findByPk(settingId);

    if (!setting) {
      throw new Error('Setting not found');
    }

    // Check if user can modify this setting
    if (!setting.isUserCustomizable) {
      throw new Error('This setting cannot be modified');
    }

    // Set the value (will be encrypted if needed)
    if (setting.isEncrypted) {
      setting.value = this.encrypt(value);
    } else {
      setting.setValue(value);
    }

    setting.updatedBy = userId;

    // Validate
    const validation = setting.validate();
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    await setting.save();

    return this.formatSetting(await setting.reload());
  }

  /**
   * Delete a setting
   */
  async deleteSetting(settingId) {
    const setting = await this.AppSetting.findByPk(settingId);

    if (!setting) {
      throw new Error('Setting not found');
    }

    if (setting.isSystemSetting) {
      throw new Error('Cannot delete system settings');
    }

    if (setting.isRequired) {
      throw new Error('Cannot delete required settings');
    }

    await setting.destroy();

    return { success: true };
  }

  /**
   * Reset setting to default value
   */
  async resetToDefault(settingId, userId = null) {
    const setting = await this.AppSetting.findByPk(settingId);

    if (!setting) {
      throw new Error('Setting not found');
    }

    setting.value = setting.defaultValue;
    setting.updatedBy = userId;

    await setting.save();

    return this.formatSetting(await setting.reload());
  }

  /**
   * Bulk create default settings for an application
   */
  async createDefaultSettings(applicationId, userId = null) {
    const defaultSettings = [
      // General settings
      {
        key: 'appName',
        displayName: 'Application Name',
        description: 'The display name of your application',
        category: 'general',
        dataType: 'string',
        defaultValue: 'My Application',
        isRequired: true
      },
      {
        key: 'appDescription',
        displayName: 'Application Description',
        description: 'A brief description of your application',
        category: 'general',
        dataType: 'string',
        defaultValue: ''
      },
      {
        key: 'appVersion',
        displayName: 'Application Version',
        description: 'Current version number',
        category: 'general',
        dataType: 'string',
        defaultValue: '1.0.0',
        isSystemSetting: true,
        isUserCustomizable: false
      },
      {
        key: 'appLogo',
        displayName: 'Application Logo URL',
        description: 'URL to your application logo',
        category: 'general',
        dataType: 'url',
        defaultValue: ''
      },
      {
        key: 'appThemeColor',
        displayName: 'Theme Color',
        description: 'Primary color for the application',
        category: 'general',
        dataType: 'color',
        defaultValue: '#0078d4'
      },

      // API settings
      {
        key: 'apiBaseUrl',
        displayName: 'API Base URL',
        description: 'Base URL for external API calls',
        category: 'api',
        dataType: 'url',
        defaultValue: ''
      },
      {
        key: 'apiTimeout',
        displayName: 'API Timeout (ms)',
        description: 'Timeout for API requests in milliseconds',
        category: 'api',
        dataType: 'number',
        defaultValue: '30000',
        validationRules: { min: 1000, max: 300000 }
      },
      {
        key: 'apiKey',
        displayName: 'API Key',
        description: 'API key for external service authentication',
        category: 'api',
        dataType: 'password',
        defaultValue: '',
        isEncrypted: true
      },

      // UI settings
      {
        key: 'recordsPerPage',
        displayName: 'Records Per Page',
        description: 'Default number of records to show per page in grids',
        category: 'ui',
        dataType: 'number',
        defaultValue: '50',
        validationRules: { min: 10, max: 200 }
      },
      {
        key: 'dateFormat',
        displayName: 'Date Format',
        description: 'Default date format for the application',
        category: 'ui',
        dataType: 'string',
        defaultValue: 'YYYY-MM-DD',
        validationRules: {
          enum: ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'DD-MMM-YYYY']
        },
        metadata: {
          inputType: 'select',
          options: [
            { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2025-12-21)' },
            { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/21/2025)' },
            { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (21/12/2025)' },
            { value: 'DD-MMM-YYYY', label: 'DD-MMM-YYYY (21-Dec-2025)' }
          ]
        }
      },
      {
        key: 'enableDarkMode',
        displayName: 'Enable Dark Mode',
        description: 'Allow users to switch to dark mode',
        category: 'ui',
        dataType: 'boolean',
        defaultValue: 'true'
      },

      // Security settings
      {
        key: 'sessionTimeout',
        displayName: 'Session Timeout (minutes)',
        description: 'User session timeout in minutes',
        category: 'security',
        dataType: 'number',
        defaultValue: '30',
        validationRules: { min: 5, max: 1440 }
      },
      {
        key: 'maxLoginAttempts',
        displayName: 'Max Login Attempts',
        description: 'Maximum failed login attempts before lockout',
        category: 'security',
        dataType: 'number',
        defaultValue: '5',
        validationRules: { min: 3, max: 10 }
      },
      {
        key: 'requireStrongPasswords',
        displayName: 'Require Strong Passwords',
        description: 'Enforce strong password requirements',
        category: 'security',
        dataType: 'boolean',
        defaultValue: 'true'
      },

      // Feature flags
      {
        key: 'enableAuditLog',
        displayName: 'Enable Audit Logging',
        description: 'Track all user actions in audit log',
        category: 'features',
        dataType: 'boolean',
        defaultValue: 'true'
      },
      {
        key: 'enableNotifications',
        displayName: 'Enable Notifications',
        description: 'Allow system notifications',
        category: 'features',
        dataType: 'boolean',
        defaultValue: 'true'
      },
      {
        key: 'enableFileUploads',
        displayName: 'Enable File Uploads',
        description: 'Allow users to upload files',
        category: 'features',
        dataType: 'boolean',
        defaultValue: 'true'
      },
      {
        key: 'maxFileSize',
        displayName: 'Max File Size (MB)',
        description: 'Maximum file upload size in megabytes',
        category: 'features',
        dataType: 'number',
        defaultValue: '10',
        validationRules: { min: 1, max: 100 }
      }
    ];

    const createdSettings = [];

    for (const settingData of defaultSettings) {
      try {
        const setting = await this.createSetting({
          applicationId,
          ...settingData
        }, userId);
        createdSettings.push(setting);
      } catch (error) {
        console.error(`Failed to create default setting ${settingData.key}:`, error.message);
      }
    }

    return createdSettings;
  }

  /**
   * Encrypt a value
   */
  encrypt(text) {
    if (!text) return '';

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    let encrypted = cipher.update(String(text), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return JSON.stringify({
      iv: iv.toString('hex'),
      encryptedData: encrypted,
      authTag: authTag.toString('hex')
    });
  }

  /**
   * Decrypt a value
   */
  decrypt(encryptedText) {
    if (!encryptedText) return '';

    try {
      const { iv, encryptedData, authTag } = JSON.parse(encryptedText);

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        Buffer.from(iv, 'hex')
      );

      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      return '';
    }
  }

  /**
   * Format setting for API response
   */
  formatSetting(setting) {
    const formatted = {
      id: setting.id,
      applicationId: setting.applicationId,
      key: setting.key,
      displayName: setting.displayName,
      description: setting.description,
      category: setting.category,
      dataType: setting.dataType,
      value: setting.value,
      defaultValue: setting.defaultValue,
      parsedValue: setting.isEncrypted ? this.decrypt(setting.value) : setting.getParsedValue(),
      isUserCustomizable: setting.isUserCustomizable,
      isSystemSetting: setting.isSystemSetting,
      isRequired: setting.isRequired,
      isEncrypted: setting.isEncrypted,
      environment: setting.environment,
      validationRules: setting.validationRules,
      metadata: setting.metadata,
      sortOrder: setting.sortOrder,
      isActive: setting.isActive,
      createdAt: setting.createdAt,
      updatedAt: setting.updatedAt
    };

    // Mask encrypted values in the raw value field
    if (setting.isEncrypted && formatted.value) {
      formatted.value = '********';
    }

    return formatted;
  }
}

module.exports = SettingsService;
