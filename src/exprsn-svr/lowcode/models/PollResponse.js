const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PollResponse = sequelize.define('PollResponse', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    pollId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'poll_id',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
    },
    selectedOptions: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'selected_options',
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'poll_responses',
    timestamps: true,
    underscored: true,
  });

  PollResponse.associate = (models) => {
    PollResponse.belongsTo(models.Poll, {
      foreignKey: 'pollId',
      as: 'poll',
    });
  };

  return PollResponse;
};
