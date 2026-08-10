const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FormCard = sequelize.define('FormCard', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    formId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'form_id',
    },
    appFormId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'app_form_id',
    },
    cardId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'card_id',
    },
    instanceId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'instance_id',
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    config: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    dataBinding: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'data_binding',
    },
  }, {
    tableName: 'form_cards',
    timestamps: true,
    underscored: true,
  });

  FormCard.associate = (models) => {
    FormCard.belongsTo(models.Form, { foreignKey: 'formId', as: 'form' });
    FormCard.belongsTo(models.AppForm, { foreignKey: 'appFormId', as: 'appForm' });
    FormCard.belongsTo(models.Card, { foreignKey: 'cardId', as: 'card' });
  };

  return FormCard;
};
