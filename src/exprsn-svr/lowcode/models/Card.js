/**
 * Card Model
 *
 * Represents a reusable component (card) that can be used across multiple forms.
 * Similar to React components or Power Apps components.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Card = sequelize.define('Card', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'application_id',
      references: {
        model: 'applications',
        key: 'id',
      },
    },
    ownerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'owner_id',
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        is: /^[a-zA-Z][a-zA-Z0-9_-]*$/,
      },
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'display_name',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    cardType: {
      type: DataTypes.ENUM('form-section', 'widget', 'template', 'component'),
      allowNull: false,
      defaultValue: 'component',
      field: 'card_type',
    },
    controls: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    exposedProperties: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      field: 'exposed_properties',
    },
    inputs: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    outputs: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    events: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    html: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    css: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    javascript: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    previewImage: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'preview_image',
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
    },
    visibility: {
      type: DataTypes.ENUM('private', 'public', 'organization'),
      allowNull: false,
      defaultValue: 'private',
    },
    version: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '1.0.0',
    },
    published: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    downloads: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'cards',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['owner_id'] },
      { fields: ['card_type'] },
      { fields: ['visibility'] },
      { fields: ['category'] },
      { fields: ['published'] },
      {
        fields: ['tags'],
        using: 'GIN',
      },
    ],
  });

  Card.associate = (models) => {
    Card.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
    });

    Card.hasMany(models.FormCard, {
      foreignKey: 'cardId',
      as: 'formCards',
      onDelete: 'CASCADE',
    });
  };

  // Instance methods
  Card.prototype.publish = async function() {
    this.published = true;
    return await this.save();
  };

  Card.prototype.unpublish = async function() {
    this.published = false;
    return await this.save();
  };

  Card.prototype.incrementDownloads = async function() {
    this.downloads += 1;
    return await this.save();
  };

  Card.prototype.updateRating = async function(newRating) {
    if (newRating < 0 || newRating > 5) {
      throw new Error('Rating must be between 0 and 5');
    }

    if (this.rating === null) {
      this.rating = newRating;
    } else {
      // Simple moving average (can be improved with proper rating counts)
      this.rating = ((this.rating + newRating) / 2).toFixed(2);
    }

    return await this.save();
  };

  return Card;
};
