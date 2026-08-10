const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const FormDraft = sequelize.define('FormDraft', {
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
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    draftData: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'draft_data',
    },
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at',
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'form_drafts',
    timestamps: true,
    underscored: true,
  });

  FormDraft.associate = (models) => {
    FormDraft.belongsTo(models.Form, { foreignKey: 'formId', as: 'form' });
    FormDraft.belongsTo(models.AppForm, { foreignKey: 'appFormId', as: 'appForm' });
  };

  return FormDraft;
};
