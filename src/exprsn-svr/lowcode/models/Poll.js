/**
 * Poll Model
 *
 * Represents a poll/survey that can be embedded in applications and forms.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Poll = sequelize.define('Poll', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'application_id',
      references: {
        model: 'applications',
        key: 'id',
      },
    },
    formId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'form_id',
      references: {
        model: 'app_forms',
        key: 'id',
      },
    },
    creatorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'creator_id',
    },
    question: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    pollType: {
      type: DataTypes.ENUM('single-choice', 'multiple-choice', 'rating', 'ranking'),
      allowNull: false,
      defaultValue: 'single-choice',
      field: 'poll_type',
    },
    options: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      validate: {
        hasOptions(value) {
          if (!Array.isArray(value) || value.length < 2) {
            throw new Error('Poll must have at least 2 options');
          }
        },
      },
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {
        allowAnonymous: true,
        allowMultipleResponses: false,
        showResults: 'after-vote',
        requireComment: false,
      },
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'start_date',
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'end_date',
    },
    status: {
      type: DataTypes.ENUM('draft', 'active', 'closed', 'archived'),
      allowNull: false,
      defaultValue: 'draft',
    },
    responseCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'response_count',
    },
    results: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'polls',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['form_id'] },
      { fields: ['creator_id'] },
      { fields: ['status'] },
      { fields: ['start_date', 'end_date'] },
    ],
  });

  Poll.associate = (models) => {
    Poll.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
    });

    Poll.belongsTo(models.AppForm, {
      foreignKey: 'formId',
      as: 'form',
    });

    Poll.hasMany(models.PollResponse, {
      foreignKey: 'pollId',
      as: 'responses',
      onDelete: 'CASCADE',
    });
  };

  // Instance methods
  Poll.prototype.activate = async function() {
    this.status = 'active';
    if (!this.startDate) {
      this.startDate = new Date();
    }
    return await this.save();
  };

  Poll.prototype.close = async function() {
    this.status = 'closed';
    this.endDate = new Date();
    return await this.save();
  };

  Poll.prototype.addOption = function(option) {
    if (!this.options) {
      this.options = [];
    }

    if (typeof option === 'string') {
      this.options.push({ id: Date.now().toString(), label: option });
    } else {
      this.options.push(option);
    }

    this.changed('options', true);
    return this;
  };

  Poll.prototype.calculateResults = async function() {
    // This would query poll_responses and calculate aggregated results
    // Placeholder implementation
    this.results = {
      totalResponses: this.responseCount,
      calculatedAt: new Date(),
      // ... option-specific results would be calculated here
    };
    this.changed('results', true);
    return await this.save();
  };

  return Poll;
};
