/**
 * ═══════════════════════════════════════════════════════════════════════
 * StorageQuota Model - User storage quotas
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = (sequelize, DataTypes) => {
  const StorageQuota = sequelize.define('StorageQuota', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      comment: 'User ID'
    },
    used_bytes: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: 'Bytes currently used by user'
    },
    quota_bytes: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 10737418240, // 10GB default
      comment: 'Total quota in bytes'
    }
  }, {
    tableName: 'storage_quotas',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id'],
        unique: true
      }
    ]
  });

  // Instance methods
  StorageQuota.prototype.getUsedPercentage = function() {
    return (this.used_bytes / this.quota_bytes) * 100;
  };

  StorageQuota.prototype.getAvailableBytes = function() {
    return this.quota_bytes - this.used_bytes;
  };

  StorageQuota.prototype.hasSpaceFor = function(bytes) {
    return this.used_bytes + bytes <= this.quota_bytes;
  };

  StorageQuota.prototype.formatBytes = function(bytes) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  StorageQuota.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());

    return {
      ...values,
      used_formatted: this.formatBytes(values.used_bytes),
      quota_formatted: this.formatBytes(values.quota_bytes),
      available_formatted: this.formatBytes(this.getAvailableBytes()),
      used_percentage: this.getUsedPercentage().toFixed(2) + '%'
    };
  };

  return StorageQuota;
};
