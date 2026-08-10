/**
 * ═══════════════════════════════════════════════════════════════════════
 * Dashboard Card Model
 * ═══════════════════════════════════════════════════════════════════════
 * Stores user's customizable dashboard card layout
 * ═══════════════════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DashboardCard = sequelize.define('DashboardCard', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: true, // Null for anonymous/default layout
    field: 'user_id'
  },
  cardType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'card_type',
    comment: 'Type of card: system_health, recent_activity, alerts, etc.'
  },
  title: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Display title for the card'
  },
  position: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Order position for the card'
  },
  size: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: '1x1',
    comment: 'Card size: 1x1, 2x1, 2x2, etc.'
  },
  visible: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Whether the card is visible'
  },
  config: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {},
    comment: 'Card-specific configuration (refresh interval, limits, etc.)'
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'setup_dashboard_cards',
  timestamps: true,
  indexes: [
    {
      fields: ['user_id']
    },
    {
      fields: ['user_id', 'position']
    }
  ]
});

module.exports = DashboardCard;
